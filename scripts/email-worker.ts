import { loadAppEnv } from '../src/lib/env-loader';
loadAppEnv();

import { processSingleEmailOutboxJob, processEmailOutboxJobById } from '../src/lib/email-outbox';
import { prisma } from '../src/lib/db';

const isOnce = process.argv.includes('--once');
const jobArgIdx = process.argv.findIndex(arg => arg === '--job-id' || arg === '--job');
const targetJobId = jobArgIdx !== -1 && process.argv[jobArgIdx + 1] ? process.argv[jobArgIdx + 1] : undefined;
const POLL_INTERVAL_MS = 10000;

async function runWorker() {
  if (targetJobId) {
    console.log('====================================================');
    console.log(` WORKER OUTBOX EMAIL - MODALITÀ MIRATA (Job: ${targetJobId})`);
    console.log('====================================================');
    try {
      const res = await processEmailOutboxJobById(targetJobId);
      console.log(`[OUTBOX WORKER] Job ${targetJobId} - Processato: ${res.processed} | Esito: ${res.outcome}${res.error ? ` | Errore: ${res.error}` : ''}`);
    } catch (err) {
      console.error('[OUTBOX WORKER ERROR]', (err as Error).message);
    } finally {
      await prisma.$disconnect();
      console.log('[OUTBOX WORKER] Terminato.');
    }
    return;
  }

  console.log('====================================================');
  console.log(` WORKER OUTBOX EMAIL - MODALITÀ ${isOnce ? 'SINGOLA ESECUZIONE (--once)' : 'CONTINUA'}`);
  console.log('====================================================');

  let running = true;
  process.on('SIGINT', () => { running = false; });
  process.on('SIGTERM', () => { running = false; });

  do {
    try {
      const res = await processSingleEmailOutboxJob();
      if (res.processed) {
        console.log(`[OUTBOX WORKER] Job elaborato. Esito: ${res.outcome}`);
      } else {
        if (isOnce) {
          console.log('[OUTBOX WORKER] Nessun job email pronto per l\'elaborazione.');
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (err) {
      console.error('[OUTBOX WORKER ERROR]', (err as Error).message);
      if (isOnce) break;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } while (running && !isOnce);

  await prisma.$disconnect();
  console.log('[OUTBOX WORKER] Terminato.');
}

runWorker().catch(console.error);

