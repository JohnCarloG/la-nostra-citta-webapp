import fs from 'node:fs';

export function assertIsolatedBrowserDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '3310' || url.pathname !== '/la_nostra_citta_browser') {
    throw new Error('Browser tests require a temporary loopback MySQL on port 3310, database la_nostra_citta_browser.');
  }
  for (const file of ['.env', '.env.local', '.env.test']) if (fs.existsSync(file)) throw new Error(`Use a clean isolated checkout, without ${file}; preserve existing local configuration.`);
}
