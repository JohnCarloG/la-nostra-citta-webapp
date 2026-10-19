import { prisma } from './db';
import { emailTransport } from './email-transport';
import { Prisma } from '@prisma/client';

export interface EmailJobPayload {
  tipo: 'VERIFICA_EMAIL' | 'RESET_PASSWORD';
  to: string;
  subject: string;
  body: string;
  token?: string;
  utente_id: string;
}

export interface DispatchEmailResult {
  outboxId: string;
  delivered: boolean;
  accepted: boolean;
  error?: string;
}

const MAX_EMAIL_RETRIES = 5;

/**
 * Registra un job di invio email nella tabella Outbox.
 * Può essere eseguito all'interno di una transazione esistente per garantire atomicita' con i dati dell'account.
 */
export async function accodaEmailOutbox(
  payload: EmailJobPayload,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const client = tx || prisma;

  const job = await client.outbox.create({
    data: {
      tipo_evento: 'INVIO_EMAIL',
      revisione: 1,
      payload_json: JSON.stringify(payload),
    }
  });

  return job.id;
}

/**
 * Tenta l'invio immediato del job Outbox appena creato, FUORI dalla transazione DB aperta.
 * Ritorna l'esito reale dell'invio.
 */
export async function tentaInvioImmediatoOutbox(jobId: string): Promise<DispatchEmailResult> {
  const job = await prisma.outbox.findUnique({ where: { id: jobId } });
  if (!job) {
    return {
      outboxId: jobId,
      delivered: false,
      accepted: false,
      error: 'Job outbox non trovato'
    };
  }

  let payload: EmailJobPayload;
  try {
    payload = JSON.parse(job.payload_json);
  } catch {
    await prisma.outbox.update({
      where: { id: jobId },
      data: { elaborata_il: new Date() } // Job malformato scartato
    });
    return {
      outboxId: jobId,
      delivered: false,
      accepted: false,
      error: 'Payload JSON malformato'
    };
  }

  // Esecuzione trasporto FUORI da qualsiasi transazione
  const sendRes = await emailTransport.sendEmail(
    payload.to,
    payload.subject,
    payload.body,
    payload.token
  );

  if (sendRes.success && sendRes.accepted) {
    await prisma.outbox.update({
      where: { id: jobId },
      data: {
        elaborata_il: new Date(),
        prossimo_tentativo_il: null,
      }
    });

    return {
      outboxId: jobId,
      delivered: true,
      accepted: true,
    };
  } else {
    // Invio non riuscito o SMTP non configurato: pianifica retry conservativo con backoff esponenziale
    const tentativi = job.tentativi + 1;
    const backoffSeconds = Math.min(Math.pow(2, tentativi) * 30, 3600); // 1m, 2m, 4m... max 1h
    const nextAttempt = new Date(Date.now() + backoffSeconds * 1000);

    await prisma.outbox.update({
      where: { id: jobId },
      data: {
        tentativi,
        prossimo_tentativo_il: nextAttempt
      }
    });

    return {
      outboxId: jobId,
      delivered: false,
      accepted: false,
      error: sendRes.error || 'Mancata accettazione dal server SMTP'
    };
  }
}

/**
 * Acquisisce in modo sicuro e concorrente il prossimo job Outbox di tipo email
 * tramite `FOR UPDATE SKIP LOCKED` su MySQL.
 */
export async function claimNextEmailOutboxJob(): Promise<{
  id: string;
  payload_json: string;
  tentativi: number;
} | null> {
  return prisma.$transaction(async (tx) => {
    const jobs = await tx.$queryRaw<Array<{
      id: string;
      payload_json: string;
      tentativi: number;
    }>>`
      SELECT id, payload_json, tentativi
      FROM Outbox
      WHERE elaborata_il IS NULL
        AND (prossimo_tentativo_il IS NULL OR prossimo_tentativo_il <= NOW())
        AND tipo_evento = 'INVIO_EMAIL'
      ORDER BY creata_il ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (jobs.length === 0) return null;

    const job = jobs[0];
    const tentativi = job.tentativi + 1;

    // Blocca per 5 minuti durante l'elaborazione
    await tx.$executeRaw`
      UPDATE Outbox
      SET tentativi = ${tentativi},
          prossimo_tentativo_il = DATE_ADD(NOW(), INTERVAL 5 MINUTE)
      WHERE id = ${job.id}
    `;

    return {
      id: job.id,
      payload_json: job.payload_json,
      tentativi
    };
  });
}

/**
 * Elabora un singolo job email acquisito dal worker asincrono.
 */
export async function processSingleEmailOutboxJob(): Promise<{
  processed: boolean;
  outcome: 'SUCCESS' | 'FAILED_RETRY' | 'FAILED_MAX_RETRIES' | 'NO_JOB';
}> {
  const job = await claimNextEmailOutboxJob();
  if (!job) {
    return { processed: false, outcome: 'NO_JOB' };
  }

  let payload: EmailJobPayload;
  try {
    payload = JSON.parse(job.payload_json);
  } catch {
    await prisma.outbox.update({
      where: { id: job.id },
      data: { elaborata_il: new Date() }
    });
    return { processed: true, outcome: 'FAILED_MAX_RETRIES' };
  }

  const sendRes = await emailTransport.sendEmail(
    payload.to,
    payload.subject,
    payload.body,
    payload.token
  );

  if (sendRes.success && sendRes.accepted) {
    await prisma.outbox.update({
      where: { id: job.id },
      data: {
        elaborata_il: new Date(),
        prossimo_tentativo_il: null
      }
    });
    return { processed: true, outcome: 'SUCCESS' };
  }

  if (job.tentativi >= MAX_EMAIL_RETRIES) {
    // Esauriti i tentativi massimi
    await prisma.outbox.update({
      where: { id: job.id },
      data: {
        elaborata_il: new Date(), // Marcato per evitare loop infiniti
        prossimo_tentativo_il: null
      }
    });
    return { processed: true, outcome: 'FAILED_MAX_RETRIES' };
  } else {
    const backoffSeconds = Math.pow(2, job.tentativi) * 30;
    await prisma.outbox.update({
      where: { id: job.id },
      data: {
        prossimo_tentativo_il: new Date(Date.now() + backoffSeconds * 1000)
      }
    });
    return { processed: true, outcome: 'FAILED_RETRY' };
  }
}
