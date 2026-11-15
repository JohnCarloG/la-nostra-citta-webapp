import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateCoherenceOutput,
  InvalidProviderOutputError
} from '../../src/lib/ia/validators';
import {
  ICoherenceAdapter,
  AllowedCategory
} from '../../src/lib/ia/types';
import {
  DeterministicMockCoherenceAdapter,
  DeterministicMockModerationAdapter,
  DeterministicMockClassificationAdapter,
  DeterministicMockMetadataAdapter
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
  };
  suggerimentoCategoria: {
    upsert: ReturnType<typeof vi.fn>;
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
  segnalazione: {
    update: ReturnType<typeof vi.fn>;
  };
  eventoStato: {
    create: ReturnType<typeof vi.fn>;
  };
  auditEvento: {
    create: ReturnType<typeof vi.fn>;
  };
}

interface AnalisiIaRecord {
  modulo?: string;
  stato_esecuzione?: string;
  esito?: string;
  punteggio?: number;
  dettagli_json?: string;
}

// Mock isolato del client Prisma per test unitari
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
      upsert: vi.fn()
    },
    suggerimentoCategoria: {
      upsert: vi.fn()
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

const mockStorageGetObject = vi.fn().mockResolvedValue(Buffer.from('fake-image-bytes'));
vi.mock('../../src/lib/storage', () => ({
  getStorageProvider: vi.fn(() => ({
    getObject: mockStorageGetObject
  }))
}));

const mockPrisma = prisma as unknown as MockPrisma;

describe('Unit Tests: RF10 — Verifica Coerenza Visivo-Testuale (Parti Indipendenti)', () => {
  const allowedCategories: AllowedCategory[] = [
    { id: 'cat-strade', codice: 'STRADE', nome: 'Manutenzione Stradale' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageGetObject.mockResolvedValue(Buffer.from('fake-image-bytes'));
  });

  // --------------------------------------------------------------------------
  // 1. Validazione Contratto di Output (validateCoherenceOutput)
  // --------------------------------------------------------------------------
  describe('Validatore Contratto di Output (validateCoherenceOutput)', () => {
    it('accetta tutti i verdetti ammessi (CONSISTENT, UNCERTAIN, INCONSISTENT, UNSUPPORTED)', () => {
      const verdetti = ['CONSISTENT', 'UNCERTAIN', 'INCONSISTENT', 'UNSUPPORTED'] as const;
      for (const v of verdetti) {
        const out = validateCoherenceOutput({
          verdict: v,
          reasons: [`Motivazione per ${v}`],
          optional_score: 0.85,
          model_version: 'vlm-v1'
        });
        expect(out.verdict).toBe(v);
        expect(out.reasons).toEqual([`Motivazione per ${v}`]);
        expect(out.optional_score).toBe(0.85);
        expect(out.model_version).toBe('vlm-v1');
      }
    });

    it('accetta output senza optional_score', () => {
      const out = validateCoherenceOutput({
        verdict: 'CONSISTENT',
        reasons: ['Nessuna anomalia riscontrata'],
        model_version: 'vlm-v1'
      });
      expect(out.optional_score).toBeUndefined();
    });

    it('rifiuta optional_score non compreso tra 0 e 1 o non numerico', () => {
      expect(() =>
        validateCoherenceOutput({
          verdict: 'CONSISTENT',
          reasons: ['OK'],
          optional_score: 1.5, // > 1
          model_version: 'v1'
        })
      ).toThrow(InvalidProviderOutputError);

      expect(() =>
        validateCoherenceOutput({
          verdict: 'CONSISTENT',
          reasons: ['OK'],
          optional_score: -0.1, // < 0
          model_version: 'v1'
        })
      ).toThrow(InvalidProviderOutputError);

      expect(() =>
        validateCoherenceOutput({
          verdict: 'CONSISTENT',
          reasons: ['OK'],
          optional_score: NaN,
          model_version: 'v1'
        })
      ).toThrow(InvalidProviderOutputError);
    });

    it('rifiuta payload malformati, nulli o privi di model_version valida', () => {
      expect(() => validateCoherenceOutput(null)).toThrow(InvalidProviderOutputError);
      expect(() => validateCoherenceOutput({})).toThrow(InvalidProviderOutputError);
      expect(() =>
        validateCoherenceOutput({
          verdict: 'CONSISTENT',
          reasons: 'non un array',
          model_version: 'v1'
        })
      ).toThrow(InvalidProviderOutputError);
      expect(() =>
        validateCoherenceOutput({
          verdict: 'CONSISTENT',
          reasons: ['ok'],
          model_version: '   ' // vuoto
        })
      ).toThrow(InvalidProviderOutputError);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Gestione Formati Multimediali Non Supportati (Video / Formati non conformi)
  // --------------------------------------------------------------------------
  describe('Gestione Formati Non Supportati (Video e Mime non gestiti)', () => {
    it('restituisce verdetto UNSUPPORTED per formati video indirizzando a revisione umana', async () => {
      const adapter = new DeterministicMockCoherenceAdapter();
      const res = await adapter.check({
        text: 'Video del marciapiede danneggiato',
        media_id: 'med-video-1',
        media_type: 'VIDEO',
        private_image_or_frames: Buffer.from('mp4-bytes')
      });

      expect(res.verdict).toBe('UNSUPPORTED');
      expect(res.reasons.some(r => r.includes('non supportata'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Discrepanza Visiva: Nessuna Equiparazione a Frode (IN_REVISIONE, mai RIFIUTATA)
  // --------------------------------------------------------------------------
  describe('Discrepanza Visivo-Testuale (Nessuna equiparazione a frode)', () => {
    it('un verdetto INCONSISTENT o UNCERTAIN indirizza a IN_REVISIONE per il comitato senza considerare il cittadino fraudolento né rifiutare la segnalazione', async () => {
      const mockCoherence: ICoherenceAdapter = {
        name: 'test-inconsistent-adapter',
        isSimulated: true,
        check: vi.fn().mockResolvedValue({
          verdict: 'INCONSISTENT',
          reasons: ['Discrepanza tra la descrizione (buca stradale) e il media allegato (foglio bianco)'],
          optional_score: 0.2,
          model_version: 'test-vlm-v1'
        })
      };

      mockPrisma.segnalazione.findUnique.mockResolvedValue({
        id: 'seg-discrepante-1',
        revisione: 1,
        descrizione: 'Buca profonda in strada',
        stato_moderazione: 'PENDENTE',
        stato_avanzamento: 'RICEVUTA',
        media: [
          {
            id: 'med-1',
            storage_key: 'uploads/foto-1.jpg',
            sha256: 'hash-med-1',
            tipo: 'FOTO',
            mime: 'image/jpeg'
          }
        ]
      });

      mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

      let updatedStatoModerazione: string | undefined;
      let recordedMotivazione: string | undefined;
      const recordedAnalisiIa: Record<string, AnalisiIaRecord> = {};

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
        const tx: MockTransactionClient = {
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'seg-discrepante-1', revisione: 1, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
          ]),
          analisiIa: {
            upsert: vi.fn().mockImplementation((args: { create: AnalisiIaRecord; where: { chiave_idempotenza: { modulo: string } } }) => {
              recordedAnalisiIa[args.where.chiave_idempotenza.modulo] = args.create;
              return { id: `an-${args.where.chiave_idempotenza.modulo}` };
            })
          },
          suggerimentoCategoria: {
            upsert: vi.fn()
          },
          segnalazione: {
            update: vi.fn().mockImplementation((args: { data: { stato_moderazione: string } }) => {
              updatedStatoModerazione = args.data.stato_moderazione;
            })
          },
          eventoStato: {
            create: vi.fn().mockImplementation((args: { data: { motivazione: string } }) => {
              recordedMotivazione = args.data.motivazione;
            })
          },
          auditEvento: {
            create: vi.fn()
          }
        };
        return cb(tx);
      });

      const result = await eseguiAnalisiSegnalazione('seg-discrepante-1', 1, {
        coherence: mockCoherence,
        moderation: new DeterministicMockModerationAdapter(),
        metadata: new DeterministicMockMetadataAdapter(),
        classification: new DeterministicMockClassificationAdapter()
      });

      expect(result.status).toBe('COMPLETED');
      // La discrepanza NON equivale a frode: stato IN_REVISIONE per controllo umano, MAI RIFIUTATA
      expect(result.finalState).toBe('IN_REVISIONE');
      expect(updatedStatoModerazione).toBe('IN_REVISIONE');
      expect(recordedMotivazione).not.toContain('frode');
      expect(recordedMotivazione).not.toContain('truffa');
      expect(recordedMotivazione).toContain('coerenza media non garantita');

      // Verifica che in AnalisiIa sia registrato il verdetto del modulo COERENZA
      expect(recordedAnalisiIa['COERENZA']?.esito).toBe('INCONSISTENT');
      expect(recordedAnalisiIa['COERENZA']?.stato_esecuzione).toBe('SUCCEEDED');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Gestione Timeout ed Errori Provider (Fail-safe verso IN_REVISIONE)
  // --------------------------------------------------------------------------
  describe('Gestione Errori e Timeout del Modulo Coerenza', () => {
    it('in caso di timeout o errore del modulo coerenza, registra FAILED in AnalisiIa e instrada a IN_REVISIONE', async () => {
      const failingCoherence: ICoherenceAdapter = {
        name: 'test-failing-coherence',
        isSimulated: false,
        check: vi.fn().mockRejectedValue(new Error('Timeout richiesta coerenza visiva superato (5000ms)'))
      };

      mockPrisma.segnalazione.findUnique.mockResolvedValue({
        id: 'seg-timeout-1',
        revisione: 1,
        descrizione: 'Segnalazione con timeout media',
        stato_moderazione: 'PENDENTE',
        stato_avanzamento: 'RICEVUTA',
        media: [
          {
            id: 'med-timeout',
            storage_key: 'uploads/foto-timeout.jpg',
            sha256: 'hash-timeout',
            tipo: 'FOTO',
            mime: 'image/jpeg'
          }
        ]
      });

      mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

      const recordedAnalisi: Record<string, AnalisiIaRecord> = {};
      let finalStato: string | undefined;

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
        const tx: MockTransactionClient = {
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'seg-timeout-1', revisione: 1, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
          ]),
          analisiIa: {
            upsert: vi.fn().mockImplementation((args: { create: AnalisiIaRecord; where: { chiave_idempotenza: { modulo: string } } }) => {
              recordedAnalisi[args.where.chiave_idempotenza.modulo] = args.create;
              return { id: `an-${args.where.chiave_idempotenza.modulo}` };
            })
          },
          suggerimentoCategoria: {
            upsert: vi.fn()
          },
          segnalazione: {
            update: vi.fn().mockImplementation((args: { data: { stato_moderazione: string } }) => {
              finalStato = args.data.stato_moderazione;
            })
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

      const result = await eseguiAnalisiSegnalazione('seg-timeout-1', 1, {
        coherence: failingCoherence,
        moderation: new DeterministicMockModerationAdapter(),
        metadata: new DeterministicMockMetadataAdapter(),
        classification: new DeterministicMockClassificationAdapter()
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.finalState).toBe('IN_REVISIONE');
      expect(finalStato).toBe('IN_REVISIONE');
      expect(recordedAnalisi['COERENZA']?.stato_esecuzione).toBe('FAILED');
      expect(recordedAnalisi['COERENZA']?.dettagli_json).toContain('Timeout richiesta coerenza visiva');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Accesso Autorizzato ai Media Privati e Tolleranza a Errori Storage
  // --------------------------------------------------------------------------
  describe('Accesso Autorizzato ai Media Privati', () => {
    it('in modalità reale, se il private storage non consente la lettura del buffer, registra errore e instrada a IN_REVISIONE', async () => {
      mockStorageGetObject.mockRejectedValueOnce(new Error('Permesso negato sul bucket storage privato'));

      mockPrisma.segnalazione.findUnique.mockResolvedValue({
        id: 'seg-storage-err-1',
        revisione: 1,
        descrizione: 'Segnalazione con file storage corrotto o inaccessibile',
        stato_moderazione: 'PENDENTE',
        stato_avanzamento: 'RICEVUTA',
        media: [
          {
            id: 'med-priv-1',
            storage_key: 'uploads/priv-file.jpg',
            sha256: 'hash-priv-1',
            tipo: 'FOTO',
            mime: 'image/jpeg'
          }
        ]
      });

      mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

      let finalStato: string | undefined;
      const recordedAnalisi: Record<string, AnalisiIaRecord> = {};

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
        const tx: MockTransactionClient = {
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'seg-storage-err-1', revisione: 1, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
          ]),
          analisiIa: {
            upsert: vi.fn().mockImplementation((args: { create: AnalisiIaRecord; where: { chiave_idempotenza: { modulo: string } } }) => {
              recordedAnalisi[args.where.chiave_idempotenza.modulo] = args.create;
              return { id: `an-${args.where.chiave_idempotenza.modulo}` };
            })
          },
          suggerimentoCategoria: {
            upsert: vi.fn()
          },
          segnalazione: {
            update: vi.fn().mockImplementation((args: { data: { stato_moderazione: string } }) => {
              finalStato = args.data.stato_moderazione;
            })
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

      const result = await eseguiAnalisiSegnalazione(
        'seg-storage-err-1',
        1,
        {
          coherence: new DeterministicMockCoherenceAdapter(),
          moderation: new DeterministicMockModerationAdapter(),
          metadata: new DeterministicMockMetadataAdapter(),
          classification: new DeterministicMockClassificationAdapter()
        },
        { adapterMode: 'real' }
      );

      expect(result.finalState).toBe('IN_REVISIONE');
      expect(finalStato).toBe('IN_REVISIONE');
      expect(recordedAnalisi['COERENZA']?.stato_esecuzione).toBe('FAILED');
      expect(recordedAnalisi['COERENZA']?.dettagli_json).toContain('Accesso storage privato fallito');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Protezione da Risultati Obsoleti (Revision concurrency)
  // --------------------------------------------------------------------------
  describe('Protezione da Risultati Obsoleti (RF10)', () => {
    it('se la revisione avanza mentre la coerenza visiva è in elaborazione, salva COERENZA come OBSOLETE senza toccare lo stato', async () => {
      mockPrisma.segnalazione.findUnique.mockResolvedValue({
        id: 'seg-rev-obsoleta',
        revisione: 1,
        descrizione: 'Segnalazione in modifica concorrente',
        stato_moderazione: 'PENDENTE',
        stato_avanzamento: 'RICEVUTA',
        media: [
          {
            id: 'med-obs',
            storage_key: 'uploads/foto-obs.jpg',
            sha256: 'hash-obs',
            tipo: 'FOTO',
            mime: 'image/jpeg'
          }
        ]
      });

      mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

      const recordedAnalisi: Record<string, AnalisiIaRecord> = {};
      let updateCalled = false;

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
        const tx: MockTransactionClient = {
          $queryRaw: vi.fn().mockResolvedValue([
            // La segnalazione ora è a revisione 2
            { id: 'seg-rev-obsoleta', revisione: 2, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
          ]),
          analisiIa: {
            upsert: vi.fn().mockImplementation((args: { create: AnalisiIaRecord; where: { chiave_idempotenza: { modulo: string } } }) => {
              recordedAnalisi[args.where.chiave_idempotenza.modulo] = args.create;
              return { id: `an-${args.where.chiave_idempotenza.modulo}` };
            })
          },
          suggerimentoCategoria: {
            upsert: vi.fn()
          },
          segnalazione: {
            update: vi.fn().mockImplementation(() => {
              updateCalled = true;
            })
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

      const result = await eseguiAnalisiSegnalazione('seg-rev-obsoleta', 1, {
        coherence: new DeterministicMockCoherenceAdapter(),
        moderation: new DeterministicMockModerationAdapter(),
        metadata: new DeterministicMockMetadataAdapter(),
        classification: new DeterministicMockClassificationAdapter()
      });

      expect(result.status).toBe('OBSOLETE');
      expect(updateCalled).toBe(false);
      expect(recordedAnalisi['COERENZA']?.stato_esecuzione).toBe('OBSOLETE');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Preservazione delle Decisioni del Comitato (Human Override)
  // --------------------------------------------------------------------------
  describe('Preservazione delle Decisioni del Comitato (Human Override)', () => {
    it('se il comitato ha già valutato la segnalazione, i risultati di coerenza vengono archiviati ma lo stato non viene sovrascritto', async () => {
      mockPrisma.segnalazione.findUnique.mockResolvedValue({
        id: 'seg-human-decided',
        revisione: 1,
        descrizione: 'Segnalazione già deliberata dal comitato',
        stato_moderazione: 'APPROVATA', // Il comitato ha già approvato
        stato_avanzamento: 'IN_CORSO',
        media: [
          {
            id: 'med-human',
            storage_key: 'uploads/foto-human.jpg',
            sha256: 'hash-human',
            tipo: 'FOTO',
            mime: 'image/jpeg'
          }
        ]
      });

      mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

      let updateCalled = false;
      const recordedAnalisi: Record<string, AnalisiIaRecord> = {};

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
        const tx: MockTransactionClient = {
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'seg-human-decided', revisione: 1, stato_moderazione: 'APPROVATA', stato_avanzamento: 'IN_CORSO' }
          ]),
          analisiIa: {
            upsert: vi.fn().mockImplementation((args: { create: AnalisiIaRecord; where: { chiave_idempotenza: { modulo: string } } }) => {
              recordedAnalisi[args.where.chiave_idempotenza.modulo] = args.create;
              return { id: `an-${args.where.chiave_idempotenza.modulo}` };
            })
          },
          suggerimentoCategoria: {
            upsert: vi.fn()
          },
          segnalazione: {
            update: vi.fn().mockImplementation(() => {
              updateCalled = true;
            })
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

      const result = await eseguiAnalisiSegnalazione('seg-human-decided', 1, {
        coherence: new DeterministicMockCoherenceAdapter(),
        moderation: new DeterministicMockModerationAdapter(),
        metadata: new DeterministicMockMetadataAdapter(),
        classification: new DeterministicMockClassificationAdapter()
      });

      expect(result.status).toBe('SKIPPED_HUMAN_OVERRIDE');
      expect(result.finalState).toBe('APPROVATA');
      expect(updateCalled).toBe(false);
      // I dati di audit restano comunque tracciati in AnalisiIa
      expect(recordedAnalisi['COERENZA']?.stato_esecuzione).toBe('SUCCEEDED');
    });
  });

  // --------------------------------------------------------------------------
  // 8. Nessuna Pubblicazione Automatica su Risultati Simulati (Safety Gate)
  // --------------------------------------------------------------------------
  describe('Nessuna Pubblicazione Automatica su Risultati Simulati', () => {
    it('in modalità reale, se il modulo di coerenza visiva è simulato (isSimulated = true), non autorizza APPROVATA ma invia a IN_REVISIONE', async () => {
      mockPrisma.segnalazione.findUnique.mockResolvedValue({
        id: 'seg-sim-real-test',
        revisione: 1,
        descrizione: 'Segnalazione perfetta ma verificata con modulo coerenza simulato',
        stato_moderazione: 'PENDENTE',
        stato_avanzamento: 'RICEVUTA',
        media: [
          {
            id: 'med-sim',
            storage_key: 'uploads/foto-sim.jpg',
            sha256: 'hash-sim',
            tipo: 'FOTO',
            mime: 'image/jpeg'
          }
        ]
      });

      mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

      let finalStato: string | undefined;
      let motivazione: string | undefined;

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
        const tx: MockTransactionClient = {
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'seg-sim-real-test', revisione: 1, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
          ]),
          analisiIa: {
            upsert: vi.fn().mockResolvedValue({ id: 'an-sim' })
          },
          suggerimentoCategoria: {
            upsert: vi.fn()
          },
          segnalazione: {
            update: vi.fn().mockImplementation((args: { data: { stato_moderazione: string } }) => {
              finalStato = args.data.stato_moderazione;
            })
          },
          eventoStato: {
            create: vi.fn().mockImplementation((args: { data: { motivazione: string } }) => {
              motivazione = args.data.motivazione;
            })
          },
          auditEvento: {
            create: vi.fn()
          }
        };
        return cb(tx);
      });

      // Esecuzione con adapterMode: 'real' e coherence adapter simulato
      const result = await eseguiAnalisiSegnalazione(
        'seg-sim-real-test',
        1,
        {
          coherence: new DeterministicMockCoherenceAdapter(), // isSimulated = true
          moderation: {
            name: 'real-mock-moderation',
            isSimulated: false, // moderazione reale conforme
            moderate: vi.fn().mockResolvedValue({
              verdict: 'ALLOW',
              reasons: ['OK'],
              model_version: 'mod-real-v1',
              policy_version: 'p1'
            })
          }
        },
        { adapterMode: 'real' }
      );

      // Sicurezza garantita: un modulo visivo simulato NON pubblica mai automaticamente la segnalazione
      expect(result.status).toBe('COMPLETED');
      expect(result.finalState).toBe('IN_REVISIONE');
      expect(finalStato).toBe('IN_REVISIONE');
      expect(motivazione).toContain('pubblicazione automatica non consentita con moduli di moderazione o coerenza visiva simulati');
    });

    it('quando allowSimulatedApproval è impostato a false, la simulazione non può mai approvare automaticamente', async () => {
      mockPrisma.segnalazione.findUnique.mockResolvedValue({
        id: 'seg-no-sim-approval',
        revisione: 1,
        descrizione: 'Segnalazione con mock ma blocco simulazione attivo',
        stato_moderazione: 'PENDENTE',
        stato_avanzamento: 'RICEVUTA',
        media: []
      });

      mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

      let finalStato: string | undefined;

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
        const tx: MockTransactionClient = {
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'seg-no-sim-approval', revisione: 1, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
          ]),
          analisiIa: {
            upsert: vi.fn().mockResolvedValue({ id: 'an-1' })
          },
          suggerimentoCategoria: {
            upsert: vi.fn()
          },
          segnalazione: {
            update: vi.fn().mockImplementation((args: { data: { stato_moderazione: string } }) => {
              finalStato = args.data.stato_moderazione;
            })
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

      const result = await eseguiAnalisiSegnalazione(
        'seg-no-sim-approval',
        1,
        {
          moderation: new DeterministicMockModerationAdapter(),
          coherence: new DeterministicMockCoherenceAdapter()
        },
        { allowSimulatedApproval: false }
      );

      expect(result.finalState).toBe('IN_REVISIONE');
      expect(finalStato).toBe('IN_REVISIONE');
    });
  });
});
