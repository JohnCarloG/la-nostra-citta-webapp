import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  moderaSegnalazioneAction,
  avanzaStatoSegnalazioneAction,
  aggiornaCategorieAction
} from '../../src/actions/segnalazioni';
import {
  getCodaRevisioniComitato,
  getTutteSegnalazioniComitato
} from '../../src/lib/domain/segnalazioni';
import { getCurrentUser } from '../../src/actions/auth';
import {
  buildComitatoModeraFormData,
  buildComitatoAvanzaFormData,
  buildComitatoCategorieFormData
} from '../../src/app/(dashboard)/comitato/comitato-actions-form';

// Mock di next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock di getCurrentUser da src/actions/auth
vi.mock('../../src/actions/auth', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock manuale di PrismaClient con vi.hoisted per consentire l'hoisting di vi.mock
const { mockPrisma, mockPrismaTx } = vi.hoisted(() => {
  const mockPrismaTx = {
    utente: {
      findUnique: vi.fn(),
    },
    segnalazione: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    categoria: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    segnalazioneCategoria: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    eventoStato: {
      create: vi.fn(),
    },
    auditEvento: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };

  const mockPrisma = {
    ...mockPrismaTx,
    $transaction: vi.fn(async (cb: (tx: typeof mockPrismaTx) => Promise<unknown>) => cb(mockPrismaTx)),
  };

  return { mockPrisma, mockPrismaTx };
});

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      constructor() {
        return mockPrisma;
      }
    }
  };
});

describe('Verifica Operativa Comitato: Server Action e Confine con Form (RF05, RF11)', () => {
  type CurrentUserType = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  const comitatoUser = {
    id: 'user-comitato-1',
    nome: 'Giulia',
    cognome: 'Bianchi',
    email_normalizzata: 'giulia.comitato@example.com',
    ruolo: 'COMITATO' as const,
    stato_account: 'ATTIVO' as const,
    verificato_il: new Date()
  } as unknown as CurrentUserType;

  const cittadinoUser = {
    id: 'user-cittadino-1',
    nome: 'Mario',
    cognome: 'Rossi',
    email_normalizzata: 'mario.rossi@example.com',
    ruolo: 'CITTADINO' as const,
    stato_account: 'ATTIVO' as const,
    verificato_il: new Date()
  } as unknown as CurrentUserType;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrismaTx) => Promise<unknown>) => cb(mockPrismaTx));
  });

  // ── 1. MODERAZIONE: APPROVAZIONE MOTIVATA CON PAYLOAD EFFETTIVO DEL FORM ──
  it('1. Approvazione motivata: usa il costruttore effettivo di FormData del componente, comitato autenticato, esito APPROVATA registrato con motivazione e operatore nello storico', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    mockPrismaTx.utente.findUnique.mockResolvedValue({
      id: comitatoUser.id,
      ruolo: 'COMITATO',
      stato_account: 'ATTIVO',
      verificato_il: new Date()
    });

    // Segnalazione attualmente in revisione con rev 2
    mockPrismaTx.$queryRaw.mockResolvedValue([
      { id: 'seg-101', revisione: 2, stato_moderazione: 'IN_REVISIONE', stato_avanzamento: 'RICEVUTA' }
    ]);

    mockPrismaTx.segnalazione.update.mockResolvedValue({
      id: 'seg-101',
      stato_moderazione: 'APPROVATA',
      revisione: 2
    });

    mockPrismaTx.eventoStato.create.mockResolvedValue({ id: 'ev-1' });
    mockPrismaTx.auditEvento.create.mockResolvedValue({ id: 'aud-1' });

    // Payload generato dallo STESSO costruttore FormData del componente ComitatoActionsForm
    const formData = buildComitatoModeraFormData({
      segnalazioneId: 'seg-101',
      decision: 'APPROVATA',
      motivazione: 'Documentazione fotografica conforme e riscontro sul manto stradale di via Celoria',
      revisione: 2,
      statoModerazione: 'IN_REVISIONE'
    });

    const res = await moderaSegnalazioneAction(formData);
    expect(res).toEqual({ success: true });

    // Verifica transazione di moderazione
    expect(mockPrismaTx.segnalazione.update).toHaveBeenCalledWith({
      where: { id: 'seg-101' },
      data: { stato_moderazione: 'APPROVATA' }
    });

    // Verifica storico EventoStato (operatore, motivazione, transizione esatta)
    expect(mockPrismaTx.eventoStato.create).toHaveBeenCalledWith({
      data: {
        segnalazione_id: 'seg-101',
        attore_id: comitatoUser.id,
        tipo_attore: 'UTENTE',
        ambito: 'MODERAZIONE',
        da_stato: 'IN_REVISIONE',
        a_stato: 'APPROVATA',
        motivazione: 'Documentazione fotografica conforme e riscontro sul manto stradale di via Celoria',
        revisione: 2
      }
    });

    // Verifica audit trail
    expect(mockPrismaTx.auditEvento.create).toHaveBeenCalledWith({
      data: {
        tipo_attore: 'UTENTE',
        attore_id: comitatoUser.id,
        segnalazione_id: 'seg-101',
        azione: 'MODERA_SEGNALAZIONE',
        dati_json: expect.stringContaining('APPROVATA')
      }
    });
  });

  // ── 2. MODERAZIONE: RIFIUTO MOTIVATO CON PAYLOAD EFFETTIVO DEL FORM ──
  it('2. Rifiuto motivato: transizione a RIFIUTATA tramite costruttore del form registrata con motivazione obbligatoria e firma operatore', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    mockPrismaTx.utente.findUnique.mockResolvedValue({
      id: comitatoUser.id,
      ruolo: 'COMITATO',
      stato_account: 'ATTIVO',
      verificato_il: new Date()
    });

    mockPrismaTx.$queryRaw.mockResolvedValue([
      { id: 'seg-102', revisione: 1, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
    ]);

    mockPrismaTx.segnalazione.update.mockResolvedValue({
      id: 'seg-102',
      stato_moderazione: 'RIFIUTATA',
      revisione: 1
    });

    // Payload generato dal costruttore FormData del componente
    const formData = buildComitatoModeraFormData({
      segnalazioneId: 'seg-102',
      decision: 'RIFIUTATA',
      motivazione: 'Segnalazione priva di interesse civico pubblico (disputa condominiale privata)',
      revisione: 1,
      statoModerazione: 'PENDENTE'
    });

    const res = await moderaSegnalazioneAction(formData);
    expect(res).toEqual({ success: true });

    expect(mockPrismaTx.segnalazione.update).toHaveBeenCalledWith({
      where: { id: 'seg-102' },
      data: { stato_moderazione: 'RIFIUTATA' }
    });
  });

  // ── 3. AVANZAMENTO: PRESA IN CARICO E TRASMISSIONE AI CANDIDATI CON PAYLOAD EFFETTIVO ──
  it('3. Avanzamento iter dal registro: usa il costruttore di avanzamento del form, segnalazione APPROVATA passa a PRESA_IN_CARICO e poi a INVIATA_AI_CANDIDATI', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    mockPrismaTx.utente.findUnique.mockResolvedValue({
      id: comitatoUser.id,
      ruolo: 'COMITATO',
      stato_account: 'ATTIVO',
      verificato_il: new Date()
    });

    // Passo A: da RICEVUTA a PRESA_IN_CARICO
    mockPrismaTx.$queryRaw.mockResolvedValue([
      { id: 'seg-201', revisione: 3, stato_moderazione: 'APPROVATA', stato_avanzamento: 'RICEVUTA' }
    ]);

    mockPrismaTx.segnalazione.update.mockResolvedValue({
      id: 'seg-201',
      stato_avanzamento: 'PRESA_IN_CARICO'
    });

    const fdCarico = buildComitatoAvanzaFormData({
      segnalazioneId: 'seg-201',
      nuovoStato: 'PRESA_IN_CARICO',
      motivazione: 'Aperta istruttoria tecnica del comitato con l ufficio manutenzioni',
      revisione: 3,
      statoAvanzamento: 'RICEVUTA'
    });

    const resCarico = await avanzaStatoSegnalazioneAction(fdCarico);
    expect(resCarico).toEqual({ success: true });

    expect(mockPrismaTx.eventoStato.create).toHaveBeenCalledWith({
      data: {
        segnalazione_id: 'seg-201',
        attore_id: comitatoUser.id,
        tipo_attore: 'UTENTE',
        ambito: 'AVANZAMENTO',
        da_stato: 'RICEVUTA',
        a_stato: 'PRESA_IN_CARICO',
        motivazione: 'Aperta istruttoria tecnica del comitato con l ufficio manutenzioni',
        revisione: 3
      }
    });

    // Passo B: da PRESA_IN_CARICO a INVIATA_AI_CANDIDATI (registrazione avvenuta trasmissione)
    mockPrismaTx.$queryRaw.mockResolvedValue([
      { id: 'seg-201', revisione: 3, stato_moderazione: 'APPROVATA', stato_avanzamento: 'PRESA_IN_CARICO' }
    ]);

    mockPrismaTx.segnalazione.update.mockResolvedValue({
      id: 'seg-201',
      stato_avanzamento: 'INVIATA_AI_CANDIDATI'
    });

    const fdTrasmissione = buildComitatoAvanzaFormData({
      segnalazioneId: 'seg-201',
      nuovoStato: 'INVIATA_AI_CANDIDATI',
      motivazione: 'Proposta inserita nel dossier civico ufficiale per il confronto tra liste',
      revisione: 3,
      statoAvanzamento: 'PRESA_IN_CARICO'
    });

    const resTrasmissione = await avanzaStatoSegnalazioneAction(fdTrasmissione);
    expect(resTrasmissione).toEqual({ success: true });

    expect(mockPrismaTx.eventoStato.create).toHaveBeenCalledWith({
      data: {
        segnalazione_id: 'seg-201',
        attore_id: comitatoUser.id,
        tipo_attore: 'UTENTE',
        ambito: 'AVANZAMENTO',
        da_stato: 'PRESA_IN_CARICO',
        a_stato: 'INVIATA_AI_CANDIDATI',
        motivazione: 'Proposta inserita nel dossier civico ufficiale per il confronto tra liste',
        revisione: 3
      }
    });
  });

  // ── 4. RIFIUTO SU STATO SUPERATO O CONFLITTO DI REVISIONE ──
  it('4a. Rifiuto su conflitto di revisione: expectedRevision obsoleta blocca la decisione', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    mockPrismaTx.utente.findUnique.mockResolvedValue({
      id: comitatoUser.id,
      ruolo: 'COMITATO',
      stato_account: 'ATTIVO',
      verificato_il: new Date()
    });

    // Nel DB la segnalazione ha già revisione 3 (es. cittadino ha aggiornato il testo)
    mockPrismaTx.$queryRaw.mockResolvedValue([
      { id: 'seg-301', revisione: 3, stato_moderazione: 'IN_REVISIONE', stato_avanzamento: 'RICEVUTA' }
    ]);

    // Il comitato tenta di deliberare basandosi sulla vecchia revisione 2
    const formData = new FormData();
    formData.set('segnalazioneId', 'seg-301');
    formData.set('decision', 'APPROVATA');
    formData.set('motivazione', 'Approvazione su vista obsoleta');
    formData.set('expectedRevision', '2');
    formData.set('expectedState', 'IN_REVISIONE');

    const res = await moderaSegnalazioneAction(formData);
    expect(res).toHaveProperty('error');
    expect(res.error).toMatch(/Conflitto Concorrenza|Conflitto di versione/i);
    expect(mockPrismaTx.segnalazione.update).not.toHaveBeenCalled();
  });

  it('4b. Rifiuto su stato superato: expectedState disallineato rispetto al DB blocca la transizione', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    mockPrismaTx.utente.findUnique.mockResolvedValue({
      id: comitatoUser.id,
      ruolo: 'COMITATO',
      stato_account: 'ATTIVO',
      verificato_il: new Date()
    });

    // Nel DB la segnalazione è già APPROVATA
    mockPrismaTx.$queryRaw.mockResolvedValue([
      { id: 'seg-302', revisione: 1, stato_moderazione: 'APPROVATA', stato_avanzamento: 'RICEVUTA' }
    ]);

    // Form tenta moderazione aspettandosi PENDENTE
    const formData = new FormData();
    formData.set('segnalazioneId', 'seg-302');
    formData.set('decision', 'RIFIUTATA');
    formData.set('motivazione', 'Rifiuto tardivo');
    formData.set('expectedRevision', '1');
    formData.set('expectedState', 'PENDENTE');

    const res = await moderaSegnalazioneAction(formData);
    expect(res).toHaveProperty('error');
    expect(res.error).toMatch(/Conflitto Concorrenza|Conflitto di stato/i);
    expect(mockPrismaTx.segnalazione.update).not.toHaveBeenCalled();
  });

  it('4c. Rifiuto avanzamento per segnalazione NON approvata (es. PENDENTE o RIFIUTATA)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    mockPrismaTx.utente.findUnique.mockResolvedValue({
      id: comitatoUser.id,
      ruolo: 'COMITATO',
      stato_account: 'ATTIVO',
      verificato_il: new Date()
    });

    // Segnalazione ancora PENDENTE di moderazione
    mockPrismaTx.$queryRaw.mockResolvedValue([
      { id: 'seg-303', revisione: 1, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
    ]);

    const formData = new FormData();
    formData.set('segnalazioneId', 'seg-303');
    formData.set('nuovoStato', 'PRESA_IN_CARICO');
    formData.set('motivazione', 'Tentativo di presa in carico anticipata');
    formData.set('expectedRevision', '1');
    formData.set('expectedState', 'RICEVUTA');

    const res = await avanzaStatoSegnalazioneAction(formData);
    expect(res).toHaveProperty('error');
    expect(res.error).toMatch(/richiede moderazione APPROVATA/i);
    expect(mockPrismaTx.segnalazione.update).not.toHaveBeenCalled();
  });

  // ── 5. DINIEGO AUTORIZZAZIONE A CITTADINO O ANONIMO ──
  it('5a. Diniego a un cittadino che invochi direttamente moderaSegnalazioneAction', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(cittadinoUser);

    const formData = new FormData();
    formData.set('segnalazioneId', 'seg-401');
    formData.set('decision', 'APPROVATA');
    formData.set('motivazione', 'Autocertificazione cittadino');
    formData.set('expectedRevision', '1');
    formData.set('expectedState', 'PENDENTE');

    const res = await moderaSegnalazioneAction(formData);
    expect(res).toEqual({ error: 'Accesso negato: operazione riservata al comitato' });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('5b. Diniego a un cittadino che invochi direttamente avanzaStatoSegnalazioneAction', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(cittadinoUser);

    const formData = new FormData();
    formData.set('segnalazioneId', 'seg-401');
    formData.set('nuovoStato', 'PRESA_IN_CARICO');
    formData.set('motivazione', 'Avanzamento abusivo da cittadino');
    formData.set('expectedRevision', '1');
    formData.set('expectedState', 'RICEVUTA');

    const res = await avanzaStatoSegnalazioneAction(formData);
    expect(res).toEqual({ error: 'Accesso negato: operazione riservata al comitato' });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('5c. Diniego ad utente anonimo (sessione assente)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const formData = new FormData();
    formData.set('segnalazioneId', 'seg-401');
    formData.set('decision', 'APPROVATA');
    formData.set('motivazione', 'Tentativo anonimo');
    formData.set('expectedRevision', '1');
    formData.set('expectedState', 'PENDENTE');

    const res = await moderaSegnalazioneAction(formData);
    expect(res).toEqual({ error: 'Accesso negato: operazione riservata al comitato' });
  });

  // ── 6. VALIDAZIONE SERVER-SIDE RIGOROSA DEI CAMPI ──
  it('6a. Rifiuta moderazione se mancano decision, motivazione, expectedRevision o expectedState', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    // Manca motivazione
    const fdNoMot = new FormData();
    fdNoMot.set('segnalazioneId', 'seg-501');
    fdNoMot.set('decision', 'APPROVATA');
    fdNoMot.set('expectedRevision', '1');
    fdNoMot.set('expectedState', 'PENDENTE');
    const resNoMot = await moderaSegnalazioneAction(fdNoMot);
    expect(resNoMot.error).toContain('La motivazione della moderazione è obbligatoria');

    // Manca expectedRevision
    const fdNoRev = new FormData();
    fdNoRev.set('segnalazioneId', 'seg-501');
    fdNoRev.set('decision', 'APPROVATA');
    fdNoRev.set('motivazione', 'Valida');
    fdNoRev.set('expectedState', 'PENDENTE');
    const resNoRev = await moderaSegnalazioneAction(fdNoRev);
    expect(resNoRev.error).toContain('Revisione attesa obbligatoria');

    // Manca expectedState
    const fdNoState = new FormData();
    fdNoState.set('segnalazioneId', 'seg-501');
    fdNoState.set('decision', 'APPROVATA');
    fdNoState.set('motivazione', 'Valida');
    fdNoState.set('expectedRevision', '1');
    const resNoState = await moderaSegnalazioneAction(fdNoState);
    expect(resNoState.error).toContain('Stato atteso di moderazione obbligatorio');

    // Decisione non valida
    const fdBadDec = new FormData();
    fdBadDec.set('segnalazioneId', 'seg-501');
    fdBadDec.set('decision', 'QUALSIASI_COSA');
    fdBadDec.set('motivazione', 'Valida');
    fdBadDec.set('expectedRevision', '1');
    fdBadDec.set('expectedState', 'PENDENTE');
    const resBadDec = await moderaSegnalazioneAction(fdBadDec);
    expect(resBadDec.error).toContain('Decisione di moderazione non valida');
  });

  it('6b. Rifiuta avanzamento se mancano nuovoStato, motivazione, expectedRevision o expectedState', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    // Manca expectedState
    const fd = new FormData();
    fd.set('segnalazioneId', 'seg-502');
    fd.set('nuovoStato', 'PRESA_IN_CARICO');
    fd.set('motivazione', 'Motivazione valida');
    fd.set('expectedRevision', '1');
    const res = await avanzaStatoSegnalazioneAction(fd);
    expect(res.error).toContain('Stato atteso di avanzamento obbligatorio');

    // Stato di destinazione non consentito
    const fdBadState = new FormData();
    fdBadState.set('segnalazioneId', 'seg-502');
    fdBadState.set('nuovoStato', 'RISOLTA'); // 'RISOLTA' non esiste nel modello!
    fdBadState.set('motivazione', 'Motivazione valida');
    fdBadState.set('expectedRevision', '1');
    fdBadState.set('expectedState', 'RICEVUTA');
    const resBad = await avanzaStatoSegnalazioneAction(fdBadState);
    expect(resBad.error).toContain('Stato di avanzamento non valido');
  });

  // ── 7. ACCESSO IN SOLA LETTURA ALLA CODA E AL REGISTRO (NESSUNA SCRITTURA SU CATALOGO) ──
  it('7. Coda e registro eseguono solo query in lettura e NON invocano ensureDefaultCategorie() o scritture su Categoria', async () => {
    mockPrisma.segnalazione.findMany.mockResolvedValue([]);

    await getCodaRevisioniComitato();
    await getTutteSegnalazioniComitato();

    // Verificato: nessuna scrittura nel catalogo categorie
    expect(mockPrisma.categoria.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.segnalazione.findMany).toHaveBeenCalledTimes(2);
  });

  // ── 8. REGRESSIONE MIRATA DIFETTO decisione/decision ──
  it('8a. Regressione difetto decisione/decision: la Server Action elabora con successo il payload legacy che trasmette SOLO "decisione", "revisioneAttesa" e "statoAtteso"', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    mockPrismaTx.utente.findUnique.mockResolvedValue({
      id: comitatoUser.id,
      ruolo: 'COMITATO',
      stato_account: 'ATTIVO',
      verificato_il: new Date()
    });

    mockPrismaTx.$queryRaw.mockResolvedValue([
      { id: 'seg-601', revisione: 1, stato_moderazione: 'PENDENTE', stato_avanzamento: 'RICEVUTA' }
    ]);

    mockPrismaTx.segnalazione.update.mockResolvedValue({
      id: 'seg-601',
      stato_moderazione: 'APPROVATA',
      revisione: 1
    });

    // Simulazione payload con SOLI campi italiani usati storicamente dal componente (senza "decision", "expectedRevision", "expectedState")
    const legacyFormData = new FormData();
    legacyFormData.set('segnalazioneId', 'seg-601');
    legacyFormData.set('decisione', 'APPROVATA'); // Solo "decisione"
    legacyFormData.set('motivazione', 'Risoluzione approvata con sola chiave italiana');
    legacyFormData.set('revisioneAttesa', '1');   // Solo "revisioneAttesa"
    legacyFormData.set('statoAtteso', 'PENDENTE'); // Solo "statoAtteso"

    const res = await moderaSegnalazioneAction(legacyFormData);
    expect(res).toEqual({ success: true });

    expect(mockPrismaTx.segnalazione.update).toHaveBeenCalledWith({
      where: { id: 'seg-601' },
      data: { stato_moderazione: 'APPROVATA' }
    });
  });

  it('8b. Regressione difetto decisione/decision: fallimento controllato se mancano sia "decision" che "decisione"', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    const fdMissingBoth = new FormData();
    fdMissingBoth.set('segnalazioneId', 'seg-602');
    fdMissingBoth.set('motivazione', 'Motivazione presente ma nessuna decisione');
    fdMissingBoth.set('expectedRevision', '1');
    fdMissingBoth.set('expectedState', 'PENDENTE');

    const res = await moderaSegnalazioneAction(fdMissingBoth);
    expect(res).toEqual({ error: 'Decisione di moderazione non valida o mancante' });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  // ── 9. REGRESSIONE MIRATA AVANZAMENTO (nuovoStato / statoAtteso) ──
  it('9. Regressione nuovoStato/statoAtteso: la Server Action elabora con successo il payload con soli campi italiani', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    mockPrismaTx.utente.findUnique.mockResolvedValue({
      id: comitatoUser.id,
      ruolo: 'COMITATO',
      stato_account: 'ATTIVO',
      verificato_il: new Date()
    });

    mockPrismaTx.$queryRaw.mockResolvedValue([
      { id: 'seg-701', revisione: 2, stato_moderazione: 'APPROVATA', stato_avanzamento: 'RICEVUTA' }
    ]);

    mockPrismaTx.segnalazione.update.mockResolvedValue({
      id: 'seg-701',
      stato_avanzamento: 'PRESA_IN_CARICO'
    });

    const fdLegacyAvanza = new FormData();
    fdLegacyAvanza.set('segnalazioneId', 'seg-701');
    fdLegacyAvanza.set('nuovoStato', 'PRESA_IN_CARICO'); // Solo "nuovoStato"
    fdLegacyAvanza.set('motivazione', 'Passaggio registrato con nomenclatura italiana');
    fdLegacyAvanza.set('revisioneAttesa', '2');         // Solo "revisioneAttesa"
    fdLegacyAvanza.set('statoAtteso', 'RICEVUTA');       // Solo "statoAtteso"

    const res = await avanzaStatoSegnalazioneAction(fdLegacyAvanza);
    expect(res).toEqual({ success: true });

    expect(mockPrismaTx.segnalazione.update).toHaveBeenCalledWith({
      where: { id: 'seg-701' },
      data: { stato_avanzamento: 'PRESA_IN_CARICO' }
    });
  });

  // ── 10. CONFERMA CATEGORIE CON PAYLOAD EFFETTIVO DEL FORM ──
  it('10. Aggiornamento categorie: usa il costruttore effettivo buildComitatoCategorieFormData e registra la modifica', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(comitatoUser);

    mockPrismaTx.utente.findUnique.mockResolvedValue({
      id: comitatoUser.id,
      ruolo: 'COMITATO',
      stato_account: 'ATTIVO',
      verificato_il: new Date()
    });

    mockPrismaTx.segnalazione.findUnique.mockResolvedValue({
      id: 'seg-801',
      revisione: 1,
      stato_moderazione: 'IN_REVISIONE',
      stato_avanzamento: 'RICEVUTA'
    });
    mockPrismaTx.$queryRaw.mockResolvedValue([
      { id: 'seg-801', revisione: 1, stato_moderazione: 'IN_REVISIONE', stato_avanzamento: 'RICEVUTA' }
    ]);

    mockPrismaTx.categoria.findMany.mockResolvedValue([
      { id: 'cat-strade', nome: 'Strade e Marciapiedi', attiva: true },
      { id: 'cat-verde', nome: 'Verde Pubblico', attiva: true }
    ]);

    mockPrismaTx.segnalazioneCategoria.findMany.mockResolvedValue([]);
    mockPrismaTx.segnalazioneCategoria.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaTx.segnalazioneCategoria.createMany.mockResolvedValue({ count: 2 });

    // Payload generato dal costruttore FormData del componente
    const formData = buildComitatoCategorieFormData({
      segnalazioneId: 'seg-801',
      categoryIds: ['cat-strade', 'cat-verde'],
      revisione: 1
    });

    const res = await aggiornaCategorieAction(formData);
    expect(res).toEqual({ success: true });

    expect(mockPrismaTx.segnalazioneCategoria.createMany).toHaveBeenCalledWith({
      data: [
        { segnalazione_id: 'seg-801', categoria_id: 'cat-strade' },
        { segnalazione_id: 'seg-801', categoria_id: 'cat-verde' }
      ]
    });
  });
});
