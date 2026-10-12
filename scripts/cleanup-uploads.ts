import { loadTestEnv } from '../src/lib/test-env';
loadTestEnv();

import { pulisciUploadTemporaneiScaduti } from '../src/lib/domain/uploads';
import { prisma } from '../src/lib/db';

/**
 * Script di esecuzione della procedura di pulizia (Garbage Collection) upload temporanei:
 * 
 * MODALITÀ DI INVOCAZIONE:
 * - Questa procedura NON è un demone o cron interno all'applicazione Next.js.
 * - Viene invocata ESPLICITAMENTE:
 *   1. Da riga di comando per manutenzione: `npm run cleanup:uploads`
 *   2. Da uno schedulatore di sistema operativo esterno (es. Cron su Linux / Task Scheduler su Windows).
 * 
 * GARANZIE DI INTEGRITÀ:
 * - Non elimina mai upload con stato 'CONSUMATO' o già trasformati in 'Media'.
 * - Verifica l'assenza di riferimenti nella tabella `Media`.
 * - Elimina prima il record sul DB solo se ancora non consumato, poi il file fisico.
 */
async function main() {
  console.log('===============================================================');
  console.log('   PROCEDURA CONTROLLATA PULIZIA UPLOAD TEMPORANEI SCADUTI     ');
  console.log('===============================================================');

  try {
    const result = await pulisciUploadTemporaneiScaduti();
    console.log(`[ESITO PULIZIA]:`);
    console.log(`- Record scaduti eliminati dal DB: ${result.scadutiEliminatiDb}`);
    console.log(`- File fisici orfani rimossi dallo storage: ${result.fileOrfaniRimossiStorage}`);
    console.log('Operazione completata con successo.');
  } catch (err) {
    console.error('[ERRORE PULIZIA]:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
