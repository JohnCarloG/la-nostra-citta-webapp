import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Carica .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
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
}

let datasourceUrl = process.env.DATABASE_URL;
if (datasourceUrl && datasourceUrl.includes('sslcert=ca.pem')) {
  const absCa = path.resolve(process.cwd(), 'ca.pem');
  datasourceUrl = datasourceUrl.replace('sslcert=ca.pem', `sslcert=${encodeURIComponent(absCa)}`);
}

console.log('--- APPLICAZIONE MIGRAZIONI SU DATABASE APPLICATIVO / DIMOSTRATIVO ---');
try {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: datasourceUrl
    }
  });
  console.log('[SUCCESSO]: Migrazioni applicate correttamente su database applicativo.');
} catch (err) {
  console.error('[ERRORE]: Fallimento applicazione migrazioni:', (err as Error).message);
  process.exit(1);
}
