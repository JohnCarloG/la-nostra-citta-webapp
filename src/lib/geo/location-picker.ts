/**
 * Modulo di dominio per la gestione dello stato di selezione del luogo
 * della segnalazione territoriale (Milano).
 *
 * Regole architetturali e di integrità:
 * 1. Il centro iniziale della mappa NON è una posizione già scelta.
 * 2. Una sola posizione selezionata condivisa tra mappa, riepilogo e payload.
 * 3. Le correzioni manuali dell'utente non vengono sovrascritte da risposte tardive o dati EXIF.
 * 4. I dati EXIF sono trattati come suggerimento da confermare esplicitamente.
 * 5. Validazione rigorosa delle coordinate geografiche (-90..90, -180..180).
 */

export type OrigineSelezione = 'RICERCA' | 'MAPPA' | 'GPS' | 'EXIF' | 'MANUALE';

export interface PosizioneScelta {
  lat: number;
  lon: number;
  indirizzo?: string;
  origine: OrigineSelezione;
  confermata: boolean;
}

export interface ExifSuggerimento {
  lat: number;
  lon: number;
  nomeFile: string;
}

export interface GeocodingResult {
  id: string;
  titolo: string;
  sottotitolo: string;
  indirizzoCompleto: string;
  lat: number;
  lon: number;
}

export interface LuogoPickerState {
  posizione: PosizioneScelta | null;
  exifSuggerimento: ExifSuggerimento | null;
  posizioneCorrettaManualmente: boolean;
  ultimoIdRichiestaRicerca: number;
  ricercaInCorso: boolean;
  ricercaRisultati: GeocodingResult[];
  ricercaErrore: string | null;
  geoInCorso: boolean;
  geoErrore: string | null;
}

export const STATO_INIZIALE_LUOGO: LuogoPickerState = {
  posizione: null, // Il centro iniziale della mappa NON è una posizione già scelta
  exifSuggerimento: null,
  posizioneCorrettaManualmente: false,
  ultimoIdRichiestaRicerca: 0,
  ricercaInCorso: false,
  ricercaRisultati: [],
  ricercaErrore: null,
  geoInCorso: false,
  geoErrore: null,
};

/**
 * Valida che latitudine e longitudine rientrino nei limiti matematici e di dominio
 */
export function validaCoordinate(lat: number, lon: number): { valida: boolean; errore?: string } {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return { valida: false, errore: 'Le coordinate devono essere numeri decimali validi.' };
  }
  if (lat < -90 || lat > 90) {
    return { valida: false, errore: 'La latitudine deve essere compresa tra -90 e 90 gradi.' };
  }
  if (lon < -180 || lon > 180) {
    return { valida: false, errore: 'La longitudine deve essere compresa tra -180 e 180 gradi.' };
  }
  return { valida: true };
}

/**
 * Avvia una richiesta di ricerca incrementando l'id sequenziale per invalidare risposte obsolete
 */
export function avviaRicerca(state: LuogoPickerState): { nuovoStato: LuogoPickerState; requestId: number } {
  const nextReqId = state.ultimoIdRichiestaRicerca + 1;
  return {
    nuovoStato: {
      ...state,
      ultimoIdRichiestaRicerca: nextReqId,
      ricercaInCorso: true,
      ricercaErrore: null,
    },
    requestId: nextReqId,
  };
}

/**
 * Riceve i risultati di ricerca. Se l'ID richiesta è obsoleto, la risposta viene ignorata.
 * Non altera MAI automaticamente la posizione scelta né sovrascrive correzioni manuali.
 */
export function riceviRisultatiRicerca(
  state: LuogoPickerState,
  requestId: number,
  risultati: GeocodingResult[],
  errore?: string | null
): LuogoPickerState {
  if (requestId !== state.ultimoIdRichiestaRicerca) {
    // Risposta obsoleta: ignora senza modificare lo stato
    return state;
  }
  return {
    ...state,
    ricercaInCorso: false,
    ricercaRisultati: risultati,
    ricercaErrore: errore || null,
  };
}

/**
 * L'utente seleziona un risultato dalla lista di ricerca.
 * Imposta la posizione confermata e aggiorna l'indirizzo descrittivo.
 */
export function selezionaRisultatoRicerca(
  state: LuogoPickerState,
  risultato: GeocodingResult
): LuogoPickerState {
  const validazione = validaCoordinate(risultato.lat, risultato.lon);
  if (!validazione.valida) {
    return { ...state, ricercaErrore: validazione.errore || 'Coordinate non valide' };
  }

  return {
    ...state,
    posizione: {
      lat: risultato.lat,
      lon: risultato.lon,
      indirizzo: risultato.indirizzoCompleto || `${risultato.titolo}, ${risultato.sottotitolo}`,
      origine: 'RICERCA',
      confermata: true,
    },
    ricercaRisultati: [], // Chiude il dropdown dei risultati
    ricercaErrore: null,
    posizioneCorrettaManualmente: false,
  };
}

/**
 * L'utente clicca sulla mappa o trascina il segnaposto.
 * Traccia la correzione manuale impedendo future sovrascritture automatiche silenziose.
 */
export function correggiPuntoMappa(
  state: LuogoPickerState,
  coords: { lat: number; lon: number }
): LuogoPickerState {
  const validazione = validaCoordinate(coords.lat, coords.lon);
  if (!validazione.valida) {
    return state;
  }

  return {
    ...state,
    posizione: {
      lat: coords.lat,
      lon: coords.lon,
      indirizzo: state.posizione?.indirizzo, // Preserva l'indirizzo se già noto o lascia generico
      origine: 'MAPPA',
      confermata: true,
    },
    posizioneCorrettaManualmente: true,
  };
}

/**
 * L'utente utilizza la geolocalizzazione del browser ("Usa la mia posizione").
 */
export function impostaPosizioneGps(
  state: LuogoPickerState,
  coords: { lat: number; lon: number }
): LuogoPickerState {
  const validazione = validaCoordinate(coords.lat, coords.lon);
  if (!validazione.valida) {
    return { ...state, geoErrore: validazione.errore || 'Coordinate GPS non valide', geoInCorso: false };
  }

  return {
    ...state,
    posizione: {
      lat: coords.lat,
      lon: coords.lon,
      indirizzo: 'Posizione rilevata dal dispositivo (GPS)',
      origine: 'GPS',
      confermata: true,
    },
    geoInCorso: false,
    geoErrore: null,
    posizioneCorrettaManualmente: true,
  };
}

/**
 * Gestisce l'errore di geolocalizzazione senza bloccare il resto del form
 */
export function gestisciErroreGps(
  state: LuogoPickerState,
  codiceErrore: number | string,
  messaggio?: string
): LuogoPickerState {
  let feedback = 'Impossibile rilevare la posizione attuale.';
  if (codiceErrore === 1 || codiceErrore === 'PERMISSION_DENIED') {
    feedback = 'Permesso di geolocalizzazione negato nel browser. Puoi cercare l’indirizzo o cliccare sulla mappa.';
  } else if (codiceErrore === 2 || codiceErrore === 'POSITION_UNAVAILABLE') {
    feedback = 'Posizione geografica non disponibile sul tuo dispositivo. Seleziona il punto sulla mappa.';
  } else if (codiceErrore === 3 || codiceErrore === 'TIMEOUT') {
    feedback = 'Tempo per il rilevamento GPS scaduto. Riprova o usa la ricerca.';
  } else if (messaggio) {
    feedback = messaggio;
  }

  return {
    ...state,
    geoInCorso: false,
    geoErrore: feedback,
  };
}

/**
 * Rilevamento coordinate EXIF da foto caricata.
 * Trattato SEMPRE come proposta/suggerimento: non sovrascrive MAI una posizione
 * già scelta o corretta manualmente senza l'esplicito consenso dell'utente.
 */
export function proponiExif(
  state: LuogoPickerState,
  exif: ExifSuggerimento
): LuogoPickerState {
  const validazione = validaCoordinate(exif.lat, exif.lon);
  if (!validazione.valida) {
    return state;
  }

  return {
    ...state,
    exifSuggerimento: exif,
  };
}

/**
 * L'utente accetta il suggerimento EXIF
 */
export function accettaSuggerimentoExif(state: LuogoPickerState): LuogoPickerState {
  if (!state.exifSuggerimento) return state;

  return {
    ...state,
    posizione: {
      lat: state.exifSuggerimento.lat,
      lon: state.exifSuggerimento.lon,
      indirizzo: `Posizione GPS rilevata dalla fotografia (${state.exifSuggerimento.nomeFile})`,
      origine: 'EXIF',
      confermata: true,
    },
    exifSuggerimento: null,
    posizioneCorrettaManualmente: false,
  };
}

/**
 * L'utente rifiuta il suggerimento EXIF
 */
export function ignoraSuggerimentoExif(state: LuogoPickerState): LuogoPickerState {
  return {
    ...state,
    exifSuggerimento: null,
  };
}

/**
 * Inserimento testuale / manuale delle coordinate (alternativa accessibile alla mappa)
 */
export function impostaPosizioneManuale(
  state: LuogoPickerState,
  lat: number,
  lon: number,
  indirizzo?: string
): { nuovoStato: LuogoPickerState; errore?: string } {
  const validazione = validaCoordinate(lat, lon);
  if (!validazione.valida) {
    return { nuovoStato: state, errore: validazione.errore };
  }

  return {
    nuovoStato: {
      ...state,
      posizione: {
        lat,
        lon,
        indirizzo: indirizzo?.trim() || 'Coordinate inserite manualmente',
        origine: 'MANUALE',
        confermata: true,
      },
      posizioneCorrettaManualmente: true,
    },
  };
}

/**
 * Conferma esplicita o modifica dello stato della posizione
 */
export function impostaConfermaPosizione(
  state: LuogoPickerState,
  confermata: boolean
): LuogoPickerState {
  if (!state.posizione) return state;
  return {
    ...state,
    posizione: {
      ...state.posizione,
      confermata,
    },
  };
}

/**
 * Rimuove la posizione selezionata
 */
export function rimuoviPosizione(state: LuogoPickerState): LuogoPickerState {
  return {
    ...state,
    posizione: null,
    posizioneCorrettaManualmente: false,
  };
}
