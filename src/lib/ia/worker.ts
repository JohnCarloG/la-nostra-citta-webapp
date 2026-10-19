import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { eseguiAnalisiSegnalazione, PipelineExecutionResult } from './pipeline';
import { PipelineAdapters } from './types';

export interface ProcessJobResult {
  jobId: string;
  segnalazioneId: string;
  revisione: number;
  outcome: 'SUCCESS' | 'RETRY_SCHEDULED' | 'FAILED_MAX_RETRIES' | 'NO_JOB';
  details?: PipelineExecutionResult | string;
}

export const MAX_WORKER_RETRIES = 3;

/**
 * Acquisisce in modo sicuro e concorrente il prossimo job Outbox non elaborato
 * usando `FOR UPDATE SKIP LOCKED` su MySQL 8.4, prevenendo collisioni tra worker concorrenti.
 */
export async function claimNextOutboxJob(): Promise<{
  id: string;
  segnalazione_id: string;
  revisione: number;
  tipo_evento: string;
  payload_json: string;
  tentativi: number;
} | null> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const jobs = await tx.$queryRaw<Array<{
      id: string;
      segnalazione_id: string;
      revisione: number;
      tipo_evento: string;
      payload_json: string;
      tentativi: number;
    }>>`
      SELECT id, segnalazione_id, revisione, tipo_evento, payload_json, tentativi
      FROM Outbox
      WHERE elaborata_il IS NULL
        AND (prossimo_tentativo_il IS NULL OR prossimo_tentativo_il <= NOW())
        AND tipo_evento IN ('SEGNALAZIONE_CREATA', 'SEGNALAZIONE_MODIFICATA')
      ORDER BY creata_il ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (jobs.length === 0) {
      return null;
    }

    const job = jobs[0];
    const tentativi = job.tentativi + 1;

    // Blocca il job per i prossimi 5 minuti per evitare riacquisizione concorrente in caso di crash
    await tx.$executeRaw`
      UPDATE Outbox
      SET tentativi = ${tentativi},
          prossimo_tentativo_il = DATE_ADD(NOW(), INTERVAL 5 MINUTE)
      WHERE id = ${job.id}
    `;

    return {
      ...job,
      tentativi
    };
  });
}

/**
 * Elabora un singolo job Outbox gestendo concorrenza, timeout, retry e fallback conservativo.
 */
export async function processSingleOutboxJob(
  customAdapters?: Partial<PipelineAdapters>,
  options?: { timeoutMs?: number; maxRetries?: number }
): Promise<ProcessJobResult> {
  const maxRetries = options?.maxRetries ?? MAX_WORKER_RETRIES;

  // 1. Claim concorrente del job (Transazione A)
  const job = await claimNextOutboxJob();
  if (!job) {
    return {
      jobId: '',
      segnalazioneId: '',
      revisione: 0,
      outcome: 'NO_JOB'
    };
  }

  // 2. Esecuzione pipeline IA FUORI da transazioni DB
  let executionResult: PipelineExecutionResult | null = null;
  let processingError: Error | null = null;

  try {
    executionResult = await eseguiAnalisiSegnalazione(
      job.segnalazione_id,
      job.revisione,
      customAdapters,
      { timeoutMs: options?.timeoutMs }
    );
  } catch (err: unknown) {
    processingError = err instanceof Error ? err : new Error(String(err));
  }

  // 3. Finalizzazione atomica dell'esito (Transazione B)
  return prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<ProcessJobResult> => {
    // Se l'elaborazione ha avuto successo o è stata gestita determinata dalla pipeline
    if (executionResult && executionResult.status !== 'FAILED') {
      await tx.outbox.update({
        where: { id: job.id },
        data: {
          elaborata_il: new Date(),
          prossimo_tentativo_il: null
        }
      });

      return {
        jobId: job.id,
        segnalazioneId: job.segnalazione_id,
        revisione: job.revisione,
        outcome: 'SUCCESS',
        details: executionResult
      };
    }

    // Se si è verificato un errore imprevisto o la pipeline ha restituito FAILED
    const errMessage = processingError?.message || executionResult?.reason || 'Errore elaborazione job';

    if (job.tentativi >= maxRetries) {
      // Esauriti i tentativi: applicazione della policy conservativa (05 riga 30)
      const segRows = await tx.$queryRaw<Array<{ id: string; stato_moderazione: string; revisione: number }>>`
        SELECT id, stato_moderazione, revisione
        FROM Segnalazione
        WHERE id = ${job.segnalazione_id}
        FOR UPDATE
      `;

      if (segRows.length > 0 && segRows[0].stato_moderazione === 'PENDENTE' && segRows[0].revisione === job.revisione) {
        await tx.segnalazione.update({
          where: { id: job.segnalazione_id },
          data: {
            stato_moderazione: 'IN_REVISIONE',
            aggiornata_il: new Date()
          }
        });

        await tx.eventoStato.create({
          data: {
            segnalazione_id: job.segnalazione_id,
            tipo_attore: 'SISTEMA',
            ambito: 'MODERAZIONE',
            da_stato: 'PENDENTE',
            a_stato: 'IN_REVISIONE',
            motivazione: `Esauriti ${maxRetries} tentativi di elaborazione automatica: ${errMessage}`,
            revisione: job.revisione
          }
        });
      }

      await tx.outbox.update({
        where: { id: job.id },
        data: {
          elaborata_il: new Date(),
          prossimo_tentativo_il: null
        }
      });

      return {
        jobId: job.id,
        segnalazioneId: job.segnalazione_id,
        revisione: job.revisione,
        outcome: 'FAILED_MAX_RETRIES',
        details: errMessage
      };
    } else {
      // Pianifica retry con backoff esponenziale (es. 2s, 4s, 8s)
      const backoffSeconds = Math.pow(2, job.tentativi) * 2;
      const nextAttemptDate = new Date(Date.now() + backoffSeconds * 1000);

      await tx.outbox.update({
        where: { id: job.id },
        data: {
          prossimo_tentativo_il: nextAttemptDate
        }
      });

      return {
        jobId: job.id,
        segnalazioneId: job.segnalazione_id,
        revisione: job.revisione,
        outcome: 'RETRY_SCHEDULED',
        details: errMessage
      };
    }
  });
}

/**
 * Esegue un ciclo batch di elaborazione dei job outbox fino a esaurimento o raggiungimento limite.
 */
export async function runOutboxWorkerBatch(
  maxJobs = 10,
  customAdapters?: Partial<PipelineAdapters>,
  options?: { timeoutMs?: number; maxRetries?: number }
): Promise<ProcessJobResult[]> {
  const results: ProcessJobResult[] = [];

  for (let i = 0; i < maxJobs; i++) {
    const res = await processSingleOutboxJob(customAdapters, options);
    if (res.outcome === 'NO_JOB') {
      break;
    }
    results.push(res);
  }

  return results;
}
