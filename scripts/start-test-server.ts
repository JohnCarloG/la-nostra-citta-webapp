import { loadTestEnv } from '../src/lib/test-env';
loadTestEnv();

import { getAndVerifyDatabaseInfo } from '../tests/helpers/test-db';
import { spawn } from 'child_process';
import path from 'path';

// Validazione preventiva della configurazione di test
const targetInfo = getAndVerifyDatabaseInfo();
if (!targetInfo.isAuthorizedTestDb) {
  console.error(`[ERRORE DI SICUREZZA]: Database autorizzato per il test è solo la_nostra_citta_test. Trovato: ${targetInfo.database}`);
  process.exit(1);
}

// Assicura configurazione ambiente per l'istanza di test su porta 3001
process.env.PORT = '3001';
process.env.APP_URL = 'http://localhost:3001';

console.log('===============================================================');
console.log('   AVVIO SERVER DI COLLAUDO LOCALE SU PORTA 3001               ');
console.log('   Target DB: la_nostra_citta_test (Aiven MySQL 8.4.11)        ');
console.log('   Indirizzo: http://localhost:3001                            ');
console.log('===============================================================');

const nextBin = path.resolve(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [nextBin, 'start', '-p', '3001'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});

child.on('error', (err) => {
  console.error('Errore durante l\'esecuzione del server Next.js:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
