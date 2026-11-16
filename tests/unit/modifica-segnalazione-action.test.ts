import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  db: { $transaction: vi.fn(), $queryRaw: vi.fn(), segnalazione: { update: vi.fn() }, eventoStato: { create: vi.fn() }, auditEvento: { create: vi.fn() }, outbox: { create: vi.fn() } }
}));
vi.mock('../../src/actions/auth', () => ({ getCurrentUser: m.auth }));
vi.mock('../../src/lib/db', () => ({ prisma: m.db }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { modificaSegnalazioneAction } from '../../src/actions/segnalazioni';

describe('Modifica da interfaccia: autorizzazione e concorrenza server', () => {
  function payload() { const fd = new FormData(); fd.set('segnalazioneId', 'report'); fd.set('descrizione', 'Nuova descrizione'); fd.set('expectedRevision', '1'); return fd; }
  beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ id: 'author', stato_account: 'ATTIVO', verificato_il: new Date() });
    m.db.$transaction.mockImplementation(async cb => cb(m.db));
    m.db.$queryRaw.mockResolvedValue([{ id: 'report', autore_id: 'author', revisione: 1, stato_moderazione: 'APPROVATA', stato_avanzamento: 'RICEVUTA', descrizione: 'Prima' }]);
  });
  it('rifiuta richieste anonime senza scritture', async () => {
    m.auth.mockResolvedValue(null);
    expect((await modificaSegnalazioneAction(payload())).error).toContain('autenticato');
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });
  it('rifiuta la modifica di una segnalazione altrui attraverso il dominio reale', async () => {
    m.auth.mockResolvedValue({ id: 'other', stato_account: 'ATTIVO', verificato_il: new Date() });
    expect((await modificaSegnalazioneAction(payload())).error).toContain('Solo l autore');
    expect(m.db.segnalazione.update).not.toHaveBeenCalled();
  });
  it('rifiuta una revisione obsoleta', async () => {
    const fd = payload(); fd.set('expectedRevision', '2');
    expect((await modificaSegnalazioneAction(fd)).error).toContain('Conflitto');
    expect(m.db.segnalazione.update).not.toHaveBeenCalled();
  });
  it('riporta a PENDENTE e accoda la revisione nuova solo per l’autore', async () => {
    expect((await modificaSegnalazioneAction(payload())).success).toBe(true);
    expect(m.db.segnalazione.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stato_moderazione: 'PENDENTE', revisione: 2 }) }));
    expect(m.db.outbox.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo_evento: 'SEGNALAZIONE_MODIFICATA', revisione: 2 }) }));
  });
});
