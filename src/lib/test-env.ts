import fs from 'fs';
import path from 'path';

/**
 * Caricatore isolato della configurazione di test.
 * Legge prioritariamente .env.test (se presente) oppure .env,
 * isolando le variabili del database di collaudo dall'applicazione.
 */
export function loadTestEnv(): void {
  const cwd = process.cwd();
  const testEnvPath = path.resolve(cwd, '.env.test');

  // Usa esclusivamente .env.test per il collaudo e i test
  if (fs.existsSync(testEnvPath)) {
    try {
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
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // Ignora errori di lettura
    }
  }

  // Se definita una variabile dedicata TEST_DATABASE_URL, assegnala a DATABASE_URL
  // per allineare PrismaClient alla stessa identica destinazione
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
}

// In ambiente vitest/test esegui automaticamente il caricamento all'import
if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
  loadTestEnv();
}

/**
 * Maschera le credenziali in una stringa di connessione per consentire
 * log e output diagnostici sicuri senza esporre password.
 */
export function maskDatabaseUrl(urlStr?: string): string {
  if (!urlStr) return '[DATABASE_URL_NON_IMPOSTATO]';
  try {
    const parsed = new URL(urlStr);
    const user = parsed.username || 'utente';
    const host = parsed.hostname || 'host';
    const port = parsed.port || '3306';
    const db = parsed.pathname.replace(/^\//, '') || 'db';
    const search = parsed.search || '';
    return `mysql://${user}:***@${host}:${port}/${db}${search}`;
  } catch {
    return '[DATABASE_URL_FORMATO_NON_VALIDO]';
  }
}
