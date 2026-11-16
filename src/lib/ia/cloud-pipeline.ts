import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { getStorageProvider } from '../storage';
import { GeminiClient, CLOUD_POLICY_VERSION, CLOUD_CLASSIFICATION_VERSION, type CloudClassification } from './gemini';
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
  let classification: CloudClassification | undefined;
  let classificationError = 'Classificatore non disponibile: verificare configurazione o ripetere la classificazione.';
  let classificationHash = inputHash;
  try {
    const client = new GeminiClient();
    model = client.model;
    const storage = getStorageProvider();
    evaluation = await evaluateCloudReport(report, key => storage.getObject(key), client, timeoutMs);
    // Independent module: a classifier failure never changes the moderation verdict.
    try {
      const categories = await prisma.categoria.findMany({
        where: { attiva: true }, select: { id: true, codice: true, nome: true }, orderBy: { id: 'asc' }
      });
      classificationHash = crypto.createHash('sha256').update(JSON.stringify({ inputHash, categories })).digest('hex');
      classification = await client.classify(report.descrizione, categories, Math.max(1, Math.min(timeoutMs ?? 20_000, 20_000)));
      if (!classification.categoryIds.length) classificationError = 'Nessuna categoria attiva riconosciuta: verificare manualmente la classificazione.';
    } catch { /* Safe fixed diagnostic above; no provider prose or user data. */ }
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
    // Recheck the catalog at commit time: deactivated/deleted categories cannot become suggestions.
    const activeCategories = classification ? await tx.categoria.findMany({
      where: { attiva: true, id: { in: classification.categoryIds } }, select: { id: true }
    }) : [];
    const activeIds = new Set(activeCategories.map(c => c.id));
    const categoryIds = (classification?.categoryIds ?? []).filter(id => activeIds.has(id));
    const classState = obsolete ? 'OBSOLETE' : categoryIds.length ? 'SUCCEEDED' : 'FAILED';
    const classData = {
      segnalazione_id: id, revisione: revision, modulo: 'CLASSIFICAZIONE' as const,
      input_hash: classificationHash, versione_modello: model, versione_policy: CLOUD_CLASSIFICATION_VERSION,
      stato_esecuzione: classState as 'OBSOLETE' | 'SUCCEEDED' | 'FAILED',
      esito: obsolete ? 'OBSOLETE' : skip ? 'SKIPPED_HUMAN_OVERRIDE' : `${categoryIds.length}_SUGGERIMENTI`,
      dettagli_json: JSON.stringify({ execution, categoryIds, discardedIds: classification?.discardedIds ?? 0,
        inactiveIds: (classification?.categoryIds.length ?? 0) - categoryIds.length,
        reason: categoryIds.length ? 'Suggerimenti IA da confermare; categorie confermate invariate.' : classificationError }),
      completata_il: new Date()
    };
    const classRecord = await tx.analisiIa.upsert({
      where: { chiave_idempotenza: {
        segnalazione_id: id, revisione: revision, modulo: 'CLASSIFICAZIONE', input_hash: classificationHash,
        versione_modello: model, versione_policy: CLOUD_CLASSIFICATION_VERSION
      } }, create: classData, update: {}
    });
    if (obsolete || skip) return {
      segnalazioneId: id, revisione: revision, status: execution as 'OBSOLETE' | 'SKIPPED_HUMAN_OVERRIDE',
      finalState: current.stato_moderazione
    };
    for (const categoryId of categoryIds) await tx.suggerimentoCategoria.upsert({
      where: { analisi_id_categoria_id: { analisi_id: classRecord.id, categoria_id: categoryId } },
      create: { analisi_id: classRecord.id, categoria_id: categoryId }, update: {}
    });
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
