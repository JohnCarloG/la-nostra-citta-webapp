/**
 * Contratti e interfacce per i moduli IA (Fase 5 - Architettura e Flussi 05)
 * Moduli: Moderazione NLP, Classificazione multi-label, Estrazione metadati EXIF, Coerenza visivo-testuale.
 */

export type ModerationVerdict = 'ALLOW' | 'REVIEW' | 'BLOCK';

export interface ModerationInput {
  report_id: string;
  revision: number;
  text: string;
  input_hash: string;
}

export interface ModerationOutput {
  verdict: ModerationVerdict;
  reasons: string[];
  optional_score?: number;
  model_version: string;
  policy_version: string;
}

export interface AllowedCategory {
  id: string;
  codice: string;
  nome: string;
}

export interface ClassificationInput {
  text: string;
  allowed_categories: AllowedCategory[];
}

export interface ClassificationSuggestion {
  category_id: string;
  optional_confidence?: number;
}

export interface ClassificationOutput {
  suggestions: ClassificationSuggestion[];
  model_version: string;
}

export type MetadataExtractionStatus = 'SUCCESS' | 'NO_EXIF' | 'CORRUPTED' | 'UNSUPPORTED';

export interface MetadataInput {
  media_id: string;
  private_object: {
    buffer?: Buffer;
    path?: string;
    mime: string;
  };
}

export interface MetadataOutput {
  gps?: {
    lat: number;
    lon: number;
  };
  extraction_status: MetadataExtractionStatus;
  parser_version: string;
}

export type CoherenceVerdict = 'CONSISTENT' | 'UNCERTAIN' | 'INCONSISTENT' | 'UNSUPPORTED';

export interface CoherenceInput {
  text: string;
  media_id: string;
  media_type: 'IMMAGINE' | 'VIDEO';
  private_image_or_frames: Buffer | string;
}

export interface CoherenceOutput {
  verdict: CoherenceVerdict;
  reasons: string[];
  optional_score?: number;
  model_version: string;
}

/**
 * Interfacce contrattuali per gli adapter
 */
export interface IModerationAdapter {
  readonly name: string;
  readonly isSimulated: boolean;
  moderate(input: ModerationInput, options?: { timeoutMs?: number }): Promise<ModerationOutput>;
}

export interface IClassificationAdapter {
  readonly name: string;
  readonly isSimulated: boolean;
  classify(input: ClassificationInput, options?: { timeoutMs?: number }): Promise<ClassificationOutput>;
}

export interface IMetadataAdapter {
  readonly name: string;
  readonly isSimulated: boolean;
  extract(input: MetadataInput, options?: { timeoutMs?: number }): Promise<MetadataOutput>;
}

export interface ICoherenceAdapter {
  readonly name: string;
  readonly isSimulated: boolean;
  check(input: CoherenceInput, options?: { timeoutMs?: number }): Promise<CoherenceOutput>;
}

export interface PipelineAdapters {
  moderation: IModerationAdapter;
  classification: IClassificationAdapter;
  metadata: IMetadataAdapter;
  coherence: ICoherenceAdapter;
}
