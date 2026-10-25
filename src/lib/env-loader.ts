import fs from 'fs';
import path from 'path';

/**
 * Carica esplicitamente la configurazione applicativa per script Node.js autonomi
 * (come smtp-check, email-worker, diagnose-outbox).
 *
 * Ordine di priorità (conforme a Next.js):
 * 1. process.env già impostato (shell)
 * 2. .env.local (sovrascrive .env ma non process.env preesistente)
 * 3. .env (valori di base)
 */
export function loadAppEnv(): void {
  const cwd = process.cwd();
  const envLocalPath = path.resolve(cwd, '.env.local');
  const envPath = path.resolve(cwd, '.env');

  const parseAndApply = (filePath: string, overrideExisting: boolean = false) => {
    if (!fs.existsSync(filePath)) return;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
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
          if (overrideExisting || process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // Ignora errori di lettura
    }
  };

  // 1. Carica prima .env
  parseAndApply(envPath, false);

  // 2. Carica .env.local con priorità su .env
  parseAndApply(envLocalPath, true);

  // Normalizza percorso relativo ca.pem se presente in DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && dbUrl.includes('sslcert=ca.pem')) {
    const absCa = path.resolve(cwd, 'ca.pem');
    process.env.DATABASE_URL = dbUrl.replace('sslcert=ca.pem', `sslcert=${encodeURIComponent(absCa)}`);
  }
}
