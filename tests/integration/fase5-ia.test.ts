import { loadTestEnv } from '../../src/lib/test-env';
loadTestEnv();

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  ensureDefaultCategorie,
  moderaSegnalazione,
  modificaSegnalazione
} from '../../src/lib/domain/segnalazioni';
import { cleanTestDatabase, getAndVerifyDatabaseInfo } from '../helpers/test-db';
import { eseguiAnalisiSegnalazione } from '../../src/lib/ia/pipeline';
import { claimNextOutboxJob, processSingleOutboxJob } from '../../src/lib/ia/worker';

const prisma = new PrismaClient();

describe('Fase 5: Pipeline IA, Worker Asincrono, Policy Conservativa e Protezione Concorrenza (T07, T08, T09, T10, T14)', () => {
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      getAndVerifyDatabaseInfo();
      await prisma.$queryRaw`SELECT 1`;
      isDbAvailable = true;
      await cleanTestDatabase(prisma);
      await ensureDefaultCategorie();
    } catch {
      isDbAvailable = false;
    }
  });

  beforeEach(async () => {
    if (isDbAvailable) {
      // Isola la coda Outbox tra i test: marca i job residui come elaborati
      await prisma.outbox.updateMany({
        where: { elaborata_il: null },
        data: { elaborata_il: new Date() }
      });
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      await cleanTestDatabase(prisma);
    }
    await prisma.$disconnect();
  });

  async function createTestUser(role: 'CITTADINO' | 'COMITATO' = 'CITTADINO', prefix = 'user') {
    return prisma.utente.create({
      data: {
        nome: 'Tester',
        cognome: 'IA',
        email_normalizzata: `${prefix}.${Date.now()}.${Math.random().toString(36).substring(7)}@example.com`,
        password_hash: 'hash_test_fase5',
        ruolo: role,
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });
  }

  async function createTestSegnalazione(autoreId: string, descrizione: string, options?: { isVideo?: boolean }) {
    const isVideo = options?.isVideo ?? false;
    const key = `test_media_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    return prisma.$transaction(async (tx) => {
      const seg = await tx.segnalazione.create({
        data: {
          autore_id: autoreId,
          descrizione,
          latitudine: 45.4642,
          longitudine: 9.1900,
          origine_posizione: 'MANUALE',
          stato_avanzamento: 'RICEVUTA',
          stato_moderazione: 'PENDENTE',
          revisione: 1,
          media: {
            create: [
              {
                storage_key: key,
                tipo: isVideo ? 'VIDEO' : 'FOTO',
                mime: isVideo ? 'video/mp4' : 'image/jpeg',
                byte_size: 1024,
                sha256: 'sha256_mock_media_hash',
                stato_file: 'READY'
              }
            ]
          },
          eventi_stato: {
            create: [
              {
                tipo_attore: 'UTENTE',
                attore_id: autoreId,
                ambito: 'AVANZAMENTO',
                a_stato: 'RICEVUTA',
                motivazione: 'Creazione iniziale',
                revisione: 1
              },
              {
                tipo_attore: 'UTENTE',
                attore_id: autoreId,
                ambito: 'MODERAZIONE',
                a_stato: 'PENDENTE',
                motivazione: 'In attesa di moderazione',
                revisione: 1
              }
            ]
          }
        }
      });

      await tx.outbox.create({
        data: {
          segnalazione_id: seg.id,
          revisione: 1,
          tipo_evento: 'SEGNALAZIONE_CREATA',
          payload_json: JSON.stringify({ description: descrizione })
        }
      });

      return seg;
    });
  }

  // =========================================================================
  // T07: Policy Conservativa di Moderazione
  // =========================================================================
  describe('T07 - Moderazione NLP e Policy Conservativa', () => {
    it('T07.1: Testo sicuro e media coerente porta automaticamente a stato APPROVATA', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      const seg = await createTestSegnalazione(user.id, 'Buca profonda in strada via Roma che richiede asfalto');

      const result = await eseguiAnalisiSegnalazione(seg.id, 1);
      expect(result.status).toBe('COMPLETED');
      expect(result.finalState).toBe('APPROVATA');

      const updated = await prisma.segnalazione.findUnique({
        where: { id: seg.id },
        include: {
          analisi_ia: true,
          eventi_stato: { where: { ambito: 'MODERAZIONE' }, orderBy: { creato_il: 'desc' } }
        }
      });

      expect(updated?.stato_moderazione).toBe('APPROVATA');
      expect(updated?.eventi_stato[0].tipo_attore).toBe('SISTEMA');
      expect(updated?.eventi_stato[0].a_stato).toBe('APPROVATA');
      expect(updated?.analisi_ia.length).toBeGreaterThanOrEqual(3); // MODERAZIONE, CLASSIFICAZIONE, EXIF, COERENZA
    });

    it('T07.2: Testo senza match di categoria non blocca l approvazione', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      // Testo generico privo di termini corrispondenti a categorie
      const seg = await createTestSegnalazione(user.id, 'Segnalazione del cittadino con testo neutrale generico');

      const result = await eseguiAnalisiSegnalazione(seg.id, 1);
      expect(result.status).toBe('COMPLETED');
      expect(result.finalState).toBe('APPROVATA');

      const updated = await prisma.segnalazione.findUnique({ where: { id: seg.id } });
      expect(updated?.stato_moderazione).toBe('APPROVATA');
    });

    it('T07.3: Testo con violazione (BLOCK) porta automaticamente a stato RIFIUTATA', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      const seg = await createTestSegnalazione(user.id, 'Testo con insulti e SPAM inaccettabile');

      const result = await eseguiAnalisiSegnalazione(seg.id, 1);
      expect(result.status).toBe('COMPLETED');
      expect(result.finalState).toBe('RIFIUTATA');

      const updated = await prisma.segnalazione.findUnique({ where: { id: seg.id } });
      expect(updated?.stato_moderazione).toBe('RIFIUTATA');
    });

    it('T07.4: Provider moderazione in timeout o offline porta conservativamente a IN_REVISIONE', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      const seg = await createTestSegnalazione(user.id, 'Segnalazione con errore [SIMULATE_OFFLINE] del provider');

      const result = await eseguiAnalisiSegnalazione(seg.id, 1);
      expect(result.status).toBe('COMPLETED');
      expect(result.finalState).toBe('IN_REVISIONE');

      const updated = await prisma.segnalazione.findUnique({ where: { id: seg.id } });
      expect(updated?.stato_moderazione).toBe('IN_REVISIONE');
    });
  });

  // =========================================================================
  // T08: Classificazione Multi-Label e Categorie
  // =========================================================================
  describe('T08 - Classificazione e Sanitizzazione Categorie', () => {
    it('T08.1: Scarta categorie duplicate e fuori catalogo senza rompere i vincoli del DB', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      const seg = await createTestSegnalazione(user.id, 'Segnalazione [SIMULATE_DUPLICATE_OR_INVALID_CATEGORY] per test catalogo');

      const result = await eseguiAnalisiSegnalazione(seg.id, 1);
      expect(result.status).toBe('COMPLETED');

      // Verifica che SuggerimentoCategoria non contenga categorie fuori catalogo
      const suggestions = await prisma.suggerimentoCategoria.findMany({
        include: { categoria: true }
      });
      for (const s of suggestions) {
        expect(s.categoria.attiva).toBe(true);
      }
    });

    it('T08.2: I suggerimenti IA rimangono separati dalle conferme del comitato', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      const seg = await createTestSegnalazione(user.id, 'C e una buca enorme nell asfalto della strada');

      await eseguiAnalisiSegnalazione(seg.id, 1);

      // Le categorie confermate (SegnalazioneCategoria) non devono essere state scritte automaticamente dall IA
      const confermate = await prisma.segnalazioneCategoria.findMany({
        where: { segnalazione_id: seg.id }
      });
      expect(confermate).toHaveLength(0);
    });
  });

  // =========================================================================
  // T09: Analisi Media, Video non Supportato e Incoerenza Visiva
  // =========================================================================
  describe('T09 - Analisi Media, Video e Coerenza', () => {
    it('T09.1: Video non supportato porta a IN_REVISIONE esplicitando il motivo', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      const seg = await createTestSegnalazione(user.id, 'Descrizione valida con allegato video', { isVideo: true });

      const result = await eseguiAnalisiSegnalazione(seg.id, 1);
      expect(result.status).toBe('COMPLETED');
      expect(result.finalState).toBe('IN_REVISIONE');
      expect(result.reason).toContain('video non supportato');

      const updated = await prisma.segnalazione.findUnique({ where: { id: seg.id } });
      expect(updated?.stato_moderazione).toBe('IN_REVISIONE');
    });

    it('T09.2: Immagine incoerente con la descrizione porta a IN_REVISIONE', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      const seg = await createTestSegnalazione(user.id, 'Descrizione buca ma immagine palesemente INCOERENTE');

      const result = await eseguiAnalisiSegnalazione(seg.id, 1);
      expect(result.status).toBe('COMPLETED');
      expect(result.finalState).toBe('IN_REVISIONE');

      const updated = await prisma.segnalazione.findUnique({ where: { id: seg.id } });
      expect(updated?.stato_moderazione).toBe('IN_REVISIONE');
    });
  });

  // =========================================================================
  // T10: Revisioni Superate e Decisione Umana Preservata
  // =========================================================================
  describe('T10 - Protezione Revisioni e Override Umano', () => {
    it('T10.1: Job relativo a revisione superata viene marcato OBSOLETE e non sovrascrive la revisione nuova', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      const seg = await createTestSegnalazione(user.id, 'Descrizione originale rev 1');

      // L autore modifica la segnalazione portandola a revisione 2
      await modificaSegnalazione({
        autoreId: user.id,
        segnalazioneId: seg.id,
        expectedRevision: 1,
        nuovaDescrizione: 'Descrizione modificata rev 2'
      });

      const segRev2 = await prisma.segnalazione.findUnique({ where: { id: seg.id } });
      expect(segRev2?.revisione).toBe(2);
      expect(segRev2?.stato_moderazione).toBe('PENDENTE');

      // Esecuzione tardiva del job della revisione 1
      const resultJobRev1 = await eseguiAnalisiSegnalazione(seg.id, 1);
      expect(resultJobRev1.status).toBe('OBSOLETE');

      // La segnalazione nel DB deve rimanere alla revisione 2 e PENDENTE
      const afterJob = await prisma.segnalazione.findUnique({ where: { id: seg.id } });
      expect(afterJob?.revisione).toBe(2);
      expect(afterJob?.stato_moderazione).toBe('PENDENTE');
    });

    it('T10.2: Decisione umana già presa non viene sovrascritta da job IA tardivo', async () => {
      if (!isDbAvailable) return;
      const cittadino = await createTestUser('CITTADINO', 'autore');
      const comitato = await createTestUser('COMITATO', 'moderatore');

      const seg = await createTestSegnalazione(cittadino.id, 'Segnalazione lecita da verificare');

      // Il comitato modera manualmente prima che l IA termini
      await moderaSegnalazione({
        comitatoId: comitato.id,
        segnalazioneId: seg.id,
        decision: 'RIFIUTATA',
        motivazione: 'Rifiutata manualmente dal comitato per duplicato locale'
      });

      const afterHuman = await prisma.segnalazione.findUnique({ where: { id: seg.id } });
      expect(afterHuman?.stato_moderazione).toBe('RIFIUTATA');

      // Arriva il job IA che normalmente approverebbe
      const result = await eseguiAnalisiSegnalazione(seg.id, 1);
      expect(result.status).toBe('SKIPPED_HUMAN_OVERRIDE');

      // Lo stato finale resta RIFIUTATA (decisione umana sovrana)
      const afterIA = await prisma.segnalazione.findUnique({ where: { id: seg.id } });
      expect(afterIA?.stato_moderazione).toBe('RIFIUTATA');
    });
  });

  // =========================================================================
  // T14: Affidabilità Worker, Acquisizione Concorrente e Retry
  // =========================================================================
  describe('T14 - Worker Outbox, Concorrenza e Retry', () => {
    it('T14.1: Acquisizione concorrente SKIP LOCKED assegna job distinti senza collisioni', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      const seg1 = await createTestSegnalazione(user.id, 'Segnalazione A');
      const seg2 = await createTestSegnalazione(user.id, 'Segnalazione B');

      // Due chiamate concorrenti simultanee a claimNextOutboxJob
      const [claim1, claim2] = await Promise.all([
        claimNextOutboxJob(),
        claimNextOutboxJob()
      ]);

      expect(claim1).not.toBeNull();
      expect(claim2).not.toBeNull();
      expect(claim1?.id).not.toBe(claim2?.id);
      expect(new Set([claim1?.segnalazione_id, claim2?.segnalazione_id])).toEqual(
        new Set([seg1.id, seg2.id])
      );
    });

    it('T14.2: Idempotenza di esecuzione: rieseguire la stessa analisi non genera duplicati', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      const seg = await createTestSegnalazione(user.id, 'Segnalazione per test di idempotenza');

      // Prima esecuzione
      const res1 = await eseguiAnalisiSegnalazione(seg.id, 1);
      expect(res1.status).toBe('COMPLETED');

      const countAnalisi1 = await prisma.analisiIa.count({ where: { segnalazione_id: seg.id } });

      // Seconda esecuzione identica (replay)
      const res2 = await eseguiAnalisiSegnalazione(seg.id, 1);
      expect(res2.status).toBe('SKIPPED_HUMAN_OVERRIDE'); // la segnalazione è già stata APPROVATA al primo giro

      const countAnalisi2 = await prisma.analisiIa.count({ where: { segnalazione_id: seg.id } });
      // Non ci devono essere duplicati di record AnalisiIa
      expect(countAnalisi2).toBe(countAnalisi1);
    });

    it('T14.3: Retry limitati e fallback conservativo su errore continuativo', async () => {
      if (!isDbAvailable) return;
      const user = await createTestUser();
      const seg = await createTestSegnalazione(user.id, 'Segnalazione destinata a fallire');

      // Creiamo un custom adapter che lancia sempre un eccezione imprevista
      const crashingAdapters = {
        moderation: {
          name: 'crasher',
          isSimulated: true,
          moderate: async () => {
            throw new Error('Crash fatale del provider');
          }
        }
      };

      // Tentativo 1: schedula retry
      const p1 = await processSingleOutboxJob(crashingAdapters, { maxRetries: 3 });
      expect(p1.outcome).toBe('RETRY_SCHEDULED');

      // Resettiamo prossimo_tentativo_il a null per simulare la scadenza immediata del backoff
      await prisma.outbox.update({
        where: { id: p1.jobId },
        data: { prossimo_tentativo_il: null }
      });

      // Tentativo 2: schedula retry
      const p2 = await processSingleOutboxJob(crashingAdapters, { maxRetries: 3 });
      expect(p2.outcome).toBe('RETRY_SCHEDULED');

      await prisma.outbox.update({
        where: { id: p2.jobId },
        data: { prossimo_tentativo_il: null }
      });

      // Tentativo 3: raggiunge maxRetries e applica la policy conservativa a IN_REVISIONE
      const p3 = await processSingleOutboxJob(crashingAdapters, { maxRetries: 3 });
      expect(p3.outcome).toBe('FAILED_MAX_RETRIES');

      const finalSeg = await prisma.segnalazione.findUnique({ where: { id: seg.id } });
      expect(finalSeg?.stato_moderazione).toBe('IN_REVISIONE');

      const finalOutbox = await prisma.outbox.findUnique({ where: { id: p3.jobId } });
      expect(finalOutbox?.elaborata_il).not.toBeNull();
    });
  });
});
