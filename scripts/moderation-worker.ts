import { loadAppEnv } from '../src/lib/env-loader';
import { CloudConfigurationError, validateCloudWorkerConfiguration } from '../src/lib/ia/gemini';

async function main() {
  // Load before importing the DB/pipeline (static imports execute before loadAppEnv).
  loadAppEnv();
  validateCloudWorkerConfiguration(); // Fail explicitly before DB imports or claiming any jobs.
  const { processSingleOutboxJob } = await import('../src/lib/ia/worker');
  const { prisma } = await import('../src/lib/db');
  let running = true;
  const stop = () => { running = false; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  const once = process.argv.includes('--once');
  try {
    do {
      const result = await processSingleOutboxJob(undefined, { adapterMode: 'cloud', timeoutMs: 20_000 });
      // No report content or provider error bodies in process logs.
      console.log('[MODERAZIONE CLOUD]', result.outcome);
      if (!once && running && result.outcome === 'NO_JOB') await new Promise(resolve => setTimeout(resolve, 2000));
    } while (running && !once);
  } finally {
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error instanceof CloudConfigurationError ? error.message : 'Worker cloud interrotto: verificare configurazione e disponibilità del database.');
  process.exitCode = 1;
});
