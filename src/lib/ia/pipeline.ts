import crypto from 'crypto';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import {
  PipelineAdapters,
  ModerationOutput,
  ClassificationOutput,
  MetadataOutput,
  CoherenceOutput,
  AllowedCategory
} from './types';
import { createMockPipelineAdapters } from './mock-adapters';
import {
  validateModerationOutput,
  validateClassificationOutput,
  validateMetadataOutput,
  validateCoherenceOutput
} from './validators';
import { getStorageProvider } from '../storage';

export interface PipelineExecutionResult {
  segnalazioneId: string;
  revisione: number;
  status: 'COMPLETED' | 'OBSOLETE' | 'SKIPPED_HUMAN_OVERRIDE' | 'FAILED';
  finalState?: string;
  reason?: string;
  moderation?: ModerationOutput;
  classification?: ClassificationOutput;
  mediaResults?: Array<{
    mediaId: string;
    exif?: MetadataOutput;
    coherence?: CoherenceOutput;
  }>;
}

/**
 * Calcola hash sha256 deterministico per input IA
 */
export function calculateInputHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Esegue l'analisi completa di una segnalazione rispettando:
 * 1. Chiamate esterne/adapter FUORI dalla transazione DB
 * 2. Idempotenza di inserimento (chiave composita segnalazione_id, revisione, modulo, input_hash, versione_modello, versione_policy)
 * 3. Nessuna sovrascrittura di decisioni umane o di revisioni superate (T10)
 * 4. Policy conservativa deterministica (ALLOW + coerenza -> APPROVATA, BLOCK -> RIFIUTATA, REVIEW/dubbio/video -> IN_REVISIONE)
 * 5. Categorie assenti non bloccano approvazione (T07)
 */
export async function eseguiAnalisiSegnalazione(
  segnalazioneId: string,
  revisione: number,
  customAdapters?: Partial<PipelineAdapters>,
  options?: { timeoutMs?: number }
): Promise<PipelineExecutionResult> {
  const adapters: PipelineAdapters = {
    ...createMockPipelineAdapters(),
    ...customAdapters
  };
  const timeoutMs = options?.timeoutMs ?? 5000;

  // ==========================================
  // FASE A: Lettura dati preliminare (No Lock)
  // ==========================================
  const segnalazione = await prisma.segnalazione.findUnique({
    where: { id: segnalazioneId },
    include: {
      media: true
    }
  });

  if (!segnalazione) {
    return {
      segnalazioneId,
      revisione,
      status: 'FAILED',
      reason: 'Segnalazione non trovata'
    };
  }

  // Se la segnalazione ha già una revisione superiore, è già obsoleta
  if (segnalazione.revisione > revisione) {
    return {
      segnalazioneId,
      revisione,
      status: 'OBSOLETE',
      reason: `Revisione superata: richiesta ${revisione}, corrente ${segnalazione.revisione}`
    };
  }

  const allowedCategories: AllowedCategory[] = await prisma.categoria.findMany({
    where: { attiva: true },
    select: { id: true, codice: true, nome: true }
  });

  // ==========================================
  // FASE B: Chiamate agli Adapter (FUORI DB TX)
  // ==========================================

  // 1. Modulo Moderazione NLP
  const modHash = calculateInputHash(`${segnalazione.descrizione}:${revisione}`);
  let moderationOutput: ModerationOutput | undefined;
  let moderationError: string | undefined;

  try {
    const rawMod = await adapters.moderation.moderate({
      report_id: segnalazione.id,
      revision: revisione,
      text: segnalazione.descrizione,
      input_hash: modHash
    }, { timeoutMs });
    moderationOutput = validateModerationOutput(rawMod);
  } catch (err: unknown) {
    if (err instanceof Error && (err.message.includes('FATAL') || err.message.includes('Crash fatale'))) {
      throw err;
    }
    moderationError = err instanceof Error ? err.message : 'Errore o timeout nel modulo moderazione';
  }

  // 2. Modulo Classificazione
  const sortedCatCodes = allowedCategories.map((c: AllowedCategory) => c.codice).sort().join(',');
  const classHash = calculateInputHash(`${segnalazione.descrizione}:${sortedCatCodes}`);
  let classificationOutput: ClassificationOutput | undefined;
  let classificationError: string | undefined;

  try {
    const rawClass = await adapters.classification.classify({
      text: segnalazione.descrizione,
      allowed_categories: allowedCategories
    }, { timeoutMs });
    classificationOutput = validateClassificationOutput(rawClass, allowedCategories);
  } catch (err: unknown) {
    classificationError = err instanceof Error ? err.message : 'Errore nel modulo classificazione';
  }

  // 3. Moduli Media: EXIF e Coerenza
  const storage = getStorageProvider();
  const mediaResults: Array<{
    mediaId: string;
    mediaSha256: string;
    exifHash: string;
    exifOutput?: MetadataOutput;
    exifError?: string;
    coherenceHash: string;
    coherenceOutput?: CoherenceOutput;
    coherenceError?: string;
  }> = [];

  for (const m of segnalazione.media) {
    const exifHash = calculateInputHash(`${m.id}:${m.storage_key}`);
    const coherenceHash = calculateInputHash(`${segnalazione.descrizione}:${m.id}:${m.sha256}`);

    let exifOutput: MetadataOutput | undefined;
    let exifError: string | undefined;
    let coherenceOutput: CoherenceOutput | undefined;
    let coherenceError: string | undefined;

    // Recupero buffer dal private storage se disponibile
    let fileBuffer: Buffer | undefined;
    try {
      fileBuffer = await storage.getObject(m.storage_key);
    } catch {
      // Buffer non disponibile o storage mock
    }

    // Estrazione EXIF
    try {
      const rawExif = await adapters.metadata.extract({
        media_id: m.id,
        private_object: {
          buffer: fileBuffer,
          mime: m.mime
        }
      }, { timeoutMs });
      exifOutput = validateMetadataOutput(rawExif);
    } catch (err: unknown) {
      exifError = err instanceof Error ? err.message : 'Errore estrazione EXIF';
    }

    // Coerenza
    const mediaTypeNorm: 'VIDEO' | 'IMMAGINE' = m.tipo === 'VIDEO' ? 'VIDEO' : 'IMMAGINE';
    try {
      const rawCoherence = await adapters.coherence.check({
        text: segnalazione.descrizione,
        media_id: m.id,
        media_type: mediaTypeNorm,
        private_image_or_frames: fileBuffer || m.storage_key
      }, { timeoutMs });
      coherenceOutput = validateCoherenceOutput(rawCoherence);
    } catch (err: unknown) {
      coherenceError = err instanceof Error ? err.message : 'Errore verifica coerenza visiva';
    }

    mediaResults.push({
      mediaId: m.id,
      mediaSha256: m.sha256,
      exifHash,
      exifOutput,
      exifError,
      coherenceHash,
      coherenceOutput,
      coherenceError
    });
  }

  // ==========================================
  // FASE C: Scrittura Atomica e Idempotente
  // ==========================================
  return prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<PipelineExecutionResult> => {
    // 1. Lock riga FOR UPDATE
    const lockedRows = await tx.$queryRaw<Array<{
      id: string;
      revisione: number;
      stato_moderazione: string;
      stato_avanzamento: string;
    }>>`
      SELECT id, revisione, stato_moderazione, stato_avanzamento
      FROM Segnalazione
      WHERE id = ${segnalazioneId}
      FOR UPDATE
    `;

    if (lockedRows.length === 0) {
      return {
        segnalazioneId,
        revisione,
        status: 'FAILED',
        reason: 'Segnalazione scomparsa durante elaborazione'
      };
    }

    const currentSegnalazione = lockedRows[0];

    // REGOLA CRITICA 1 (T10): Se la revisione è cambiata mentre l'IA lavorava -> OBSOLETE
    if (currentSegnalazione.revisione !== revisione) {
      if (moderationOutput) {
        await tx.analisiIa.upsert({
          where: {
            chiave_idempotenza: {
              segnalazione_id: segnalazioneId,
              revisione,
              modulo: 'MODERAZIONE',
              input_hash: modHash,
              versione_modello: moderationOutput.model_version,
              versione_policy: moderationOutput.policy_version
            }
          },
          create: {
            segnalazione_id: segnalazioneId,
            revisione,
            modulo: 'MODERAZIONE',
            versione_modello: moderationOutput.model_version,
            versione_policy: moderationOutput.policy_version,
            input_hash: modHash,
            stato_esecuzione: 'OBSOLETE',
            esito: moderationOutput.verdict,
            punteggio: moderationOutput.optional_score,
            dettagli_json: JSON.stringify({ reasons: moderationOutput.reasons, note: 'Revisione superata' }),
            completata_il: new Date()
          },
          update: {
            stato_esecuzione: 'OBSOLETE'
          }
        });
      }

      return {
        segnalazioneId,
        revisione,
        status: 'OBSOLETE',
        reason: `Revisione superata durante elaborazione (richiesta ${revisione}, corrente ${currentSegnalazione.revisione})`
      };
    }

    // REGOLA CRITICA 2 (T10 / 05 riga 14): Se la decisione umana è già stata presa (!== PENDENTE)
    // L'IA NON sovrascrive l'override umano della stessa revisione!
    const isHumanDecided = currentSegnalazione.stato_moderazione !== 'PENDENTE';

    // 2. Registrazione Idempotente AnalisiIa: MODERAZIONE
    if (moderationOutput) {
      await tx.analisiIa.upsert({
        where: {
          chiave_idempotenza: {
            segnalazione_id: segnalazioneId,
            revisione,
            modulo: 'MODERAZIONE',
            input_hash: modHash,
            versione_modello: moderationOutput.model_version,
            versione_policy: moderationOutput.policy_version
          }
        },
        create: {
          segnalazione_id: segnalazioneId,
          revisione,
          modulo: 'MODERAZIONE',
          versione_modello: moderationOutput.model_version,
          versione_policy: moderationOutput.policy_version,
          input_hash: modHash,
          stato_esecuzione: 'SUCCEEDED',
          esito: moderationOutput.verdict,
          punteggio: moderationOutput.optional_score,
          dettagli_json: JSON.stringify({ reasons: moderationOutput.reasons }),
          completata_il: new Date()
        },
        update: {
          stato_esecuzione: 'SUCCEEDED',
          esito: moderationOutput.verdict,
          punteggio: moderationOutput.optional_score,
          dettagli_json: JSON.stringify({ reasons: moderationOutput.reasons }),
          completata_il: new Date()
        }
      });
    } else if (moderationError) {
      await tx.analisiIa.upsert({
        where: {
          chiave_idempotenza: {
            segnalazione_id: segnalazioneId,
            revisione,
            modulo: 'MODERAZIONE',
            input_hash: modHash,
            versione_modello: 'unknown',
            versione_policy: 'policy-v1.0'
          }
        },
        create: {
          segnalazione_id: segnalazioneId,
          revisione,
          modulo: 'MODERAZIONE',
          versione_modello: 'unknown',
          versione_policy: 'policy-v1.0',
          input_hash: modHash,
          stato_esecuzione: 'FAILED',
          esito: 'FAILED',
          dettagli_json: JSON.stringify({ error: moderationError }),
          completata_il: new Date()
        },
        update: {
          stato_esecuzione: 'FAILED',
          dettagli_json: JSON.stringify({ error: moderationError })
        }
      });
    }

    // 3. Registrazione Idempotente AnalisiIa: CLASSIFICAZIONE
    if (classificationOutput) {
      const classRecord = await tx.analisiIa.upsert({
        where: {
          chiave_idempotenza: {
            segnalazione_id: segnalazioneId,
            revisione,
            modulo: 'CLASSIFICAZIONE',
            input_hash: classHash,
            versione_modello: classificationOutput.model_version,
            versione_policy: 'policy-v1.0'
          }
        },
        create: {
          segnalazione_id: segnalazioneId,
          revisione,
          modulo: 'CLASSIFICAZIONE',
          versione_modello: classificationOutput.model_version,
          versione_policy: 'policy-v1.0',
          input_hash: classHash,
          stato_esecuzione: 'SUCCEEDED',
          esito: `${classificationOutput.suggestions.length}_SUGGERIMENTI`,
          completata_il: new Date()
        },
        update: {
          stato_esecuzione: 'SUCCEEDED',
          esito: `${classificationOutput.suggestions.length}_SUGGERIMENTI`,
          completata_il: new Date()
        }
      });

      // Salvataggio suggerimenti categorie validati (T08)
      if (classificationOutput.suggestions.length > 0) {
        for (const sugg of classificationOutput.suggestions) {
          await tx.suggerimentoCategoria.upsert({
            where: {
              analisi_id_categoria_id: {
                analisi_id: classRecord.id,
                categoria_id: sugg.category_id
              }
            },
            create: {
              analisi_id: classRecord.id,
              categoria_id: sugg.category_id,
              confidenza: sugg.optional_confidence
            },
            update: {
              confidenza: sugg.optional_confidence
            }
          });
        }
      }
    } else if (classificationError) {
      // Registra errore modulo classificazione
      await tx.analisiIa.upsert({
        where: {
          chiave_idempotenza: {
            segnalazione_id: segnalazioneId,
            revisione,
            modulo: 'CLASSIFICAZIONE',
            input_hash: classHash,
            versione_modello: 'unknown',
            versione_policy: 'policy-v1.0'
          }
        },
        create: {
          segnalazione_id: segnalazioneId,
          revisione,
          modulo: 'CLASSIFICAZIONE',
          versione_modello: 'unknown',
          versione_policy: 'policy-v1.0',
          input_hash: classHash,
          stato_esecuzione: 'FAILED',
          esito: 'FAILED',
          dettagli_json: JSON.stringify({ error: classificationError }),
          completata_il: new Date()
        },
        update: {
          stato_esecuzione: 'FAILED',
          dettagli_json: JSON.stringify({ error: classificationError })
        }
      });
    }

    // 4. Registrazione Idempotente AnalisiIa: EXIF e COERENZA per ciascun media
    for (const mr of mediaResults) {
      if (mr.exifOutput) {
        await tx.analisiIa.upsert({
          where: {
            chiave_idempotenza: {
              segnalazione_id: segnalazioneId,
              revisione,
              modulo: 'EXIF',
              input_hash: mr.exifHash,
              versione_modello: mr.exifOutput.parser_version,
              versione_policy: 'policy-v1.0'
            }
          },
          create: {
            segnalazione_id: segnalazioneId,
            media_id: mr.mediaId,
            revisione,
            modulo: 'EXIF',
            versione_modello: mr.exifOutput.parser_version,
            versione_policy: 'policy-v1.0',
            input_hash: mr.exifHash,
            stato_esecuzione: 'SUCCEEDED',
            esito: mr.exifOutput.extraction_status,
            dettagli_json: JSON.stringify({ gps: mr.exifOutput.gps }),
            completata_il: new Date()
          },
          update: {
            stato_esecuzione: 'SUCCEEDED',
            esito: mr.exifOutput.extraction_status,
            dettagli_json: JSON.stringify({ gps: mr.exifOutput.gps }),
            completata_il: new Date()
          }
        });
      }

      if (mr.coherenceOutput) {
        await tx.analisiIa.upsert({
          where: {
            chiave_idempotenza: {
              segnalazione_id: segnalazioneId,
              revisione,
              modulo: 'COERENZA',
              input_hash: mr.coherenceHash,
              versione_modello: mr.coherenceOutput.model_version,
              versione_policy: 'policy-v1.0'
            }
          },
          create: {
            segnalazione_id: segnalazioneId,
            media_id: mr.mediaId,
            revisione,
            modulo: 'COERENZA',
            versione_modello: mr.coherenceOutput.model_version,
            versione_policy: 'policy-v1.0',
            input_hash: mr.coherenceHash,
            stato_esecuzione: 'SUCCEEDED',
            esito: mr.coherenceOutput.verdict,
            punteggio: mr.coherenceOutput.optional_score,
            dettagli_json: JSON.stringify({ reasons: mr.coherenceOutput.reasons }),
            completata_il: new Date()
          },
          update: {
            stato_esecuzione: 'SUCCEEDED',
            esito: mr.coherenceOutput.verdict,
            punteggio: mr.coherenceOutput.optional_score,
            dettagli_json: JSON.stringify({ reasons: mr.coherenceOutput.reasons }),
            completata_il: new Date()
          }
        });
      }
    }

    // SE L'UMANO HA GIÀ DECISO: non tocca lo stato della segnalazione!
    if (isHumanDecided) {
      return {
        segnalazioneId,
        revisione,
        status: 'SKIPPED_HUMAN_OVERRIDE',
        finalState: currentSegnalazione.stato_moderazione,
        reason: `Decisione umana già presente: ${currentSegnalazione.stato_moderazione}. Nessuna sovrascrittura automatica.`
      };
    }

    // ==========================================
    // 5. Valutazione Policy Conservativa (05 riga 13)
    // ==========================================
    let targetStato: 'APPROVATA' | 'IN_REVISIONE' | 'RIFIUTATA';
    let motivazione: string;

    if (moderationOutput?.verdict === 'BLOCK') {
      targetStato = 'RIFIUTATA';
      motivazione = `Rifiuto automatico di sistema per violazione policy testo: ${moderationOutput.reasons.join('; ')}`;
    } else if (!moderationOutput || moderationOutput.verdict === 'REVIEW' || moderationError) {
      targetStato = 'IN_REVISIONE';
      motivazione = moderationOutput
        ? `Richiesta revisione comitato per valutazione testo: ${moderationOutput.reasons.join('; ')}`
        : `Richiesta revisione comitato per mancata risposta provider moderazione: ${moderationError}`;
    } else {
      const hasCoherenceFailure = mediaResults.some(mr => {
        if (mr.coherenceError) return true;
        if (!mr.coherenceOutput) return true;
        return mr.coherenceOutput.verdict !== 'CONSISTENT';
      });

      if (hasCoherenceFailure) {
        targetStato = 'IN_REVISIONE';
        const failReasons = mediaResults
          .map(mr => mr.coherenceError || mr.coherenceOutput?.reasons?.join('; ') || 'Coerenza non verificata')
          .join(' | ');
        motivazione = `Richiesta revisione comitato: coerenza media non garantita o formato video non supportato (${failReasons})`;
      } else {
        targetStato = 'APPROVATA';
        motivazione = 'Approvazione automatica: testo sicuro e coerenza dei media verificata';
      }
    }

    // 6. Aggiornamento Segnalazione + EventoStato + Audit atomici
    await tx.segnalazione.update({
      where: { id: segnalazioneId },
      data: {
        stato_moderazione: targetStato,
        aggiornata_il: new Date()
      }
    });

    await tx.eventoStato.create({
      data: {
        segnalazione_id: segnalazioneId,
        tipo_attore: 'SISTEMA',
        ambito: 'MODERAZIONE',
        da_stato: 'PENDENTE',
        a_stato: targetStato,
        motivazione,
        revisione
      }
    });

    await tx.auditEvento.create({
      data: {
        segnalazione_id: segnalazioneId,
        tipo_attore: 'SISTEMA',
        azione: 'MODERAZIONE_IA',
        dati_json: JSON.stringify({
          modulo_moderazione: moderationOutput?.verdict || 'ERROR',
          esito_finale: targetStato,
          revisione,
          categorie_suggerite: classificationOutput?.suggestions.length ?? 0
        })
      }
    });

    return {
      segnalazioneId,
      revisione,
      status: 'COMPLETED',
      finalState: targetStato,
      reason: motivazione,
      moderation: moderationOutput,
      classification: classificationOutput,
      mediaResults: mediaResults.map(m => ({
        mediaId: m.mediaId,
        exif: m.exifOutput,
        coherence: m.coherenceOutput
      }))
    };
  });
}
