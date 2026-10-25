/**
 * Worker Outbox Email per Ambiente di Test Isolato (la_nostra_citta_test).
 * 
 * Requisiti di sicurezza stringenti e inderogabili:
 * 1. Carica ESCLUSIVAMENTE .env.test prima di qualsiasi istanziazione di Prisma.
 * 2. Mantiene separata la configurazione del database dai parametri SMTP.
 * 3. Applica le guardie statiche di destinazione (host, porta, db === 'la_nostra_citta_test', sslaccept === 'strict').
 * 4. Esegue la verifica live su server MySQL: abortisce se DATABASE() !== 'la_nostra_citta_test'.
 * 5. Elabora ESCLUSIVAMENTE il singolo job specificato tramite --job-id.
 * 6. Verifica che APP_URL sia valorizzato e punti al server corretto.
 * 7. Destinatario autorizzato letto da variabile d'ambiente obbligatoria SMTP_TEST_ALLOWED_RECIPIENT (nessun valore hardcoded).
 * 8. Richiede consenso esplicito all'invio tramite --send. Senza --send esegue SOLO verifica (dry-run, nessuna modifica a Outbox, nessun invio).
 */

import fs from 'fs';
import path from 'path';

// 1. CARICAMENTO ESCLUSIVO DI .env.test PER IL DATABASE
function loadStrictTestDatabaseEnv(): void {
  const cwd = process.cwd();
  const testEnvPath = path.resolve(cwd, '.env.test');

  if (!fs.existsSync(testEnvPath)) {
    console.error('[ERRORE SICUREZZA]: File .env.test assente.');
    process.exit(1);
  }

  // Pulisci rigorosamente variabili database preesistenti
  delete process.env.DATABASE_URL;
  delete process.env.TEST_DATABASE_URL;
  delete process.env.AUTHORIZED_TEST_HOST;
  delete process.env.AUTHORIZED_TEST_PORT;

  const content = fs.readFileSync(testEnvPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }

  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }

  // Carica in modo separato SOLO parametri SMTP e APP_URL da .env.local (senza toccare DATABASE_URL)
  const localEnvPath = path.resolve(cwd, '.env.local');
  if (fs.existsSync(localEnvPath)) {
    const localContent = fs.readFileSync(localEnvPath, 'utf8');
    for (const line of localContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // Ammetti ESCLUSIVAMENTE parametri di trasporto email, APP_URL e il destinatario di test se definito
        if (
          key.startsWith('SMTP_') ||
          key === 'EMAIL_FROM' ||
          key === 'APP_URL' ||
          key === 'SMTP_TEST_ALLOWED_RECIPIENT'
        ) {
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadStrictTestDatabaseEnv();

import { PrismaClient } from '@prisma/client';
import { getAndVerifyDatabaseInfo } from '../tests/helpers/test-db';
import { SmtpEmailTransport } from '../src/lib/email-transport';
import { executeTestEmailWorker, validateTestWorkerEnv } from '../src/lib/email-test-worker-core';

async function main() {
  const args = process.argv.slice(2);
  const jobArgIdx = args.findIndex(arg => arg === '--job-id' || arg === '--job');
  const targetJobId = jobArgIdx !== -1 && args[jobArgIdx + 1] ? args[jobArgIdx + 1] : undefined;
  const isSendExplicit = args.includes('--send');

  const allowedRecipient = process.env.SMTP_TEST_ALLOWED_RECIPIENT;
  const appUrl = process.env.APP_URL;

  console.log('====================================================');
  console.log(' WORKER OUTBOX EMAIL TEST - MODALITÀ CONTROLLATA');
  console.log(` Target Job ID : ${targetJobId || '[NON SPECIFICATO]'}`);
  console.log(` Modalità      : ${isSendExplicit ? 'INVIO REALE CONFERMATO (--send)' : 'VERIFICA DRY-RUN (nessun invio)'}`);
  console.log('====================================================');

  // Validazione preliminare dei parametri d'ambiente
  const envCheck = validateTestWorkerEnv({
    jobId: targetJobId,
    allowedRecipient,
    appUrl,
    send: isSendExplicit
  });

  if (!envCheck.valid) {
    console.error(`[ERRORE CONFIGURAZIONE]: ${envCheck.error}`);
    process.exit(1);
  }

  // Guardia statica dei parametri database (.env.test)
  const targetInfo = getAndVerifyDatabaseInfo();
  console.log(`[GUARDIA STATICA]: Host=${targetInfo.host}:${targetInfo.port} | Database=${targetInfo.database}`);
  console.log(`[GUARDIA STATICA]: TLS strict=${targetInfo.sslAccept === 'strict' ? 'SI' : 'NO'}`);
  console.log(`[PARAMETRO TEST]: Destinatario autorizzato configurato = ${allowedRecipient}`);
  console.log(`[PARAMETRO TEST]: APP_URL configurato = ${appUrl}`);

  const prisma = new PrismaClient();
  const transport = new SmtpEmailTransport();

  try {
    const result = await executeTestEmailWorker(prisma, transport, {
      jobId: targetJobId,
      send: isSendExplicit,
      allowedRecipient,
      appUrl,
      expectedDbName: 'la_nostra_citta_test'
    });

    if (!result.success) {
      console.error(`[ESITO FALLITO]: ${result.error}`);
      process.exit(1);
    }

    if (result.mode === 'DRY_RUN_VERIFICATION') {
      console.log('----------------------------------------------------');
      console.log('[VERIFICA DRY-RUN COMPLETATA CON SUCCESSO]');
      console.log(`- Job ID              : ${result.jobId}`);
      console.log(`- Destinatario job    : ${result.recipient}`);
      console.log('- Verifica DB live    : SUPERATA (la_nostra_citta_test)');
      console.log('- Corrispondenza dest.: SUPERATA');
      console.log('- Modifica Outbox     : NESSUNA (Job non alterato)');
      console.log('- Invio email         : NESSUNO');
      console.log('Per autorizzare l\'invio reale sul provider SMTP, rilanciare con il flag: --send');
      console.log('----------------------------------------------------');
    } else {
      console.log('----------------------------------------------------');
      console.log('[INVIO REALE COMPLETATO CON SUCCESSO]');
      console.log(`- Job ID              : ${result.jobId}`);
      console.log(`- Destinatario inviato: ${result.recipient}`);
      console.log('- Stato Outbox        : AGGIORNATO (elaborata_il registrato)');
      console.log('----------------------------------------------------');
    }
  } catch (err: any) {
    console.error(`[ERRORE CRITICO]: ${err.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('[OUTBOX TEST WORKER]: Sessione terminata.');
  }
}

main().catch(err => {
  console.error('[FATAL]:', err);
  process.exit(1);
});
