import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import sharp from 'sharp';

const mocks = vi.hoisted(() => ({
  db: { segnalazione: { findUnique: vi.fn() }, $transaction: vi.fn() },
  storage: { getObject: vi.fn() }
}));
vi.mock('../../src/lib/db', () => ({ prisma: mocks.db }));
vi.mock('../../src/lib/storage', () => ({ getStorageProvider: () => mocks.storage }));
import { eseguiAnalisiSegnalazione } from '../../src/lib/ia/pipeline';
import { processSingleOutboxJob } from '../../src/lib/ia/worker';
import { CLOUD_POLICY_VERSION, DEFAULT_GEMINI_MODEL } from '../../src/lib/ia/gemini';

type Report = {
  id: string; revisione: number; descrizione: string; stato_moderazione: string; stato_avanzamento: string;
  media: Array<{ id: string; segnalazione_id: string; storage_key: string; sha256: string; byte_size: number; tipo: string; mime: string; stato_file: string }>;
};
const safeText = { relevance: { verdict: 'PASS', reason: 'CIVIC' }, community: { verdict: 'PASS', reason: 'SAFE' } };
const safeImage = { coherence: 'CONSISTENT', publication: { verdict: 'PASS', reason: 'SAFE' } };
const response = (output: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] }));

describe('Pipeline e worker cloud: storage/DB/HTTP offline', () => {
  let current: Report;
  let human: { id: string } | null;
  let duringProvider: () => void;
  let http: ReturnType<typeof vi.fn<typeof fetch>>;
  const tx = {
    $queryRaw: vi.fn(), $executeRaw: vi.fn(),
    segnalazione: { findUnique: vi.fn(), update: vi.fn() },
    eventoStato: { findFirst: vi.fn(), create: vi.fn() },
    analisiIa: { upsert: vi.fn() }, auditEvento: { create: vi.fn() }, outbox: { update: vi.fn() }
  };
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'offline-dummy-key');
    vi.stubEnv('GEMINI_MODEL', DEFAULT_GEMINI_MODEL);
    human = null;
    duringProvider = () => {};
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
    current = {
      id: 'report', revisione: 1, descrizione: 'Manca illuminazione pubblica.', stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA',
      media: [{ id: 'media', segnalazione_id: 'report', storage_key: 'private-object', sha256: crypto.createHash('sha256').update(bytes).digest('hex'), byte_size: bytes.length, tipo: 'FOTO', mime: 'image/png', stato_file: 'READY' }]
    };
    mocks.storage.getObject.mockResolvedValue(bytes);
    mocks.db.segnalazione.findUnique.mockImplementation(async () => structuredClone(current));
    mocks.db.$transaction.mockImplementation(async fn => fn(tx));
    tx.$queryRaw.mockImplementation(async () => [structuredClone(current)]);
    tx.segnalazione.findUnique.mockImplementation(async () => structuredClone(current));
    tx.eventoStato.findFirst.mockImplementation(async () => human);
    http = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      duringProvider();
      const body = JSON.parse(String(options?.body));
      return response(JSON.parse(body.contents[0].parts[0].text).task === 'TEXT' ? safeText : safeImage);
    });
    vi.stubGlobal('fetch', http);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('approva atomicamente e registra revisione, esito, motivi, modello e versione regole', async () => {
    const result = await eseguiAnalisiSegnalazione('report', 1, undefined, { adapterMode: 'cloud' });
    expect(result.finalState).toBe('APPROVATA');
    expect(http).toHaveBeenCalledTimes(2);
    expect(tx.segnalazione.update).toHaveBeenCalledWith({ where: { id: 'report' }, data: { stato_moderazione: 'APPROVATA' } });
    const entry = tx.analisiIa.upsert.mock.calls[0][0].create;
    expect(entry).toMatchObject({ revisione: 1, esito: 'APPROVATA', versione_modello: DEFAULT_GEMINI_MODEL, versione_policy: CLOUD_POLICY_VERSION });
    expect(JSON.parse(entry.dettagli_json)).toMatchObject({ revision: 1, state: 'APPROVATA', model: DEFAULT_GEMINI_MODEL, policy: CLOUD_POLICY_VERSION });
    expect(entry.dettagli_json).not.toContain('private-object');
    expect(tx.eventoStato.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revisione: 1, a_stato: 'APPROVATA', tipo_attore: 'SISTEMA' }) }));
    expect(tx.auditEvento.create).toHaveBeenCalledTimes(1);
  });

  it('scarta il risultato se la revisione cambia durante la risposta del modello', async () => {
    duringProvider = () => { current.revisione = 2; current.descrizione = 'Testo aggiornato'; };
    const result = await eseguiAnalisiSegnalazione('report', 1, undefined, { adapterMode: 'cloud' });
    expect(result.status).toBe('OBSOLETE');
    expect(tx.segnalazione.update).not.toHaveBeenCalled();
    expect(tx.eventoStato.create).not.toHaveBeenCalled();
    expect(tx.analisiIa.upsert.mock.calls[0][0].create.stato_esecuzione).toBe('OBSOLETE');
  });

  it('rifiuta anche una revisione richiesta futura senza inviare contenuti', async () => {
    expect((await eseguiAnalisiSegnalazione('report', 2, undefined, { adapterMode: 'cloud' })).status).toBe('OBSOLETE');
    expect(http).not.toHaveBeenCalled();
  });

  it('ricontrolla il manifest dei media prima del commit', async () => {
    duringProvider = () => { current.media[0].stato_file = 'QUARANTENA'; };
    expect((await eseguiAnalisiSegnalazione('report', 1, undefined, { adapterMode: 'cloud' })).status).toBe('OBSOLETE');
    expect(tx.segnalazione.update).not.toHaveBeenCalled();
  });

  it.each(['APPROVATA', 'RIFIUTATA', 'IN_REVISIONE'])('preserva la decisione umana %s presa mentre il provider risponde', async state => {
    duringProvider = () => { current.stato_moderazione = state; human = { id: 'human-decision' }; };
    const result = await eseguiAnalisiSegnalazione('report', 1, undefined, { adapterMode: 'cloud' });
    expect(result.status).toBe('SKIPPED_HUMAN_OVERRIDE');
    expect(result.finalState).toBe(state);
    expect(tx.segnalazione.update).not.toHaveBeenCalled();
    expect(tx.eventoStato.create).not.toHaveBeenCalled();
  });

  it('non sovrascrive una decisione umana registrata anche se lo stato risultasse PENDENTE', async () => {
    duringProvider = () => { human = { id: 'human-event' }; };
    expect((await eseguiAnalisiSegnalazione('report', 1, undefined, { adapterMode: 'cloud' })).status).toBe('SKIPPED_HUMAN_OVERRIDE');
    expect(tx.segnalazione.update).not.toHaveBeenCalled();
  });

  it('non chiama il provider su segnalazioni già decise', async () => {
    current.stato_moderazione = 'RIFIUTATA';
    expect((await eseguiAnalisiSegnalazione('report', 1, undefined, { adapterMode: 'cloud' })).status).toBe('SKIPPED_HUMAN_OVERRIDE');
    expect(http).not.toHaveBeenCalled();
  });

  it('non invia media di segnalazioni già ritirate', async () => {
    current.stato_avanzamento = 'RITIRATA';
    await eseguiAnalisiSegnalazione('report', 1, undefined, { adapterMode: 'cloud' });
    expect(http).not.toHaveBeenCalled();
    expect(mocks.storage.getObject).not.toHaveBeenCalled();
    expect(tx.segnalazione.update).not.toHaveBeenCalled();
  });

  it('un errore del provider invia al comitato cosa verificare senza attribuire violazioni', async () => {
    http.mockResolvedValue(new Response('sensitive-error', { status: 500 }));
    const result = await eseguiAnalisiSegnalazione('report', 1, undefined, { adapterMode: 'cloud' });
    expect(result.finalState).toBe('IN_REVISIONE');
    expect(result.reason).toContain('Testo: ripetere il controllo');
    expect(result.reason).toContain('Allegato 1: ripetere il controllo');
    expect(result.reason).not.toContain('sensitive-error');
    expect(tx.analisiIa.upsert.mock.calls[0][0].create.stato_esecuzione).toBe('FAILED');
  });

  it('senza chiave non usa Ollama o mock, nemmeno con allowSimulatedApproval', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const result = await eseguiAnalisiSegnalazione('report', 1, undefined, { adapterMode: 'cloud', allowSimulatedApproval: true });
    expect(result.finalState).toBe('IN_REVISIONE');
    expect(http).not.toHaveBeenCalled();
  });

  it('rifiuta adapter sostitutivi nel percorso cloud', async () => {
    await expect(eseguiAnalisiSegnalazione('report', 1, { moderation: {} as never }, { adapterMode: 'cloud' })).rejects.toThrow('adapter sostitutivi');
  });

  it.each(['SEGNALAZIONE_CREATA', 'SEGNALAZIONE_MODIFICATA'])('worker: claim e analisi concreta per %s', async tipo_evento => {
    current.revisione = tipo_evento === 'SEGNALAZIONE_MODIFICATA' ? 2 : 1;
    tx.$queryRaw.mockImplementation(async (query: TemplateStringsArray) => query.join('').includes('FROM Outbox')
      ? [{ id: 'job', segnalazione_id: 'report', revisione: current.revisione, tipo_evento, payload_json: '{}', tentativi: 0 }]
      : [structuredClone(current)]);
    const result = await processSingleOutboxJob(undefined, { adapterMode: 'cloud' });
    expect(result.outcome).toBe('SUCCESS');
    expect(result.details).toMatchObject({ finalState: 'APPROVATA', revisione: current.revisione });
    expect(http).toHaveBeenCalledTimes(2);
    expect(tx.outbox.update).toHaveBeenCalledWith({ where: { id: 'job' }, data: { elaborata_il: expect.any(Date), prossimo_tentativo_il: null } });
    const sql = tx.$queryRaw.mock.calls[0][0].join('');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("'SEGNALAZIONE_CREATA', 'SEGNALAZIONE_MODIFICATA'");
  });

  it.each([false, true])('worker: errore infrastrutturale finale sanificato; preserva decisioni umane=%s', async humanExists => {
    human = humanExists ? { id: 'human' } : null;
    mocks.db.segnalazione.findUnique.mockRejectedValue(new Error('private database connection string'));
    tx.$queryRaw.mockImplementation(async (query: TemplateStringsArray) => query.join('').includes('FROM Outbox')
      ? [{ id: 'job', segnalazione_id: 'report', revisione: 1, tipo_evento: 'SEGNALAZIONE_CREATA', payload_json: '{}', tentativi: 2 }]
      : [structuredClone(current)]);
    const result = await processSingleOutboxJob(undefined, { adapterMode: 'cloud' });
    expect(result.outcome).toBe('FAILED_MAX_RETRIES');
    expect(result.details).not.toContain('private database connection string');
    if (humanExists) expect(tx.segnalazione.update).not.toHaveBeenCalled();
    else {
      expect(tx.segnalazione.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stato_moderazione: 'IN_REVISIONE' }) }));
      expect(tx.eventoStato.create.mock.calls[0][0].data.motivazione).toContain('Nessuna violazione accertata');
    }
  });
});
