import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import sharp from 'sharp';

const mocks = vi.hoisted(() => ({
  db: { segnalazione: { findUnique: vi.fn() }, categoria: { findMany: vi.fn() }, $transaction: vi.fn() },
  storage: { getObject: vi.fn() }
}));
vi.mock('../../src/lib/db', () => ({ prisma: mocks.db }));
vi.mock('../../src/lib/storage', () => ({ getStorageProvider: () => mocks.storage }));
import { eseguiAnalisiSegnalazione } from '../../src/lib/ia/pipeline';
import { processSingleOutboxJob } from '../../src/lib/ia/worker';
import { CLOUD_POLICY_VERSION } from '../../src/lib/ia/gemini';
import { getDettaglioSegnalazione, DEFAULT_CATEGORIE } from '../../src/lib/domain/segnalazioni';

const catalog = DEFAULT_CATEGORIE.filter(c => ['STRADE_MARCIAPIEDI', 'RIFIUTI_PULIZIA'].includes(c.codice))
  .map(c => ({ ...c, id: `catalog-${c.codice}`, attiva: true }));

type Report = {
  id: string; autore_id: string; revisione: number; descrizione: string; stato_moderazione: string; stato_avanzamento: string;
  sostegni: Array<{ utente_id: string }>;
  eventi_stato: Array<{ revisione: number; motivazione: string }>;
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
    analisiIa: { upsert: vi.fn() }, auditEvento: { create: vi.fn() }, outbox: { update: vi.fn() },
    categoria: { findMany: vi.fn() }, suggerimentoCategoria: { upsert: vi.fn() }, segnalazioneCategoria: { upsert: vi.fn() }
  };
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'offline-dummy-key');
    vi.stubEnv('GEMINI_MODEL', 'offline-test-model');
    human = null;
    duringProvider = () => {};
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
    current = {
      id: 'report', autore_id: 'author', revisione: 1, descrizione: 'Manca illuminazione pubblica.', stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA',
      sostegni: [], eventi_stato: [],
      media: [{ id: 'media', segnalazione_id: 'report', storage_key: 'private-object', sha256: crypto.createHash('sha256').update(bytes).digest('hex'), byte_size: bytes.length, tipo: 'FOTO', mime: 'image/png', stato_file: 'READY' }]
    };
    mocks.storage.getObject.mockResolvedValue(bytes);
    mocks.db.segnalazione.findUnique.mockImplementation(async () => structuredClone(current));
    mocks.db.$transaction.mockImplementation(async fn => fn(tx));
    mocks.db.categoria.findMany.mockResolvedValue(catalog);
    tx.categoria.findMany.mockResolvedValue(catalog);
    tx.analisiIa.upsert.mockImplementation(async ({ create }) => ({ id: `analysis-${create.modulo}` }));
    tx.$queryRaw.mockImplementation(async () => [structuredClone(current)]);
    tx.segnalazione.findUnique.mockImplementation(async () => structuredClone(current));
    tx.eventoStato.findFirst.mockImplementation(async () => human);
    tx.segnalazione.update.mockImplementation(async ({ data }) => { current.stato_moderazione = data.stato_moderazione; return structuredClone(current); });
    tx.eventoStato.create.mockImplementation(async ({ data }) => { current.eventi_stato.push(data); return data; });
    http = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      duringProvider();
      const body = JSON.parse(String(options?.body));
      const task = JSON.parse(body.contents[0].parts[0].text).task;
      return response(task === 'TEXT' ? safeText : task === 'CLASSIFY' ? { category_ids: catalog.map(c => c.id) } : safeImage);
    });
    vi.stubGlobal('fetch', http);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('approva atomicamente e registra revisione, esito, motivi, modello e versione regole', async () => {
    const result = await eseguiAnalisiSegnalazione('report', 1, undefined, { adapterMode: 'cloud' });
    expect(result.finalState).toBe('APPROVATA');
    expect(http).toHaveBeenCalledTimes(3);
    expect(tx.segnalazione.update).toHaveBeenCalledWith({ where: { id: 'report' }, data: { stato_moderazione: 'APPROVATA' } });
    const entry = tx.analisiIa.upsert.mock.calls[0][0].create;
    expect(entry).toMatchObject({ revisione: 1, esito: 'APPROVATA', versione_modello: 'offline-test-model', versione_policy: CLOUD_POLICY_VERSION });
    expect(JSON.parse(entry.dettagli_json)).toMatchObject({ revision: 1, state: 'APPROVATA', model: 'offline-test-model', policy: CLOUD_POLICY_VERSION });
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
    expect(tx.suggerimentoCategoria.upsert).not.toHaveBeenCalled();
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
    expect(tx.suggerimentoCategoria.upsert).not.toHaveBeenCalled();
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
    expect(http).toHaveBeenCalledTimes(3);
    expect(tx.outbox.update).toHaveBeenCalledWith({ where: { id: 'job' }, data: { elaborata_il: expect.any(Date), prossimo_tentativo_il: null } });
    const sql = tx.$queryRaw.mock.calls[0][0].join('');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("'SEGNALAZIONE_CREATA', 'SEGNALAZIONE_MODIFICATA'");
  });

  it.each(['violation-and-doubt', 'doubt', 'technical-error', 'all-pass', 'obsolete-and-human'])('confine worker: %s, stato e motivo accessibili all’autore', async scenario => {
    const second = { ...current.media[0], id: 'second', storage_key: 'private-second' };
    current.media.push(second);
    tx.$queryRaw.mockImplementation(async (query: TemplateStringsArray) => query.join('').includes('FROM Outbox')
      ? [{ id: 'job', segnalazione_id: 'report', revisione: 1, tipo_evento: 'SEGNALAZIONE_MODIFICATA', payload_json: '{}', tentativi: 0 }]
      : [structuredClone(current)]);
    http.mockImplementation(async (_url, options) => {
      const payload = JSON.parse(String(options?.body));
      const input = JSON.parse(payload.contents[0].parts[0].text);
      if (scenario === 'obsolete-and-human') {
        current.revisione = 2;
        current.stato_moderazione = 'RIFIUTATA';
        human = { id: 'human' };
      }
      if (scenario === 'technical-error') return new Response('untrusted-private-error', { status: 503 });
      if (input.task === 'TEXT') return response(safeText);
      if (input.task === 'CLASSIFY') return response({ category_ids: catalog.map(c => c.id) });
      if (scenario === 'violation-and-doubt' && input.attachment === 2) return response({ ...safeImage, publication: { verdict: 'FAIL', reason: 'PERSONAL_DATA' } });
      if (scenario === 'doubt' || scenario === 'violation-and-doubt') return response({ ...safeImage, coherence: 'UNCERTAIN' });
      return response(safeImage);
    });
    const result = await processSingleOutboxJob(undefined, { adapterMode: 'cloud' });
    expect(result.outcome).toBe('SUCCESS');
    if (scenario === 'obsolete-and-human') {
      expect(result.details).toMatchObject({ status: 'OBSOLETE' });
      expect(tx.segnalazione.update).not.toHaveBeenCalled();
      expect(tx.eventoStato.create).not.toHaveBeenCalled();
      expect(current.stato_moderazione).toBe('RIFIUTATA');
      return;
    }
    const state = scenario === 'all-pass' ? 'APPROVATA' : scenario === 'violation-and-doubt' ? 'RIFIUTATA' : 'IN_REVISIONE';
    expect(result.details).toMatchObject({ finalState: state });
    expect(current.stato_moderazione).toBe(state);
    const detail = await getDettaglioSegnalazione('report', 'author');
    expect(detail?.eventi_stato[0].motivazione).toBe(current.eventi_stato[0].motivazione);
    if (scenario === 'violation-and-doubt') {
      expect(detail?.eventi_stato[0].motivazione).toBe('Allegato 2: diffusione di dati personali altrui.');
      expect(await getDettaglioSegnalazione('report', 'unrelated-user')).toBeNull();
    }
    if (scenario === 'technical-error') expect(detail?.eventi_stato[0].motivazione).toContain('nessuna violazione accertata');
    if (scenario === 'doubt') expect(detail?.eventi_stato[0].motivazione).toContain('verificare il collegamento');
    expect(tx.eventoStato.create).toHaveBeenCalledTimes(1);
    expect(tx.outbox.update).toHaveBeenCalledTimes(1);
  });

  it('RF08: due categorie attive, ID inesistente scartato e scelte umane invariate', async () => {
    current.descrizione = 'Rifiuti abbandonati e marciapiede dissestato impediscono il passaggio.';
    http.mockImplementation(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      const input = JSON.parse(body.contents[0].parts[0].text);
      if (input.task === 'CLASSIFY') {
        expect(input.description).toBe(current.descrizione);
        expect(input.allowed_categories.map((c: { id: string }) => c.id)).toEqual(catalog.map(c => c.id));
        expect(body.generationConfig.responseJsonSchema.properties.category_ids.items.enum).toEqual(catalog.map(c => c.id));
        return response({ category_ids: [catalog[0].id, 'nonexistent-id', catalog[1].id, catalog[0].id] });
      }
      return response(input.task === 'TEXT' ? safeText : safeImage);
    });
    const result = await processSingleOutboxJobForCurrentReport();
    expect(result.details).toMatchObject({ finalState: 'APPROVATA' });
    const saved = tx.suggerimentoCategoria.upsert.mock.calls.map(([arg]) => arg.create.categoria_id);
    expect(saved).toEqual(catalog.map(c => c.id));
    expect(tx.segnalazioneCategoria.upsert).not.toHaveBeenCalled();
    const classEntry = tx.analisiIa.upsert.mock.calls.find(([arg]) => arg.create.modulo === 'CLASSIFICAZIONE')![0].create;
    expect(classEntry.stato_esecuzione).toBe('SUCCEEDED');
    expect(JSON.parse(classEntry.dettagli_json).discardedIds).toBe(1);
    // The real detail query exposes suggestions separately from confirmed links, to author/committee only.
    const withSuggestions = { ...current, categorie: [{ categoria: { id: 'human-choice', nome: 'Scelta umana' } }],
      analisi_ia: [{ revisione: 1, esito: classEntry.esito, suggerimenti: catalog.map(c => ({ categoria: c })) }] };
    mocks.db.segnalazione.findUnique.mockResolvedValue(withSuggestions);
    const author = await getDettaglioSegnalazione('report', 'author');
    expect(author?.suggerimentiIa.map(c => c.id)).toEqual(saved);
    expect(author?.categorie[0].categoria.id).toBe('human-choice');
    expect((await getDettaglioSegnalazione('report', 'committee', 'COMITATO'))?.suggerimentiIa).toHaveLength(2);
    expect((await getDettaglioSegnalazione('report'))?.suggerimentiIa).toEqual([]);
    withSuggestions.analisi_ia[0].revisione = 0;
    expect((await getDettaglioSegnalazione('report', 'author'))?.suggerimentiIa).toEqual([]);
  });

  async function processSingleOutboxJobForCurrentReport() {
    tx.$queryRaw.mockImplementation(async (query: TemplateStringsArray) => query.join('').includes('FROM Outbox')
      ? [{ id: 'job', segnalazione_id: 'report', revisione: current.revisione, tipo_evento: 'SEGNALAZIONE_CREATA', payload_json: '{}', tentativi: 0 }]
      : [structuredClone(current)]);
    return processSingleOutboxJob(undefined, { adapterMode: 'cloud' });
  }

  it('RF08: errore del solo classificatore registrato, senza rifiutare né bloccare l’approvazione', async () => {
    const original = http.getMockImplementation()!;
    http.mockImplementation(async (url, options) => {
      const task = JSON.parse(JSON.parse(String(options?.body)).contents[0].parts[0].text).task;
      return task === 'CLASSIFY' ? new Response('private-provider-error', { status: 500 }) : original(url, options);
    });
    expect((await processSingleOutboxJobForCurrentReport()).details).toMatchObject({ finalState: 'APPROVATA' });
    const record = tx.analisiIa.upsert.mock.calls.find(([arg]) => arg.create.modulo === 'CLASSIFICAZIONE')![0].create;
    expect(record.stato_esecuzione).toBe('FAILED');
    expect(record.dettagli_json).not.toContain('private-provider-error');
    expect(tx.suggerimentoCategoria.upsert).not.toHaveBeenCalled();
  });

  it('RF08: categoria disattivata durante l’inferenza non viene salvata', async () => {
    tx.categoria.findMany.mockResolvedValue([catalog[0]]);
    await processSingleOutboxJobForCurrentReport();
    expect(tx.suggerimentoCategoria.upsert.mock.calls.map(([arg]) => arg.create.categoria_id)).toEqual([catalog[0].id]);
  });

  it.each(['empty-catalog', 'unknown-only'])('RF08: %s non produce categorie inventate né rifiuto', async kind => {
    if (kind === 'empty-catalog') mocks.db.categoria.findMany.mockResolvedValue([]);
    else {
      const original = http.getMockImplementation()!;
      http.mockImplementation(async (url, options) => {
        const task = JSON.parse(JSON.parse(String(options?.body)).contents[0].parts[0].text).task;
        return task === 'CLASSIFY' ? response({ category_ids: ['does-not-exist'] }) : original(url, options);
      });
    }
    expect((await processSingleOutboxJobForCurrentReport()).details).toMatchObject({ finalState: 'APPROVATA' });
    expect(tx.suggerimentoCategoria.upsert).not.toHaveBeenCalled();
    const entry = tx.analisiIa.upsert.mock.calls.find(([arg]) => arg.create.modulo === 'CLASSIFICAZIONE')![0].create;
    expect(entry.stato_esecuzione).toBe('FAILED');
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
