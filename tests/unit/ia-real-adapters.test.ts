import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NativeExifMetadataAdapter,
  ProviderModerationAdapter,
  ProviderClassificationAdapter,
  MissingProviderCredentialError,
  createRealPipelineAdapters
} from '../../src/lib/ia/real-adapters';
import { InvalidProviderOutputError } from '../../src/lib/ia/validators';

describe('Unit Tests: Adattatori IA Reali (Fase 5 - Requisiti Traccia)', () => {
  describe('NativeExifMetadataAdapter (Parsing Binario Reale Locale)', () => {
    const adapter = new NativeExifMetadataAdapter();

    it('è contrassegnato come adattatore reale (isSimulated = false)', () => {
      expect(adapter.isSimulated).toBe(false);
      expect(adapter.name).toBe('native-exif-parser');
    });

    it('restituisce UNSUPPORTED per formati video o formati senza EXIF standard', async () => {
      const resVideo = await adapter.extract({
        media_id: 'med-video-1',
        private_object: {
          mime: 'video/mp4',
          buffer: Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])
        }
      });
      expect(resVideo.extraction_status).toBe('UNSUPPORTED');
      expect(resVideo.gps).toBeUndefined();

      const resPng = await adapter.extract({
        media_id: 'med-png-1',
        private_object: {
          mime: 'image/png',
          buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47])
        }
      });
      expect(resPng.extraction_status).toBe('UNSUPPORTED');
    });

    it('restituisce NO_EXIF per immagini JPEG prive di coordinate GPS', async () => {
      // JPEG minimale senza APP1
      const jpegNoExif = Buffer.from([
        0xFF, 0xD8, // SOI
        0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // JFIF
        0xFF, 0xD9 // EOI
      ]);

      const res = await adapter.extract({
        media_id: 'med-jpeg-no-exif',
        private_object: {
          mime: 'image/jpeg',
          buffer: jpegNoExif
        }
      });

      expect(res.extraction_status).toBe('NO_EXIF');
      expect(res.gps).toBeUndefined();
      expect(res.parser_version).toBe('native-exif-v1.0');
    });

    it('estrae con precisione le coordinate GPS reali da un segmento JPEG EXIF valido', async () => {
      // Costruzione di un segmento JPEG APP1 con TIFF IFD contenente tag GPS reali
      // Coordinate test: 45°27'51.12" N, 9°11'24.00" E (Milano Duomo) -> lat 45.4642, lon 9.1900
      const tiffHeader = Buffer.alloc(8);
      tiffHeader.write('II', 0); // Little Endian
      tiffHeader.writeUInt16LE(0x002A, 2); // 42
      tiffHeader.writeUInt32LE(8, 4); // Offset to IFD0

      // IFD0 con 1 entry: Exif IFD Pointer o GPS IFD Pointer (tag 0x8825)
      const ifd0 = Buffer.alloc(2 + 12 + 4);
      ifd0.writeUInt16LE(1, 0); // 1 entry
      ifd0.writeUInt16LE(0x8825, 2); // GPSInfo tag
      ifd0.writeUInt16LE(4, 4); // LONG type
      ifd0.writeUInt32LE(1, 6); // 1 count
      const gpsIfdOffset = 8 + ifd0.length;
      ifd0.writeUInt32LE(gpsIfdOffset, 10); // Offset to GPS IFD
      ifd0.writeUInt32LE(0, 14); // Next IFD offset = 0

      // GPS IFD: 4 entries:
      // tag 1: GPSLatitudeRef ('N')
      // tag 2: GPSLatitude (3 RATIONALs)
      // tag 3: GPSLongitudeRef ('E')
      // tag 4: GPSLongitude (3 RATIONALs)
      const gpsIfd = Buffer.alloc(2 + (4 * 12) + 4);
      gpsIfd.writeUInt16LE(4, 0); // 4 entries

      const dataOffsetStart = gpsIfdOffset + gpsIfd.length;

      // Entry 1: GPSLatitudeRef (ASCII)
      gpsIfd.writeUInt16LE(1, 2);
      gpsIfd.writeUInt16LE(2, 4); // ASCII
      gpsIfd.writeUInt32LE(2, 6); // 'N\0'
      gpsIfd.write('N\0', 10, 2, 'ascii');

      // Entry 2: GPSLatitude (RATIONAL)
      gpsIfd.writeUInt16LE(2, 14);
      gpsIfd.writeUInt16LE(5, 16); // RATIONAL
      gpsIfd.writeUInt32LE(3, 18); // 3 rationals
      gpsIfd.writeUInt32LE(dataOffsetStart, 22);

      // Entry 3: GPSLongitudeRef (ASCII)
      gpsIfd.writeUInt16LE(3, 26);
      gpsIfd.writeUInt16LE(2, 28);
      gpsIfd.writeUInt32LE(2, 30);
      gpsIfd.write('E\0', 34, 2, 'ascii');

      // Entry 4: GPSLongitude (RATIONAL)
      gpsIfd.writeUInt16LE(4, 38);
      gpsIfd.writeUInt16LE(5, 40);
      gpsIfd.writeUInt32LE(3, 42);
      gpsIfd.writeUInt32LE(dataOffsetStart + 24, 46);

      // Dati dei razionali:
      // Latitudine: 45/1 deg, 27/1 min, 5112/100 sec = 45.4642
      const rationals = Buffer.alloc(48);
      rationals.writeUInt32LE(45, 0); rationals.writeUInt32LE(1, 4);
      rationals.writeUInt32LE(27, 8); rationals.writeUInt32LE(1, 12);
      rationals.writeUInt32LE(5112, 16); rationals.writeUInt32LE(100, 20);

      // Longitudine: 9/1 deg, 11/1 min, 2400/100 sec = 9.19
      rationals.writeUInt32LE(9, 24); rationals.writeUInt32LE(1, 28);
      rationals.writeUInt32LE(11, 32); rationals.writeUInt32LE(1, 36);
      rationals.writeUInt32LE(2400, 40); rationals.writeUInt32LE(100, 44);

      const tiffBlock = Buffer.concat([tiffHeader, ifd0, gpsIfd, rationals]);

      // Segmento APP1 JPEG: 0xFF 0xE1 [len_be] "Exif\0\0" [tiffBlock]
      const app1Payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiffBlock]);
      const app1Len = app1Payload.length + 2;
      const app1Header = Buffer.alloc(4);
      app1Header.writeUInt8(0xFF, 0);
      app1Header.writeUInt8(0xE1, 1);
      app1Header.writeUInt16BE(app1Len, 2);

      const validJpegWithExif = Buffer.concat([
        Buffer.from([0xFF, 0xD8]), // SOI
        app1Header,
        app1Payload,
        Buffer.from([0xFF, 0xD9]) // EOI
      ]);

      const res = await adapter.extract({
        media_id: 'med-real-exif',
        private_object: {
          mime: 'image/jpeg',
          buffer: validJpegWithExif
        }
      });

      expect(res.extraction_status).toBe('SUCCESS');
      expect(res.gps).toBeDefined();
      expect(res.gps?.lat).toBeCloseTo(45.4642, 4);
      expect(res.gps?.lon).toBeCloseTo(9.1900, 4);
    });
  });

  describe('ProviderModerationAdapter (Provider Reale con Vincoli di Sicurezza)', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      delete process.env.AI_MODERATION_API_KEY;
      delete process.env.OPENAI_API_KEY;
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
    });

    it('in assenza di credenziali solleva MissingProviderCredentialError senza chiamate di rete', async () => {
      const adapter = new ProviderModerationAdapter();

      await expect(
        adapter.moderate({
          report_id: 'rep-1',
          revision: 1,
          text: 'Segnalazione buca in strada',
          input_hash: 'hash-1'
        })
      ).rejects.toThrow(MissingProviderCredentialError);
    });

    it('esegue la chiamata con prompt isolation e restituisce ALLOW su contenuto conforme', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'modr-123',
          model: 'text-moderation-007',
          results: [
            {
              flagged: false,
              categories: { hate: false, violence: false, spam: false },
              category_scores: { hate: 0.001, violence: 0.002, spam: 0.005 }
            }
          ]
        })
      });
      vi.stubGlobal('fetch', mockFetch);

      const adapter = new ProviderModerationAdapter({ apiKey: 'test-secret-key' });

      const res = await adapter.moderate({
        report_id: 'rep-1',
        revision: 1,
        text: 'Lampione spento in via Roma 10 da tre giorni',
        input_hash: 'hash-1'
      });

      expect(res.verdict).toBe('ALLOW');
      expect(res.reasons).toEqual(['Testo conforme']);
      expect(res.model_version).toBe('text-moderation-007');

      // Verifica che il body inviato isoli il testo utente come input dato
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const parsedBody = JSON.parse(callArgs[1].body);
      expect(parsedBody.input).toBe('Lampione spento in via Roma 10 da tre giorni');
    });

    it('restituisce BLOCK con motivi se il provider rileva violazioni', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'modr-block-99',
          model: 'text-moderation-007',
          results: [
            {
              flagged: true,
              categories: { hate: false, violence: true, spam: false },
              category_scores: { hate: 0.01, violence: 0.98, spam: 0.02 }
            }
          ]
        })
      });
      vi.stubGlobal('fetch', mockFetch);

      const adapter = new ProviderModerationAdapter({ apiKey: 'test-secret-key' });

      const res = await adapter.moderate({
        report_id: 'rep-2',
        revision: 1,
        text: 'Messaggio con minacce di violenza',
        input_hash: 'hash-2'
      });

      expect(res.verdict).toBe('BLOCK');
      expect(res.reasons).toContain('violence');
      expect(res.optional_score).toBe(0.98);
    });

    it('in caso di risposta HTTP 500 o 429 solleva errore esplicito (fail-closed -> IN_REVISIONE)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service Unavailable' })
      });
      vi.stubGlobal('fetch', mockFetch);

      const adapter = new ProviderModerationAdapter({ apiKey: 'test-secret-key' });

      await expect(
        adapter.moderate({
          report_id: 'rep-3',
          revision: 1,
          text: 'Segnalazione ordinaria',
          input_hash: 'hash-3'
        })
      ).rejects.toThrow('Provider moderazione ha risposto con codice HTTP 503');
    });

    it('in caso di timeout della richiesta solleva eccezione di timeout', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          setTimeout(() => reject(err), 20);
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const adapter = new ProviderModerationAdapter({ apiKey: 'test-secret-key' });

      await expect(
        adapter.moderate(
          {
            report_id: 'rep-timeout',
            revision: 1,
            text: 'Segnalazione lenta',
            input_hash: 'hash-timeout'
          },
          { timeoutMs: 10 }
        )
      ).rejects.toThrow('Timeout modulo moderazione superato (10ms)');
    });

    it('rifiuta risposte malformate prive di schema valido (InvalidProviderOutputError)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: 'non un array di risultati'
        })
      });
      vi.stubGlobal('fetch', mockFetch);

      const adapter = new ProviderModerationAdapter({ apiKey: 'test-secret-key' });

      await expect(
        adapter.moderate({
          report_id: 'rep-bad-schema',
          revision: 1,
          text: 'Testo con payload non standard',
          input_hash: 'hash-bad'
        })
      ).rejects.toThrow(InvalidProviderOutputError);
    });
  });

  describe('ProviderClassificationAdapter (Classificatore Civico Reale)', () => {
    const originalEnv = process.env;
    const testCategories = [
      { id: 'cat-verde', codice: 'VERDE', nome: 'Verde Pubblico' },
      { id: 'cat-strade', codice: 'STRADE', nome: 'Manutenzione Stradale' }
    ];

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.AI_CLASSIFICATION_API_KEY;
      delete process.env.AI_CLASSIFICATION_ENDPOINT;
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('è contrassegnato come adattatore reale (isSimulated = false)', () => {
      const adapter = new ProviderClassificationAdapter({ apiKey: 'key', endpointUrl: 'https://api.example.com/classify' });
      expect(adapter.isSimulated).toBe(false);
      expect(adapter.name).toBe('provider-civic-classification');
    });

    it('in assenza di configurazione solleva MissingProviderCredentialError (nessun fallback silenzioso al mock)', async () => {
      const adapter = new ProviderClassificationAdapter();

      await expect(
        adapter.classify({
          text: 'Rami caduti nel parco',
          allowed_categories: testCategories
        })
      ).rejects.toThrow(MissingProviderCredentialError);
    });

    it('invia la tassonomia chiusa e restituisce i suggerimenti validati', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          model_version: 'civic-classifier-v1.0',
          suggestions: [
            { category_id: 'cat-verde', optional_confidence: 0.94 }
          ]
        })
      });
      vi.stubGlobal('fetch', mockFetch);

      const adapter = new ProviderClassificationAdapter({
        apiKey: 'clf-secret-key',
        endpointUrl: 'https://ia.example.com/classify'
      });

      const res = await adapter.classify({
        text: 'Alberi non potati e rami pericolosi in viale Monza',
        allowed_categories: testCategories
      });

      expect(res.model_version).toBe('civic-classifier-v1.0');
      expect(res.suggestions).toHaveLength(1);
      expect(res.suggestions[0].category_id).toBe('cat-verde');
      expect(res.suggestions[0].optional_confidence).toBe(0.94);

      // Verifica che la tassonomia chiusa sia stata inviata correttamente
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const parsedBody = JSON.parse(callArgs[1].body);
      expect(parsedBody.text).toBe('Alberi non potati e rami pericolosi in viale Monza');
      expect(parsedBody.allowed_categories).toEqual([
        { id: 'cat-verde', codice: 'VERDE', nome: 'Verde Pubblico' },
        { id: 'cat-strade', codice: 'STRADE', nome: 'Manutenzione Stradale' }
      ]);
    });

    it('in caso di timeout della richiesta solleva eccezione di timeout esplicita', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          setTimeout(() => reject(err), 20);
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const adapter = new ProviderClassificationAdapter({
        apiKey: 'clf-secret-key',
        endpointUrl: 'https://ia.example.com/classify'
      });

      await expect(
        adapter.classify(
          {
            text: 'Testo con richiesta lenta',
            allowed_categories: testCategories
          },
          { timeoutMs: 10 }
        )
      ).rejects.toThrow('Timeout modulo classificazione superato (10ms)');
    });

    it('in caso di errore HTTP dal provider solleva errore esplicito', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Bad Gateway' })
      });
      vi.stubGlobal('fetch', mockFetch);

      const adapter = new ProviderClassificationAdapter({
        apiKey: 'clf-secret-key',
        endpointUrl: 'https://ia.example.com/classify'
      });

      await expect(
        adapter.classify({
          text: 'Segnalazione buca',
          allowed_categories: testCategories
        })
      ).rejects.toThrow('Provider classificazione ha risposto con codice HTTP 502');
    });
  });

  describe('createRealPipelineAdapters Factory', () => {
    it('crea un set di adapter combinando parser EXIF reale, moderazione reale e classificatore reale', () => {
      const adapters = createRealPipelineAdapters({
        moderationApiKey: 'dummy-mod-key',
        classificationApiKey: 'dummy-clf-key',
        classificationEndpoint: 'https://ia.example.com/classify'
      });
      expect(adapters.metadata.isSimulated).toBe(false);
      expect(adapters.moderation.isSimulated).toBe(false);
      expect(adapters.classification.isSimulated).toBe(false); // Classificatore reale non simulato
      expect(adapters.coherence.isSimulated).toBe(true); // mock conservativo deterministico fino al blocco successivo RF10
    });
  });
});
