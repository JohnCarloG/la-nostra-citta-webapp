import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UploadTemporaneo, Utente } from '@prisma/client';
import { 
  caricaUploadTemporaneo, 
  pulisciUploadTemporaneiScaduti 
} from '../../src/lib/domain/uploads';
import { POST as uploadsHandler } from '../../src/app/api/uploads/route';
import { NextRequest } from 'next/server';
import { prisma } from '../../src/lib/db';
import { getCurrentUser } from '../../src/actions/auth';
import { createValidMp4 } from './mime-validator.test';

// Mock DB
vi.mock('../../src/lib/db', () => ({
  prisma: {
    utente: {
      findUnique: vi.fn(),
    },
    uploadTemporaneo: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    media: {
      count: vi.fn(),
    },
  },
}));

// Mock Storage
const mockStorage = {
  putObject: vi.fn(),
  getObject: vi.fn(),
  deleteObject: vi.fn(),
  exists: vi.fn(),
};

vi.mock('../../src/lib/storage', () => ({
  getStorageProvider: vi.fn(() => mockStorage),
}));

// Mock Auth action
vi.mock('../../src/actions/auth', () => ({
  getCurrentUser: vi.fn(),
}));

function createValidJpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xFF, 0xD8]), // SOI
    Buffer.from([0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]), // APP0
    Buffer.from([0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00]), // SOF0: 16x16 px
    Buffer.from([0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00]), // SOS
    Buffer.from([0xAA, 0xBB]), // Compressed scan data
    Buffer.from([0xFF, 0xD9]), // EOI
  ]);
}

describe('Dominio Uploads e Route Handler /api/uploads (Fase 3 - RF04, VI09)', () => {
  const activeVerifiedUser = {
    id: 'user-123',
    nome: 'Mario',
    cognome: 'Rossi',
    email_normalizzata: 'mario.rossi@example.com',
    ruolo: 'CITTADINO' as const,
    stato_account: 'ATTIVO' as const,
    verificato_il: new Date(),
    codice_fiscale: null,
    quartiere_id: null,
    quartiere: null,
    creato_il: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. caricaUploadTemporaneo (Dominio)', () => {
    it('Rifiuta utente non trovato', async () => {
      vi.mocked(prisma.utente.findUnique).mockResolvedValue(null);
      await expect(caricaUploadTemporaneo('user-404', createValidJpeg()))
        .rejects.toThrow('Caricamento non autorizzato');
      expect(mockStorage.putObject).not.toHaveBeenCalled();
    });

    it('Rifiuta utente sospeso', async () => {
      vi.mocked(prisma.utente.findUnique).mockResolvedValue({
        id: 'user-sospeso',
        stato_account: 'SOSPESO',
        verificato_il: new Date(),
      } as unknown as Utente);

      await expect(caricaUploadTemporaneo('user-sospeso', createValidJpeg()))
        .rejects.toThrow('Caricamento non autorizzato: utente non valido, sospeso o non verificato');
      expect(mockStorage.putObject).not.toHaveBeenCalled();
    });

    it('Rifiuta utente non verificato', async () => {
      vi.mocked(prisma.utente.findUnique).mockResolvedValue({
        id: 'user-unverified',
        stato_account: 'ATTIVO',
        verificato_il: null,
      } as unknown as Utente);

      await expect(caricaUploadTemporaneo('user-unverified', createValidJpeg()))
        .rejects.toThrow('Caricamento non autorizzato: utente non valido, sospeso o non verificato');
      expect(mockStorage.putObject).not.toHaveBeenCalled();
    });

    it('Rifiuta file corrotto o con magic bytes non conformi', async () => {
      vi.mocked(prisma.utente.findUnique).mockResolvedValue({
        id: activeVerifiedUser.id,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      } as unknown as Utente);

      const fakeFile = Buffer.from('Questo non e un file grafico');
      await expect(caricaUploadTemporaneo(activeVerifiedUser.id, fakeFile))
        .rejects.toThrow();
      expect(mockStorage.putObject).not.toHaveBeenCalled();
    });

    it('Carica con successo una foto valida su storage e persiste il record temporaneo', async () => {
      vi.mocked(prisma.utente.findUnique).mockResolvedValue({
        id: activeVerifiedUser.id,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      } as unknown as Utente);

      const jpeg = createValidJpeg();
      const mockRecord = {
        id: 'upload-abc-123',
        proprietario_id: activeVerifiedUser.id,
        storage_key: 'uploads/user-123/123456789_abcdef.jpg',
        tipo: 'FOTO' as const,
        mime: 'image/jpeg',
        byte_size: jpeg.length,
        sha256: 'dummy-sha',
        exif_lat: null,
        exif_lon: null,
        stato: 'VALIDO',
        scade_il: new Date(Date.now() + 2 * 60 * 60 * 1000),
      };

      vi.mocked(mockStorage.putObject).mockResolvedValue(undefined);
      vi.mocked(prisma.uploadTemporaneo.create).mockResolvedValue(mockRecord as unknown as UploadTemporaneo);

      const res = await caricaUploadTemporaneo(activeVerifiedUser.id, jpeg);

      expect(res.uploadId).toBe(mockRecord.id);
      expect(res.tipo).toBe('FOTO');
      expect(res.mime).toBe('image/jpeg');
      expect(res.byteSize).toBe(jpeg.length);
      expect(mockStorage.putObject).toHaveBeenCalledTimes(1);
      expect(prisma.uploadTemporaneo.create).toHaveBeenCalledTimes(1);
    });

    it('Esegue rollback compensativo su storage se la creazione del record DB fallisce', async () => {
      vi.mocked(prisma.utente.findUnique).mockResolvedValue({
        id: activeVerifiedUser.id,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      } as unknown as Utente);

      const jpeg = createValidJpeg();
      vi.mocked(mockStorage.putObject).mockResolvedValue(undefined);
      vi.mocked(mockStorage.deleteObject).mockResolvedValue(undefined);
      vi.mocked(prisma.uploadTemporaneo.create).mockRejectedValue(new Error('DB Connection dropped'));

      await expect(caricaUploadTemporaneo(activeVerifiedUser.id, jpeg))
        .rejects.toThrow('DB Connection dropped');

      // Verifica cancellazione compensativa
      expect(mockStorage.deleteObject).toHaveBeenCalledTimes(1);
    });

    it('RF04: Accetta video MP4 valido entro i 60 secondi e persiste durata_secondi nel DB', async () => {
      vi.mocked(prisma.utente.findUnique).mockResolvedValue({
        id: activeVerifiedUser.id,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      } as unknown as Utente);

      const mp4_60s = createValidMp4(60.0);
      const mockRecord = {
        id: 'upload-mp4-60',
        proprietario_id: activeVerifiedUser.id,
        storage_key: 'uploads/user-1/video.mp4',
        tipo: 'VIDEO' as const,
        mime: 'video/mp4',
        byte_size: mp4_60s.length,
        durata_secondi: 60,
        sha256: 'dummy-sha-mp4',
        exif_lat: null,
        exif_lon: null,
        stato: 'VALIDO',
        scade_il: new Date(Date.now() + 2 * 60 * 60 * 1000),
      };

      vi.mocked(mockStorage.putObject).mockResolvedValue(undefined);
      vi.mocked(prisma.uploadTemporaneo.create).mockResolvedValue(mockRecord as unknown as UploadTemporaneo);

      const res = await caricaUploadTemporaneo(activeVerifiedUser.id, mp4_60s);

      expect(res.uploadId).toBe('upload-mp4-60');
      expect(res.tipo).toBe('VIDEO');
      expect(res.mime).toBe('video/mp4');
      expect(res.durataSecondi).toBe(60);
      expect(mockStorage.putObject).toHaveBeenCalledTimes(1);
      expect(prisma.uploadTemporaneo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            durata_secondi: 60,
            tipo: 'VIDEO',
            mime: 'video/mp4'
          })
        })
      );
    });

    it('RF04: Rifiuta video MP4 con durata > 60 secondi (60.5s e 61s) senza lasciare file né record orfani', async () => {
      vi.mocked(prisma.utente.findUnique).mockResolvedValue({
        id: activeVerifiedUser.id,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      } as unknown as Utente);

      const mp4_61s = createValidMp4(61.0);
      await expect(caricaUploadTemporaneo(activeVerifiedUser.id, mp4_61s))
        .rejects.toThrow('supera il limite massimo consentito di 60 secondi');

      // Nessun file scritto su storage e nessun record creato nel DB (zero orfani)
      expect(mockStorage.putObject).not.toHaveBeenCalled();
      expect(prisma.uploadTemporaneo.create).not.toHaveBeenCalled();
    });

    it('RF04: Rifiuta video MP4 con durata non leggibile senza creare file o record orfani', async () => {
      vi.mocked(prisma.utente.findUnique).mockResolvedValue({
        id: activeVerifiedUser.id,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      } as unknown as Utente);

      const invalidMp4 = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x14]),
        Buffer.from('ftyp', 'ascii'),
        Buffer.from('isom', 'ascii'),
        Buffer.from([0x00, 0x00, 0x02, 0x00]),
        Buffer.from('isom', 'ascii'),
        Buffer.from([0x00, 0x00, 0x00, 0x08]),
        Buffer.from('moov', 'ascii')
      ]);

      await expect(caricaUploadTemporaneo(activeVerifiedUser.id, invalidMp4))
        .rejects.toThrow('Durata del video non leggibile');

      expect(mockStorage.putObject).not.toHaveBeenCalled();
      expect(prisma.uploadTemporaneo.create).not.toHaveBeenCalled();
    });
  });

  describe('2. pulisciUploadTemporaneiScaduti (Garbage Collection)', () => {
    it('Preserva i file referenziati nella tabella Media', async () => {
      vi.mocked(prisma.uploadTemporaneo.findMany).mockResolvedValue([
        { id: 'up-1', storage_key: 'uploads/user-1/file1.jpg' },
      ] as unknown as UploadTemporaneo[]);
      // Il file e referenziato da Media
      vi.mocked(prisma.media.count).mockResolvedValue(1);

      const result = await pulisciUploadTemporaneiScaduti();

      expect(result.scadutiEliminatiDb).toBe(0);
      expect(result.fileOrfaniRimossiStorage).toBe(0);
      expect(prisma.uploadTemporaneo.deleteMany).not.toHaveBeenCalled();
      expect(mockStorage.deleteObject).not.toHaveBeenCalled();
    });

    it('Elimina solo record DB e storage non consumati e scaduti', async () => {
      vi.mocked(prisma.uploadTemporaneo.findMany).mockResolvedValue([
        { id: 'up-scaduto', storage_key: 'uploads/user-1/scaduto.jpg' },
      ] as unknown as UploadTemporaneo[]);
      vi.mocked(prisma.media.count).mockResolvedValue(0);
      vi.mocked(prisma.uploadTemporaneo.deleteMany).mockResolvedValue({ count: 1 });
      vi.mocked(mockStorage.deleteObject).mockResolvedValue(undefined);

      const result = await pulisciUploadTemporaneiScaduti();

      expect(result.scadutiEliminatiDb).toBe(1);
      expect(result.fileOrfaniRimossiStorage).toBe(1);
      expect(mockStorage.deleteObject).toHaveBeenCalledWith('uploads/user-1/scaduto.jpg');
    });

    it('Non cancella il file da storage se un consumo concorrente ha annullato la delete DB', async () => {
      vi.mocked(prisma.uploadTemporaneo.findMany).mockResolvedValue([
        { id: 'up-consumato-altrove', storage_key: 'uploads/user-1/consumato.jpg' },
      ] as unknown as UploadTemporaneo[]);
      vi.mocked(prisma.media.count).mockResolvedValue(0);
      // count 0 indica che consumato_il e stato valorizzato nel frattempo
      vi.mocked(prisma.uploadTemporaneo.deleteMany).mockResolvedValue({ count: 0 });

      const result = await pulisciUploadTemporaneiScaduti();

      expect(result.scadutiEliminatiDb).toBe(0);
      expect(result.fileOrfaniRimossiStorage).toBe(0);
      expect(mockStorage.deleteObject).not.toHaveBeenCalled();
    });
  });

  describe('3. Route Handler POST /api/uploads', () => {
    it('Restituisce 401 se utente non autenticato', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/uploads', {
        method: 'POST',
      });

      const res = await uploadsHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Accesso non autorizzato');
    });

    it('Restituisce 403 se utente non verificato', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        ...activeVerifiedUser,
        verificato_il: null,
      });

      const req = new NextRequest('http://localhost:3000/api/uploads', {
        method: 'POST',
      });

      const res = await uploadsHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('attivo e verificato');
    });

    it('Restituisce 413 se l header Content-Length supera 55 MiB', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(activeVerifiedUser);

      const req = new NextRequest('http://localhost:3000/api/uploads', {
        method: 'POST',
        headers: {
          'content-length': String(60 * 1024 * 1024),
        },
      });

      const res = await uploadsHandler(req);
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error).toContain('supera il limite massimo consentito di 50 MiB');
    });

    it('Restituisce 400 se nessun file e selezionato o il file e vuoto', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(activeVerifiedUser);

      const fd = new FormData();
      const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' });
      fd.set('file', emptyFile);

      const req = new NextRequest('http://localhost:3000/api/uploads', {
        method: 'POST',
        body: fd,
      });

      const res = await uploadsHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Nessun file selezionato o file vuoto');
    });

    it('Accetta con successo un file grafico JPEG valido', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(activeVerifiedUser);
      vi.mocked(prisma.utente.findUnique).mockResolvedValue({
        id: activeVerifiedUser.id,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      } as unknown as Utente);

      const jpeg = createValidJpeg();
      const file = new File([new Uint8Array(jpeg)], 'segnalazione.jpg', { type: 'image/jpeg' });
      const fd = new FormData();
      fd.set('file', file);

      const mockRecord = {
        id: 'upload-12345',
        proprietario_id: activeVerifiedUser.id,
        storage_key: 'uploads/user-123/foto.jpg',
        tipo: 'FOTO' as const,
        mime: 'image/jpeg',
        byte_size: jpeg.length,
        sha256: 'dummy-sha',
        exif_lat: null,
        exif_lon: null,
        stato: 'VALIDO',
        scade_il: new Date(),
      };

      vi.mocked(mockStorage.putObject).mockResolvedValue(undefined);
      vi.mocked(prisma.uploadTemporaneo.create).mockResolvedValue(mockRecord as unknown as UploadTemporaneo);

      const req = new NextRequest('http://localhost:3000/api/uploads', {
        method: 'POST',
        body: fd,
      });

      const res = await uploadsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.uploadId).toBe('upload-12345');
    });

    it('RF04: Route Handler accetta video MP4 di durata <= 60 secondi restituendo 200 e durataSecondi', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(activeVerifiedUser);
      vi.mocked(prisma.utente.findUnique).mockResolvedValue({
        id: activeVerifiedUser.id,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      } as unknown as Utente);

      const mp4 = createValidMp4(60.0);
      const file = new File([new Uint8Array(mp4)], 'video_60s.mp4', { type: 'video/mp4' });
      const fd = new FormData();
      fd.set('file', file);

      const mockRecord = {
        id: 'upload-vid-60',
        proprietario_id: activeVerifiedUser.id,
        storage_key: 'uploads/user-123/video.mp4',
        tipo: 'VIDEO' as const,
        mime: 'video/mp4',
        byte_size: mp4.length,
        durata_secondi: 60,
        sha256: 'dummy-sha-video',
        exif_lat: null,
        exif_lon: null,
        stato: 'VALIDO',
        scade_il: new Date(),
      };

      vi.mocked(mockStorage.putObject).mockResolvedValue(undefined);
      vi.mocked(prisma.uploadTemporaneo.create).mockResolvedValue(mockRecord as unknown as UploadTemporaneo);

      const req = new NextRequest('http://localhost:3000/api/uploads', {
        method: 'POST',
        body: fd,
      });

      const res = await uploadsHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.durataSecondi).toBe(60);
      expect(data.data.tipo).toBe('VIDEO');
    });

    it('RF04: Route Handler rifiuta video MP4 con durata > 60 secondi restituendo HTTP 400', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(activeVerifiedUser);
      vi.mocked(prisma.utente.findUnique).mockResolvedValue({
        id: activeVerifiedUser.id,
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      } as unknown as Utente);

      const mp4_61s = createValidMp4(61.0);
      const file = new File([new Uint8Array(mp4_61s)], 'video_61s.mp4', { type: 'video/mp4' });
      const fd = new FormData();
      fd.set('file', file);

      const req = new NextRequest('http://localhost:3000/api/uploads', {
        method: 'POST',
        body: fd,
      });

      const res = await uploadsHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('supera il limite massimo consentito di 60 secondi');
      expect(mockStorage.putObject).not.toHaveBeenCalled();
      expect(prisma.uploadTemporaneo.create).not.toHaveBeenCalled();
    });
  });
});
