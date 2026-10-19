/**
 * Adattatori IA simulati deterministici per testing e sviluppo locale.
 * NOTA: Questi adattatori sono SIMULATI (MOCK) e non invocano provider esterni o a pagamento.
 */

import {
  IModerationAdapter,
  IClassificationAdapter,
  IMetadataAdapter,
  ICoherenceAdapter,
  ModerationInput,
  ModerationOutput,
  ClassificationInput,
  ClassificationOutput,
  MetadataInput,
  MetadataOutput,
  CoherenceInput,
  CoherenceOutput,
  PipelineAdapters,
  ModerationVerdict,
  CoherenceVerdict
} from './types';

export class DeterministicMockModerationAdapter implements IModerationAdapter {
  readonly name = 'mock-nlp-moderation';
  readonly isSimulated = true;

  async moderate(input: ModerationInput, options?: { timeoutMs?: number }): Promise<ModerationOutput> {
    const textUpper = input.text.toUpperCase();

    if (textUpper.includes('[SIMULATE_TIMEOUT]')) {
      await new Promise(resolve => setTimeout(resolve, (options?.timeoutMs ?? 50) + 50));
      throw new Error('Provider moderation timeout');
    }

    if (textUpper.includes('[SIMULATE_ERROR]') || textUpper.includes('[SIMULATE_OFFLINE]')) {
      throw new Error('Provider moderazione offline/non raggiungibile');
    }

    if (textUpper.includes('[SIMULATE_MALFORMED]')) {
      // Restituisce un oggetto non conforme per testare il validatore
      return {
        verdict: 'INVALIDO' as unknown as ModerationVerdict,
        reasons: 'non un array' as unknown as string[],
        model_version: '',
        policy_version: ''
      };
    }

    // Parole che innescano un blocco diretto (BLOCK -> RIFIUTATA)
    const blockKeywords = ['SPAM', 'ODIO', 'VIOLENZA', 'DISPREZZO', 'BLOCK_ME', 'INSULTI'];
    if (blockKeywords.some(kw => textUpper.includes(kw))) {
      return {
        verdict: 'BLOCK',
        reasons: ['Rilevata violazione della policy sui contenuti vietati'],
        optional_score: 0.95,
        model_version: 'mock-nlp-v1.0',
        policy_version: 'policy-v1.0'
      };
    }

    // Parole che innescano una revisione manuale (REVIEW -> IN_REVISIONE)
    const reviewKeywords = ['DUBBIO', 'VERIFICA', 'SOSPETTO', 'AMBIGUO', 'REVIEW_ME'];
    if (reviewKeywords.some(kw => textUpper.includes(kw))) {
      return {
        verdict: 'REVIEW',
        reasons: ['Rilevato contenuto ambiguo che richiede revisione umana'],
        optional_score: 0.65,
        model_version: 'mock-nlp-v1.0',
        policy_version: 'policy-v1.0'
      };
    }

    // Esito positivo di default (ALLOW -> APPROVATA se coerente)
    return {
      verdict: 'ALLOW',
      reasons: ['Testo conforme alle linee guida di pubblicazione'],
      optional_score: 0.05,
      model_version: 'mock-nlp-v1.0',
      policy_version: 'policy-v1.0'
    };
  }
}

export class DeterministicMockClassificationAdapter implements IClassificationAdapter {
  readonly name = 'mock-multilabel-classifier';
  readonly isSimulated = true;

  async classify(input: ClassificationInput): Promise<ClassificationOutput> {
    const textUpper = input.text.toUpperCase();

    if (textUpper.includes('[SIMULATE_CLASSIFICATION_OFFLINE]')) {
      throw new Error('Provider classificazione offline');
    }

    if (textUpper.includes('[SIMULATE_CLASSIFICATION_MALFORMED]')) {
      return {
        suggestions: null as unknown as [],
        model_version: ''
      };
    }

    // Se richiesto dal test T08: inietta categorie duplicate o fuori catalogo
    if (textUpper.includes('[SIMULATE_DUPLICATE_OR_INVALID_CATEGORY]')) {
      const firstCat = input.allowed_categories[0];
      return {
        suggestions: [
          ...(firstCat ? [
            { category_id: firstCat.id, optional_confidence: 0.9 },
            { category_id: firstCat.id, optional_confidence: 0.85 } // duplicato
          ] : []),
          { category_id: 'cat-inesistente-fuori-catalogo-999', optional_confidence: 0.99 } // fuori catalogo
        ],
        model_version: 'mock-classifier-v1.0'
      };
    }

    // Classificazione euristica semplice su categorie ammesse
    const suggestions: Array<{ category_id: string; optional_confidence?: number }> = [];

    for (const cat of input.allowed_categories) {
      const codeUpper = cat.codice.toUpperCase();
      const nameUpper = cat.nome.toUpperCase();

      if (
        (codeUpper.includes('STRAD') || nameUpper.includes('BUC') || nameUpper.includes('STRAD')) &&
        (textUpper.includes('BUCA') || textUpper.includes('ASFALTO') || textUpper.includes('STRADA') || textUpper.includes('MARCIAPIEDE'))
      ) {
        suggestions.push({ category_id: cat.id, optional_confidence: 0.92 });
      } else if (
        (codeUpper.includes('RIFIUT') || nameUpper.includes('RIFIUT') || nameUpper.includes('PULIZ')) &&
        (textUpper.includes('RIFIUT') || textUpper.includes('SPAZZATURA') || textUpper.includes('CASSONETTO') || textUpper.includes('DEGRADO'))
      ) {
        suggestions.push({ category_id: cat.id, optional_confidence: 0.88 });
      } else if (
        (codeUpper.includes('ILLUMIN') || nameUpper.includes('LUCE') || nameUpper.includes('ILLUMIN')) &&
        (textUpper.includes('LAMPION') || textUpper.includes('ILLUMINAZ') || textUpper.includes('BUIO') || textUpper.includes('LUCE'))
      ) {
        suggestions.push({ category_id: cat.id, optional_confidence: 0.89 });
      } else if (
        (codeUpper.includes('VERDE') || nameUpper.includes('PARC') || nameUpper.includes('VERDE')) &&
        (textUpper.includes('ALBER') || textUpper.includes('ERBA') || textUpper.includes('PARCO') || textUpper.includes('RAMI'))
      ) {
        suggestions.push({ category_id: cat.id, optional_confidence: 0.91 });
      }
    }

    return {
      suggestions,
      model_version: 'mock-classifier-v1.0'
    };
  }
}

export class DeterministicMockMetadataAdapter implements IMetadataAdapter {
  readonly name = 'mock-exif-parser';
  readonly isSimulated = true;

  async extract(input: MetadataInput): Promise<MetadataOutput> {
    const mime = input.private_object.mime;

    // Se è un video o mime che non supporta EXIF GPS
    if (mime.startsWith('video/')) {
      return {
        extraction_status: 'UNSUPPORTED',
        parser_version: 'mock-exif-v1.0'
      };
    }

    // Se mime immagine ma senza buffer o EXIF assente (T04: EXIF assente non è errore)
    if (!input.private_object.buffer || input.private_object.buffer.length < 16) {
      return {
        extraction_status: 'NO_EXIF',
        parser_version: 'mock-exif-v1.0'
      };
    }

    // Se presente una firma fittizia nel buffer per simulare EXIF valido
    const bufferStr = input.private_object.buffer.toString('utf-8', 0, Math.min(100, input.private_object.buffer.length));
    if (bufferStr.includes('MOCK_GPS_EXIF')) {
      return {
        gps: { lat: 45.4642, lon: 9.1900 },
        extraction_status: 'SUCCESS',
        parser_version: 'mock-exif-v1.0'
      };
    }

    return {
      extraction_status: 'NO_EXIF',
      parser_version: 'mock-exif-v1.0'
    };
  }
}

export class DeterministicMockCoherenceAdapter implements ICoherenceAdapter {
  readonly name = 'mock-visual-coherence';
  readonly isSimulated = true;

  async check(input: CoherenceInput): Promise<CoherenceOutput> {
    const textUpper = input.text.toUpperCase();

    if (textUpper.includes('[SIMULATE_COHERENCE_ERROR]')) {
      throw new Error('Provider coerenza non raggiungibile');
    }

    if (textUpper.includes('[SIMULATE_COHERENCE_MALFORMED]')) {
      return {
        verdict: 'MALFORMED' as unknown as CoherenceVerdict,
        reasons: 'non un array' as unknown as string[],
        model_version: ''
      };
    }

    // REQUISITO ESPLICITO (T09, 05 riga 13/26):
    // "Per video non supportato manda in revisione dichiarandolo"
    if (input.media_type === 'VIDEO') {
      return {
        verdict: 'UNSUPPORTED',
        reasons: ['Analisi video non supportata automaticamente: segnalazione indirizzata a revisione comitato'],
        model_version: 'mock-coherence-v1.0'
      };
    }

    // Testo con incoerenza esplicita
    if (textUpper.includes('INCOERENTE') || textUpper.includes('INCONSISTENT') || textUpper.includes('FOTO_FALSA')) {
      return {
        verdict: 'INCONSISTENT',
        reasons: ['Discrepanza rilevata tra il testo della segnalazione e il contenuto visivo del media'],
        optional_score: 0.15,
        model_version: 'mock-coherence-v1.0'
      };
    }

    // Testo con dubbio visivo
    if (textUpper.includes('DUBBIO_IMMAGINE') || textUpper.includes('UNCERTAIN_MEDIA')) {
      return {
        verdict: 'UNCERTAIN',
        reasons: ['Immagine sfocata o parzialmente occultata: non è possibile determinare la piena coerenza'],
        optional_score: 0.50,
        model_version: 'mock-coherence-v1.0'
      };
    }

    // Esito coerente di default
    return {
      verdict: 'CONSISTENT',
      reasons: ['Il contenuto visivo del media corrisponde alla descrizione fornita'],
      optional_score: 0.98,
      model_version: 'mock-coherence-v1.0'
    };
  }
}

/**
 * Factory per creare il set completo di adapter deterministici simulati
 */
export function createMockPipelineAdapters(): PipelineAdapters {
  return {
    moderation: new DeterministicMockModerationAdapter(),
    classification: new DeterministicMockClassificationAdapter(),
    metadata: new DeterministicMockMetadataAdapter(),
    coherence: new DeterministicMockCoherenceAdapter()
  };
}
