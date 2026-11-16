import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { getStorageProvider } from '../storage';
import { GeminiClient, CLOUD_POLICY_VERSION } from './gemini';
import { evaluateCloudReport, type CloudReport, type CloudEvaluation } from './cloud-evaluation';
import type { PipelineExecutionResult } from './pipeline';

function fingerprint(report: CloudReport): string {
  return crypto.createHash('sha256').update(JSON.stringify({
    revision: report.revisione, description: report.descrizione,
    media: report.media.map(m => [m.id, m.segnalazione_id, m.storage_key, m.sha256, m.byte_size, m.mime, m.tipo, m.stato_file])
  })).digest('hex');
}

/** Cloud path deliberately separate from legacy mock/Ollama adapters. No simulated approval option. */
export async function eseguiAnalisiCloud(id: string, revision: number, timeoutMs?: number): Promise<PipelineExecutionResult> {
  const report = await prisma.segnalazione.findUnique({
    where: { id }, include: { media: { orderBy: [{ creato_il: 'asc' }, { id: 'asc' }] } }
  });
  if (!report) return { segnalazioneId: id, revisione: revision, status: 'FAILED', reason: 'Segnalazione non trovata' };
  if (report.revisione !== revision) return { segnalazioneId: id, revisione: revision, status: 'OBSOLETE' };
  if (report.stato_moderazione !== 'PENDENTE' || report.stato_avanzamento === 'RITIRATA') return {
    segnalazioneId: id, revisione: revision, status: 'SKIPPED_HUMAN_OVERRIDE', finalState: report.stato_moderazione
  };
  const inputHash = fingerprint(report);
  let evaluation: CloudEvaluation;
  let model = 'configuration-error';
  try {
    const client = new GeminiClient();
    model = client.model;
    const storage = getStorageProvider();
    evaluation = await evaluateCloudReport(report, key => storage.getObject(key), client, timeoutMs);
  } catch {
    // Configuration/storage initialization errors are not user violations. Do not log raw errors or secrets.
    model = 'configuration-error';
    evaluation = {
      state: 'IN_REVISIONE', reason: 'Testo e allegati: ripetere i controlli; configurazione del servizio non disponibile. Nessuna violazione accertata.',
      checks: [{ target: 'Testo', error: 'PROVIDER_UNAVAILABLE' }]
    };
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{ id: string; revisione: number; stato_moderazione: string; stato_avanzamento: string }>>`
      SELECT id, revisione, stato_moderazione, stato_avanzamento FROM Segnalazione WHERE id = ${id} FOR UPDATE
    `;
    const current = rows[0];
    if (!current) return { segnalazioneId: id, revisione: revision, status: 'FAILED' as const };
    const latest = await tx.segnalazione.findUnique({
      where: { id }, include: { media: { orderBy: [{ creato_il: 'asc' }, { id: 'asc' }] } }
    });
    const obsolete = current.revisione !== revision || !latest || fingerprint(latest) !== inputHash;
    const human = await tx.eventoStato.findFirst({
      where: { segnalazione_id: id, revisione: revision, ambito: 'MODERAZIONE', tipo_attore: 'UTENTE', a_stato: { not: 'PENDENTE' } },
      select: { id: true }
    });
    const skip = !!human || current.stato_moderazione !== 'PENDENTE' || current.stato_avanzamento === 'RITIRATA';
    const execution = obsolete ? 'OBSOLETE' : skip ? 'SKIPPED_HUMAN_OVERRIDE' : 'COMPLETED';
    // Complete immutable-by-idempotency snapshot: no provider prose, credentials or private storage paths.
    const entry = {
      segnalazione_id: id, revisione: revision, modulo: 'MODERAZIONE' as const,
      input_hash: inputHash, versione_modello: model, versione_policy: CLOUD_POLICY_VERSION,
      stato_esecuzione: obsolete ? 'OBSOLETE' as const : evaluation.checks.some(c => c.error) ? 'FAILED' as const : 'SUCCEEDED' as const,
      esito: execution === 'COMPLETED' ? evaluation.state : execution,
      dettagli_json: JSON.stringify({ revision, model, policy: CLOUD_POLICY_VERSION, execution, ...evaluation }),
      completata_il: new Date()
    };
    await tx.analisiIa.upsert({
      where: { chiave_idempotenza: {
        segnalazione_id: id, revisione: revision, modulo: 'MODERAZIONE', input_hash: inputHash,
        versione_modello: model, versione_policy: CLOUD_POLICY_VERSION
      } }, create: entry, update: {}
    });
    if (obsolete || skip) return {
      segnalazioneId: id, revisione: revision, status: execution as 'OBSOLETE' | 'SKIPPED_HUMAN_OVERRIDE',
      finalState: current.stato_moderazione
    };
    await tx.segnalazione.update({ where: { id }, data: { stato_moderazione: evaluation.state } });
    await tx.eventoStato.create({ data: {
      segnalazione_id: id, tipo_attore: 'SISTEMA', ambito: 'MODERAZIONE', da_stato: 'PENDENTE',
      a_stato: evaluation.state, motivazione: evaluation.reason, revisione: revision
    } });
    await tx.auditEvento.create({ data: {
      segnalazione_id: id, tipo_attore: 'SISTEMA', azione: 'MODERAZIONE_CLOUD',
      dati_json: JSON.stringify({ revision, model, policy: CLOUD_POLICY_VERSION, state: evaluation.state, reason: evaluation.reason })
    } });
    return { segnalazioneId: id, revisione: revision, status: 'COMPLETED' as const, finalState: evaluation.state, reason: evaluation.reason };
  });
}
