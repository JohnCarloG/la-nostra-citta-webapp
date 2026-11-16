import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { syntheticGpsJpeg, SYNTHETIC_GPS } from '../helpers/synthetic-gps-image';
import { inspectFileBuffer, extractJpegExifGps } from '../../src/lib/storage/mime-validator';
import { STATO_INIZIALE_LUOGO, proponiExif, accettaSuggerimentoExif, impostaPosizioneManuale } from '../../src/lib/geo/location-picker';

const m = vi.hoisted(() => ({
  db: {
    utente: { findUnique: vi.fn() },
    uploadTemporaneo: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    segnalazione: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    media: { findUnique: vi.fn() }, categoria: { findMany: vi.fn() },
    outbox: { create: vi.fn(), update: vi.fn() },
    eventoStato: { create: vi.fn(), findFirst: vi.fn() }, auditEvento: { create: vi.fn() },
    analisiIa: { upsert: vi.fn() }, suggerimentoCategoria: { upsert: vi.fn() },
    $transaction: vi.fn(), $queryRaw: vi.fn(), $executeRaw: vi.fn()
  },
  storage: { putObject: vi.fn(), getObject: vi.fn(), deleteObject: vi.fn() }, auth: vi.fn()
}));
vi.mock('../../src/lib/db', () => ({ prisma: m.db }));
vi.mock('../../src/lib/storage', () => ({ getStorageProvider: () => m.storage }));
vi.mock('../../src/actions/auth', () => ({ getCurrentUser: m.auth }));
import { uploadMediaAction, submitSegnalazioneAction } from '../../src/actions/uploads';
import { modificaSegnalazione, getSegnalazioniMappa, isSegnalazionePubblica } from '../../src/lib/domain/segnalazioni';
import { processSingleOutboxJob } from '../../src/lib/ia/worker';
import { GET as readMedia } from '../../src/app/api/media/[id]/route';

type StoredMedia = { id: string; segnalazione_id: string; storage_key: string; sha256: string; byte_size: number; tipo: string; mime: string; stato_file: string };
type Row = { id: string; autore_id: string; revisione: number; descrizione: string; stato_moderazione: string; stato_avanzamento: string;
  latitudine: number; longitudine: number; origine_posizione: string; media: StoredMedia[]; categorie: []; sostegni: [] };
const envelope = (value: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }));

describe('RF07–RF10: invio reale delle action, worker e visibilità; DB/storage/HTTP isolati', () => {
  const objects = new Map<string, Buffer>();
  let row: Row;
  let upload: Record<string, unknown>;
  let jobs: Array<{ id: string; segnalazione_id: string; revisione: number; tipo_evento: string; payload_json: string; tentativi: number }>;
  let http: ReturnType<typeof vi.fn<typeof fetch>>;
  beforeEach(() => {
    vi.resetAllMocks(); objects.clear(); jobs = [];
    vi.stubEnv('AI_ADAPTER_MODE', 'cloud'); vi.stubEnv('GEMINI_MODEL', 'offline-test-model'); vi.stubEnv('GEMINI_API_KEY', 'offline-test-key');
    m.auth.mockResolvedValue({ id: 'author', stato_account: 'ATTIVO', verificato_il: new Date(), ruolo: 'CITTADINO' });
    m.db.utente.findUnique.mockResolvedValue({ id: 'author', stato_account: 'ATTIVO', verificato_il: new Date() });
    m.db.$transaction.mockImplementation(async cb => cb(m.db));
    m.storage.putObject.mockImplementation(async (key, bytes) => { objects.set(key, Buffer.from(bytes)); });
    m.storage.getObject.mockImplementation(async key => { const bytes = objects.get(key); if (!bytes) throw new Error('missing'); return Buffer.from(bytes); });
    m.db.uploadTemporaneo.create.mockImplementation(async ({ data }) => { upload = { id: 'upload', ...data }; return upload; });
    m.db.uploadTemporaneo.updateMany.mockResolvedValue({ count: 1 });
    m.db.uploadTemporaneo.findMany.mockImplementation(async () => [upload]);
    m.db.segnalazione.create.mockImplementation(async ({ data }) => {
      row = { ...data, id: 'report', categorie: [], sostegni: [], media: data.media.create.map((media: StoredMedia) => ({ ...media, id: 'media', segnalazione_id: 'report' })) };
      return structuredClone(row);
    });
    m.db.segnalazione.update.mockImplementation(async ({ data }) => { row = { ...row, ...data }; return structuredClone(row); });
    m.db.segnalazione.findUnique.mockImplementation(async () => structuredClone(row));
    m.db.segnalazione.findMany.mockImplementation(async ({ where }) => row.stato_moderazione === where.stato_moderazione && row.stato_avanzamento !== where.stato_avanzamento.not ? [structuredClone(row)] : []);
    m.db.media.findUnique.mockImplementation(async () => ({ ...row.media[0], segnalazione: structuredClone(row) }));
    m.db.outbox.create.mockImplementation(async ({ data }) => { const job = { ...data, id: `job-${data.revisione}`, tentativi: 0 }; jobs.push(job); return job; });
    m.db.outbox.update.mockImplementation(async ({ where }) => { jobs = jobs.filter(j => j.id !== where.id); });
    m.db.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => sql.join('').includes('FROM Outbox') ? jobs.slice(0, 1) : [structuredClone(row)]);
    m.db.eventoStato.findFirst.mockResolvedValue(null);
    m.db.categoria.findMany.mockResolvedValue([{ id: 'roads', codice: 'STRADE_MARCIAPIEDI', nome: 'Strade, buche e marciapiedi' }]);
    m.db.analisiIa.upsert.mockImplementation(async ({ create }) => ({ id: create.modulo }));
    http = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      const input = JSON.parse(JSON.parse(String(options?.body)).contents[0].parts[0].text);
      if (input.task === 'CLASSIFY') return envelope({ category_ids: ['roads'] });
      if (input.task === 'TEXT') return envelope({ relevance: { verdict: 'PASS', reason: 'CIVIC' }, community: { verdict: 'PASS', reason: 'SAFE' } });
      return envelope({ coherence: 'CONSISTENT', publication: { verdict: 'PASS', reason: 'SAFE' } });
    });
    vi.stubGlobal('fetch', http);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  async function submit(bytes: Buffer, manual = false) {
    const form = new FormData(); form.set('file', new File([new Uint8Array(bytes)], 'synthetic.jpg', { type: 'image/jpeg' }));
    const result = await uploadMediaAction(form);
    expect(result.success).toBe(true);
    const coords = result.data?.exifCoords;
    const selected = manual ? impostaPosizioneManuale(STATO_INIZIALE_LUOGO, 45.47, 9.2).nuovoStato
      : accettaSuggerimentoExif(proponiExif(STATO_INIZIALE_LUOGO, { ...coords!, nomeFile: 'synthetic.jpg' }));
    if (!manual) {
      expect(coords?.lat).toBeCloseTo(SYNTHETIC_GPS.lat, 6);
      expect(coords?.lon).toBeCloseTo(SYNTHETIC_GPS.lon, 6);
      // New EXIF must not silently replace a citizen's correction.
      const corrected = impostaPosizioneManuale(selected, 45.47, 9.2).nuovoStato;
      expect(proponiExif(corrected, { ...coords!, nomeFile: 'another.jpg' }).posizione).toEqual(corrected.posizione);
    } else expect(coords).toBeUndefined();
    const send = new FormData(); send.set('descrizione', 'Il Comune gestisce malissimo questi marciapiedi: riparate le buche.');
    send.set('latitudine', String(selected.posizione!.lat)); send.set('longitudine', String(selected.posizione!.lon));
    send.set('originePosizione', selected.posizione!.origine === 'EXIF' ? 'EXIF_CONFERMATO' : 'MANUALE');
    send.set('storageKeys', JSON.stringify([result.data!.storageKey]));
    expect((await submitSegnalazioneAction(send)).success).toBe(true);
    return result.data!;
  }

  it('RF09: GPS originale → proposta confermata → invio PENDENTE → copia Gemini senza GPS → mappa pubblica solo dopo esito', async () => {
    const original = await syntheticGpsJpeg();
    expect(inspectFileBuffer(original).valid).toBe(true);
    expect(extractJpegExifGps(original)?.lat).toBeCloseTo(SYNTHETIC_GPS.lat, 6);
    const uploaded = await submit(original);
    expect(objects.get(uploaded.storageKey)).toEqual(original);
    expect(row.origine_posizione).toBe('EXIF_CONFERMATO');
    expect(row.stato_moderazione).toBe('PENDENTE');
    expect(isSegnalazionePubblica(row)).toBe(false);
    expect(jobs[0].tipo_evento).toBe('SEGNALAZIONE_CREATA');
    expect(http).not.toHaveBeenCalled(); // Submission acknowledges receipt, never a synchronous verdict.
    m.auth.mockResolvedValue(null);
    expect((await readMedia(new NextRequest('http://localhost/api/media/media'), { params: Promise.resolve({ id: 'media' }) })).status).toBe(404);
    expect(await getSegnalazioniMappa()).toEqual([]);
    const outcome = await processSingleOutboxJob(); // AI_ADAPTER_MODE=cloud routes the actual worker.
    expect(outcome.details).toMatchObject({ finalState: 'APPROVATA' });
    const imagePayload = http.mock.calls.map(([, options]) => JSON.parse(String(options?.body)))
      .find(body => JSON.parse(body.contents[0].parts[0].text).task === 'IMAGE');
    const clean = Buffer.from(imagePayload.contents[0].parts[1].inlineData.data, 'base64');
    expect((await sharp(original).metadata()).exif).toBeDefined();
    expect((await sharp(clean).metadata()).exif).toBeUndefined();
    expect(extractJpegExifGps(clean)).toBeUndefined();
    expect(objects.get(uploaded.storageKey)).toEqual(original);
    expect((await getSegnalazioniMappa())[0]).toMatchObject({ latitudine: SYNTHETIC_GPS.lat, longitudine: SYNTHETIC_GPS.lon });
    expect(m.db.segnalazione.findMany.mock.calls.at(-1)![0].where).toMatchObject({ stato_moderazione: 'APPROVATA', stato_avanzamento: { not: 'RITIRATA' } });
    expect((await readMedia(new NextRequest('http://localhost/api/media/media'), { params: Promise.resolve({ id: 'media' }) })).status).toBe(200);
  });

  it('RF07: modifica di una segnalazione approvata nasconde subito testo, media e punto mappa e accoda la nuova revisione', async () => {
    await submit(await syntheticGpsJpeg()); await processSingleOutboxJob();
    expect(row.stato_moderazione).toBe('APPROVATA');
    await modificaSegnalazione({ autoreId: 'author', segnalazioneId: 'report', expectedRevision: 1, nuovaDescrizione: 'Nuova descrizione ancora da verificare.' });
    expect(row.stato_moderazione).toBe('PENDENTE'); expect(row.revisione).toBe(2);
    expect(isSegnalazionePubblica(row)).toBe(false);
    expect(jobs[0]).toMatchObject({ tipo_evento: 'SEGNALAZIONE_MODIFICATA', revisione: 2 });
    m.auth.mockResolvedValue(null);
    expect((await readMedia(new NextRequest('http://localhost/api/media/media'), { params: Promise.resolve({ id: 'media' }) })).status).toBe(404);
    expect(await getSegnalazioniMappa()).toEqual([]);
    const before = http.mock.calls.length;
    await processSingleOutboxJob();
    expect(row.stato_moderazione).toBe('APPROVATA');
    expect(http.mock.calls.slice(before)).toHaveLength(3);
    for (const [, options] of http.mock.calls.slice(before)) {
      const input = JSON.parse(JSON.parse(String(options?.body)).contents[0].parts[0].text);
      expect(input.description).toBe('Nuova descrizione ancora da verificare.');
    }
  });

  it('RF09: senza EXIF resta possibile inviare il luogo scelto manualmente', async () => {
    const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: 'white' } }).jpeg().toBuffer();
    await submit(bytes, true);
    expect(row).toMatchObject({ origine_posizione: 'MANUALE', latitudine: 45.47, longitudine: 9.2, stato_moderazione: 'PENDENTE' });
  });
});
