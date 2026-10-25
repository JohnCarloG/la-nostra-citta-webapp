import type { PrismaClient } from '@prisma/client';
import type { IEmailTransport } from './email-transport';

export interface TestWorkerOptions {
  jobId?: string;
  send?: boolean;
  allowedRecipient?: string;
  appUrl?: string;
  expectedDbName?: string;
}

export interface TestWorkerResult {
  success: boolean;
  mode: 'DRY_RUN_VERIFICATION' | 'REAL_SEND';
  jobId?: string;
  recipient?: string;
  error?: string;
  outboxUpdated?: boolean;
  emailSent?: boolean;
}

/**
 * Valida i parametri e la coerenza dell'ambiente per il worker di collaudo email.
 */
export function validateTestWorkerEnv(options: TestWorkerOptions): { valid: boolean; error?: string } {
  if (!options.jobId || options.jobId.trim() === '') {
    return { valid: false, error: 'Parametro --job-id obbligatorio non specificato.' };
  }

  if (!options.allowedRecipient || options.allowedRecipient.trim() === '') {
    return { valid: false, error: 'Variabile obbligatoria SMTP_TEST_ALLOWED_RECIPIENT non definita o vuota.' };
  }

  if (!options.appUrl || options.appUrl.trim() === '') {
    return { valid: false, error: 'Variabile APP_URL non definita o vuota.' };
  }

  try {
    const parsedUrl = new URL(options.appUrl);
    if (!parsedUrl.protocol.startsWith('http')) {
      return { valid: false, error: `APP_URL non valido: atteso protocollo HTTP/HTTPS, trovato ${parsedUrl.protocol}` };
    }
  } catch {
    return { valid: false, error: `APP_URL non valido: '${options.appUrl}'` };
  }

  return { valid: true };
}

/**
 * Esegue in modo controllato la verifica o l'invio mirato del singolo job Outbox sul database di test.
 */
export async function executeTestEmailWorker(
  prisma: Pick<PrismaClient, '$queryRaw' | 'outbox'>,
  transport: IEmailTransport,
  options: TestWorkerOptions
): Promise<TestWorkerResult> {
  const envCheck = validateTestWorkerEnv(options);
  if (!envCheck.valid) {
    return {
      success: false,
      mode: options.send ? 'REAL_SEND' : 'DRY_RUN_VERIFICATION',
      error: envCheck.error,
      outboxUpdated: false,
      emailSent: false
    };
  }

  const expectedDb = options.expectedDbName || 'la_nostra_citta_test';

  // 1. Controllo dinamico live sul database attivo
  try {
    const rows = await prisma.$queryRaw<Array<{ current_db: string | null }>>`SELECT DATABASE() as current_db;`;
    const liveDb = rows[0]?.current_db;
    if (liveDb !== expectedDb) {
      return {
        success: false,
        mode: options.send ? 'REAL_SEND' : 'DRY_RUN_VERIFICATION',
        jobId: options.jobId,
        error: `SICUREZZA VIOLATA: Il database live '${liveDb}' non corrisponde a quello autorizzato '${expectedDb}'. Operazione interrotta.`,
        outboxUpdated: false,
        emailSent: false
      };
    }
  } catch (err: any) {
    return {
      success: false,
      mode: options.send ? 'REAL_SEND' : 'DRY_RUN_VERIFICATION',
      jobId: options.jobId,
      error: `Verifica live del database fallita: ${err.message}`,
      outboxUpdated: false,
      emailSent: false
    };
  }

  // 2. Recupero del job specificato
  const job = await prisma.outbox.findUnique({
    where: { id: options.jobId }
  });

  if (!job) {
    return {
      success: false,
      mode: options.send ? 'REAL_SEND' : 'DRY_RUN_VERIFICATION',
      jobId: options.jobId,
      error: `Job '${options.jobId}' non trovato nel database ${expectedDb}.`,
      outboxUpdated: false,
      emailSent: false
    };
  }

  if (job.tipo_evento !== 'INVIO_EMAIL') {
    return {
      success: false,
      mode: options.send ? 'REAL_SEND' : 'DRY_RUN_VERIFICATION',
      jobId: options.jobId,
      error: `Job '${options.jobId}' ha tipo '${job.tipo_evento}', atteso 'INVIO_EMAIL'.`,
      outboxUpdated: false,
      emailSent: false
    };
  }

  if (job.elaborata_il !== null) {
    return {
      success: false,
      mode: options.send ? 'REAL_SEND' : 'DRY_RUN_VERIFICATION',
      jobId: options.jobId,
      error: `Job '${options.jobId}' risulta già elaborato il ${job.elaborata_il.toISOString()}.`,
      outboxUpdated: false,
      emailSent: false
    };
  }

  let payload: { tipo: string; to: string; subject: string; body: string; token?: string; utente_id: string };
  try {
    payload = JSON.parse(job.payload_json);
  } catch {
    return {
      success: false,
      mode: options.send ? 'REAL_SEND' : 'DRY_RUN_VERIFICATION',
      jobId: options.jobId,
      error: 'Payload JSON malformato nel job Outbox.',
      outboxUpdated: false,
      emailSent: false
    };
  }

  // 3. Verifica rigorosa del destinatario autorizzato
  const allowed = options.allowedRecipient!.trim().toLowerCase();
  const actual = payload.to.trim().toLowerCase();
  if (actual !== allowed) {
    return {
      success: false,
      mode: options.send ? 'REAL_SEND' : 'DRY_RUN_VERIFICATION',
      jobId: options.jobId,
      recipient: payload.to,
      error: `SICUREZZA VIOLATA: Destinatario del job '${payload.to}' non coincide con l'indirizzo autorizzato configurato '${options.allowedRecipient}'. Invio bloccato.`,
      outboxUpdated: false,
      emailSent: false
    };
  }

  // 4. Se --send non è specificato: MODALITÀ DRY-RUN (Nessuna modifica DB, nessun invio)
  if (!options.send) {
    return {
      success: true,
      mode: 'DRY_RUN_VERIFICATION',
      jobId: options.jobId,
      recipient: payload.to,
      outboxUpdated: false,
      emailSent: false
    };
  }

  // 5. Se --send è specificato: INVIO REALE AUTORIZZATO
  const sendRes = await transport.sendEmail(
    payload.to,
    payload.subject,
    payload.body,
    payload.token
  );

  if (!sendRes.success || !sendRes.accepted) {
    await prisma.outbox.update({
      where: { id: options.jobId },
      data: {
        tentativi: { increment: 1 }
      }
    });
    return {
      success: false,
      mode: 'REAL_SEND',
      jobId: options.jobId,
      recipient: payload.to,
      error: `Invio email fallito dal provider SMTP: ${sendRes.error || 'Messaggio non accettato'}`,
      outboxUpdated: true,
      emailSent: false
    };
  }

  await prisma.outbox.update({
    where: { id: options.jobId },
    data: {
      elaborata_il: new Date(),
      prossimo_tentativo_il: null
    }
  });

  return {
    success: true,
    mode: 'REAL_SEND',
    jobId: options.jobId,
    recipient: payload.to,
    outboxUpdated: true,
    emailSent: true
  };
}
