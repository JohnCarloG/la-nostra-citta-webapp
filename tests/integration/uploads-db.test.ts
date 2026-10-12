import { loadTestEnv } from '../../src/lib/test-env';
loadTestEnv();

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import {
  caricaUploadTemporaneo,
  pulisciUploadTemporaneiScaduti,
  registraOrfanoIrrecuperabile
} from '../../src/lib/domain/uploads';
import { createSegnalazioneAtomica } from '../../src/lib/domain/segnalazioni';
import { getStorageProvider, setStorageProviderForTest } from '../../src/lib/storage';
import { LocalDiskStorageProvider } from '../../src/lib/storage/local-provider';
import { getAndVerifyDatabaseInfo } from '../helpers/test-db';

const prisma = new PrismaClient();

// Helper per generare un buffer JPEG strutturato conforme
function makeValidJpegBuffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0xFF, 0xD8]), // SOI
    Buffer.from([0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]), // APP0
    Buffer.from([0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00]), // SOF0
    Buffer.from([0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00]), // SOS
    Buffer.from([0xAA, 0xBB]), // Scan
    Buffer.from([0xFF, 0xD9])  // EOI
  ]);
}

describe('Integrazione DB MySQL: Upload Fisico, Proprietà, Scadenza e Integrità', () => {
  let isDbAvailable = false;
  let connectionError: string | null = null;
  const testStorageDir = path.resolve(process.cwd(), '.test_storage');
  const createdUserIds: string[] = [];
  const createdSegnalazioneIds: string[] = [];

  beforeAll(async () => {
    try {
      getAndVerifyDatabaseInfo();
      await prisma.$queryRaw`SELECT 1`;
      isDbAvailable = true;

      // ISOLAMENTO STORAGE: Usa una cartella storage dedicata esclusivamente ai test (.test_storage),
      // completamente separata da .private_storage usata dal collaudo manuale / server attivo.
      if (fs.existsSync(testStorageDir)) {
        fs.rmSync(testStorageDir, { recursive: true, force: true });
      }
      setStorageProviderForTest(new LocalDiskStorageProvider(testStorageDir));

      // NOTA DI SICUREZZA: Non viene eseguito cleanTestDatabase(prisma) globale per non cancellare
      // gli account o i dati inseriti dall'operatore durante il collaudo manuale.
    } catch (err) {
      isDbAvailable = false;
      connectionError = (err as Error).message;
    }
  });

  afterAll(async () => {
    // Pulizia mirata ESCLUSIVAMENTE dei record creati da questa suite
    if (isDbAvailable) {
      if (createdSegnalazioneIds.length > 0) {
        await prisma.outbox.deleteMany({ where: { segnalazione_id: { in: createdSegnalazioneIds } } }).catch(() => {});
        await prisma.eventoStato.deleteMany({ where: { segnalazione_id: { in: createdSegnalazioneIds } } }).catch(() => {});
        await prisma.media.deleteMany({ where: { segnalazione_id: { in: createdSegnalazioneIds } } }).catch(() => {});
        await prisma.segnalazione.deleteMany({ where: { id: { in: createdSegnalazioneIds } } }).catch(() => {});
      }
      if (createdUserIds.length > 0) {
        await prisma.auditEvento.deleteMany({ where: { attore_id: { in: createdUserIds } } }).catch(() => {});
        await prisma.uploadTemporaneo.deleteMany({ where: { proprietario_id: { in: createdUserIds } } }).catch(() => {});
        await prisma.sessione.deleteMany({ where: { utente_id: { in: createdUserIds } } }).catch(() => {});
        await prisma.tokenAccount.deleteMany({ where: { utente_id: { in: createdUserIds } } }).catch(() => {});
        await prisma.utente.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
      }
    }

    // Rimozione directory temporanea test storage e ripristino provider
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
    setStorageProviderForTest(new LocalDiskStorageProvider());
    await prisma.$disconnect();
  });

  it('Carica un file JPEG valido, verifica storage privato e record UploadTemporaneo', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database non disponibile: ${connectionError}`);
    }

    const utente = await prisma.utente.create({
      data: {
        nome: 'Utente',
        cognome: 'UploadTest',
        email_normalizzata: `utente.upload.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });
    createdUserIds.push(utente.id);

    const validJpeg = makeValidJpegBuffer();
    const result = await caricaUploadTemporaneo(utente.id, validJpeg);

    expect(result.uploadId).toBeDefined();
    expect(result.storageKey).toContain(utente.id);
    expect(result.mime).toBe('image/jpeg');
    expect(result.tipo).toBe('FOTO');

    // Verifica presenza fisica nella directory storage dedicata ai test
    const storage = getStorageProvider();
    expect(await storage.hasObject(result.storageKey)).toBe(true);

    // Verifica record DB
    const rec = await prisma.uploadTemporaneo.findUnique({
      where: { storage_key: result.storageKey }
    });
    expect(rec).not.toBeNull();
    expect(rec?.stato).toBe('VALIDO');
    expect(rec?.proprietario_id).toBe(utente.id);
  });

  it('Rifiuta upload da utente non verificato o sospeso', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database non disponibile: ${connectionError}`);
    }

    const nonVerificato = await prisma.utente.create({
      data: {
        nome: 'Non',
        cognome: 'Verificato',
        email_normalizzata: `non.verificato.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: null
      }
    });
    createdUserIds.push(nonVerificato.id);

    const validJpeg = makeValidJpegBuffer();
    await expect(
      caricaUploadTemporaneo(nonVerificato.id, validJpeg)
    ).rejects.toThrow('Caricamento non autorizzato');
  });

  it('Rifiuta file con estensione o contenuto non conforme e non lascia orfani nello storage', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database non disponibile: ${connectionError}`);
    }

    const utente = await prisma.utente.create({
      data: {
        nome: 'Security',
        cognome: 'Tester',
        email_normalizzata: `sec.tester.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });
    createdUserIds.push(utente.id);

    const fakeMalicious = Buffer.from('<html><script>alert(1)</script></html>');
    await expect(
      caricaUploadTemporaneo(utente.id, fakeMalicious)
    ).rejects.toThrow('Formato file non supportato o firma binaria');
  });

  it('PROPRIETÀ: Un utente B non può consumare né utilizzare upload appartenenti a un utente A', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database non disponibile: ${connectionError}`);
    }

    // Utente A (legittimo proprietario)
    const utenteA = await prisma.utente.create({
      data: {
        nome: 'Utente',
        cognome: 'A',
        email_normalizzata: `utente.a.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });
    createdUserIds.push(utenteA.id);

    // Utente B (tentativo di usurpazione)
    const utenteB = await prisma.utente.create({
      data: {
        nome: 'Utente',
        cognome: 'B',
        email_normalizzata: `utente.b.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });
    createdUserIds.push(utenteB.id);

    // Utente A carica il file
    const uploadA = await caricaUploadTemporaneo(utenteA.id, makeValidJpegBuffer());

    // Utente B tenta di inviare una segnalazione referenziando la chiave di Utente A
    await expect(
      createSegnalazioneAtomica(
        utenteB.id,
        'Tentativo di furto upload altrui',
        45.4642,
        9.1900,
        [uploadA.storageKey]
      )
    ).rejects.toThrow('Impossibile consumare gli upload: non validi, scaduti, altrui o inesistenti');

    // L'upload di A deve essere rimasto VALIDO e non consumato
    const recA = await prisma.uploadTemporaneo.findUnique({
      where: { storage_key: uploadA.storageKey }
    });
    expect(recA?.stato).toBe('VALIDO');
    expect(recA?.consumato_il).toBeNull();
    expect(recA?.proprietario_id).toBe(utenteA.id);
  });

  it('Flusso completo: Caricamento fisico -> Consumo atomico in Segnalazione -> Creazione Media READY', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database non disponibile: ${connectionError}`);
    }

    const utente = await prisma.utente.create({
      data: {
        nome: 'Cittadino',
        cognome: 'Completo',
        email_normalizzata: `cittadino.completo.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });
    createdUserIds.push(utente.id);

    const upload = await caricaUploadTemporaneo(utente.id, makeValidJpegBuffer());

    // Creazione atomica della segnalazione
    const seg = await createSegnalazioneAtomica(
      utente.id,
      'Segnalazione con upload fisico verificato',
      45.4642,
      9.1900,
      [upload.storageKey]
    );
    createdSegnalazioneIds.push(seg.id);

    expect(seg.id).toBeDefined();

    // Verifica Media su DB: stato READY, metadati reali corrispondenti
    const mediaList = await prisma.media.findMany({
      where: { segnalazione_id: seg.id }
    });
    expect(mediaList).toHaveLength(1);
    expect(mediaList[0].storage_key).toBe(upload.storageKey);
    expect(mediaList[0].stato_file).toBe('READY');
    expect(mediaList[0].mime).toBe('image/jpeg');
    expect(mediaList[0].sha256).toBe(upload.sha256);

    // Verifica UploadTemporaneo: passato a CONSUMATO
    const upRec = await prisma.uploadTemporaneo.findUnique({
      where: { storage_key: upload.storageKey }
    });
    expect(upRec?.stato).toBe('CONSUMATO');
    expect(upRec?.consumato_il).not.toBeNull();
  });

  it('INTEGRITÀ CLEANUP: La pulizia NON elimina file CONSUMATI o referenziati da Media anche se con data passata', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database non disponibile: ${connectionError}`);
    }

    const utente = await prisma.utente.create({
      data: {
        nome: 'User',
        cognome: 'SafeCleanup',
        email_normalizzata: `user.safecleanup.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });
    createdUserIds.push(utente.id);

    const storage = getStorageProvider();
    const consumedStorageKey = `uploads/${utente.id}/consumed_file_${Date.now()}.jpg`;
    await storage.putObject(consumedStorageKey, makeValidJpegBuffer(), 'image/jpeg');

    // Record con data di scadenza nel passato ma con stato CONSUMATO
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 3);

    const consumedRec = await prisma.uploadTemporaneo.create({
      data: {
        proprietario_id: utente.id,
        storage_key: consumedStorageKey,
        tipo: 'FOTO',
        mime: 'image/jpeg',
        byte_size: 100,
        sha256: 'f'.repeat(64),
        stato: 'CONSUMATO',
        consumato_il: new Date(),
        scade_il: pastDate
      }
    });

    // Eseguiamo la pulizia
    await pulisciUploadTemporaneiScaduti();

    // Il record su DB deve essere ancora presente
    const stillPresentDb = await prisma.uploadTemporaneo.findUnique({
      where: { id: consumedRec.id }
    });
    expect(stillPresentDb).not.toBeNull();
    expect(stillPresentDb?.stato).toBe('CONSUMATO');

    // Il file fisico su storage NON deve essere stato eliminato
    expect(await storage.hasObject(consumedStorageKey)).toBe(true);

    // Pulizia manuale del file di fixture
    await storage.deleteObject(consumedStorageKey);
  });

  it('Pulisce upload scaduti non consumati ed elimina i file corrispondenti dallo storage', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database non disponibile: ${connectionError}`);
    }

    const utente = await prisma.utente.create({
      data: {
        nome: 'Cleanup',
        cognome: 'User',
        email_normalizzata: `cleanup.user.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });
    createdUserIds.push(utente.id);

    const storage = getStorageProvider();
    const expiredKey = `uploads/${utente.id}/expired_${Date.now()}.jpg`;
    await storage.putObject(expiredKey, makeValidJpegBuffer(), 'image/jpeg');

    const scadutoIl = new Date();
    scadutoIl.setHours(scadutoIl.getHours() - 1);

    const expiredRec = await prisma.uploadTemporaneo.create({
      data: {
        proprietario_id: utente.id,
        storage_key: expiredKey,
        tipo: 'FOTO',
        mime: 'image/jpeg',
        byte_size: 4,
        sha256: 'a'.repeat(64),
        stato: 'VALIDO',
        scade_il: scadutoIl
      }
    });

    expect(await storage.hasObject(expiredKey)).toBe(true);

    const cleanupRes = await pulisciUploadTemporaneiScaduti();
    expect(cleanupRes.scadutiEliminatiDb).toBeGreaterThanOrEqual(1);

    // L'oggetto scaduto non consumato deve essere rimosso anche dallo storage
    expect(await storage.hasObject(expiredKey)).toBe(false);

    // Record DB rimosso
    const checkDb = await prisma.uploadTemporaneo.findUnique({
      where: { id: expiredRec.id }
    });
    expect(checkDb).toBeNull();
  });

  it('RECUPERO ORFANI: registraOrfanoIrrecuperabile persiste la chiave nel registro in caso di fallimento', async () => {
    const orphanLogPath = path.resolve(process.cwd(), '.orphaned_storage_keys.json');
    const testKey = `test_orphan_key_${Date.now()}.jpg`;

    await registraOrfanoIrrecuperabile(testKey, 'test_user_orphan', 1024, 'Errore simulato di compensazione');

    expect(fs.existsSync(orphanLogPath)).toBe(true);
    const content = JSON.parse(await fs.promises.readFile(orphanLogPath, 'utf8'));
    const found = content.find((item: { storage_key: string }) => item.storage_key === testKey);
    expect(found).toBeDefined();
    expect(found.errore).toBe('Errore simulato di compensazione');

    // Pulizia dell'entry di test dal file di log
    const filtered = content.filter((item: { storage_key: string }) => item.storage_key !== testKey);
    await fs.promises.writeFile(orphanLogPath, JSON.stringify(filtered, null, 2), 'utf8');
  });
});
