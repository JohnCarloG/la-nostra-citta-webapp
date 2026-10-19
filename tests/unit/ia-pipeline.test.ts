import { describe, it, expect } from 'vitest';
import {
  validateModerationOutput,
  validateClassificationOutput,
  validateMetadataOutput,
  validateCoherenceOutput,
  InvalidProviderOutputError
} from '../../src/lib/ia/validators';
import { AllowedCategory } from '../../src/lib/ia/types';
import {
  DeterministicMockModerationAdapter,
  DeterministicMockClassificationAdapter,
  DeterministicMockCoherenceAdapter,
  DeterministicMockMetadataAdapter
} from '../../src/lib/ia/mock-adapters';
import { calculateInputHash } from '../../src/lib/ia/pipeline';

describe('Unit Tests: Validatori e Adapter Moduli IA (Fase 5 - T07, T08, T09)', () => {
  const allowedCategories: AllowedCategory[] = [
    { id: 'cat-1', codice: 'STRADE', nome: 'Manutenzione Stradale' },
    { id: 'cat-2', codice: 'RIFIUTI', nome: 'Gestione Rifiuti' }
  ];

  describe('Validatore Moderazione NLP', () => {
    it('accetta output valido con ALLOW', () => {
      const valid = {
        verdict: 'ALLOW',
        reasons: ['OK'],
        optional_score: 0.1,
        model_version: 'nlp-v1',
        policy_version: 'policy-v1'
      };
      const res = validateModerationOutput(valid);
      expect(res.verdict).toBe('ALLOW');
      expect(res.reasons).toEqual(['OK']);
    });

    it('rifiuta verdict sconosciuto o malformato', () => {
      expect(() => validateModerationOutput({ verdict: 'ACCETTATA' })).toThrow(InvalidProviderOutputError);
      expect(() => validateModerationOutput(null)).toThrow(InvalidProviderOutputError);
      expect(() => validateModerationOutput({ verdict: 'ALLOW', reasons: 'non array' })).toThrow(InvalidProviderOutputError);
    });
  });

  describe('Validatore Classificazione (T08: scarto duplicati e fuori catalogo)', () => {
    it('filtra categorie non appartenenti al catalogo ammesso e rimuove duplicati', () => {
      const raw = {
        model_version: 'clf-v1',
        suggestions: [
          { category_id: 'cat-1', optional_confidence: 0.95 },
          { category_id: 'cat-1', optional_confidence: 0.90 }, // Duplicato
          { category_id: 'cat-hacker-999', optional_confidence: 0.99 }, // Fuori catalogo
          { category_id: 'cat-2', optional_confidence: 0.80 }
        ]
      };

      const res = validateClassificationOutput(raw, allowedCategories);
      expect(res.suggestions).toHaveLength(2);
      expect(res.suggestions[0].category_id).toBe('cat-1');
      expect(res.suggestions[1].category_id).toBe('cat-2');
    });

    it('accetta suggestions vuote senza errore (T07)', () => {
      const raw = {
        model_version: 'clf-v1',
        suggestions: []
      };
      const res = validateClassificationOutput(raw, allowedCategories);
      expect(res.suggestions).toEqual([]);
    });

    it('rifiuta payload con suggestions non array', () => {
      expect(() => validateClassificationOutput({ model_version: 'v1', suggestions: 'none' }, allowedCategories))
        .toThrow(InvalidProviderOutputError);
    });
  });

  describe('Validatore Metadati EXIF', () => {
    it('accetta stato NO_EXIF senza coordinate (T04/T09)', () => {
      const valid = {
        extraction_status: 'NO_EXIF',
        parser_version: 'exif-v1'
      };
      const res = validateMetadataOutput(valid);
      expect(res.extraction_status).toBe('NO_EXIF');
      expect(res.gps).toBeUndefined();
    });

    it('accetta coordinate GPS valide', () => {
      const valid = {
        gps: { lat: 45.4642, lon: 9.1900 },
        extraction_status: 'SUCCESS',
        parser_version: 'exif-v1'
      };
      const res = validateMetadataOutput(valid);
      expect(res.gps?.lat).toBe(45.4642);
    });

    it('rifiuta GPS con valori non numerici', () => {
      expect(() => validateMetadataOutput({
        gps: { lat: 'invalido', lon: 9.0 },
        extraction_status: 'SUCCESS',
        parser_version: 'v1'
      })).toThrow(InvalidProviderOutputError);
    });
  });

  describe('Validatore Coerenza Visivo-Testuale (T09)', () => {
    it('accetta verdetti consentiti: CONSISTENT, UNCERTAIN, INCONSISTENT, UNSUPPORTED', () => {
      const v1 = validateCoherenceOutput({
        verdict: 'CONSISTENT',
        reasons: ['Coerente'],
        model_version: 'coh-v1'
      });
      expect(v1.verdict).toBe('CONSISTENT');

      const v2 = validateCoherenceOutput({
        verdict: 'UNSUPPORTED',
        reasons: ['Video non supportato'],
        model_version: 'coh-v1'
      });
      expect(v2.verdict).toBe('UNSUPPORTED');
    });

    it('rifiuta verdict sconosciuto', () => {
      expect(() => validateCoherenceOutput({
        verdict: 'VALID',
        reasons: ['ok'],
        model_version: 'v1'
      })).toThrow(InvalidProviderOutputError);
    });
  });

  describe('Adapter Simulati Deterministici', () => {
    it('Moderation: riconosce parole bloccanti e restituisce BLOCK', async () => {
      const adapter = new DeterministicMockModerationAdapter();
      const res = await adapter.moderate({
        report_id: 'rep-1',
        revision: 1,
        text: 'Questo messaggio contiene SPAM e violenza inaccettabile',
        input_hash: 'hash-1'
      });
      expect(res.verdict).toBe('BLOCK');
    });

    it('Moderation: riconosce parole dubbie e restituisce REVIEW', async () => {
      const adapter = new DeterministicMockModerationAdapter();
      const res = await adapter.moderate({
        report_id: 'rep-1',
        revision: 1,
        text: 'C e un dubbio sulla veridicità di questa informazione',
        input_hash: 'hash-1'
      });
      expect(res.verdict).toBe('REVIEW');
    });

    it('Coherence: video restituisce UNSUPPORTED con motivazione esplicita (T09)', async () => {
      const adapter = new DeterministicMockCoherenceAdapter();
      const res = await adapter.check({
        text: 'Buca profonda in strada',
        media_id: 'med-1',
        media_type: 'VIDEO',
        private_image_or_frames: 'storage/key'
      });
      expect(res.verdict).toBe('UNSUPPORTED');
      expect(res.reasons[0]).toContain('Analisi video non supportata');
    });

    it('Coherence: immagine incoerente restituisce INCONSISTENT', async () => {
      const adapter = new DeterministicMockCoherenceAdapter();
      const res = await adapter.check({
        text: 'Buca in strada ma immagine palesemente INCOERENTE con spiaggia',
        media_id: 'med-2',
        media_type: 'IMMAGINE',
        private_image_or_frames: 'storage/key'
      });
      expect(res.verdict).toBe('INCONSISTENT');
    });

    it('Metadata: estrae coordinate se presente firma mock GPS, altrimenti NO_EXIF', async () => {
      const adapter = new DeterministicMockMetadataAdapter();
      const resExif = await adapter.extract({
        media_id: 'med-1',
        private_object: {
          mime: 'image/jpeg',
          buffer: Buffer.from('TEST_BUFFER_MOCK_GPS_EXIF_DATA')
        }
      });
      expect(resExif.extraction_status).toBe('SUCCESS');
      expect(resExif.gps?.lat).toBe(45.4642);

      const resNoExif = await adapter.extract({
        media_id: 'med-2',
        private_object: {
          mime: 'image/jpeg',
          buffer: Buffer.from('TEST_BUFFER_WITHOUT_GPS')
        }
      });
      expect(resNoExif.extraction_status).toBe('NO_EXIF');
    });

    it('Classification: suggerisce categorie pertinenti dal testo', async () => {
      const adapter = new DeterministicMockClassificationAdapter();
      const res = await adapter.classify({
        text: 'C e una buca pericolosa nell asfalto della strada',
        allowed_categories: allowedCategories
      });
      expect(res.suggestions).toHaveLength(1);
      expect(res.suggestions[0].category_id).toBe('cat-1');
    });

    it('Hash calcolato è deterministico per lo stesso input', () => {
      const h1 = calculateInputHash('testo-segnalazione-1:1');
      const h2 = calculateInputHash('testo-segnalazione-1:1');
      const h3 = calculateInputHash('testo-segnalazione-1:2');
      expect(h1).toBe(h2);
      expect(h1).not.toBe(h3);
    });
  });
});
