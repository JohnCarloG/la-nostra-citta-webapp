import { loadTestEnv } from '../src/lib/test-env';
loadTestEnv();

import { PrismaClient } from '@prisma/client';
import { getAndVerifyDatabaseInfo } from '../tests/helpers/test-db';

const prisma = new PrismaClient();

export interface VerificationReport {
  connected: boolean;
  serverVersion?: string;
  tlsActive?: boolean;
  tlsCipher?: string;
  selectedDatabase?: string;
  isAuthorizedTargetConfigured: boolean;
  isLiveDatabaseAuthorized: boolean;
  existingTables?: Array<{ table: string; rowCount: number }> | 'NON_VERIFICATO';
  containsNonProjectTables?: boolean | 'NON_VERIFICATO';
  hasExistingData?: boolean | 'NON_VERIFICATO';
  migrationState?: 'NON_VERIFICATO' | 'NESSUNA_MIGRAZIONE' | 'TABELLA_MIGRAZIONI_PRESENTE';
  targetConfigured?: string;
  error?: string;
  errorCategory?: 'RETE_TCP' | 'TLS_CERTIFICATO' | 'AUTENTICAZIONE' | 'DATABASE_INFORMATO' | 'ALTRO';
}

/**
 * Script Diagnostico Read-Only per Database MySQL (Aiven).
 * Esegue esclusivamente query di ispezione non distruttive.
 * Non modifica dati, non esegue migrazioni e non cancella tabelle.
 */
export async function verifyDatabaseReadonly(): Promise<VerificationReport> {
  loadTestEnv();

  const report: VerificationReport = {
    connected: false,
    isAuthorizedTargetConfigured: false,
    isLiveDatabaseAuthorized: false,
    existingTables: 'NON_VERIFICATO',
    containsNonProjectTables: 'NON_VERIFICATO',
    hasExistingData: 'NON_VERIFICATO',
    migrationState: 'NON_VERIFICATO',
  };

  try {
    const targetInfo = getAndVerifyDatabaseInfo();
    report.isAuthorizedTargetConfigured = targetInfo.isAuthorizedTestDb;
    report.targetConfigured = targetInfo.maskedUrl;

    // 1. Connessione e Versione MySQL live (SELECT VERSION())
    const versionRows = await prisma.$queryRaw<Array<{ version: string }>>`
      SELECT VERSION() as version;
    `;
    if (versionRows && versionRows.length > 0) {
      report.serverVersion = versionRows[0].version;
      report.connected = true;
    }

    // 2. Database attualmente selezionato (SELECT DATABASE())
    const dbRows = await prisma.$queryRaw<Array<{ current_db: string | null }>>`
      SELECT DATABASE() as current_db;
    `;
    if (dbRows && dbRows.length > 0) {
      report.selectedDatabase = dbRows[0].current_db ?? undefined;
      report.isLiveDatabaseAuthorized = report.selectedDatabase === 'la_nostra_citta_test';
    }

    // 3. Verifica TLS / Ssl_cipher
    const sslCipherRows = await prisma.$queryRaw<Array<{ Variable_name: string; Value: string }>>`
      SHOW STATUS LIKE 'Ssl_cipher';
    `;
    if (sslCipherRows && sslCipherRows.length > 0 && sslCipherRows[0].Value) {
      report.tlsActive = true;
      report.tlsCipher = sslCipherRows[0].Value;
    } else {
      report.tlsActive = false;
    }

    // 4. Ispezione tabelle esistenti e conteggio righe
    const tableRows = await prisma.$queryRaw<Array<Record<string, string>>>`
      SHOW TABLES;
    `;
    const tableNames = tableRows.map((r) => Object.values(r)[0]);

    const allowedTables = new Set([
      '_prisma_migrations',
      'Quartiere',
      'Utente',
      'Segnalazione',
      'Media',
      'Sostegno',
      'Categoria',
      'SegnalazioneCategoria',
      'EventoStato',
      'AuditEvento',
      'AnalisiIa',
      'SuggerimentoCategoria',
      'UploadTemporaneo',
      'TokenAccount',
      'Sessione',
      'Outbox',
      'RichiestaIdempotente'
    ]);

    const nonProject = tableNames.filter((t) => !allowedTables.has(t));
    report.containsNonProjectTables = nonProject.length > 0;

    const tablesList: Array<{ table: string; rowCount: number }> = [];
    let totalRows = 0;
    for (const table of tableNames) {
      try {
        const countRes = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
          `SELECT COUNT(*) as count FROM \`${table.replace(/`/g, '')}\`;`
        );
        const count = Number(countRes[0]?.count ?? 0);
        totalRows += count;
        tablesList.push({ table, rowCount: count });
      } catch {
        tablesList.push({ table, rowCount: -1 });
      }
    }

    report.existingTables = tablesList;
    report.hasExistingData = totalRows > 0;
    report.migrationState = tableNames.includes('_prisma_migrations') 
      ? 'TABELLA_MIGRAZIONI_PRESENTE' 
      : 'NESSUNA_MIGRAZIONE';

    if (!report.isLiveDatabaseAuthorized) {
      report.errorCategory = 'DATABASE_INFORMATO';
      throw new Error(
        `Database attivo '${report.selectedDatabase}' non autorizzato per collaudo automatico. ` +
        `Atteso: 'la_nostra_citta_test'. Non usare mai defaultdb come alternativa.`
      );
    }

    if (report.containsNonProjectTables) {
      throw new Error(
        `Rilevate tabelle estranee allo schema di progetto: [${nonProject.join(', ')}].`
      );
    }

  } catch (err) {
    const errMsg = (err as Error).message;
    report.error = errMsg;
    if (!report.errorCategory) {
      if (errMsg.includes("Can't reach database server") || errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNREFUSED')) {
        report.errorCategory = 'RETE_TCP';
      } else if (errMsg.includes('ssl') || errMsg.includes('cert') || errMsg.includes('certificate') || errMsg.includes('TLS')) {
        report.errorCategory = 'TLS_CERTIFICATO';
      } else if (errMsg.includes('Access denied') || errMsg.includes('password') || errMsg.includes('authentication')) {
        report.errorCategory = 'AUTENTICAZIONE';
      } else if (errMsg.includes('Unknown database') || errMsg.includes('database')) {
        report.errorCategory = 'DATABASE_INFORMATO';
      } else {
        report.errorCategory = 'ALTRO';
      }
    }
  }

  return report;
}

async function main() {
  console.log('====================================================');
  console.log('   VERIFICA DIAGNOSTICA READ-ONLY DATABASE MYSQL   ');
  console.log('====================================================');

  const report = await verifyDatabaseReadonly();
  console.log(JSON.stringify(report, null, 2));

  if (!report.connected || report.error) {
    console.error('\n[ERRORE]: Connessione o verifica fallita.');
    console.error(`Dettaglio: ${report.error ?? 'Database non raggiungibile'}`);
    process.exit(1);
  }

  console.log('\n[SUCCESSO]: Connessione verificata e conforme.');
  process.exit(0);
}

if (process.argv[1] && process.argv[1].includes('verify-aiven')) {
  main().finally(() => prisma.$disconnect());
}
