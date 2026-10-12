import { PrismaClient } from '@prisma/client';
import { getAndVerifyDatabaseInfo } from '../tests/helpers/test-db';
import { loadTestEnv } from '../src/lib/test-env';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

/**
 * Script protetto per l'applicazione delle migrazioni esclusivamente sul database di test.
 *
 * Controlli preventivi inderogabili prima di eseguire qualsiasi migrazione:
 * 1. Controllo statico: AUTHORIZED_TEST_HOST, AUTHORIZED_TEST_PORT e database 'la_nostra_citta_test'.
 * 2. Controllo dinamico live: query 'SELECT DATABASE()' sulla connessione attiva.
 * 3. Rifiuto categorico di defaultdb o ambienti non autorizzati.
 * 4. Utilizzo esclusivo di 'prisma migrate deploy' (vietati reset o db push).
 */
async function main() {
  console.log('====================================================');
  console.log('   APPLICAZIONE PROTETTA MIGRAZIONI MYSQL DI TEST   ');
  console.log('====================================================');

  loadTestEnv();

  try {
    // 1. Controllo statico dei parametri
    const targetInfo = getAndVerifyDatabaseInfo();
    console.log(`Target configurato: ${targetInfo.maskedUrl}`);

    // 2. Controllo dinamico live sulla connessione MySQL
    const dbRows = await prisma.$queryRaw<Array<{ current_db: string | null; server_port?: string | number }>>`
      SELECT DATABASE() AS current_db, @@port AS server_port;
    `;
    const activeDb = dbRows?.[0]?.current_db;
    if (activeDb !== 'la_nostra_citta_test') {
      throw new Error(
        `SICUREZZA VIOLATA: Il database attivo sulla connessione è '${activeDb ?? 'nessuno'}', atteso 'la_nostra_citta_test'. ` +
        `Esecuzione migrazioni interrotta tassativamente per salvaguardia dati.`
      );
    }

    const activePort = Number(dbRows?.[0]?.server_port);
    if (activePort && activePort !== targetInfo.port) {
      throw new Error(
        `SICUREZZA VIOLATA: Porta server attiva '${activePort}' diversa dalla porta autorizzata '${targetInfo.port}'.`
      );
    }

    console.log(`[VERIFICA SUPERATA]: Connessione live confermata su '${activeDb}' (porta ${activePort}).`);

    // Chiudi la connessione del client di verifica prima di lanciare il runner di Prisma CLI
    await prisma.$disconnect();

    // 3. Esecuzione formale di prisma migrate deploy (senza reset o db push)
    console.log('\nEsecuzione comando protetto: npx prisma migrate deploy ...');
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL
      }
    });

    console.log('\n[SUCCESSO]: Tutte le migrazioni sono state applicate con successo al database di test.');
    process.exit(0);
  } catch (err) {
    console.error('\n[ERRORE DI PROTEZIONE]: Applicazione migrazioni bloccata.');
    console.error((err as Error).message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].includes('deploy-migrations')) {
  main();
}
