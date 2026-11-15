import { loadTestEnv } from '../../src/lib/test-env';
import { getAndVerifyDatabaseInfo } from '../helpers/test-db';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/security';
import type { PrismaClient } from '@prisma/client';

// 1. Carica .env.test prima di qualsiasi importazione del singleton Prisma o dei moduli di dominio
loadTestEnv();

// 2. Guardia statica: verifica che env, host, porta, target db e certificato CA siano validi
getAndVerifyDatabaseInfo();

// Variabili per client e funzione di dominio caricati dinamicamente
let prisma: PrismaClient;
let cambiaPasswordAutenticato: typeof import('../../src/lib/domain/auth').cambiaPasswordAutenticato;

describe('Integrazione DB MySQL: Concorrenza su Cambio Password Simultaneo', () => {
  let isDbAvailable = false;
  let connectionError: string | null = null;

  beforeAll(async () => {
    try {
      // Import dinamico per garantire che nessun import statico transitivo abbia inizializzato il client prima
      const dbModule = await import('../../src/lib/db');
      prisma = dbModule.prisma;

      const authModule = await import('../../src/lib/domain/auth');
      cambiaPasswordAutenticato = authModule.cambiaPasswordAutenticato;

      // Verifica dinamica della connessione effettiva sullo stesso client usato per fixture e funzione
      const rows = await prisma.$queryRaw<Array<{ current_db: string }>>`SELECT DATABASE() AS current_db`;
      const currentDb = rows[0]?.current_db;
      if (currentDb !== 'la_nostra_citta_test') {
        throw new Error(
          `Connessione attiva non autorizzata: SELECT DATABASE() ha restituito '${currentDb}', atteso 'la_nostra_citta_test'.`
        );
      }
      isDbAvailable = true;
    } catch (err: unknown) {
      isDbAvailable = false;
      const rawMsg = (err as Error).message || 'Errore di connessione non determinato';
      // Sanitizza qualsiasi URL, password o credenziale dall'errore
      connectionError = rawMsg
        .replace(/mysql:\/\/[^@]+@/g, 'mysql://***:***@')
        .replace(/password=[^&;]+/gi, 'password=***');
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('Due cambi password simultanei con la stessa vecchia password: un solo successo e una sola nuova password valida', async () => {
    // Se la suite DB viene richiesta esplicitamente e la configurazione/guardia/connessione falliscono,
    // la suite fallisce prima delle scritture senza falsi positivi
    if (!isDbAvailable) {
      expect.fail(
        `[INTEGRAZIONE DB FALLITA]: Impossibile eseguire la prova di concorrenza MySQL (connessione non disponibile o non autorizzata): ${connectionError}`
      );
    }

    const emailTest = `concurrency.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
    const vecchiaPassword = 'VecchiaPasswordSicura123!';
    const nuovaPasswordA = 'NuovaPasswordVincenteAAA1!';
    const nuovaPasswordB = 'NuovaPasswordConcorrenteBBB2!';

    const vecchioHash = await hashPassword(vecchiaPassword);

    // Identificativi di sessione unici per questa specifica esecuzione
    const sessionHash1 = `sess-concurr-1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sessionHash2 = `sess-concurr-2-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // 1. Predisposizione utente di test nel database la_nostra_citta_test
    const user = await prisma.utente.create({
      data: {
        nome: 'Test',
        cognome: 'Concorrenza',
        email_normalizzata: emailTest,
        password_hash: vecchioHash,
        ruolo: 'CITTADINO',
        stato_account: 'ATTIVO',
        verificato_il: new Date(),
      }
    });

    // Protezione dell'intera sequenza di setup (inclusa la creazione sessioni) con try/finally
    try {
      // 2. Creazione delle due sessioni attive uniche per la fixture
      const scadenza = new Date(Date.now() + 24 * 3600 * 1000);
      await prisma.sessione.createMany({
        data: [
          { utente_id: user.id, token_hash: sessionHash1, scade_il: scadenza },
          { utente_id: user.id, token_hash: sessionHash2, scade_il: scadenza },
        ]
      });

      // 3. Lancio simultaneo delle due richieste concorrenti con la stessa vecchia password
      const promiseA = cambiaPasswordAutenticato(user.id, vecchiaPassword, nuovaPasswordA, nuovaPasswordA);
      const promiseB = cambiaPasswordAutenticato(user.id, vecchiaPassword, nuovaPasswordB, nuovaPasswordB);

      const results = await Promise.allSettled([promiseA, promiseB]);

      // 4. Verifica che una e una sola richiesta sia riuscita
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // 5. Verifica errore della richiesta perdente:
      // ammette sia il fallimento atomico per hash modificato nel frattempo (count === 0),
      // sia il rifiuto per password attuale ormai superata se la seconda transazione ha riletto l'hash dopo il commit della prima
      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
      const validRejectionMessages = [
        'La password o lo stato dell\'account sono stati modificati nel frattempo. Riprova.',
        'Password attuale non corretta'
      ];
      expect(validRejectionMessages).toContain(rejectionReason?.message);

      // 6. Verifica stato del database: la password della vincente funziona,
      // quella della perdente e la vecchia password non funzionano
      const utenteFinale = await prisma.utente.findUnique({
        where: { id: user.id },
        select: { password_hash: true }
      });
      expect(utenteFinale).toBeDefined();

      const matchA = await verifyPassword(nuovaPasswordA, utenteFinale!.password_hash);
      const matchB = await verifyPassword(nuovaPasswordB, utenteFinale!.password_hash);
      const matchVecchia = await verifyPassword(vecchiaPassword, utenteFinale!.password_hash);

      // La vecchia password è stata invalidata
      expect(matchVecchia).toBe(false);

      // Esattamente una delle due nuove password è valida nel database
      expect(Number(matchA) + Number(matchB)).toBe(1);

      // La password vincente coincide con la richiesta completata con successo
      if (fulfilled[0] === results[0]) {
        expect(matchA).toBe(true);
        expect(matchB).toBe(false);
      } else {
        expect(matchA).toBe(false);
        expect(matchB).toBe(true);
      }

      // 7. Verifica revoca sessioni: le sessioni della fixture creata risultano revocate
      const sessioniFixture = await prisma.sessione.findMany({
        where: {
          token_hash: { in: [sessionHash1, sessionHash2] }
        }
      });
      expect(sessioniFixture).toHaveLength(2);
      for (const s of sessioniFixture) {
        expect(s.revocata_il).not.toBeNull();
      }

    } finally {
      // 8. Pulizia mirata della fixture (nessun reset o pulizia globale)
      // Garantita anche in caso di eccezione durante la creazione delle sessioni
      await prisma.sessione.deleteMany({ where: { utente_id: user.id } });
      await prisma.tokenAccount.deleteMany({ where: { utente_id: user.id } });
      await prisma.utente.deleteMany({ where: { id: user.id } });
    }
  });
});
