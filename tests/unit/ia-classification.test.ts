import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateClassificationOutput,
  InvalidProviderOutputError
} from '../../src/lib/ia/validators';
import {
  AllowedCategory,
  IClassificationAdapter
} from '../../src/lib/ia/types';
import {
  ProviderClassificationAdapter,
  MissingProviderCredentialError
} from '../../src/lib/ia/real-adapters';
import {
  DeterministicMockClassificationAdapter,
  DeterministicMockModerationAdapter,
  DeterministicMockMetadataAdapter,
  DeterministicMockCoherenceAdapter
} from '../../src/lib/ia/mock-adapters';
import { eseguiAnalisiSegnalazione } from '../../src/lib/ia/pipeline';
import { prisma } from '../../src/lib/db';

interface MockPrisma {
  segnalazione: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  categoria: {
    findMany: ReturnType<typeof vi.fn>;
  };
  analisiIa: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  suggerimentoCategoria: {
    upsert: ReturnType<typeof vi.fn>;
  };
  segnalazioneCategoria: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  eventoStato: {
    create: ReturnType<typeof vi.fn>;
  };
  auditEvento: {
    create: ReturnType<typeof vi.fn>;
  };
  $queryRaw: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
}

interface MockTransactionClient {
  $queryRaw: ReturnType<typeof vi.fn>;
  analisiIa: {
    upsert: ReturnType<typeof vi.fn>;
  };
  suggerimentoCategoria: {
    upsert: ReturnType<typeof vi.fn>;
  };
  segnalazione?: {
    update: ReturnType<typeof vi.fn>;
  };
  eventoStato?: {
    create: ReturnType<typeof vi.fn>;
  };
  auditEvento?: {
    create: ReturnType<typeof vi.fn>;
  };
}

interface AnalisiIaRecord {
  stato_esecuzione?: string;
  esito?: string;
  dettagli_json?: string;
}

// Mock del client Prisma per test unitari deterministici isolati
vi.mock('../../src/lib/db', () => {
  const mPrisma = {
    segnalazione: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    categoria: {
      findMany: vi.fn()
    },
    analisiIa: {
      upsert: vi.fn(),
      findUnique: vi.fn()
    },
    suggerimentoCategoria: {
      upsert: vi.fn()
    },
    segnalazioneCategoria: {
      findMany: vi.fn(),
      create: vi.fn()
    },
    eventoStato: {
      create: vi.fn()
    },
    auditEvento: {
      create: vi.fn()
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn()
  };
  return { prisma: mPrisma };
});

vi.mock('../../src/lib/storage', () => ({
  getStorageProvider: vi.fn(() => ({
    getObject: vi.fn().mockResolvedValue(Buffer.from('fake-buffer'))
  }))
}));

const mockPrisma = prisma as unknown as MockPrisma;

describe('Unit Tests: RF08 — Classificazione Automatica in Categorie', () => {
  const allowedCategories: AllowedCategory[] = [
    { id: 'cat-verde', codice: 'VERDE', nome: 'Verde Pubblico' },
    { id: 'cat-strade', codice: 'STRADE', nome: 'Manutenzione Stradale' },
    { id: 'cat-rifiuti', codice: 'RIFIUTI', nome: 'Gestione Rifiuti' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Categorie valide (Taxonomy filtering & suggestion preservation)
  // --------------------------------------------------------------------------
  it('accetta e valida categorie valide appartenenti al catalogo chiuso con relative confidenze', () => {
    const rawOutput = {
      model_version: 'civic-bert-milano-v1',
      suggestions: [
        { category_id: 'cat-verde', optional_confidence: 0.95 },
        { category_id: 'cat-strade', optional_confidence: 0.82 }
      ]
    };

    const validated = validateClassificationOutput(rawOutput, allowedCategories);
    expect(validated.model_version).toBe('civic-bert-milano-v1');
    expect(validated.suggestions).toHaveLength(2);
    expect(validated.suggestions[0]).toEqual({ category_id: 'cat-verde', optional_confidence: 0.95 });
    expect(validated.suggestions[1]).toEqual({ category_id: 'cat-strade', optional_confidence: 0.82 });
  });

  // --------------------------------------------------------------------------
  // 2. Categorie inesistenti o fuori catalogo (Strict filtering & deduplication)
  // --------------------------------------------------------------------------
  it('scarta rigorosamente categorie inesistenti, codici fuori catalogo o duplicati senza sollevare errori', () => {
    const rawOutput = {
      model_version: 'civic-classifier-v1',
      suggestions: [
        { category_id: 'cat-verde', optional_confidence: 0.90 },
        { category_id: 'cat-verde', optional_confidence: 0.85 }, // Duplicato dello stesso ID
        { category_id: 'cat-hacker-aliena-99', optional_confidence: 0.99 }, // Fuori catalogo ammesso
        { category_id: 'cat-rifiuti', optional_confidence: 0.75 },
        { category_id: '', optional_confidence: 0.50 } // ID vuoto
      ]
    };

    const validated = validateClassificationOutput(rawOutput, allowedCategories);
    expect(validated.suggestions).toHaveLength(2);
    expect(validated.suggestions.map(s => s.category_id)).toEqual(['cat-verde', 'cat-rifiuti']);
  });

  // --------------------------------------------------------------------------
  // 3. Risposta malformata (Invalid schema handling)
  // --------------------------------------------------------------------------
  it('rifiuta una risposta malformata sollevando InvalidProviderOutputError', () => {
    // Non oggetto
    expect(() => validateClassificationOutput(null, allowedCategories)).toThrow(InvalidProviderOutputError);
    expect(() => validateClassificationOutput('stringa invece di json', allowedCategories)).toThrow(InvalidProviderOutputError);

    // model_version mancante o vuoto
    expect(() => validateClassificationOutput({ model_version: '', suggestions: [] }, allowedCategories))
      .toThrow(InvalidProviderOutputError);

    // suggestions non array
    expect(() => validateClassificationOutput({ model_version: 'v1', suggestions: 'non un array' }, allowedCategories))
      .toThrow(InvalidProviderOutputError);
  });

  // --------------------------------------------------------------------------
  // 4. Nessun suggerimento (Empty suggestions array does not block publication)
  // --------------------------------------------------------------------------
  it('accetta array di suggerimenti vuoto senza bloccare la pubblicazione (T07)', async () => {
    const rawOutput = {
      model_version: 'civic-v1',
      suggestions: []
    };

    const validated = validateClassificationOutput(rawOutput, allowedCategories);
    expect(validated.suggestions).toEqual([]);

    // Verifica che in pipeline un classificatore che non trova suggerimenti produca esito SUCCEEDED
    // e non blocchi l'approvazione se testo e media sono conformi
    const mockClassification: IClassificationAdapter = {
      name: 'test-empty-classifier',
      isSimulated: true,
      classify: vi.fn().mockResolvedValue({
        model_version: 'clf-empty-v1',
        suggestions: []
      })
    };

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-101',
      revisione: 1,
      descrizione: 'Segnalazione senza parole chiave evidenti per categorie specifiche',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: []
    });

    mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

    const recordedAnalisiIa: AnalisiIaRecord = {};
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
      const tx: MockTransactionClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          { id: 'seg-101', revisione: 1, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
        ]),
        analisiIa: {
          upsert: vi.fn().mockImplementation((args: { create: AnalisiIaRecord; where: { chiave_idempotenza: { modulo: string } } }) => {
            if (args.where.chiave_idempotenza.modulo === 'CLASSIFICAZIONE') {
              Object.assign(recordedAnalisiIa, args.create);
            }
            return { id: 'an-class-1' };
          })
        },
        suggerimentoCategoria: {
          upsert: vi.fn()
        },
        segnalazione: {
          update: vi.fn()
        },
        eventoStato: {
          create: vi.fn()
        },
        auditEvento: {
          create: vi.fn()
        }
      };
      return cb(tx);
    });

    const result = await eseguiAnalisiSegnalazione('seg-101', 1, {
      classification: mockClassification,
      moderation: new DeterministicMockModerationAdapter(),
      metadata: new DeterministicMockMetadataAdapter(),
      coherence: new DeterministicMockCoherenceAdapter()
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.finalState).toBe('APPROVATA');
    expect(recordedAnalisiIa.esito).toBe('0_SUGGERIMENTI');
    expect(recordedAnalisiIa.stato_esecuzione).toBe('SUCCEEDED');
  });

  // --------------------------------------------------------------------------
  // 5. Indisponibilità del classificatore (Offline/Error does not block publication)
  // --------------------------------------------------------------------------
  it('in caso di indisponibilità o timeout del classificatore, registra FAILED in AnalisiIa senza bloccare la segnalazione', async () => {
    const failingClassifier: IClassificationAdapter = {
      name: 'test-failing-classifier',
      isSimulated: false,
      classify: vi.fn().mockRejectedValue(new Error('Network connection timeout to classifier provider'))
    };

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-102',
      revisione: 1,
      descrizione: 'Segnalazione con classificatore offline',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: []
    });

    mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

    const recordedClassError: AnalisiIaRecord = {};
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
      const tx: MockTransactionClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          { id: 'seg-102', revisione: 1, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
        ]),
        analisiIa: {
          upsert: vi.fn().mockImplementation((args: { create: AnalisiIaRecord; where: { chiave_idempotenza: { modulo: string } } }) => {
            if (args.where.chiave_idempotenza.modulo === 'CLASSIFICAZIONE') {
              Object.assign(recordedClassError, args.create);
            }
            return { id: 'an-class-err' };
          })
        },
        suggerimentoCategoria: {
          upsert: vi.fn()
        },
        segnalazione: {
          update: vi.fn()
        },
        eventoStato: {
          create: vi.fn()
        },
        auditEvento: {
          create: vi.fn()
        }
      };
      return cb(tx);
    });

    const result = await eseguiAnalisiSegnalazione('seg-102', 1, {
      classification: failingClassifier,
      moderation: new DeterministicMockModerationAdapter(),
      metadata: new DeterministicMockMetadataAdapter(),
      coherence: new DeterministicMockCoherenceAdapter()
    });

    // L'indisponibilità del solo classificatore NON blocca l'approvazione del report se la moderazione è conforme
    expect(result.status).toBe('COMPLETED');
    expect(result.finalState).toBe('APPROVATA');
    expect(recordedClassError.stato_esecuzione).toBe('FAILED');
    expect(recordedClassError.esito).toBe('FAILED');
    expect(recordedClassError.dettagli_json).toContain('Network connection timeout');
  });

  // --------------------------------------------------------------------------
  // 6. Mancata sovrascrittura delle decisioni del comitato (Human override preservation)
  // --------------------------------------------------------------------------
  it('non sovrascrive mai le decisioni del comitato né le categorie confermate (SKIPPED_HUMAN_OVERRIDE)', async () => {
    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-103',
      revisione: 1,
      descrizione: 'Segnalazione già visionata ed esaminata dal comitato',
      stato_moderazione: 'IN_REVISIONE', // L'umano ha già preso in carico / deciso
      stato_avanzamento: 'PRESA_IN_CARICO',
      media: []
    });

    mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

    let segUpdateCalled = false;
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
      const tx: MockTransactionClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          { id: 'seg-103', revisione: 1, stato_moderazione: 'IN_REVISIONE', stato_avanzamento: 'PRESA_IN_CARICO' }
        ]),
        analisiIa: {
          upsert: vi.fn().mockResolvedValue({ id: 'an-103' })
        },
        suggerimentoCategoria: {
          upsert: vi.fn()
        },
        segnalazione: {
          update: vi.fn().mockImplementation(() => {
            segUpdateCalled = true;
          })
        },
        eventoStato: {
          create: vi.fn()
        }
      };
      return cb(tx);
    });

    const result = await eseguiAnalisiSegnalazione('seg-103', 1, {
      classification: new DeterministicMockClassificationAdapter(),
      moderation: new DeterministicMockModerationAdapter(),
      metadata: new DeterministicMockMetadataAdapter(),
      coherence: new DeterministicMockCoherenceAdapter()
    });

    // Preserva intatta la decisione umana
    expect(result.status).toBe('SKIPPED_HUMAN_OVERRIDE');
    expect(result.finalState).toBe('IN_REVISIONE');
    expect(segUpdateCalled).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 7. Selezione esplicita mock/reale e nessun fallback silenzioso dal reale al mock
  // --------------------------------------------------------------------------
  it('solleva errore esplicito se viene selezionato l adapter reale senza credenziali e NON esegue fallback silenzioso al mock', async () => {
    const realAdapter = new ProviderClassificationAdapter({ apiKey: '', endpointUrl: '' });
    expect(realAdapter.isSimulated).toBe(false);

    await expect(
      realAdapter.classify({
        text: 'Buca in strada',
        allowed_categories: allowedCategories
      })
    ).rejects.toThrow(MissingProviderCredentialError);

    // Il mock deterministico invece ha isSimulated = true ed è esplicitamente dedicato alla CI
    const mockAdapter = new DeterministicMockClassificationAdapter();
    expect(mockAdapter.isSimulated).toBe(true);
    const mockRes = await mockAdapter.classify({
      text: 'Buca pericolosa nell asfalto della strada',
      allowed_categories: allowedCategories
    });
    expect(mockRes.suggestions.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // 8. Gestione risultati obsoleti (Revision changed during inference -> OBSOLETE)
  // --------------------------------------------------------------------------
  it('registra stato OBSOLETE e non memorizza suggerimenti se la revisione della segnalazione è avanzata', async () => {
    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-104',
      revisione: 1, // Letta a rev 1
      descrizione: 'Segnalazione in corso di modifica concorrente',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: []
    });

    mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

    const recordedObsoleteClass: AnalisiIaRecord = {};
    let suggestionsSaved = false;

    mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
      const tx: MockTransactionClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          // Nel frattempo un utente ha modificato la segnalazione a revisione 2!
          { id: 'seg-104', revisione: 2, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
        ]),
        analisiIa: {
          upsert: vi.fn().mockImplementation((args: { create: AnalisiIaRecord; where: { chiave_idempotenza: { modulo: string } } }) => {
            if (args.where.chiave_idempotenza.modulo === 'CLASSIFICAZIONE') {
              Object.assign(recordedObsoleteClass, args.create);
            }
            return { id: 'an-obsolete-1' };
          })
        },
        suggerimentoCategoria: {
          upsert: vi.fn().mockImplementation(() => {
            suggestionsSaved = true;
          })
        }
      };
      return cb(tx);
    });

    const result = await eseguiAnalisiSegnalazione('seg-104', 1, {
      classification: new DeterministicMockClassificationAdapter(),
      moderation: new DeterministicMockModerationAdapter(),
      metadata: new DeterministicMockMetadataAdapter(),
      coherence: new DeterministicMockCoherenceAdapter()
    });

    expect(result.status).toBe('OBSOLETE');
    expect(recordedObsoleteClass.stato_esecuzione).toBe('OBSOLETE');
    expect(suggestionsSaved).toBe(false); // Nessun suggerimento obsoleto salvato
  });
});
