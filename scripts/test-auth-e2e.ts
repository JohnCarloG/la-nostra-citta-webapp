import { loadTestEnv } from '../src/lib/test-env';
loadTestEnv();

import { PrismaClient } from '@prisma/client';
import { getAndVerifyDatabaseInfo, cleanTestDatabase } from '../tests/helpers/test-db';
import * as auth from '../src/lib/domain/auth';
import { emailTransport } from '../src/lib/email-transport';

const prisma = new PrismaClient();

export interface E2ETestResult {
  success: boolean;
  stepsCompleted: string[];
  error?: string;
}

/**
 * Collaudo End-to-End del ciclo di vita autenticazione.
 * Utilizza esclusivamente i metodi di dominio ufficiali e il trasporto email
 * in-memory con ispezione token, senza bypass manuali a database.
 * Autorizzato unicamente su 'la_nostra_citta_test'.
 */
export async function runAuthE2ECollaudo(): Promise<E2ETestResult> {
  const steps: string[] = [];

  try {
    const targetInfo = getAndVerifyDatabaseInfo();
    if (!targetInfo.isAuthorizedTestDb) {
      throw new Error(
        `Esecuzione E2E consentita ESCLUSIVAMENTE sul database di collaudo 'la_nostra_citta_test'. ` +
        `Target rilevato: '${targetInfo.database}'.`
      );
    }

    // Pulisce il db di test prima del collaudo
    await cleanTestDatabase(prisma);
    emailTransport.clear();

    const emailTest = `cittadino.e2e.${Date.now()}@example.com`;
    const passwordIniziale = 'PasswordSicura123!';
    const passwordNuova = 'NuovaPassword456!';

    // Step 1: Registrazione
    steps.push(`1. Registrazione cittadino (${emailTest})`);
    const utente = await auth.registraCittadino('Mario', 'Rossi', emailTest, passwordIniziale);
    if (!utente || !utente.id) throw new Error('Registrazione fallita: utente non restituito');

    // Step 2: Tentativo login prima di verifica email (deve fallire)
    steps.push('2. Verifica blocco login per account non ancora verificato');
    let bloccatoNonVerificato = false;
    try {
      await auth.login(emailTest, passwordIniziale);
    } catch (err) {
      if ((err as Error).message.includes('non verificato')) {
        bloccatoNonVerificato = true;
      }
    }
    if (!bloccatoNonVerificato) {
      throw new Error('FALLIMENTO: Login consentito su account non verificato!');
    }

    // Step 3: Recupero token reale dal trasporto email
    steps.push('3. Ispezione token di verifica dal canale email di collaudo');
    const tokenVerifica = emailTransport.getLatestTokenFor(emailTest);
    if (!tokenVerifica) {
      throw new Error('Nessun token di verifica recapitato al trasporto email per l\'indirizzo');
    }

    // Step 4: Verifica email tramite funzione di dominio ufficiale (senza bypass DB)
    steps.push('4. Consumo atomico token tramite funzione di dominio verificaEmail()');
    await auth.verificaEmail(tokenVerifica);

    // Step 5: Login con credenziali corrette
    steps.push('5. Login su account verificato');
    const loginRes = await auth.login(emailTest, passwordIniziale);
    if (!loginRes.sessionTokenInChiaro) {
      throw new Error('Session token non generato al login');
    }

    // Step 6: Validazione sessione attiva
    steps.push('6. Validazione sessione tramite getSessionUtente()');
    const sessionUser = await auth.getSessionUtente(loginRes.sessionTokenInChiaro);
    if (!sessionUser || sessionUser.id !== utente.id) {
      throw new Error('Sessione non valida o non corrispondente all\'utente');
    }

    // Step 7: Richiesta Reset Password
    steps.push('7. Richiesta reset password');
    await auth.richiediResetPassword(emailTest);
    const tokenReset = emailTransport.getLatestTokenFor(emailTest);
    if (!tokenReset || tokenReset === tokenVerifica) {
      throw new Error('Nuovo token di reset password non recapitato');
    }

    // Step 8: Esecuzione Reset Password tramite dominio
    steps.push('8. Aggiornamento credenziali e revoca sessioni tramite eseguiResetPassword()');
    await auth.eseguiResetPassword(tokenReset, passwordNuova);

    // Step 9: Verifica invalidazione sessione precedente
    steps.push('9. Controllo invalidazione immediata della vecchia sessione');
    const sessionPostReset = await auth.getSessionUtente(loginRes.sessionTokenInChiaro);
    if (sessionPostReset !== null) {
      throw new Error('FALLIMENTO: La sessione precedente è rimasta attiva dopo il cambio password!');
    }

    // Step 10: Verifica che la vecchia password sia respinta
    steps.push('10. Controllo rifiuto credenziali obsolete');
    let vecchiaPasswordRespinta = false;
    try {
      await auth.login(emailTest, passwordIniziale);
    } catch {
      vecchiaPasswordRespinta = true;
    }
    if (!vecchiaPasswordRespinta) {
      throw new Error('FALLIMENTO: Login con vecchia password ancora consentito!');
    }

    // Step 11: Login con nuova password
    steps.push('11. Login con nuova password');
    const nuovoLogin = await auth.login(emailTest, passwordNuova);
    if (!nuovoLogin.sessionTokenInChiaro) {
      throw new Error('Login con nuova password fallito');
    }

    // Step 12: Logout esplicito
    steps.push('12. Logout esplicito e revoca sessione');
    await auth.logout(nuovoLogin.sessionTokenInChiaro);
    const sessionPostLogout = await auth.getSessionUtente(nuovoLogin.sessionTokenInChiaro);
    if (sessionPostLogout !== null) {
      throw new Error('FALLIMENTO: Sessione ancora valida dopo logout!');
    }

    steps.push('Tutti i passaggi completati con successo e conformità verificata!');
    return { success: true, stepsCompleted: steps };
  } catch (err) {
    return { success: false, stepsCompleted: steps, error: (err as Error).message };
  }
}

async function main() {
  console.log('====================================================');
  console.log('     COLLAUDO END-TO-END AUTENTICAZIONE E DOMINIO    ');
  console.log('====================================================');

  const result = await runAuthE2ECollaudo();
  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    console.error('\n[FALLIMENTO]: Collaudo E2E interrotto con errore:');
    console.error(result.error);
    process.exit(1);
  }

  console.log('\n[SUCCESSO]: Ciclo E2E completato senza anomalie.');
  process.exit(0);
}

if (process.argv[1] && process.argv[1].includes('test-auth-e2e')) {
  main().finally(() => prisma.$disconnect());
}
