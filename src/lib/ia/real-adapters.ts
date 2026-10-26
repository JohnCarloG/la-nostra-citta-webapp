/**
 * Adattatori IA Reali (Fase 5 - Architettura e Flussi 05)
 *
 * Linee guida e vincoli di specifica:
 * 1. NativeExifMetadataAdapter:
 *    - Adattatore reale non simulato (isSimulated = false).
 *    - Analizza la struttura binaria TIFF/APP1 dei JPEG su storage locale privato.
 *    - Nessun costo, nessuna chiamata esterna e zero trasmissione di dati a terzi.
 * 2. ProviderModerationAdapter:
 *    - Adattatore reale per provider esterno di moderazione NLP (isSimulated = false).
 *    - Verifica la presenza della credenziale obbligatoria (AI_MODERATION_API_KEY).
 *    - Se la credenziale manca, solleva MissingProviderCredentialError:
 *      la pipeline applica la policy conservativa indirizzando a IN_REVISIONE (nessuna approvazione fittizia).
 *    - Isolamento rigoroso del testo dell'utente (dati non fidati: mitigazione prompt injection).
 *    - Timeout limitato via AbortSignal e validazione rigorosa dello schema di risposta.
 */

import {
  IClassificationAdapter,
  IMetadataAdapter,
  IModerationAdapter,
  ClassificationInput,
  ClassificationOutput,
  MetadataInput,
  MetadataOutput,
  ModerationInput,
  ModerationOutput,
  PipelineAdapters
} from './types';
import { extractJpegExifGps } from '../storage/mime-validator';
import { getStorageProvider } from '../storage';
import {
  validateModerationOutput,
  validateClassificationOutput,
  validateMetadataOutput
} from './validators';
import {
  DeterministicMockCoherenceAdapter
} from './mock-adapters';

export class MissingProviderCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingProviderCredentialError';
  }
}

/**
 * 1. Adattatore Reale per Estrazione Metadati EXIF (NativeExifMetadataAdapter)
 * Esegue il parsing reale dei segmenti EXIF JPEG senza librerie terze o dipendenze esterne.
 */
export class NativeExifMetadataAdapter implements IMetadataAdapter {
  readonly name = 'native-exif-parser';
  readonly isSimulated = false;

  async extract(input: MetadataInput): Promise<MetadataOutput> {
    const mime = input.private_object.mime?.toLowerCase() || '';

    // I file video o formati non-JPEG non contengono segmenti APP1 EXIF standard
    if (mime.startsWith('video/') || mime === 'image/png' || mime === 'image/webp') {
      const output: MetadataOutput = {
        extraction_status: 'UNSUPPORTED',
        parser_version: 'native-exif-v1.0'
      };
      return validateMetadataOutput(output);
    }

    let buffer = input.private_object.buffer;

    // Se il buffer non è in memoria ma è indicato il percorso/chiave storage
    if (!buffer && input.private_object.path) {
      try {
        const storage = getStorageProvider();
        buffer = await storage.getObject(input.private_object.path);
      } catch {
        return validateMetadataOutput({
          extraction_status: 'CORRUPTED',
          parser_version: 'native-exif-v1.0'
        });
      }
    }

    if (!buffer || buffer.length < 16) {
      return validateMetadataOutput({
        extraction_status: 'NO_EXIF',
        parser_version: 'native-exif-v1.0'
      });
    }

    try {
      const coords = extractJpegExifGps(buffer);

      if (coords && typeof coords.lat === 'number' && typeof coords.lon === 'number') {
        // Vincolo geografico: lat [-90, 90], lon [-180, 180]
        if (coords.lat >= -90 && coords.lat <= 90 && coords.lon >= -180 && coords.lon <= 180) {
          return validateMetadataOutput({
            gps: {
              lat: Number(coords.lat.toFixed(6)),
              lon: Number(coords.lon.toFixed(6))
            },
            extraction_status: 'SUCCESS',
            parser_version: 'native-exif-v1.0'
          });
        }
      }

      // Verifica se l'immagine ha un segmento APP1 corrotto (0xFF 0xE1 con header Exif ma TIFF illeggibile)
      const hasApp1Exif = buffer.indexOf(Buffer.from([0xFF, 0xE1])) !== -1 && buffer.indexOf(Buffer.from('Exif')) !== -1;
      if (hasApp1Exif && !coords) {
        // Se c'è header Exif ma non contiene GPS valido o è troncato
        return validateMetadataOutput({
          extraction_status: 'NO_EXIF',
          parser_version: 'native-exif-v1.0'
        });
      }

      return validateMetadataOutput({
        extraction_status: 'NO_EXIF',
        parser_version: 'native-exif-v1.0'
      });
    } catch {
      return validateMetadataOutput({
        extraction_status: 'CORRUPTED',
        parser_version: 'native-exif-v1.0'
      });
    }
  }
}

/**
 * 2. Adattatore Reale per Moderazione NLP con Provider Esterno (ProviderModerationAdapter)
 * Connessione a endpoint di moderazione conforme ai vincoli di sicurezza:
 * - Credenziali lette esclusivamente da variabili d'ambiente.
 * - Incapsulamento del testo utente non fidato (anti prompt-injection).
 * - Timeout e gestione errori con fallback deterministico.
 */
export class ProviderModerationAdapter implements IModerationAdapter {
  readonly name = 'provider-nlp-moderation';
  readonly isSimulated = false;

  private readonly apiKey: string | undefined;
  private readonly endpointUrl: string;

  constructor(options?: { apiKey?: string; endpointUrl?: string }) {
    this.apiKey = options?.apiKey || process.env.AI_MODERATION_API_KEY || process.env.OPENAI_API_KEY;
    this.endpointUrl =
      options?.endpointUrl ||
      process.env.AI_MODERATION_ENDPOINT ||
      'https://api.openai.com/v1/moderations';
  }

  async moderate(input: ModerationInput, options?: { timeoutMs?: number }): Promise<ModerationOutput> {
    // Vincolo di specifica: se le credenziali mancano, solleva errore esplicito.
    // La pipeline conservativa intercetta l'errore e manda la segnalazione in IN_REVISIONE.
    // Nessun costo viene attivato e nessuna approvazione fittizia viene generata.
    if (!this.apiKey) {
      throw new MissingProviderCredentialError(
        'Chiave API per la moderazione IA non configurata. Impostare la variabile d\'ambiente AI_MODERATION_API_KEY per attivare il provider reale.'
      );
    }

    const timeoutMs = options?.timeoutMs ?? 5000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Isolamento dei dati non fidati: il testo della segnalazione è inviato come dato atomico
      // Non è concatenato in prompt operativi che potrebbero subire prompt injection.
      const payload = {
        model: 'text-moderation-latest',
        input: input.text
      };

      const res = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'LaNostraCitta-ModerationWorker/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Provider moderazione ha risposto con codice HTTP ${res.status}`);
      }

      const data = await res.json();

      // Normalizzazione e validazione della risposta del provider standard OpenAI Moderation
      // Formato atteso OpenAI: { results: [{ flagged: boolean, categories: Record<string, boolean>, category_scores: ... }] }
      if (data?.results && Array.isArray(data.results) && data.results.length > 0) {
        const item = data.results[0];
        const flagged = Boolean(item.flagged);

        const reasons: string[] = [];
        if (item.categories) {
          for (const [cat, val] of Object.entries(item.categories)) {
            if (val) reasons.push(cat);
          }
        }

        const maxScore = item.category_scores
          ? Math.max(...Object.values(item.category_scores as Record<string, number>))
          : undefined;

        // Se è flagged -> BLOCK; altrimenti ALLOW
        const rawOutput: ModerationOutput = {
          verdict: flagged ? 'BLOCK' : 'ALLOW',
          reasons: reasons.length > 0 ? reasons : [flagged ? 'Contenuto segnalato per violazione policy' : 'Testo conforme'],
          optional_score: maxScore,
          model_version: data.model || 'text-moderation-latest',
          policy_version: 'provider-policy-v1.0'
        };

        return validateModerationOutput(rawOutput);
      }

      // Se il provider risponde in formato generico { verdict, reasons, model_version }
      return validateModerationOutput(data);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        throw new Error(`Timeout modulo moderazione superato (${timeoutMs}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 3. Adattatore Reale per Classificazione Multi-Label Civica (ProviderClassificationAdapter)
 * Connessione a endpoint di classificazione con tassonomia chiusa:
 * - isSimulated = false (adattatore reale, mai simulato).
 * - Tassonomia chiusa ricavata rigorosamente dal catalogo categorie ammesse (allowed_categories).
 * - Nessun fallback silenzioso al mock: se mancano credenziali/endpoint, solleva MissingProviderCredentialError.
 * - Isolamento del testo della segnalazione.
 * - Validazione di schema rigida, scarto di identificativi inesistenti o duplicati.
 * - Gestione di timeout limitati via AbortSignal.
 */
export class ProviderClassificationAdapter implements IClassificationAdapter {
  readonly name = 'provider-civic-classification';
  readonly isSimulated = false;

  private readonly apiKey?: string;
  private readonly endpointUrl?: string;

  constructor(options?: { apiKey?: string; endpointUrl?: string }) {
    this.apiKey = options?.apiKey || process.env.AI_CLASSIFICATION_API_KEY;
    this.endpointUrl =
      options?.endpointUrl ||
      process.env.AI_CLASSIFICATION_ENDPOINT;
  }

  async classify(
    input: ClassificationInput,
    options?: { timeoutMs?: number }
  ): Promise<ClassificationOutput> {
    // Vincolo di specifica categorico:
    // Nessun fallback silenzioso dal reale al mock!
    // Se la configurazione del provider o le credenziali mancano, solleva MissingProviderCredentialError.
    if (!this.apiKey || !this.endpointUrl) {
      throw new MissingProviderCredentialError(
        'Configurazione del classificatore civico IA reale non presente. Impostare le variabili d\'ambiente AI_CLASSIFICATION_ENDPOINT e AI_CLASSIFICATION_API_KEY per abilitare il provider esterno, oppure predisporre un classificatore locale dedicato. Nessun fallback silenzioso al mock viene eseguito.'
      );
    }

    const timeoutMs = options?.timeoutMs ?? 5000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Tassonomia chiusa: invio del testo isolato e dell'elenco chiuso delle categorie ammesse a catalogo
      const payload = {
        text: input.text,
        allowed_categories: input.allowed_categories.map(c => ({
          id: c.id,
          codice: c.codice,
          nome: c.nome
        }))
      };

      const res = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'LaNostraCitta-ClassificationWorker/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Provider classificazione ha risposto con codice HTTP ${res.status}`);
      }

      const data = await res.json();

      // Validazione stringente: scarta codici non a catalogo, elimina duplicati e valida confidenze
      return validateClassificationOutput(data, input.allowed_categories);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        throw new Error(`Timeout modulo classificazione superato (${timeoutMs}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Factory per creare il set di adattatori con componenti reali:
 * - Metadata: parser EXIF reale nativo (NativeExifMetadataAdapter, isSimulated = false)
 * - Moderation: adapter provider reale protetto (ProviderModerationAdapter, isSimulated = false)
 * - Classification: adapter provider reale con tassonomia chiusa (ProviderClassificationAdapter, isSimulated = false)
 * - Coherence: mock deterministico conservato fino al blocco successivo RF10
 */
export function createRealPipelineAdapters(options?: {
  moderationApiKey?: string;
  moderationEndpoint?: string;
  classificationApiKey?: string;
  classificationEndpoint?: string;
}): PipelineAdapters {
  return {
    moderation: new ProviderModerationAdapter({
      apiKey: options?.moderationApiKey,
      endpointUrl: options?.moderationEndpoint
    }),
    classification: new ProviderClassificationAdapter({
      apiKey: options?.classificationApiKey,
      endpointUrl: options?.classificationEndpoint
    }),
    metadata: new NativeExifMetadataAdapter(),
    coherence: new DeterministicMockCoherenceAdapter()
  };
}
