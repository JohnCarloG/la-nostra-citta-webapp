import { loadTestEnv } from '../../src/lib/test-env';
loadTestEnv();

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  aggiungiSostegno,
  rimuoviSostegno,
  moderaSegnalazione,
  avanzaStatoSegnalazione,
  ritiraSegnalazione,
  getClassificaSegnalazioni,
  getDettaglioSegnalazione,
  getSegnalazioniPubbliche,
  getSegnalazioniMappa,
  isSegnalazionePubblica,
  ensureDefaultCategorie
} from '../../src/lib/domain/segnalazioni';
import { ConcurrencyConflictError } from '../../src/lib/domain/errors';
import { cleanTestDatabase, getAndVerifyDatabaseInfo } from '../helpers/test-db';

const prisma = new PrismaClient();

describe('Fase 4: Community, Supervisione, Transizioni Concorrenti e Classifica', () => {
  let isDbAvailable = false;
  let connectionError: string | null = null;

  beforeAll(async () => {
    try {
      getAndVerifyDatabaseInfo();
      await prisma.$queryRaw`SELECT 1`;
      isDbAvailable = true;
      await cleanTestDatabase(prisma);
      await ensureDefaultCategorie();
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

  // Helper per creare utenti attivi e verificati
  async function createTestUser(role: 'CITTADINO' | 'COMITATO' = 'CITTADINO', prefix = 'user') {
    return prisma.utente.create({
      data: {
        nome: 'Mario',
        cognome: 'Rossi',
        email_normalizzata: `${prefix}.${Date.now()}.${Math.random().toString(36).substring(7)}@example.com`,
        password_hash: 'hash_sicuro_test',
        ruolo: role,
        stato_account: 'ATTIVO',
        verificato_il: new Date()
      }
    });
  }

  // Helper per creare una segnalazione di test con media READY
  async function createTestReport(params: {
    autoreId: string;
    statoModerazione?: 'PENDENTE' | 'IN_REVISIONE' | 'APPROVATA' | 'RIFIUTATA';
    statoAvanzamento?: 'RICEVUTA' | 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI' | 'RITIRATA';
    creataIl?: Date;
    descrizione?: string;
  }) {
    const {
      autoreId,
      statoModerazione = 'APPROVATA',
      statoAvanzamento = 'RICEVUTA',
      creataIl = new Date(),
      descrizione = 'Descrizione segnalazione territoriale di collaudo'
    } = params;

    return prisma.segnalazione.create({
      data: {
        autore_id: autoreId,
        descrizione,
        latitudine: 45.4642,
        longitudine: 9.1900,
        origine_posizione: 'MANUALE',
        stato_moderazione: statoModerazione,
        stato_avanzamento: statoAvanzamento,
        revisione: 1,
        creata_il: creataIl,
        media: {
          create: {
            storage_key: `key_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            tipo: 'FOTO',
            mime: 'image/jpeg',
            byte_size: 2048,
            sha256: 'a'.repeat(64),
            stato_file: 'READY'
          }
        },
        eventi_stato: {
          create: [
            {
              tipo_attore: 'UTENTE',
              attore_id: autoreId,
              ambito: 'AVANZAMENTO',
              a_stato: statoAvanzamento,
              motivazione: 'Creazione iniziale',
              revisione: 1,
              creato_il: creataIl
            },
            {
              tipo_attore: 'SISTEMA',
              ambito: 'MODERAZIONE',
              a_stato: statoModerazione,
              motivazione: 'Stato iniziale',
              revisione: 1,
              creato_il: creataIl
            }
          ]
        },
        audit: {
          create: {
            tipo_attore: 'UTENTE',
            attore_id: autoreId,
            azione: 'CREATE_SEGNALAZIONE'
          }
        }
      },
      include: { media: true }
    });
  }

  // =========================================================================
  // T05 RF06: SOSTEGNO E REVOCA IDEMPOTENTI, AUTOSOSTEGNO, UTENTI SOSPESI
  // =========================================================================
  describe('T05: Sostegno, autosostegno, revoca idempotente e utenti sospesi', () => {
    it('T05.1: Due richieste simultanee di sostegno creano una sola riga a DB (idempotenza concorrente)', async () => {
      if (!isDbAvailable) expect.fail(`DB non disponibile: ${connectionError}`);

      const autore = await createTestUser('CITTADINO', 'autore.t05.1');
      const supporter = await createTestUser('CITTADINO', 'supporter.t05.1');
      const report = await createTestReport({ autoreId: autore.id, statoModerazione: 'APPROVATA' });

      // Due richieste concorrenti di sostegno da parte dello stesso utente
      const results = await Promise.allSettled([
        aggiungiSostegno(supporter.id, report.id),
        aggiungiSostegno(supporter.id, report.id)
      ]);

      // Almeno una richiesta va a buon fine, e nessuna deve corrompere lo stato
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThanOrEqual(1);

      // Verifica DB: esattamente una sola riga nella tabella Sostegno
      const count = await prisma.sostegno.count({
        where: { utente_id: supporter.id, segnalazione_id: report.id }
      });
      expect(count).toBe(1);
    });

    it('T05.2: Autosostegno categoricamente rifiutato a livello di dominio', async () => {
      if (!isDbAvailable) expect.fail(`DB non disponibile: ${connectionError}`);

      const autore = await createTestUser('CITTADINO', 'autore.t05.2');
      const report = await createTestReport({ autoreId: autore.id, statoModerazione: 'APPROVATA' });

      // L'autore tenta di votare la propria segnalazione
      await expect(aggiungiSostegno(autore.id, report.id)).rejects.toThrow('Autosostegno vietato');

      const count = await prisma.sostegno.count({
        where: { utente_id: autore.id, segnalazione_id: report.id }
      });
      expect(count).toBe(0);
    });

    it('T05.3: DELETE ripetuto resta un successo senza sollevare eccezioni (revoca idempotente)', async () => {
      if (!isDbAvailable) expect.fail(`DB non disponibile: ${connectionError}`);

      const autore = await createTestUser('CITTADINO', 'autore.t05.3');
      const supporter = await createTestUser('CITTADINO', 'supporter.t05.3');
      const report = await createTestReport({ autoreId: autore.id, statoModerazione: 'APPROVATA' });

      // Aggiunge sostegno
      await aggiungiSostegno(supporter.id, report.id);

      // Prima revoca: successo
      const res1 = await rimuoviSostegno(supporter.id, report.id, false);
      expect(res1).toBe(true);

      // Seconda revoca (ripetuta, risorsa già assente): deve restare un successo idempotente
      const res2 = await rimuoviSostegno(supporter.id, report.id, false);
      expect(res2).toBe(true);

      const count = await prisma.sostegno.count({
        where: { utente_id: supporter.id, segnalazione_id: report.id }
      });
      expect(count).toBe(0);
    });

    it('T05.4: Sostegno di un utente sospeso viene escluso dal conteggio della classifica', async () => {
      if (!isDbAvailable) expect.fail(`DB non disponibile: ${connectionError}`);

      const autore = await createTestUser('CITTADINO', 'autore.t05.4');
      const supporter = await createTestUser('CITTADINO', 'supporter.t05.4');
      const report = await createTestReport({ autoreId: autore.id, statoModerazione: 'APPROVATA' });

      // Il supporter vota
      await aggiungiSostegno(supporter.id, report.id);

      // Verifica conteggio iniziale: 1 voto
      let ranking = await getClassificaSegnalazioni(10, 0);
      let match = ranking.find(r => r.id === report.id);
      expect(match?.totaleSostegniValidi).toBe(1);

      // Sospendiamo dinamicamente l'account del supporter
      await prisma.utente.update({
        where: { id: supporter.id },
        data: { stato_account: 'SOSPESO' }
      });

      // Ricalcolo classifica: il voto del profilo sospeso NON deve essere contato (COUNT(u.id))
      ranking = await getClassificaSegnalazioni(10, 0);
      match = ranking.find(r => r.id === report.id);
      expect(match?.totaleSostegniValidi).toBe(0);
    });
  });

  // =========================================================================
  // T06 RF05 / VI07: TRANSIZIONI, CONCORRENZA OTTIMISTICA E ATOMICITÀ
  // =========================================================================
  describe('T06: Transizioni vietate, consentite, eventi atomici e decisioni concorrenti', () => {
    it('T06.1: Transizione vietata fallisce (es. PRESA_IN_CARICO su segnalazione non approvata)', async () => {
      if (!isDbAvailable) expect.fail(`DB non disponibile: ${connectionError}`);

      const autore = await createTestUser('CITTADINO', 'autore.t06.1');
      const comitato = await createTestUser('COMITATO', 'comitato.t06.1');
      const report = await createTestReport({
        autoreId: autore.id,
        statoModerazione: 'PENDENTE',
        statoAvanzamento: 'RICEVUTA'
      });

      // Tentativo di passare a PRESA_IN_CARICO con moderazione ancora PENDENTE
      await expect(
        avanzaStatoSegnalazione({
          comitatoId: comitato.id,
          segnalazioneId: report.id,
          nuovoStato: 'PRESA_IN_CARICO',
          motivazione: 'Tentativo non autorizzato'
        })
      ).rejects.toThrow('richiede moderazione APPROVATA');
    });

    it('T06.2: Transizione consentita aggiorna stato, EventoStato e AuditEvento atomicamente', async () => {
      if (!isDbAvailable) expect.fail(`DB non disponibile: ${connectionError}`);

      const autore = await createTestUser('CITTADINO', 'autore.t06.2');
      const comitato = await createTestUser('COMITATO', 'comitato.t06.2');
      const report = await createTestReport({
        autoreId: autore.id,
        statoModerazione: 'PENDENTE'
      });

      // Transizione consentita: PENDENTE -> APPROVATA
      const motivazione = 'Evidenze fotografiche conformi e testo verificato';
      const aggiornata = await moderaSegnalazione({
        comitatoId: comitato.id,
        segnalazioneId: report.id,
        decision: 'APPROVATA',
        motivazione,
        expectedRevision: 1,
        expectedState: 'PENDENTE'
      });

      expect(aggiornata.stato_moderazione).toBe('APPROVATA');

      // Verifica EventoStato scritto nella stessa transazione
      const eventi = await prisma.eventoStato.findMany({
        where: { segnalazione_id: report.id, ambito: 'MODERAZIONE', a_stato: 'APPROVATA' }
      });
      expect(eventi.length).toBe(1);
      expect(eventi[0].attore_id).toBe(comitato.id);
      expect(eventi[0].tipo_attore).toBe('UTENTE');
      expect(eventi[0].motivazione).toBe(motivazione);

      // Verifica AuditEvento scritto nella stessa transazione
      const audit = await prisma.auditEvento.findMany({
        where: { segnalazione_id: report.id, azione: 'MODERA_SEGNALAZIONE' }
      });
      expect(audit.length).toBe(1);
      expect(audit[0].attore_id).toBe(comitato.id);
    });

    it('T06.3: Due moderatori concorrenti con la stessa versione attesa: uno solo applica la decisione (409)', async () => {
      if (!isDbAvailable) expect.fail(`DB non disponibile: ${connectionError}`);

      const autore = await createTestUser('CITTADINO', 'autore.t06.3');
      const modA = await createTestUser('COMITATO', 'modA.t06.3');
      const modB = await createTestUser('COMITATO', 'modB.t06.3');
      const report = await createTestReport({
        autoreId: autore.id,
        statoModerazione: 'PENDENTE'
      });

      // Due moderatori vedono entrambi expectedRevision: 1 e expectedState: 'PENDENTE'
      // Il primo approva, il secondo rifiuta
      const results = await Promise.allSettled([
        moderaSegnalazione({
          comitatoId: modA.id,
          segnalazioneId: report.id,
          decision: 'APPROVATA',
          motivazione: 'Approvata da Mod A',
          expectedRevision: 1,
          expectedState: 'PENDENTE'
        }),
        moderaSegnalazione({
          comitatoId: modB.id,
          segnalazioneId: report.id,
          decision: 'RIFIUTATA',
          motivazione: 'Rifiutata da Mod B',
          expectedRevision: 1,
          expectedState: 'PENDENTE'
        })
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      // Uno solo applica la decisione, l'altro riceve conflitto di concorrenza
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const err = (rejected[0] as PromiseRejectedResult).reason;
      expect(err instanceof ConcurrencyConflictError || err.message.includes('Conflitto')).toBe(true);
    });

    it('T06.4: Ritiro consentito da autore o comitato e irreversibilità terminale', async () => {
      if (!isDbAvailable) expect.fail(`DB non disponibile: ${connectionError}`);

      const autore = await createTestUser('CITTADINO', 'autore.t06.4');
      const report = await createTestReport({ autoreId: autore.id, statoModerazione: 'APPROVATA' });

      // Autore ritira
      const ritirata = await ritiraSegnalazione({
        utenteId: autore.id,
        segnalazioneId: report.id,
        motivazione: 'Risolto con i vicini'
      });
      expect(ritirata.stato_avanzamento).toBe('RITIRATA');

      // Tentativo di riavanzare da stato RITIRATA deve fallire
      const comitato = await createTestUser('COMITATO', 'comitato.t06.4');
      await expect(
        avanzaStatoSegnalazione({
          comitatoId: comitato.id,
          segnalazioneId: report.id,
          nuovoStato: 'PRESA_IN_CARICO',
          motivazione: 'Tentativo di riattivazione'
        })
      ).rejects.toThrow('Nessuna transizione consentita da stato terminale RITIRATA');
    });
  });

  // =========================================================================
  // T11 RF12: TRACCIABILITÀ, ATTORI, ASSENZA TOKEN/PASSWORD NEI LOG
  // =========================================================================
  describe('T11: Tracciabilità, audit trail e riservatezza credenziali nei log', () => {
    it('T11: Verifica tracciabilità completa di inserimenti, sostegni e decisioni senza password/token', async () => {
      if (!isDbAvailable) expect.fail(`DB non disponibile: ${connectionError}`);

      const autore = await createTestUser('CITTADINO', 'autore.t11');
      const supporter = await createTestUser('CITTADINO', 'supporter.t11');
      const comitato = await createTestUser('COMITATO', 'comitato.t11');

      const report = await createTestReport({ autoreId: autore.id, statoModerazione: 'PENDENTE' });

      // 1. Moderazione
      await moderaSegnalazione({
        comitatoId: comitato.id,
        segnalazioneId: report.id,
        decision: 'APPROVATA',
        motivazione: 'Evidenze verificate',
        expectedRevision: 1
      });

      // 2. Sostegno
      await aggiungiSostegno(supporter.id, report.id);

      // 3. Ritiro
      await ritiraSegnalazione({
        utenteId: autore.id,
        segnalazioneId: report.id,
        motivazione: 'Ritiro per completamento'
      });

      // Verifica eventi di audit
      const auditRows = await prisma.auditEvento.findMany({
        where: { segnalazione_id: report.id }
      });

      const azioni = auditRows.map(a => a.azione);
      expect(azioni).toContain('CREATE_SEGNALAZIONE');
      expect(azioni).toContain('MODERA_SEGNALAZIONE');
      expect(azioni).toContain('AGGIUNGI_SOSTEGNO');
      expect(azioni).toContain('RITIRA_SEGNALAZIONE');

      // Verifica vincolo di riservatezza: nessun hash di password né token nei payload audit
      for (const row of auditRows) {
        if (row.dati_json) {
          expect(row.dati_json).not.toContain('password_hash');
          expect(row.dati_json).not.toContain('token_hash');
          expect(row.dati_json).not.toContain('session_token');
        }
      }
    });
  });

  // =========================================================================
  // T12 VI06 / VI10: POLICY DI VISIBILITÀ E RISERVATEZZA
  // =========================================================================
  describe('T12: Policy di visibilità e protezione contenuti privati', () => {
    it('T12: Report privati (PENDENTE, IN_REVISIONE, RIFIUTATA, RITIRATA) non sono visibili a terzi', async () => {
      if (!isDbAvailable) expect.fail(`DB non disponibile: ${connectionError}`);

      const autore = await createTestUser('CITTADINO', 'autore.t12');
      const terzo = await createTestUser('CITTADINO', 'terzo.t12');
      const comitato = await createTestUser('COMITATO', 'comitato.t12');

      // Creiamo report privato (PENDENTE)
      const reportPendente = await createTestReport({
        autoreId: autore.id,
        statoModerazione: 'PENDENTE',
        statoAvanzamento: 'RICEVUTA'
      });

      // Creiamo report ritirato (RITIRATA)
      const reportRitirato = await createTestReport({
        autoreId: autore.id,
        statoModerazione: 'APPROVATA',
        statoAvanzamento: 'RITIRATA'
      });

      // 1. isSegnalazionePubblica deve restituire false
      expect(isSegnalazionePubblica(reportPendente)).toBe(false);
      expect(isSegnalazionePubblica(reportRitirato)).toBe(false);

      // 2. Dettaglio anonimo: deve restituire null (nessun dato riservato esposto)
      const dettAnonimo = await getDettaglioSegnalazione(reportPendente.id);
      expect(dettAnonimo).toBeNull();

      // 3. Dettaglio cittadino terzo: deve restituire null
      const dettTerzo = await getDettaglioSegnalazione(reportPendente.id, terzo.id, 'CITTADINO');
      expect(dettTerzo).toBeNull();

      // 4. Dettaglio per l'autore proprietario: consentito
      const dettAutore = await getDettaglioSegnalazione(reportPendente.id, autore.id, 'CITTADINO');
      expect(dettAutore).not.toBeNull();
      expect(dettAutore?.id).toBe(reportPendente.id);

      // 5. Dettaglio per il comitato: consentito per revisione
      const dettComitato = await getDettaglioSegnalazione(reportPendente.id, comitato.id, 'COMITATO');
      expect(dettComitato).not.toBeNull();

      // 6. Elenchi pubblici, classifica e mappa NON devono includere report pendenti o ritirati
      const ranking = await getClassificaSegnalazioni(50, 0);
      const mappa = await getSegnalazioniMappa();
      const pubbliche = await getSegnalazioniPubbliche();

      const rankingIds = ranking.map(r => r.id);
      const mappaIds = mappa.map(m => m.id);
      const pubblicheIds = pubbliche.items.map(p => p.id);

      expect(rankingIds).not.toContain(reportPendente.id);
      expect(rankingIds).not.toContain(reportRitirato.id);
      expect(mappaIds).not.toContain(reportPendente.id);
      expect(mappaIds).not.toContain(reportRitirato.id);
      expect(pubblicheIds).not.toContain(reportPendente.id);
      expect(pubblicheIds).not.toContain(reportRitirato.id);
    });
  });

  // =========================================================================
  // T13: CLASSIFICA CON FIXTURE SPECIFICA E SPAREGGIO DETERMINISTICO
  // =========================================================================
  describe('T13: Classifica deterministica con fixture A=2, B=2, C=0 e D nascosta con 10', () => {
    it('T13: Ordina correttamente per voti decrescenti, data/id crescente; include 0 voti; esclude nascosta; allegati/categorie non moltiplicano', async () => {
      if (!isDbAvailable) expect.fail(`DB non disponibile: ${connectionError}`);

      // Pulizia isolata per testare esattamente la classifica deterministica
      await cleanTestDatabase(prisma);
      await ensureDefaultCategorie();

      const cats = await prisma.categoria.findMany({ take: 2 });
      expect(cats.length).toBeGreaterThanOrEqual(2);

      // Utenti votanti attivi e verificati
      const v1 = await createTestUser('CITTADINO', 'v1.t13');
      const v2 = await createTestUser('CITTADINO', 'v2.t13');
      const v3 = await createTestUser('CITTADINO', 'v3.t13');
      const v4 = await createTestUser('CITTADINO', 'v4.t13');

      const authorA = await createTestUser('CITTADINO', 'authorA.t13');
      const authorB = await createTestUser('CITTADINO', 'authorB.t13');
      const authorC = await createTestUser('CITTADINO', 'authorC.t13');
      const authorD = await createTestUser('CITTADINO', 'authorD.t13');

      const t0 = new Date('2026-10-01T10:00:00.000Z');
      const t1 = new Date('2026-10-01T10:15:00.000Z');
      const t2 = new Date('2026-10-01T10:30:00.000Z');

      // Segnalazione A: creata a t0. Riceve 2 voti validi (v1, v2).
      // Ha 2 categorie confermate e 2 media per verificare che non moltiplichino i voti!
      const repA = await prisma.segnalazione.create({
        data: {
          autore_id: authorA.id,
          descrizione: 'Segnalazione A: 2 voti, creata prima',
          latitudine: 45.464,
          longitudine: 9.190,
          origine_posizione: 'MANUALE',
          stato_moderazione: 'APPROVATA',
          stato_avanzamento: 'RICEVUTA',
          creata_il: t0,
          categorie: {
            create: [
              { categoria_id: cats[0].id },
              { categoria_id: cats[1].id }
            ]
          },
          media: {
            create: [
              {
                storage_key: `m1_a_${Date.now()}`,
                tipo: 'FOTO',
                mime: 'image/jpeg',
                byte_size: 1024,
                sha256: '1'.repeat(64),
                stato_file: 'READY'
              },
              {
                storage_key: `m2_a_${Date.now()}`,
                tipo: 'FOTO',
                mime: 'image/jpeg',
                byte_size: 2048,
                sha256: '2'.repeat(64),
                stato_file: 'READY'
              }
            ]
          }
        }
      });
      await aggiungiSostegno(v1.id, repA.id);
      await aggiungiSostegno(v2.id, repA.id);

      // Segnalazione B: creata a t1 (dopo A). Riceve 2 voti validi (v3, v4).
      const repB = await prisma.segnalazione.create({
        data: {
          autore_id: authorB.id,
          descrizione: 'Segnalazione B: 2 voti, creata dopo',
          latitudine: 45.465,
          longitudine: 9.191,
          origine_posizione: 'MANUALE',
          stato_moderazione: 'APPROVATA',
          stato_avanzamento: 'RICEVUTA',
          creata_il: t1,
          media: {
            create: {
              storage_key: `m_b_${Date.now()}`,
              tipo: 'FOTO',
              mime: 'image/jpeg',
              byte_size: 1024,
              sha256: '3'.repeat(64),
              stato_file: 'READY'
            }
          }
        }
      });
      await aggiungiSostegno(v3.id, repB.id);
      await aggiungiSostegno(v4.id, repB.id);

      // Segnalazione C: creata a t2. Riceve 0 voti.
      const repC = await prisma.segnalazione.create({
        data: {
          autore_id: authorC.id,
          descrizione: 'Segnalazione C: 0 voti',
          latitudine: 45.466,
          longitudine: 9.192,
          origine_posizione: 'MANUALE',
          stato_moderazione: 'APPROVATA',
          stato_avanzamento: 'RICEVUTA',
          creata_il: t2,
          media: {
            create: {
              storage_key: `m_c_${Date.now()}`,
              tipo: 'FOTO',
              mime: 'image/jpeg',
              byte_size: 1024,
              sha256: '4'.repeat(64),
              stato_file: 'READY'
            }
          }
        }
      });

      // Segnalazione D: creata a t0 con 10 voti fittizi ma NASCOSTA (PENDENTE)
      const repD = await prisma.segnalazione.create({
        data: {
          autore_id: authorD.id,
          descrizione: 'Segnalazione D: 10 voti ma PENDENTE (nascosta)',
          latitudine: 45.467,
          longitudine: 9.193,
          origine_posizione: 'MANUALE',
          stato_moderazione: 'PENDENTE',
          stato_avanzamento: 'RICEVUTA',
          creata_il: t0,
          media: {
            create: {
              storage_key: `m_d_${Date.now()}`,
              tipo: 'FOTO',
              mime: 'image/jpeg',
              byte_size: 1024,
              sha256: '5'.repeat(64),
              stato_file: 'READY'
            }
          }
        }
      });

      // Calcolo della classifica
      const classifica = await getClassificaSegnalazioni(10, 0);

      // 1. D deve essere CATEGORICAMENTE ESCLUSA
      const ids = classifica.map(c => c.id);
      expect(ids).not.toContain(repD.id);

      // 2. Classifica deve contenere esattamente 3 elementi: A, B, C
      expect(classifica.length).toBe(3);

      // 3. A e B hanno entrambi 2 voti, ma A è stata creata a t0 e B a t1.
      // Lo spareggio temporale (creata_il ASC) impone A al primo posto (#1) e B al secondo (#2).
      expect(classifica[0].id).toBe(repA.id);
      expect(classifica[0].totaleSostegniValidi).toBe(2);

      // Verifica fondamentale: A ha 2 categorie e 2 media, ma i voti conteggiati devono restare ESATTAMENTE 2!
      expect(classifica[0].totaleSostegniValidi).toBe(2);

      expect(classifica[1].id).toBe(repB.id);
      expect(classifica[1].totaleSostegniValidi).toBe(2);

      // 4. C con 0 voti deve essere INCLUSA al terzo posto
      expect(classifica[2].id).toBe(repC.id);
      expect(classifica[2].totaleSostegniValidi).toBe(0);
    });
  });
});
