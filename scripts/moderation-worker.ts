import { loadAppEnv } from '../src/lib/env-loader';

async function main() {
  // Load before importing the DB/pipeline (static imports execute before loadAppEnv).
  loadAppEnv();
  if (process.env.AI_ADAPTER_MODE !== 'cloud') throw new Error('Il worker cloud richiede AI_ADAPTER_MODE=cloud');
  if (!process.env.GEMINI_API_KEY) throw new Error('Configurare GEMINI_API_KEY solo lato server');
  const { GeminiClient } = await import('../src/lib/ia/gemini');
  new GeminiClient(); // Validate model configuration before claiming any jobs.
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

main().catch(() => {
  console.error('Worker cloud interrotto: verificare configurazione e disponibilità del database.');
  process.exitCode = 1;
});
