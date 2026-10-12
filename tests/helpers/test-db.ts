import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { maskDatabaseUrl } from '../../src/lib/test-env';

export interface DatabaseTargetInfo {
  host: string;
  port: number;
  database: string;
  isAuthorizedTestDb: boolean;
  sslAccept?: string;
  sslCertPath?: string;
  maskedUrl: string;
}

/**
 * Analizza e verifica l'URL di connessione al database con controlli stringenti inderogabili:
 * - Protocollo obbligatorio: mysql
 * - AUTHORIZED_TEST_HOST obbligatorio in env: deve coincidere esattamente con l'host
 * - AUTHORIZED_TEST_PORT obbligatorio in env: deve coincidere esattamente con la porta
 * - Database target obbligatorio: la_nostra_citta_test (vietato categoricamente defaultdb o altri db)
 * - Configurazione TLS per connettore Prisma MySQL:
 *   se specificato sslaccept deve essere 'strict' (non consentiti bypass come accept_invalid_certs).
 *   se specificato sslcert o SSL_CERT_PATH, verifica l'esistenza fisica del file CA sul filesystem.
 *
 * Previene tassativamente qualsiasi operazione accidentale su database non autorizzati.
 */
export function getAndVerifyDatabaseInfo(databaseUrl?: string): DatabaseTargetInfo {
  const urlString = databaseUrl || process.env.DATABASE_URL;
  if (!urlString) {
    throw new Error('Configurazione di test assente: DATABASE_URL o TEST_DATABASE_URL non configurato.');
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch (err) {
    throw new Error(`DATABASE_URL non valido: ${(err as Error).message}`);
  }

  const protocol = parsed.protocol.replace(':', '');
  if (protocol !== 'mysql') {
    throw new Error(`Target non autorizzato: atteso 'mysql', trovato '${protocol}'. Non tornare a PostgreSQL.`);
  }

  const host = parsed.hostname;
  const port = parsed.port ? parseInt(parsed.port, 10) : 3306;
  const databaseName = parsed.pathname.replace(/^\//, '');

  if (!host) {
    throw new Error('Host database non specificato nell\'URL di connessione.');
  }

  // 1. AUTHORIZED_TEST_HOST OBBLIGATORIO
  const authorizedHost = process.env.AUTHORIZED_TEST_HOST;
  if (!authorizedHost) {
    throw new Error(
      'SICUREZZA VIOLATA: Variabile d\'ambiente AUTHORIZED_TEST_HOST obbligatoria non definita. ' +
      'Configurarla esplicitamente per autorizzare la destinazione di test.'
    );
  }
  if (host !== authorizedHost) {
    throw new Error(
      `SICUREZZA VIOLATA: L'host specificato '${host}' non corrisponde all'host autorizzato '${authorizedHost}'. ` +
      'Operazione interrotta per salvaguardia dati.'
    );
  }

  // 2. AUTHORIZED_TEST_PORT OBBLIGATORIO
  const authorizedPortStr = process.env.AUTHORIZED_TEST_PORT;
  if (!authorizedPortStr) {
    throw new Error(
      'SICUREZZA VIOLATA: Variabile d\'ambiente AUTHORIZED_TEST_PORT obbligatoria non definita. ' +
      'Configurarla esplicitamente per autorizzare la porta di test.'
    );
  }
  const authorizedPort = parseInt(authorizedPortStr, 10);
  if (isNaN(authorizedPort) || port !== authorizedPort) {
    throw new Error(
      `SICUREZZA VIOLATA: La porta specificata '${port}' non corrisponde alla porta autorizzata '${authorizedPort}'. ` +
      'Operazione interrotta per salvaguardia dati.'
    );
  }

  // 3. DATABASE TARGET OBBLIGATORIO: la_nostra_citta_test
  const expectedTestDb = 'la_nostra_citta_test';
  if (databaseName !== expectedTestDb) {
    throw new Error(
      `SICUREZZA VIOLATA: Il database selezionato è '${databaseName}'. ` +
      `Le operazioni di test e pulizia sono autorizzate ESCLUSIVAMENTE sul database dedicato '${expectedTestDb}'. ` +
      'È categoricamente vietato utilizzare defaultdb o database operativi.'
    );
  }

  // 4. VERIFICA CONFIGURAZIONE TLS / CERTIFICATO CA
  const sslAccept = parsed.searchParams.get('sslaccept') || undefined;
  if (sslAccept) {
    if (sslAccept !== 'strict') {
      throw new Error(
        `SICUREZZA VIOLATA: Modalità TLS 'sslaccept=${sslAccept}' non consentita. ` +
        'Il connettore Prisma richiede \'sslaccept=strict\'; disabilitare o indebolire la verifica certificati è vietato.'
      );
    }
  }

  const sslCertParam = parsed.searchParams.get('sslcert') || process.env.SSL_CERT_PATH || undefined;
  let resolvedCertPath: string | undefined = undefined;
  if (sslCertParam) {
    // Risolve in modo assoluto rispetto alla root di lavoro per garantire identica risoluzione
    resolvedCertPath = path.isAbsolute(sslCertParam)
      ? sslCertParam
      : path.resolve(process.cwd(), sslCertParam);

    if (!fs.existsSync(resolvedCertPath)) {
      throw new Error(
        `Configurazione TLS non valida: Il certificato CA specificato '${sslCertParam}' non esiste sul filesystem locale (risolto in: '${resolvedCertPath}').`
      );
    }
  }

  return {
    host,
    port,
    database: databaseName,
    isAuthorizedTestDb: true,
    sslAccept,
    sslCertPath: resolvedCertPath,
    maskedUrl: maskDatabaseUrl(urlString),
  };
}

/**
 * Pulisce in modo transazionale e sicuro il database di test.
 *
 * Controlli preventivi inderogabili prima di qualsiasi scrittura:
 * 1. Controllo statico dei parametri di connessione (host, porta, db: la_nostra_citta_test).
 * 2. Controllo dinamico live interrogando il server MySQL attivo (SELECT DATABASE()).
 * Nessuna operazione di pulizia o cancellazione viene avviata se una delle verifiche fallisce.
 *
 * Ordine rigoroso di cancellazione per rispettare i vincoli di Foreign Key (onDelete: Restrict):
 * 1. SuggerimentoCategoria (FK verso AnalisiIa e Categoria)
 * 2. AnalisiIa (FK verso Segnalazione e Media)
 * 3. RichiestaIdempotente (FK verso Utente e Segnalazione)
 * 4. Outbox (FK verso Segnalazione)
 * 5. AuditEvento (FK verso Utente e Segnalazione: CANCELLATO PRIMA di Segnalazione e Utente)
 * 6. EventoStato (FK verso Segnalazione e Utente)
 * 7. Sostegno (FK verso Utente e Segnalazione)
 * 8. SegnalazioneCategoria (FK verso Segnalazione e Categoria)
 * 9. Media (FK verso Segnalazione)
 * 10. Segnalazione (FK verso Utente)
 * 11. UploadTemporaneo (FK verso Utente)
 * 12. TokenAccount (FK verso Utente)
 * 13. Sessione (FK verso Utente)
 * 14. Utente (FK verso Quartiere)
 * 15. Categoria (catalogo indipendente)
 * 16. Quartiere (catalogo indipendente)
 */
export async function cleanTestDatabase(prisma: PrismaClient): Promise<void> {
  const targetInfo = getAndVerifyDatabaseInfo();

  if (!targetInfo.isAuthorizedTestDb) {
    throw new Error(
      `SICUREZZA VIOLATA: Il database target selezionato è '${targetInfo.database}'. ` +
      'La pulizia automatica è autorizzata ESCLUSIVAMENTE sul database dedicato \'la_nostra_citta_test\'.'
    );
  }

  // Verifica dinamica live su sessione attiva: interroga il server MySQL prima di qualunque operazione
  const activeDbRows = await prisma.$queryRaw<Array<{ current_db: string | null }>>`
    SELECT DATABASE() AS current_db;
  `;
  const activeDb = activeDbRows?.[0]?.current_db;
  if (activeDb !== 'la_nostra_citta_test') {
    throw new Error(
      `SICUREZZA VIOLATA: Il database attivo sulla connessione è '${activeDb ?? 'nessuno'}', atteso 'la_nostra_citta_test'. ` +
      'Pulizia automatica interrotta per salvaguardia dati.'
    );
  }

  // Pulizia eseguita atomicamente in una singola transazione DB
  await prisma.$transaction(async (tx) => {
    // 1. Tabelle dipendenti di livello 2
    await tx.suggerimentoCategoria.deleteMany();
    await tx.analisiIa.deleteMany();
    await tx.richiestaIdempotente.deleteMany();
    await tx.outbox.deleteMany();

    // 2. AuditEvento: tassativamente prima di Segnalazione e Utente
    await tx.auditEvento.deleteMany();

    // 3. Altre dipendenze dirette di Segnalazione e Utente
    await tx.eventoStato.deleteMany();
    await tx.sostegno.deleteMany();
    await tx.segnalazioneCategoria.deleteMany();
    await tx.media.deleteMany();

    // 4. Segnalazione (padre di Media, figlia di Utente)
    await tx.segnalazione.deleteMany();

    // 5. Dipendenze di account e upload
    await tx.uploadTemporaneo.deleteMany();
    await tx.tokenAccount.deleteMany();
    await tx.sessione.deleteMany();

    // 6. Utente (padre di sessioni/token, figlio di Quartiere)
    await tx.utente.deleteMany();

    // 7. Cataloghi base
    await tx.categoria.deleteMany();
    await tx.quartiere.deleteMany();
  });
}
