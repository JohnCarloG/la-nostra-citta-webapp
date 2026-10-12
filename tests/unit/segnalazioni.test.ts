import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as segnalazioni from '../../src/lib/domain/segnalazioni';
import { PrismaClient } from '@prisma/client';

vi.mock('@prisma/client', () => {
  const mPrisma = {
    utente: {
      findUnique: vi.fn(),
    },
    uploadTemporaneo: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    segnalazione: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    outbox: {
      create: vi.fn(),
    },
    sostegno: {
      upsert: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    auditEvento: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => cb(mPrisma))
  };
  return { PrismaClient: class { constructor() { return mPrisma; } } };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient() as any;

describe('Dominio Segnalazioni (Funzioni pure/mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Dovrebbe rifiutare array media vuoto con messaggio corretto senza inserimenti a DB', async () => {
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione valida territorio', 10, 10, []))
      .rejects.toThrow('La segnalazione richiede almeno un media');
    expect(prisma.segnalazione.create).not.toHaveBeenCalled();
    expect(prisma.uploadTemporaneo.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('Dovrebbe rifiutare più di 5 allegati (limite RF04)', async () => {
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione valida territorio', 10, 10, ['1', '2', '3', '4', '5', '6']))
      .rejects.toThrow('Massimo 5 allegati consentiti');
  });

  it('Dovrebbe rifiutare coordinate non valide (VI05)', async () => {
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione valida territorio', 95, 10, ['1']))
      .rejects.toThrow('Coordinate geografiche non valide');
  });

  it('Dovrebbe rifiutare upload duplicati (stesso ID)', async () => {
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione valida territorio', 10, 10, ['A', 'A']))
      .rejects.toThrow('Identificatori upload duplicati nella richiesta');
  });

  it('Dovrebbe rifiutare account sospeso', async () => {
    prisma.utente.findUnique.mockResolvedValue({ stato_account: 'SOSPESO', verificato_il: new Date() });
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione valida territorio', 10, 10, ['A']))
      .rejects.toThrow('Utente non autorizzato o account non verificato');
  });

  it('Dovrebbe rifiutare account non verificato', async () => {
    prisma.utente.findUnique.mockResolvedValue({ stato_account: 'ATTIVO', verificato_il: null });
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione valida territorio', 10, 10, ['A']))
      .rejects.toThrow('Utente non autorizzato o account non verificato');
  });

  it('Dovrebbe lanciare errore se il consumo atomico dei token fallisce (concorrenza/inesistente)', async () => {
    prisma.utente.findUnique.mockResolvedValue({ stato_account: 'ATTIVO', verificato_il: new Date() });
    prisma.uploadTemporaneo.updateMany.mockResolvedValue({ count: 0 }); // Fallisce
    
    await expect(segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione valida territorio', 10, 10, ['A']))
      .rejects.toThrow('Impossibile consumare gli upload');
  });

  it('Creazione segnalazione usa i metadati validati dal database ignorando manipolazioni client', async () => {
    prisma.utente.findUnique.mockResolvedValue({ stato_account: 'ATTIVO', verificato_il: new Date() });
    prisma.uploadTemporaneo.updateMany.mockResolvedValue({ count: 1 });
    // Dati fittizi estratti da DB (sicuri)
    prisma.uploadTemporaneo.findMany.mockResolvedValue([
      { storage_key: 'A', tipo: 'FOTO', mime: 'image/jpeg', byte_size: 999, sha256: 'hashsicuro' }
    ]);
    prisma.segnalazione.create.mockResolvedValue({ id: 'seg1' });

    // Client passa solo 'A', impossibile spoofare mime e byte_size
    await segnalazioni.createSegnalazioneAtomica('autore1', 'Descrizione valida territorio', 10, 10, ['A']);

    expect(prisma.segnalazione.create).toHaveBeenCalled();
    const createCallData = prisma.segnalazione.create.mock.calls[0][0].data;
    const mediaCreated = createCallData.media.create[0];
    
    // Verifichiamo che i dati iniettati siano quelli provenienti dalla findMany (DB) e non altri
    expect(mediaCreated.byte_size).toBe(999);
    expect(mediaCreated.sha256).toBe('hashsicuro');
  });

  describe('aggiungiSostegno (Vincoli, Audit e Rollback)', () => {
    it('Dovrebbe rifiutare autosostegno senza inserire righe in tabella sostegno', async () => {
      prisma.utente.findUnique.mockResolvedValue({
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      });
      prisma.segnalazione.findUnique.mockResolvedValue({
        autore_id: 'user-123',
        stato_moderazione: 'APPROVATA',
        stato_avanzamento: 'PRESA_IN_CARICO'
      });

      await expect(segnalazioni.aggiungiSostegno('user-123', 'seg-456'))
        .rejects.toThrow('Autosostegno vietato');

      expect(prisma.sostegno.upsert).not.toHaveBeenCalled();
      expect(prisma.auditEvento.create).not.toHaveBeenCalled();
    });

    it('Dovrebbe rifiutare sostegno da utente non verificato senza inserimenti', async () => {
      prisma.utente.findUnique.mockResolvedValue({
        stato_account: 'ATTIVO',
        verificato_il: null
      });

      await expect(segnalazioni.aggiungiSostegno('user-unverified', 'seg-456'))
        .rejects.toThrow('Solo account attivi e verificati possono sostenere');

      expect(prisma.sostegno.upsert).not.toHaveBeenCalled();
    });

    it('Dovrebbe rifiutare sostegno su segnalazione non approvata', async () => {
      prisma.utente.findUnique.mockResolvedValue({
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      });
      prisma.segnalazione.findUnique.mockResolvedValue({
        autore_id: 'different-author',
        stato_moderazione: 'PENDENTE',
        stato_avanzamento: 'RICEVUTA'
      });

      await expect(segnalazioni.aggiungiSostegno('user-123', 'seg-456'))
        .rejects.toThrow('Possibile sostenere solo segnalazioni pubbliche');

      expect(prisma.sostegno.upsert).not.toHaveBeenCalled();
    });

    it('Dovrebbe registrare il sostegno e la traccia AuditEvento per un utente terzo verificato su segnalazione approvata', async () => {
      prisma.utente.findUnique.mockResolvedValue({
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      });
      prisma.segnalazione.findUnique.mockResolvedValue({
        autore_id: 'author-999',
        stato_moderazione: 'APPROVATA',
        stato_avanzamento: 'PRESA_IN_CARICO'
      });
      prisma.sostegno.upsert.mockResolvedValue({
        utente_id: 'supporter-111',
        segnalazione_id: 'seg-456'
      });

      const res = await segnalazioni.aggiungiSostegno('supporter-111', 'seg-456');
      expect(prisma.sostegno.upsert).toHaveBeenCalledWith({
        where: {
          utente_id_segnalazione_id: {
            utente_id: 'supporter-111',
            segnalazione_id: 'seg-456'
          }
        },
        create: { utente_id: 'supporter-111', segnalazione_id: 'seg-456' },
        update: {}
      });
      expect(prisma.auditEvento.create).toHaveBeenCalledWith({
        data: {
          tipo_attore: 'UTENTE',
          attore_id: 'supporter-111',
          segnalazione_id: 'seg-456',
          azione: 'AGGIUNGI_SOSTEGNO'
        }
      });
      expect(res).toBeDefined();
    });
  });

  describe('rimuoviSostegno (Revocabilità e Audit)', () => {
    it('Dovrebbe revocare un sostegno esistente e registrare l\'audit', async () => {
      prisma.sostegno.findUnique.mockResolvedValue({
        utente_id: 'u-1',
        segnalazione_id: 's-1'
      });
      prisma.sostegno.delete.mockResolvedValue({});

      const res = await segnalazioni.rimuoviSostegno('u-1', 's-1');
      expect(res).toBe(true);
      expect(prisma.sostegno.delete).toHaveBeenCalledWith({
        where: { utente_id_segnalazione_id: { utente_id: 'u-1', segnalazione_id: 's-1' } }
      });
      expect(prisma.auditEvento.create).toHaveBeenCalledWith({
        data: {
          tipo_attore: 'UTENTE',
          attore_id: 'u-1',
          segnalazione_id: 's-1',
          azione: 'RIMUOVI_SOSTEGNO'
        }
      });
    });

    it('Dovrebbe fallire se il sostegno da revocare non esiste', async () => {
      prisma.sostegno.findUnique.mockResolvedValue(null);
      await expect(segnalazioni.rimuoviSostegno('u-1', 's-1')).rejects.toThrow('Sostegno non presente');
    });
  });
});


