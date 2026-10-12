import { loadTestEnv } from '../../src/lib/test-env';
loadTestEnv();

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import * as auth from '../../src/lib/domain/auth';
import { emailTransport } from '../../src/lib/email-transport';
import { cleanTestDatabase, getAndVerifyDatabaseInfo } from '../helpers/test-db';

const prisma = new PrismaClient();

describe('Integrazione DB MySQL: Autenticazione, Token Monouso e Sessioni', () => {
  let isDbAvailable = false;
  let connectionError: string | null = null;

  beforeAll(async () => {
    try {
      getAndVerifyDatabaseInfo();
      await prisma.$queryRaw`SELECT 1`;
      isDbAvailable = true;
      await cleanTestDatabase(prisma);
      emailTransport.clear();
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

  it('Registrazione, token monouso reale e rifiuto categorico del secondo utilizzo', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    const email = `test.monouso.${Date.now()}@example.com`;
    const pwd = 'PasswordValida123!';

    // Registrazione tramite metodo ufficiale di dominio
    const utente = await auth.registraCittadino('Cittadino', 'Monouso', email, pwd);
    expect(utente).toBeDefined();

    // Recupero del token in chiaro inviato tramite il canale email di test
    const tokenInChiaro = emailTransport.getLatestTokenFor(email);
    expect(tokenInChiaro).toBeDefined();

    // Primo utilizzo: deve completarsi con successo
    const esitoPrimo = await auth.verificaEmail(tokenInChiaro!);
    expect(esitoPrimo).toBe(true);

    // Verifica su DB che l'utente risulti verificato
    const utenteDb = await prisma.utente.findUnique({ where: { id: utente.id } });
    expect(utenteDb?.verificato_il).not.toBeNull();

    // Secondo utilizzo dello stesso token: deve fallire tassativamente (consumo atomico)
    await expect(auth.verificaEmail(tokenInChiaro!))
      .rejects.toThrow('Token non valido, scaduto o già utilizzato');
  });

  it('Concorrenza: due tentativi simultanei di consumo dello stesso token consentono una sola transazione', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    const email = `test.concorrenza.${Date.now()}@example.com`;
    await auth.registraCittadino('Concorrente', 'Test', email, 'PasswordValida123!');
    const token = emailTransport.getLatestTokenFor(email)!;

    // Esecuzione concorrente
    const results = await Promise.allSettled([
      auth.verificaEmail(token),
      auth.verificaEmail(token)
    ]);

    const successi = results.filter(r => r.status === 'fulfilled');
    const fallimenti = results.filter(r => r.status === 'rejected');

    expect(successi).toHaveLength(1);
    expect(fallimenti).toHaveLength(1);
  });

  it('Login, sessione attiva con getSessionUtente e revoca immediata al logout', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    const email = `test.sessione.${Date.now()}@example.com`;
    const pwd = 'PasswordSicura123!';
    const utente = await auth.registraCittadino('Mario', 'Rossi', email, pwd);
    const token = emailTransport.getLatestTokenFor(email)!;
    await auth.verificaEmail(token);

    // Login
    const { sessionTokenInChiaro } = await auth.login(email, pwd);
    expect(sessionTokenInChiaro).toBeDefined();

    // Lettura sessione
    const userSession = await auth.getSessionUtente(sessionTokenInChiaro);
    expect(userSession).not.toBeNull();
    expect(userSession?.id).toBe(utente.id);
    expect((userSession as Record<string, unknown>).password_hash).toBeUndefined();

    // Logout
    await auth.logout(sessionTokenInChiaro);

    // Controllo che la sessione sia revocata
    const userPostLogout = await auth.getSessionUtente(sessionTokenInChiaro);
    expect(userPostLogout).toBeNull();
  });

  it('Sospensione dinamica dell\'account rende immediatamente invalida la sessione attiva e blocca il login', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    const email = `test.sospensione.${Date.now()}@example.com`;
    const pwd = 'PasswordSicura123!';
    const utente = await auth.registraCittadino('Gianni', 'Verdi', email, pwd);
    const token = emailTransport.getLatestTokenFor(email)!;
    await auth.verificaEmail(token);

    const { sessionTokenInChiaro } = await auth.login(email, pwd);
    expect(await auth.getSessionUtente(sessionTokenInChiaro)).not.toBeNull();

    // Azione amministrativa: sospensione account su DB
    await prisma.utente.update({
      where: { id: utente.id },
      data: { stato_account: 'SOSPESO' }
    });

    // Controllo invalidazione dinamica della sessione già aperta
    const sessioneDopoSospensione = await auth.getSessionUtente(sessionTokenInChiaro);
    expect(sessioneDopoSospensione).toBeNull();

    // Nuovo tentativo di login deve essere bloccato
    await expect(auth.login(email, pwd)).rejects.toThrow('Account sospeso');
  });

  it('Reset password revoca tutte le sessioni aperte dell\'utente', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    const email = `test.multisessione.${Date.now()}@example.com`;
    const pwdVecchia = 'VecchiaPassword123!';
    const pwdNuova = 'NuovaPasswordSicura456!';

    await auth.registraCittadino('Luigi', 'Bianchi', email, pwdVecchia);
    const tokenVerifica = emailTransport.getLatestTokenFor(email)!;
    await auth.verificaEmail(tokenVerifica);

    // Apertura di due sessioni concorrenti (es. due dispositivi)
    const { sessionTokenInChiaro: sess1 } = await auth.login(email, pwdVecchia);
    const { sessionTokenInChiaro: sess2 } = await auth.login(email, pwdVecchia);

    expect(await auth.getSessionUtente(sess1)).not.toBeNull();
    expect(await auth.getSessionUtente(sess2)).not.toBeNull();

    // Richiesta reset password
    await auth.richiediResetPassword(email);
    const tokenReset = emailTransport.getLatestTokenFor(email)!;
    expect(tokenReset).not.toBe(tokenVerifica);

    // Esecuzione reset password
    await auth.eseguiResetPassword(tokenReset, pwdNuova);

    // Entrambe le sessioni precedenti devono risultare revocate
    expect(await auth.getSessionUtente(sess1)).toBeNull();
    expect(await auth.getSessionUtente(sess2)).toBeNull();

    // Login con vecchia password fallisce
    await expect(auth.login(email, pwdVecchia)).rejects.toThrow('Credenziali non valide');

    // Login con nuova password ha successo
    const { sessionTokenInChiaro: nuovaSess } = await auth.login(email, pwdNuova);
    expect(nuovaSess).toBeDefined();
    expect(await auth.getSessionUtente(nuovaSess)).not.toBeNull();
  });

  it('Reinvio email di verifica invalida i token precedenti emessi', async () => {
    if (!isDbAvailable) {
      expect.fail(`[INTEGRAZIONE DB FALLITA]: Database di test non disponibile: ${connectionError}`);
    }

    const email = `test.reinvio.${Date.now()}@example.com`;
    await auth.registraCittadino('Paolo', 'Neri', email, 'PasswordValida123!');
    const primoToken = emailTransport.getLatestTokenFor(email)!;

    // Reinvio verifica
    const reinviato = await auth.reinviaVerificaEmail(email);
    expect(reinviato).toBe(true);

    const secondoToken = emailTransport.getLatestTokenFor(email)!;
    expect(secondoToken).not.toBe(primoToken);

    // Il primo token deve essere respinto
    await expect(auth.verificaEmail(primoToken))
      .rejects.toThrow('Token non valido, scaduto o già utilizzato');

    // Il secondo token deve funzionare
    expect(await auth.verificaEmail(secondoToken)).toBe(true);
  });
});
