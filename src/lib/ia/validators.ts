import {
  ModerationOutput,
  ModerationVerdict,
  ClassificationOutput,
  ClassificationSuggestion,
  AllowedCategory,
  MetadataOutput,
  MetadataExtractionStatus,
  CoherenceOutput,
  CoherenceVerdict
} from './types';

export class InvalidProviderOutputError extends Error {
  constructor(public readonly moduleName: string, message: string) {
    super(`Output del provider per modulo ${moduleName} non valido: ${message}`);
    this.name = 'InvalidProviderOutputError';
  }
}

/**
 * Valida la struttura dell'output del modulo di moderazione NLP.
 */
export function validateModerationOutput(data: unknown): ModerationOutput {
  if (!data || typeof data !== 'object') {
    throw new InvalidProviderOutputError('MODERAZIONE', 'Il payload deve essere un oggetto non nullo');
  }

  const obj = data as Record<string, unknown>;

  const validVerdicts: ModerationVerdict[] = ['ALLOW', 'REVIEW', 'BLOCK'];
  if (typeof obj.verdict !== 'string' || !validVerdicts.includes(obj.verdict as ModerationVerdict)) {
    throw new InvalidProviderOutputError('MODERAZIONE', `verdict deve essere uno tra ${validVerdicts.join(', ')}`);
  }

  if (!Array.isArray(obj.reasons) || !obj.reasons.every(r => typeof r === 'string')) {
    throw new InvalidProviderOutputError('MODERAZIONE', 'reasons deve essere un array di stringhe');
  }

  if (obj.optional_score !== undefined && (typeof obj.optional_score !== 'number' || isNaN(obj.optional_score))) {
    throw new InvalidProviderOutputError('MODERAZIONE', 'optional_score deve essere un numero valido');
  }

  if (typeof obj.model_version !== 'string' || obj.model_version.trim().length === 0) {
    throw new InvalidProviderOutputError('MODERAZIONE', 'model_version deve essere una stringa non vuota');
  }

  if (typeof obj.policy_version !== 'string' || obj.policy_version.trim().length === 0) {
    throw new InvalidProviderOutputError('MODERAZIONE', 'policy_version deve essere una stringa non vuota');
  }

  return {
    verdict: obj.verdict as ModerationVerdict,
    reasons: obj.reasons,
    optional_score: obj.optional_score,
    model_version: obj.model_version,
    policy_version: obj.policy_version
  };
}

/**
 * Valida la classificazione e filtra categorie non appartenenti al catalogo ammesso o duplicate (T08).
 */
export function validateClassificationOutput(
  data: unknown,
  allowedCategories: AllowedCategory[]
): ClassificationOutput {
  if (!data || typeof data !== 'object') {
    throw new InvalidProviderOutputError('CLASSIFICAZIONE', 'Il payload deve essere un oggetto non nullo');
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.model_version !== 'string' || obj.model_version.trim().length === 0) {
    throw new InvalidProviderOutputError('CLASSIFICAZIONE', 'model_version deve essere una stringa non vuota');
  }

  if (!Array.isArray(obj.suggestions)) {
    throw new InvalidProviderOutputError('CLASSIFICAZIONE', 'suggestions deve essere un array');
  }

  const allowedIds = new Set(allowedCategories.map(c => c.id));
  const seenIds = new Set<string>();
  const sanitizedSuggestions: ClassificationSuggestion[] = [];

  for (const s of obj.suggestions) {
    if (!s || typeof s !== 'object') continue;
    const catId = (s as Record<string, unknown>).category_id;
    const confidence = (s as Record<string, unknown>).optional_confidence;

    if (typeof catId !== 'string') continue;

    // Scarta categorie fuori catalogo ammesso o duplicate (T08)
    if (!allowedIds.has(catId) || seenIds.has(catId)) {
      continue;
    }

    seenIds.add(catId);
    sanitizedSuggestions.push({
      category_id: catId,
      optional_confidence: typeof confidence === 'number' && !isNaN(confidence) ? confidence : undefined
    });
  }

  return {
    suggestions: sanitizedSuggestions,
    model_version: obj.model_version
  };
}

/**
 * Valida l'output dell'estrazione dei metadati EXIF.
 */
export function validateMetadataOutput(data: unknown): MetadataOutput {
  if (!data || typeof data !== 'object') {
    throw new InvalidProviderOutputError('EXIF', 'Il payload deve essere un oggetto non nullo');
  }

  const obj = data as Record<string, unknown>;

  const validStatuses: MetadataExtractionStatus[] = ['SUCCESS', 'NO_EXIF', 'CORRUPTED', 'UNSUPPORTED'];
  if (typeof obj.extraction_status !== 'string' || !validStatuses.includes(obj.extraction_status as MetadataExtractionStatus)) {
    throw new InvalidProviderOutputError('EXIF', `extraction_status deve essere uno tra ${validStatuses.join(', ')}`);
  }

  if (typeof obj.parser_version !== 'string' || obj.parser_version.trim().length === 0) {
    throw new InvalidProviderOutputError('EXIF', 'parser_version deve essere una stringa non vuota');
  }

  let gps: { lat: number; lon: number } | undefined;
  if (obj.gps !== undefined) {
    if (typeof obj.gps !== 'object' || obj.gps === null) {
      throw new InvalidProviderOutputError('EXIF', 'gps deve essere un oggetto con lat e lon');
    }
    const gpsObj = obj.gps as Record<string, unknown>;
    if (
      typeof gpsObj.lat !== 'number' ||
      isNaN(gpsObj.lat) ||
      typeof gpsObj.lon !== 'number' ||
      isNaN(gpsObj.lon)
    ) {
      throw new InvalidProviderOutputError('EXIF', 'gps.lat e gps.lon devono essere numeri validi');
    }
    gps = { lat: gpsObj.lat, lon: gpsObj.lon };
  }

  return {
    gps,
    extraction_status: obj.extraction_status as MetadataExtractionStatus,
    parser_version: obj.parser_version
  };
}

/**
 * Valida l'output della coerenza visivo-testuale.
 */
export function validateCoherenceOutput(data: unknown): CoherenceOutput {
  if (!data || typeof data !== 'object') {
    throw new InvalidProviderOutputError('COERENZA', 'Il payload deve essere un oggetto non nullo');
  }

  const obj = data as Record<string, unknown>;

  const validVerdicts: CoherenceVerdict[] = ['CONSISTENT', 'UNCERTAIN', 'INCONSISTENT', 'UNSUPPORTED'];
  if (typeof obj.verdict !== 'string' || !validVerdicts.includes(obj.verdict as CoherenceVerdict)) {
    throw new InvalidProviderOutputError('COERENZA', `verdict deve essere uno tra ${validVerdicts.join(', ')}`);
  }

  if (!Array.isArray(obj.reasons) || !obj.reasons.every(r => typeof r === 'string')) {
    throw new InvalidProviderOutputError('COERENZA', 'reasons deve essere un array di stringhe');
  }

  if (obj.optional_score !== undefined && (typeof obj.optional_score !== 'number' || isNaN(obj.optional_score))) {
    throw new InvalidProviderOutputError('COERENZA', 'optional_score deve essere un numero valido');
  }

  if (typeof obj.model_version !== 'string' || obj.model_version.trim().length === 0) {
    throw new InvalidProviderOutputError('COERENZA', 'model_version deve essere una stringa non vuota');
  }

  return {
    verdict: obj.verdict as CoherenceVerdict,
    reasons: obj.reasons,
    optional_score: obj.optional_score,
    model_version: obj.model_version
  };
}
