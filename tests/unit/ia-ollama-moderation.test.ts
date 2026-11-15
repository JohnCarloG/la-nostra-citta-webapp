import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ollamaAdapters } from '../../src/lib/ia/ollama';
import { eseguiAnalisiSegnalazione, PipelineExecutionResult } from '../../src/lib/ia/pipeline';
import { processSingleOutboxJob } from '../../src/lib/ia/worker';
import { prisma } from '../../src/lib/db';
import type { AllowedCategory, ICoherenceAdapter } from '../../src/lib/ia/types';

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
  outbox: {
    update: ReturnType<typeof vi.fn>;
  };
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
}

interface MockTransactionClient {
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
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
  outbox: {
    update: ReturnType<typeof vi.fn>;
  };
}

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
    outbox: {
      update: vi.fn()
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
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
const model = 'qwen3-vl:2b-instruct';

function fakeTransport(result: unknown, modelResp = model) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      model: modelResp,
      done: true,
      message: { content: JSON.stringify(result) }
    })
  );
}

describe('RF07: Pipeline Moderazione Testuale con Ollama Locale e Trasporto Simulato', () => {
  const allowedCategories: AllowedCategory[] = [
    { id: 'cat-viabilita', codice: 'VIAB', nome: 'Viabilità' }
  ];

  let recordedStatoModerazione: string | null = null;
  let recordedMotivazione: string | null = null;
  let recordedAnalisiIa: Record<string, { esito?: string; stato_esecuzione?: string; dettagli_json?: string }> = {};
  let currentOutboxSegnalazioneId = 'seg-worker-no-media';

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageGetObject.mockResolvedValue(Buffer.from('fake-image-bytes'));
    recordedStatoModerazione = null;
    recordedMotivazione = null;
    recordedAnalisiIa = {};
    currentOutboxSegnalazioneId = 'seg-worker-no-media';

    mockPrisma.categoria.findMany.mockResolvedValue(allowedCategories);

    mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
      const tx: MockTransactionClient = {
        $queryRaw: vi.fn().mockImplementation((query: unknown) => {
          const sql = String(query);
          if (sql.includes('FROM Outbox') || sql.includes('from Outbox') || sql.includes('outbox')) {
            return Promise.resolve([
              {
                id: 'outbox-job-1',
                segnalazione_id: currentOutboxSegnalazioneId,
                revisione: 1,
                tipo_evento: 'SEGNALAZIONE_CREATA',
                payload_json: JSON.stringify({ id: currentOutboxSegnalazioneId }),
                tentativi: 0
              }
            ]);
          }
          return Promise.resolve([
            { id: currentOutboxSegnalazioneId, revisione: 1, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
          ]);
        }),
        $executeRaw: vi.fn().mockResolvedValue(1),
        analisiIa: {
          upsert: vi.fn().mockImplementation((args: { create: { modulo: string; esito: string; stato_esecuzione: string; dettagli_json: string } }) => {
            recordedAnalisiIa[args.create.modulo] = args.create;
            return { id: `an-${args.create.modulo.toLowerCase()}` };
          })
        },
        suggerimentoCategoria: {
          upsert: vi.fn().mockResolvedValue({ id: 'sug-1' })
        },
        segnalazione: {
          update: vi.fn().mockImplementation((args: { data: { stato_moderazione: string } }) => {
            recordedStatoModerazione = args.data.stato_moderazione;
            return { id: 'seg-test-1', stato_moderazione: args.data.stato_moderazione };
          })
        },
        eventoStato: {
          create: vi.fn().mockImplementation((args: { data: { motivazione: string } }) => {
            recordedMotivazione = args.data.motivazione;
            return { id: 'ev-1' };
          })
        },
        auditEvento: {
          create: vi.fn().mockResolvedValue({ id: 'aud-1' })
        },
        outbox: {
          update: vi.fn().mockResolvedValue({ id: 'outbox-job-1' })
        }
      };
      return cb(tx);
    });
  });

  it('1. Moderazione invia solo testo al client Ollama (images undefined)', async () => {
    const mockHttp = fakeTransport({
      verdict: 'ALLOW',
      reasons: ['Segnalazione di manutenzione stradale idonea']
    });

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-text-only',
      revisione: 1,
      descrizione: 'Buca profonda in mezzo all incrocio via Torino',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: []
    });

    const adapters = ollamaAdapters(model, mockHttp);
    const result = await eseguiAnalisiSegnalazione('seg-text-only', 1, adapters, { adapterMode: 'ollama' });

    expect(result.status).toBe('COMPLETED');
    expect(mockHttp).toHaveBeenCalled();

    const [url, init] = mockHttp.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    const parsedBody = JSON.parse(String(init?.body));
    expect(parsedBody.messages[1].images).toBeUndefined();
    expect(parsedBody.messages[0].content).toContain('moderatore civico');
  });

  it('2. RF07: Verdetto ALLOW senza media autorizzati READY instrada a IN_REVISIONE (allegato mancante/non valutabile, no frode)', async () => {
    const mockHttp = fakeTransport({
      verdict: 'ALLOW',
      reasons: ['Descrizione del problema stradale corretta ed esaustiva']
    });

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-allow-no-media',
      revisione: 1,
      descrizione: 'Asfalto ceduto pericolosamente all incrocio senza foto allegata',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: [] // Priva di allegati
    });

    const adapters = ollamaAdapters(model, mockHttp);
    const result = await eseguiAnalisiSegnalazione('seg-allow-no-media', 1, adapters, { adapterMode: 'ollama' });

    expect(result.status).toBe('COMPLETED');
    // Anche se il testo riceve ALLOW, l'assenza di media READY autorizzati NON autorizza APPROVATA
    expect(result.finalState).toBe('IN_REVISIONE');
    expect(recordedStatoModerazione).toBe('IN_REVISIONE');
    expect(recordedMotivazione).toContain('allegato multimediale mancante o non valutabile');
    // La motivazione deve indicare l'allegato mancante o non valutabile senza accusare di frode
    expect(recordedMotivazione).not.toContain('frode');
    expect(recordedMotivazione).not.toContain('truffa');
    expect(recordedMotivazione).not.toContain('inganno');
  });

  it('3. RF07: Verdetto ALLOW con allegati non in stato READY (es. QUARANTENA) instrada a IN_REVISIONE', async () => {
    const mockHttp = fakeTransport({
      verdict: 'ALLOW',
      reasons: ['Segnalazione valida']
    });

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-allow-quarantena',
      revisione: 1,
      descrizione: 'Tombino ostruito in via Larga',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: [
        {
          id: 'med-quar-1',
          segnalazione_id: 'seg-allow-quarantena',
          tipo: 'FOTO',
          mime: 'image/jpeg',
          byte_size: 1024,
          sha256: 'sha-quar',
          storage_key: 'uploads/quar.jpg',
          stato_file: 'QUARANTENA'
        }
      ]
    });

    const adapters = ollamaAdapters(model, mockHttp);
    const result = await eseguiAnalisiSegnalazione('seg-allow-quarantena', 1, adapters, { adapterMode: 'ollama' });

    expect(result.status).toBe('COMPLETED');
    expect(result.finalState).toBe('IN_REVISIONE');
    expect(recordedStatoModerazione).toBe('IN_REVISIONE');
    expect(recordedMotivazione).toContain('allegato multimediale mancante o non valutabile');
    expect(recordedMotivazione).not.toContain('frode');
  });

  it('4. RF07: Verdetto ALLOW con video non valutabile (UNSUPPORTED) instrada a IN_REVISIONE', async () => {
    const mockHttp = fakeTransport({
      verdict: 'ALLOW',
      reasons: ['Critica civica legittima all incuria del parco']
    });

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-allow-video',
      revisione: 1,
      descrizione: 'Parco pubblico abbandonato da mesi con erba alta e panchine distrutte',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: [
        {
          id: 'med-video-1',
          segnalazione_id: 'seg-allow-video',
          tipo: 'VIDEO',
          mime: 'video/mp4',
          byte_size: 2048,
          sha256: 'sha-video',
          storage_key: 'storage/video1.mp4',
          stato_file: 'READY'
        }
      ]
    });

    const adapters = ollamaAdapters(model, mockHttp);
    const result = await eseguiAnalisiSegnalazione('seg-allow-video', 1, adapters, { adapterMode: 'ollama' });

    expect(result.status).toBe('COMPLETED');
    // Video: revisione del comitato sempre richiesta
    expect(result.finalState).toBe('IN_REVISIONE');
    expect(recordedStatoModerazione).toBe('IN_REVISIONE');
    expect(recordedMotivazione).toContain('coerenza media non garantita o formato non supportato');
    expect(recordedAnalisiIa['MODERAZIONE']?.esito).toBe('ALLOW');
    expect(recordedAnalisiIa['COERENZA']?.esito).toBe('UNSUPPORTED');
  });

  it('5. RF07: Verdetto ALLOW con immagine coerente (CONSISTENT) in stato READY pubblica in APPROVATA', async () => {
    const mockHttp = fakeTransport({
      verdict: 'ALLOW',
      reasons: ['Segnalazione decoro urbano conforme']
    });

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-allow-approved',
      revisione: 1,
      descrizione: 'Cestino dei rifiuti divelto in piazza Duomo',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: [
        {
          id: 'med-img-1',
          segnalazione_id: 'seg-allow-approved',
          tipo: 'IMMAGINE',
          mime: 'image/jpeg',
          byte_size: 1024,
          sha256: 'sha-img',
          storage_key: 'storage/img1.jpg',
          stato_file: 'READY'
        }
      ]
    });

    const consistentCoherence: ICoherenceAdapter = {
      name: 'ollama-coherence',
      isSimulated: false,
      check: vi.fn().mockResolvedValue({
        verdict: 'CONSISTENT',
        reasons: ['Cestino visibile'],
        model_version: model
      })
    };

    const baseOllama = ollamaAdapters(model, mockHttp);
    const result = await eseguiAnalisiSegnalazione('seg-allow-approved', 1, {
      ...baseOllama,
      coherence: consistentCoherence
    }, { adapterMode: 'ollama' });

    expect(result.status).toBe('COMPLETED');
    expect(result.finalState).toBe('APPROVATA');
    expect(recordedStatoModerazione).toBe('APPROVATA');
    expect(recordedMotivazione).toContain('testo sicuro e coerenza dei media verificata');
  });

  it('6. RF07: Nel percorso del worker ordinario (processSingleOutboxJob), ALLOW senza media instrada a IN_REVISIONE', async () => {
    currentOutboxSegnalazioneId = 'seg-worker-no-media';
    const mockHttp = fakeTransport({
      verdict: 'ALLOW',
      reasons: ['Segnalazione valida']
    });

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-worker-no-media',
      revisione: 1,
      descrizione: 'Segnalazione elaborata dal worker outbox ordinario ma senza media allegati',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: []
    });

    const adapters = ollamaAdapters(model, mockHttp);
    const jobRes = await processSingleOutboxJob(adapters, { adapterMode: 'ollama' });

    expect(jobRes.outcome).toBe('SUCCESS');
    const details = jobRes.details as PipelineExecutionResult;
    expect(details.finalState).toBe('IN_REVISIONE');
    expect(recordedStatoModerazione).toBe('IN_REVISIONE');
    expect(recordedMotivazione).toContain('allegato multimediale mancante o non valutabile');
    expect(recordedMotivazione).not.toContain('frode');
  });

  it('6b. Worker ordinario (a): Adattatori dichiarati simulati (isSimulated = true) con esiti favorevoli NON pubblicano e vanno a IN_REVISIONE', async () => {
    currentOutboxSegnalazioneId = 'seg-worker-sim-favorable';

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-worker-sim-favorable',
      revisione: 1,
      descrizione: 'Buca profonda in carreggiata via Celoria',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: [
        {
          id: 'media-worker-1',
          segnalazione_id: 'seg-worker-sim-favorable',
          tipo: 'FOTO',
          storage_key: 'segnalazioni/foto-worker-1.jpg',
          sha256: 'hash-worker-1',
          stato_file: 'READY',
          creato_il: new Date()
        }
      ]
    });

    // Adattatori applicativi dichiarati esplicitamente SIMULATI (isSimulated = true)
    const simulatedAdapters = {
      moderation: {
        name: 'mock-simulated-moderation',
        isSimulated: true,
        async moderate() {
          return {
            verdict: 'ALLOW' as const,
            reasons: ['Testo apparentemente idoneo (mock)'],
            model_version: 'sim-mod-v1',
            policy_version: 'sim-policy-v1'
          };
        }
      },
      classification: {
        name: 'mock-simulated-classification',
        isSimulated: true,
        async classify() {
          return { suggestions: [], model_version: 'sim-clf-v1' };
        }
      },
      coherence: {
        name: 'mock-simulated-coherence',
        isSimulated: true,
        async check() {
          return {
            verdict: 'CONSISTENT' as const,
            reasons: ['Foto visivamente coerente (mock)'],
            optional_score: 0.99,
            model_version: 'sim-coh-v1'
          };
        }
      }
    };

    const jobRes = await processSingleOutboxJob(simulatedAdapters, { adapterMode: 'ollama' });

    expect(jobRes.outcome).toBe('SUCCESS');
    const details = jobRes.details as PipelineExecutionResult;
    // RF10: Adattatori simulati non possono autorizzare la pubblicazione automatica!
    expect(details.finalState).toBe('IN_REVISIONE');
    expect(recordedStatoModerazione).toBe('IN_REVISIONE');
    expect(recordedMotivazione).toContain('pubblicazione automatica non consentita con moduli di moderazione o coerenza visiva simulati');
  });

  it('6c. Worker ordinario (b): Adattatori dichiarati non simulati (isSimulated = false), trasporto HTTP mockato, ALLOW + immagine READY CONSISTENT -> APPROVATA', async () => {
    currentOutboxSegnalazioneId = 'seg-worker-real-approved';

    // Il mock del trasporto HTTP (fakeTransport) intercetta le chiamate di rete offline,
    // ma l'adattatore è reale (isSimulated = false, OllamaModerationAdapter / OllamaCoherenceAdapter).
    const mockHttp = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          model,
          done: true,
          message: { content: JSON.stringify({ verdict: 'ALLOW', reasons: ['Testo urbano corretto'] }) }
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          model,
          done: true,
          message: { content: JSON.stringify({ suggestions: [{ category_id: 'cat-viabilita' }] }) }
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          model,
          done: true,
          message: { content: JSON.stringify({ verdict: 'CONSISTENT', reason: 'Immagine coerente con il testo' }) }
        })
      );

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-worker-real-approved',
      revisione: 1,
      descrizione: 'Buca pericolosa segnalata con foto allegata',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: [
        {
          id: 'media-worker-real-1',
          segnalazione_id: 'seg-worker-real-approved',
          tipo: 'FOTO',
          storage_key: 'segnalazioni/foto-real.jpg',
          sha256: 'hash-real-1',
          stato_file: 'READY',
          creato_il: new Date()
        }
      ]
    });

    const realAdaptersWithMockTransport = ollamaAdapters(model, mockHttp);
    expect(realAdaptersWithMockTransport.moderation.isSimulated).toBe(false);
    expect(realAdaptersWithMockTransport.coherence.isSimulated).toBe(false);

    const jobRes = await processSingleOutboxJob(realAdaptersWithMockTransport, { adapterMode: 'ollama' });

    expect(jobRes.outcome).toBe('SUCCESS');
    const details = jobRes.details as PipelineExecutionResult;
    // Policy di progetto: testo ALLOW e immagine READY CONSISTENT -> APPROVATA
    expect(details.finalState).toBe('APPROVATA');
    expect(recordedStatoModerazione).toBe('APPROVATA');
    expect(recordedMotivazione).toContain('testo sicuro e coerenza dei media verificata');
  });

  it('6d. Worker ordinario: ALLOW con video (formato non valutabile per coerenza visiva) instrada a IN_REVISIONE', async () => {
    currentOutboxSegnalazioneId = 'seg-worker-video';

    const mockHttp = fakeTransport({
      verdict: 'ALLOW',
      reasons: ['Testo idoneo']
    });

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-worker-video',
      revisione: 1,
      descrizione: 'Segnalazione con allegato video MP4',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: [
        {
          id: 'media-video-1',
          segnalazione_id: 'seg-worker-video',
          tipo: 'VIDEO',
          storage_key: 'segnalazioni/video.mp4',
          sha256: 'hash-vid-1',
          stato_file: 'READY',
          creato_il: new Date()
        }
      ]
    });

    const adapters = ollamaAdapters(model, mockHttp);
    const jobRes = await processSingleOutboxJob(adapters, { adapterMode: 'ollama' });

    expect(jobRes.outcome).toBe('SUCCESS');
    const details = jobRes.details as PipelineExecutionResult;
    expect(details.finalState).toBe('IN_REVISIONE');
    expect(recordedStatoModerazione).toBe('IN_REVISIONE');
    expect(recordedMotivazione).toContain('coerenza media non garantita o formato non supportato');
  });

  it('6e. Worker ordinario con configurazione assente / modalità mock: non autorizza MAI APPROVATA e instrada a IN_REVISIONE', async () => {
    currentOutboxSegnalazioneId = 'seg-worker-default-mock';

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-worker-default-mock',
      revisione: 1,
      descrizione: 'Segnalazione elaborata dal worker senza adapterMode o con adapter mock',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: [
        {
          id: 'media-worker-default-1',
          segnalazione_id: 'seg-worker-default-mock',
          tipo: 'FOTO',
          storage_key: 'segnalazioni/foto-mock.jpg',
          sha256: 'hash-mock-1',
          stato_file: 'READY',
          creato_il: new Date()
        }
      ]
    });

    // Invocazione ordinaria del worker SENZA passare opzioni (configurazione assente/default mock)
    const jobRes = await processSingleOutboxJob();

    expect(jobRes.outcome).toBe('SUCCESS');
    const details = jobRes.details as PipelineExecutionResult;
    // RF10: Anche con configurazione assente o mock, il worker ordinario NON autorizza mai la pubblicazione!
    expect(details.finalState).toBe('IN_REVISIONE');
    expect(recordedStatoModerazione).toBe('IN_REVISIONE');
    expect(recordedMotivazione).toContain('pubblicazione automatica non consentita con moduli di moderazione o coerenza visiva simulati');
  });

  it('7. Verdetto REVIEW indirizza la segnalazione a IN_REVISIONE con motivazioni registrate', async () => {
    const mockHttp = fakeTransport({
      verdict: 'REVIEW',
      reasons: ['Descrizione ambigua che necessita di verifica del comitato civico']
    });

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-review-1',
      revisione: 1,
      descrizione: 'Qualcosa di strano nei pressi del palazzo giallo',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: []
    });

    const adapters = ollamaAdapters(model, mockHttp);
    const result = await eseguiAnalisiSegnalazione('seg-review-1', 1, adapters, { adapterMode: 'ollama' });

    expect(result.status).toBe('COMPLETED');
    expect(result.finalState).toBe('IN_REVISIONE');
    expect(recordedStatoModerazione).toBe('IN_REVISIONE');
    expect(recordedMotivazione).toContain('Richiesta revisione comitato per valutazione testo');
    expect(recordedMotivazione).toContain('Descrizione ambigua');
    expect(recordedAnalisiIa['MODERAZIONE']?.esito).toBe('REVIEW');
    expect(recordedAnalisiIa['MODERAZIONE']?.stato_esecuzione).toBe('SUCCEEDED');
  });

  it('8. Verdetto BLOCK rifiuta la segnalazione (stato RIFIUTATA)', async () => {
    const mockHttp = fakeTransport({
      verdict: 'BLOCK',
      reasons: ['Insulti personali gravi e ingiurie verso privati cittadini']
    });

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-block-1',
      revisione: 1,
      descrizione: 'Testo diffamatorio con insulti specifici contro Mario Rossi',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: []
    });

    const adapters = ollamaAdapters(model, mockHttp);
    const result = await eseguiAnalisiSegnalazione('seg-block-1', 1, adapters, { adapterMode: 'ollama' });

    expect(result.status).toBe('COMPLETED');
    expect(result.finalState).toBe('RIFIUTATA');
    expect(recordedStatoModerazione).toBe('RIFIUTATA');
    expect(recordedMotivazione).toContain('Rifiuto automatico di sistema per violazione policy testo');
    expect(recordedMotivazione).toContain('Insulti personali gravi');
    expect(recordedAnalisiIa['MODERAZIONE']?.esito).toBe('BLOCK');
  });

  it('9. Risposta non valida dal fornitore Ollama indirizza a IN_REVISIONE (fail-safe conservativo)', async () => {
    const mockHttp = fakeTransport({
      verdict: 'VALORE_INVENTATO',
      reasons: ['motivazione']
    });

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-invalid-resp',
      revisione: 1,
      descrizione: 'Segnalazione con risposta provider malformata',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: []
    });

    const adapters = ollamaAdapters(model, mockHttp);
    const result = await eseguiAnalisiSegnalazione('seg-invalid-resp', 1, adapters, { adapterMode: 'ollama' });

    expect(result.status).toBe('COMPLETED');
    expect(result.finalState).toBe('IN_REVISIONE');
    expect(recordedStatoModerazione).toBe('IN_REVISIONE');
    expect(recordedMotivazione).toContain('Richiesta revisione comitato per mancata risposta provider moderazione');
    expect(recordedAnalisiIa['MODERAZIONE']?.stato_esecuzione).toBe('FAILED');
  });

  it('10. Timeout della richiesta di moderazione indirizza a IN_REVISIONE', async () => {
    const mockHttp = vi.fn<typeof fetch>().mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    );

    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-timeout',
      revisione: 1,
      descrizione: 'Segnalazione con timeout del server Ollama',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: []
    });

    const adapters = ollamaAdapters(model, mockHttp);
    const result = await eseguiAnalisiSegnalazione('seg-timeout', 1, adapters, { adapterMode: 'ollama' });

    expect(result.status).toBe('COMPLETED');
    expect(result.finalState).toBe('IN_REVISIONE');
    expect(recordedStatoModerazione).toBe('IN_REVISIONE');
    expect(recordedMotivazione).toContain('Richiesta revisione comitato per mancata risposta provider moderazione');
    expect(recordedAnalisiIa['MODERAZIONE']?.stato_esecuzione).toBe('FAILED');
  });

  it('11. Revisione obsoleta (segnalazione.revisione > revisione) restituisce status OBSOLETE e non modifica il DB', async () => {
    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-obsolete',
      revisione: 2, // nel DB è già revisione 2
      descrizione: 'Testo già modificato dall utente',
      stato_moderazione: 'PENDENTE',
      stato_avanzamento: 'RICEVUTA',
      media: []
    });

    const mockHttp = fakeTransport({ verdict: 'ALLOW', reasons: ['ok'] });
    const adapters = ollamaAdapters(model, mockHttp);

    // Eseguiamo per la revisione 1 ormai superata
    const result = await eseguiAnalisiSegnalazione('seg-obsolete', 1, adapters, { adapterMode: 'ollama' });

    expect(result.status).toBe('OBSOLETE');
    expect(result.reason).toContain('Revisione superata');
    expect(mockHttp).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(recordedStatoModerazione).toBeNull();
  });

  it('12. Decisione umana del comitato già presa conserva l autorità umana (status SKIPPED_HUMAN_OVERRIDE)', async () => {
    mockPrisma.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-human-override',
      revisione: 1,
      descrizione: 'Segnalazione già valutata dal comitato',
      stato_moderazione: 'APPROVATA', // Il comitato ha già deciso
      stato_avanzamento: 'IN_VALUTAZIONE',
      media: []
    });

    const mockHttp = fakeTransport({ verdict: 'BLOCK', reasons: ['blocco tardivo'] });

    // Mock della transazione che controlla lo stato corrente nel lock
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: MockTransactionClient) => Promise<unknown>) => {
      const tx: MockTransactionClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          { id: 'seg-human-override', revisione: 1, stato_moderazione: 'APPROVATA', stato_avanzamento: 'IN_VALUTAZIONE' }
        ]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        analisiIa: { upsert: vi.fn() },
        suggerimentoCategoria: { upsert: vi.fn() },
        segnalazione: { update: vi.fn() },
        eventoStato: { create: vi.fn() },
        auditEvento: { create: vi.fn() },
        outbox: { update: vi.fn() }
      };
      return cb(tx);
    });

    const adapters = ollamaAdapters(model, mockHttp);
    const result = await eseguiAnalisiSegnalazione('seg-human-override', 1, adapters, { adapterMode: 'ollama' });

    expect(result.status).toBe('SKIPPED_HUMAN_OVERRIDE');
    expect(result.reason).toContain('Decisione umana già presente: APPROVATA. Nessuna sovrascrittura automatica.');
    expect(recordedStatoModerazione).toBeNull();
  });
});
