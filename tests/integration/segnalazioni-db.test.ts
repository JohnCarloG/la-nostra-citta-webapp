import { loadTestEnv } from '../../src/lib/test-env';
loadTestEnv();

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createSegnalazioneAtomica, aggiungiSostegno, rimuoviSostegno } from '../../src/lib/domain/segnalazioni';
import * as segnalazioniDomain from '../../src/lib/domain/segnalazioni';
import { cleanTestDatabase, getAndVerifyDatabaseInfo } from '../helpers/test-db';

const prisma = new PrismaClient();

describe('Integrazione DB MySQL: Segnalazioni, Vincoli, Upload e Transazioni', () => {
  let isDbAvailable = false;
  let connectionError: string | null = null;

  beforeAll(async () => {
    try {
      getAndVerifyDatabaseInfo();
      await prisma.$queryRaw`SELECT 1`;
      isDbAvailable = true;
      await cleanTestDatabase(prisma);
    } catch (err) {
      isDbAvailable = false;
      connectionError = (err as Error).message;
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      await cleanTestDatabase(prisma);
    }
    await prisma.$disconnect();
  });

  it('Dovrebbe rifiutare createSegnalazioneAtomica senza media e verificare rollback atomico', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    const autore = await prisma.utente.create({
      data: {
        nome: 'Test',
        cognome: 'Autore',
        email_normalizzata: `autore.nomedia.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });

    const countPrima = await prisma.segnalazione.count();

    await expect(
      createSegnalazioneAtomica(autore.id, 'Segnalazione senza media prova territorio', 45.4642, 9.1900, [])
    ).rejects.toThrow('La segnalazione richiede almeno un media');

    const countDopo = await prisma.segnalazione.count();
    expect(countDopo).toBe(countPrima);
  });

  it('Consumo atomico e monouso di UploadTemporaneo: rifiuta riutilizzo e protegge concorrenza', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    const autore = await prisma.utente.create({
      data: {
        nome: 'Autore',
        cognome: 'Upload',
        email_normalizzata: `autore.upload.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });

    const storageKeyTest = `test_upload_key_${Date.now()}`;
    const scadeIl = new Date();
    scadeIl.setHours(scadeIl.getHours() + 2);

    // Creiamo un upload temporaneo valido e non scaduto
    await prisma.uploadTemporaneo.create({
      data: {
        proprietario_id: autore.id,
        storage_key: storageKeyTest,
        tipo: 'FOTO',
        mime: 'image/jpeg',
        byte_size: 2048,
        sha256: 'd'.repeat(64),
        stato: 'VALIDO',
        scade_il: scadeIl
      }
    });

    // Primo consumo: crea la segnalazione e consuma l'upload
    const seg = await createSegnalazioneAtomica(
      autore.id,
      'Descrizione segnalazione valida per collaudo upload',
      45.4642,
      9.1900,
      [storageKeyTest]
    );
    expect(seg).toBeDefined();

    // Verifica su DB: lo stato dell'upload deve essere CONSUMATO
    const uploadDb = await prisma.uploadTemporaneo.findUnique({
      where: { storage_key: storageKeyTest }
    });
    expect(uploadDb?.stato).toBe('CONSUMATO');
    expect(uploadDb?.consumato_il).not.toBeNull();

    // Secondo tentativo di riutilizzo della stessa chiave: deve fallire tassativamente
    await expect(
      createSegnalazioneAtomica(
        autore.id,
        'Tentativo fraudolento di riuso dello stesso upload',
        45.4642,
        9.1900,
        [storageKeyTest]
      )
    ).rejects.toThrow('Impossibile consumare gli upload');
  });

  it('Dovrebbe impedire autosostegno e garantire assenza di inserimenti in Sostegno', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    const autore = await prisma.utente.create({
      data: {
        nome: 'Autore',
        cognome: 'Civico',
        email_normalizzata: `autore.civico.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });

    const segnalazione = await prisma.segnalazione.create({
      data: {
        autore_id: autore.id,
        descrizione: 'Segnalazione per test sostegno',
        latitudine: 45.4642,
        longitudine: 9.1900,
        origine_posizione: 'MANUALE',
        stato_avanzamento: 'PRESA_IN_CARICO',
        stato_moderazione: 'APPROVATA',
        revisione: 1,
        media: {
          create: {
            storage_key: `media_sostegno_${Date.now()}`,
            tipo: 'FOTO',
            mime: 'image/jpeg',
            byte_size: 1024,
            sha256: 'a'.repeat(64),
            stato_file: 'READY'
          }
        }
      }
    });

    const sostegniPrima = await prisma.sostegno.count();

    // Tentativo di autosostegno: deve fallire
    await expect(
      aggiungiSostegno(autore.id, segnalazione.id)
    ).rejects.toThrow('Autosostegno vietato');

    const sostegniDopo = await prisma.sostegno.count();
    expect(sostegniDopo).toBe(sostegniPrima);
  });

  it('Sostegno da terzo utente: aggiunta con traccia audit e revoca corretta', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    const autore = await prisma.utente.create({
      data: {
        nome: 'Autore',
        cognome: 'Principale',
        email_normalizzata: `autore.p.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });

    const sostenitore = await prisma.utente.create({
      data: {
        nome: 'Sostenitore',
        cognome: 'Terzo',
        email_normalizzata: `sostenitore.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });

    const segnalazione = await prisma.segnalazione.create({
      data: {
        autore_id: autore.id,
        descrizione: 'Segnalazione con sostegno auditabile',
        latitudine: 45.4642,
        longitudine: 9.1900,
        origine_posizione: 'MANUALE',
        stato_avanzamento: 'PRESA_IN_CARICO',
        stato_moderazione: 'APPROVATA',
        revisione: 1,
        media: {
          create: {
            storage_key: `media_audit_${Date.now()}`,
            tipo: 'FOTO',
            mime: 'image/jpeg',
            byte_size: 1024,
            sha256: 'f'.repeat(64),
            stato_file: 'READY'
          }
        }
      }
    });

    // 1. Aggiungi sostegno
    await aggiungiSostegno(sostenitore.id, segnalazione.id);
    const sostegnoDb = await prisma.sostegno.findUnique({
      where: { utente_id_segnalazione_id: { utente_id: sostenitore.id, segnalazione_id: segnalazione.id } }
    });
    expect(sostegnoDb).not.toBeNull();

    // Verifica traccia AuditEvento per aggiunta
    const auditAdd = await prisma.auditEvento.findFirst({
      where: { attore_id: sostenitore.id, segnalazione_id: segnalazione.id, azione: 'AGGIUNGI_SOSTEGNO' }
    });
    expect(auditAdd).not.toBeNull();

    // 2. Rimuovi sostegno (revocabilità RF06)
    await rimuoviSostegno(sostenitore.id, segnalazione.id);
    const sostegnoDopoRimozione = await prisma.sostegno.findUnique({
      where: { utente_id_segnalazione_id: { utente_id: sostenitore.id, segnalazione_id: segnalazioneId(segnalazione.id) } }
    });
    expect(sostegnoDopoRimozione).toBeNull();

    // Verifica traccia AuditEvento per rimozione
    const auditRemove = await prisma.auditEvento.findFirst({
      where: { attore_id: sostenitore.id, segnalazione_id: segnalazione.id, azione: 'RIMUOVI_SOSTEGNO' }
    });
    expect(auditRemove).not.toBeNull();
  });

  function segnalazioneId(id: string) { return id; }

  it('Dovrebbe verificare vincolo DB Foreign Key composta Media/AnalisiIa a livello MySQL InnoDB', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    const autore = await prisma.utente.create({
      data: {
        nome: 'Autore',
        cognome: 'Due',
        email_normalizzata: `autore.due.${Date.now()}@example.com`,
        password_hash: 'hash_test',
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });

    const seg1 = await prisma.segnalazione.create({
      data: {
        autore_id: autore.id,
        descrizione: 'Segnalazione 1 con media proprio',
        latitudine: 45.0,
        longitudine: 9.0,
        origine_posizione: 'MANUALE',
        media: {
          create: {
            storage_key: `media_seg1_${Date.now()}`,
            tipo: 'FOTO',
            mime: 'image/jpeg',
            byte_size: 500,
            sha256: 'b'.repeat(64),
            stato_file: 'READY'
          }
        }
      },
      include: { media: true }
    });

    const seg2 = await prisma.segnalazione.create({
      data: {
        autore_id: autore.id,
        descrizione: 'Segnalazione 2 con media proprio',
        latitudine: 45.1,
        longitudine: 9.1,
        origine_posizione: 'MANUALE',
        media: {
          create: {
            storage_key: `media_seg2_${Date.now()}`,
            tipo: 'FOTO',
            mime: 'image/jpeg',
            byte_size: 500,
            sha256: 'c'.repeat(64),
            stato_file: 'READY'
          }
        }
      },
      include: { media: true }
    });

    const mediaSeg2 = seg2.media[0];

    // Tentativo di associare ad AnalisiIa di seg1 il media appartenente a seg2.
    // La FK composta (media_id, segnalazione_id) verso Media(id, segnalazione_id) deve bloccare l'inserimento.
    await expect(
      prisma.analisiIa.create({
        data: {
          segnalazione_id: seg1.id,
          media_id: mediaSeg2.id, // appartiene a seg2, NON a seg1!
          revisione: 1,
          modulo: 'EXIF',
          versione_modello: 'v1',
          versione_policy: 'p1',
          input_hash: 'hash1',
          stato_esecuzione: 'QUEUED'
        }
      })
    ).rejects.toThrow();

    // Creiamo un'AnalisiIa lecita associata a mediaSeg2 e seg2
    const analisiValida = await prisma.analisiIa.create({
      data: {
        segnalazione_id: seg2.id,
        media_id: mediaSeg2.id,
        revisione: 1,
        modulo: 'EXIF',
        versione_modello: 'v1',
        versione_policy: 'p1',
        input_hash: `hash_valido_${Date.now()}`,
        stato_esecuzione: 'QUEUED'
      }
    });

    // Verifica divieto ON UPDATE RESTRICT: tentare di spostare il Media a un'altra segnalazione deve fallire a livello engine
    await expect(
      prisma.media.update({
        where: { id: mediaSeg2.id },
        data: { segnalazione_id: seg1.id }
      })
    ).rejects.toThrow();

    // Pulizia dell'analisi di prova creata
    await prisma.analisiIa.delete({ where: { id: analisiValida.id } });
  });

  it('Dovrebbe verificare vincoli MySQL CHECK chk_audit_attore e chk_evento_attore', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    // 1. AuditEvento con SISTEMA ma attore_id valorizzato deve violare chk_audit_attore
    await expect(
      prisma.auditEvento.create({
        data: {
          tipo_attore: 'SISTEMA',
          attore_id: 'fake-user-id', // SISTEMA richiede attore_id IS NULL
          azione: 'TEST_CHECK_FAIL',
          dati_json: '{}'
        }
      })
    ).rejects.toThrow();

    // 2. AuditEvento con UTENTE ma attore_id NULL deve violare chk_audit_attore
    await expect(
      prisma.auditEvento.create({
        data: {
          tipo_attore: 'UTENTE',
          attore_id: null, // UTENTE richiede attore_id NOT NULL
          azione: 'TEST_CHECK_FAIL_2',
          dati_json: '{}'
        }
      })
    ).rejects.toThrow();

    // 3. EventoStato con SISTEMA ma attore_id valorizzato deve violare chk_evento_attore
    await expect(
      prisma.$executeRaw`
        INSERT INTO EventoStato (id, segnalazione_id, attore_id, tipo_attore, ambito, da_stato, a_stato, motivazione, revisione, creato_il)
        VALUES (UUID(), UUID(), 'fake-attore-id', 'SISTEMA', 'AVANZAMENTO', NULL, 'RICEVUTA', 'Test', 1, NOW(3));
      `
    ).rejects.toThrow();
  });

  it('Dichiara esplicitamente che il percorso di rimozione media è mancante e non espone cancellazioni non protette', () => {
    const exportedKeys = Object.keys(segnalazioniDomain);
    expect(exportedKeys).not.toContain('deleteMedia');
    expect(exportedKeys).not.toContain('rimuoviMedia');
    expect(exportedKeys).not.toContain('cancellaUltimoMedia');
  });
});
