import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitSegnalazioneAction } from '@/actions/uploads';
import { getCurrentUser } from '@/actions/auth';
import { createSegnalazioneAtomica } from '@/lib/domain/segnalazioni';

vi.mock('@/actions/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/domain/segnalazioni', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/domain/segnalazioni')>();
  return {
    ...actual,
    createSegnalazioneAtomica: vi.fn(),
  };
});

describe('submitSegnalazioneAction - Invio Coordinate Confermate e Validazione Luogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'utente-1',
      nome: 'Mario',
      cognome: 'Rossi',
      email_normalizzata: 'mario.rossi@example.com',
      ruolo: 'CITTADINO',
      stato_account: 'ATTIVO',
      verificato_il: new Date(),
      codice_fiscale: null,
      quartiere_id: null,
      quartiere: null,
      creato_il: new Date(),
    });
  });

  it('Rifiuta la richiesta se le coordinate sono assenti (mancata selezione del luogo)', async () => {
    const fd = new FormData();
    fd.set('descrizione', 'Buca pericolosa sul marciapiede davanti al civico');
    fd.set('storageKeys', JSON.stringify(['key-1']));

    const res = await submitSegnalazioneAction(fd);

    expect(res.success).toBe(false);
    expect(res.error).toContain('La posizione geografica della segnalazione è obbligatoria');
    expect(createSegnalazioneAtomica).not.toHaveBeenCalled();
  });

  it('Rifiuta coordinate geografiche non valide (latitudine fuori range -90..90)', async () => {
    const fd = new FormData();
    fd.set('descrizione', 'Buca pericolosa sul marciapiede davanti al civico');
    fd.set('latitudine', '95.123');
    fd.set('longitudine', '9.1900');
    fd.set('storageKeys', JSON.stringify(['key-1']));

    const res = await submitSegnalazioneAction(fd);

    expect(res.success).toBe(false);
    expect(res.error).toContain('Coordinate geografiche non valide');
    expect(createSegnalazioneAtomica).not.toHaveBeenCalled();
  });

  it('Rifiuta coordinate non numeriche (NaN)', async () => {
    const fd = new FormData();
    fd.set('descrizione', 'Buca pericolosa sul marciapiede davanti al civico');
    fd.set('latitudine', 'non-un-numero');
    fd.set('longitudine', '9.1900');
    fd.set('storageKeys', JSON.stringify(['key-1']));

    const res = await submitSegnalazioneAction(fd);

    expect(res.success).toBe(false);
    expect(res.error).toContain('Coordinate geografiche non valide');
    expect(createSegnalazioneAtomica).not.toHaveBeenCalled();
  });

  it('Invia con successo coordinate confermate con origine MANUALE attraverso il servizio esistente', async () => {
    vi.mocked(createSegnalazioneAtomica).mockResolvedValue({
      id: 'segnalazione-creata-1',
    } as unknown as Awaited<ReturnType<typeof createSegnalazioneAtomica>>);

    const fd = new FormData();
    fd.set('descrizione', 'Buca pericolosa sul marciapiede in via Dante 12');
    fd.set('latitudine', '45.4665');
    fd.set('longitudine', '9.1860');
    fd.set('originePosizione', 'MANUALE');
    fd.set('storageKeys', JSON.stringify(['key-foto-1']));

    const res = await submitSegnalazioneAction(fd);

    expect(res.success).toBe(true);
    expect(res.segnalazioneId).toBe('segnalazione-creata-1');
    expect(createSegnalazioneAtomica).toHaveBeenCalledWith(
      'utente-1',
      'Buca pericolosa sul marciapiede in via Dante 12',
      45.4665,
      9.186,
      ['key-foto-1'],
      undefined,
      undefined,
      'MANUALE'
    );
  });

  it('Invia con successo coordinate confermate con origine EXIF_CONFERMATO quando accettate da foto', async () => {
    vi.mocked(createSegnalazioneAtomica).mockResolvedValue({
      id: 'segnalazione-creata-exif',
    } as unknown as Awaited<ReturnType<typeof createSegnalazioneAtomica>>);

    const fd = new FormData();
    fd.set('descrizione', 'Dissesto stradale documentato con foto geolocalizzata');
    fd.set('latitudine', '45.4750');
    fd.set('longitudine', '9.2050');
    fd.set('originePosizione', 'EXIF_CONFERMATO');
    fd.set('storageKeys', JSON.stringify(['key-foto-gps']));

    const res = await submitSegnalazioneAction(fd);

    expect(res.success).toBe(true);
    expect(res.segnalazioneId).toBe('segnalazione-creata-exif');
    expect(createSegnalazioneAtomica).toHaveBeenCalledWith(
      'utente-1',
      'Dissesto stradale documentato con foto geolocalizzata',
      45.475,
      9.205,
      ['key-foto-gps'],
      undefined,
      undefined,
      'EXIF_CONFERMATO'
    );
  });
});
