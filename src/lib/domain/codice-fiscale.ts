/**
 * Modulo di validazione e normalizzazione del Codice Fiscale italiano (D.M. 23/12/1976).
 * 
 * Implementa:
 * - Normalizzazione formale (trim, uppercase)
 * - Decodifica e gestione dell'omocodia (sostituzione cifre con lettere L, M, N, P, Q, R, S, T, U, V)
 * - Calcolo e verifica del carattere di controllo (CIN - 16° carattere)
 * - Validazione di data, mese e intervallo giorni (1-31 M, 41-71 F)
 * - Validazione del codice catastale (1 lettera + 3 caratteri alfanumerici)
 * 
 * NOTA INDEROGABILE DI DOMINIO:
 * Il codice catastale nel codice fiscale identifica il luogo di nascita (o Stato estero),
 * MAI la residenza anagrafica attuale. Non dedurre dal CF una residenza verificata.
 */

// Mappa omocodia per le 7 posizioni numeriche (indici 0-based: 6, 7, 9, 10, 12, 13, 14)
const OMOCODIA_DECODE: Record<string, string> = {
  L: '0',
  M: '1',
  N: '2',
  P: '3',
  Q: '4',
  R: '5',
  S: '6',
  T: '7',
  U: '8',
  V: '9',
};

const NUMERIC_POSITIONS = [6, 7, 9, 10, 12, 13, 14];

// Mesi ammessi: A=Gen, B=Feb, C=Mar, D=Apr, E=Mag, H=Giu, L=Lug, M=Ago, P=Set, R=Ott, S=Nov, T=Dic
const MESI_VALIDI = new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L', 'M', 'P', 'R', 'S', 'T']);

// Tabella valori posizioni dispari (1-based: 1, 3, 5, ..., 15)
const VALORI_DISPARI: Record<string, number> = {
  '0': 1,  '1': 0,  '2': 5,  '3': 7,  '4': 9,  '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  'A': 1,  'B': 0,  'C': 5,  'D': 7,  'E': 9,  'F': 13, 'G': 15, 'H': 17, 'I': 19, 'J': 21,
  'K': 2,  'L': 4,  'M': 18, 'N': 20, 'O': 11, 'P': 3,  'Q': 6,  'R': 8,  'S': 12, 'T': 14,
  'U': 16, 'V': 10, 'W': 22, 'X': 25, 'Y': 24, 'Z': 23,
};

// Tabella valori posizioni pari (1-based: 2, 4, 6, ..., 14)
function getValorePari(char: string): number {
  if (char >= '0' && char <= '9') {
    return char.charCodeAt(0) - '0'.charCodeAt(0);
  }
  if (char >= 'A' && char <= 'Z') {
    return char.charCodeAt(0) - 'A'.charCodeAt(0);
  }
  return 0;
}

export interface CodiceFiscaleValidationResult {
  valido: boolean;
  cfNormalizzato?: string;
  motivoErrore?: string;
}

/**
 * Normalizza il codice fiscale: rimuove spazi e converte in maiuscolo.
 */
export function normalizzaCodiceFiscale(cf: string): string {
  return cf.trim().toUpperCase();
}

/**
 * Calcola il carattere di controllo (CIN) sui primi 15 caratteri di un codice fiscale.
 */
export function calcolaCarattereDiControllo(primi15: string): string {
  if (primi15.length !== 15) {
    throw new Error('Il calcolo del carattere di controllo richiede esattamente 15 caratteri.');
  }

  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const char = primi15[i];
    const isDispari = (i + 1) % 2 !== 0; // 1-indexed

    if (isDispari) {
      const val = VALORI_DISPARI[char];
      if (val === undefined) {
        throw new Error(`Carattere non valido in posizione dispari: ${char}`);
      }
      somma += val;
    } else {
      somma += getValorePari(char);
    }
  }

  const remainder = somma % 26;
  return String.fromCharCode('A'.charCodeAt(0) + remainder);
}

/**
 * Risolve eventuali lettere di omocodia nelle posizioni numeriche standard.
 */
export function decodificaOmocodia(cf: string): string {
  const chars = cf.split('');
  for (const pos of NUMERIC_POSITIONS) {
    const c = chars[pos];
    if (OMOCODIA_DECODE[c] !== undefined) {
      chars[pos] = OMOCODIA_DECODE[c];
    }
  }
  return chars.join('');
}

/**
 * Valida rigorosamente un codice fiscale secondo le regole ministeriali italiane.
 */
export function validaCodiceFiscale(cf: string): CodiceFiscaleValidationResult {
  if (!cf || typeof cf !== 'string') {
    return { valido: false, motivoErrore: 'Codice fiscale obbligatorio' };
  }

  const cfNorm = normalizzaCodiceFiscale(cf);

  if (cfNorm.length !== 16) {
    return { valido: false, motivoErrore: 'Il codice fiscale deve essere lungo esattamente 16 caratteri' };
  }

  // Verifica caratteri ammessi (solo lettere A-Z e cifre 0-9)
  if (!/^[A-Z0-9]{16}$/.test(cfNorm)) {
    return { valido: false, motivoErrore: 'Il codice fiscale contiene caratteri non ammessi' };
  }

  // Primi 6 caratteri devono essere lettere (cognome e nome)
  if (!/^[A-Z]{6}/.test(cfNorm)) {
    return { valido: false, motivoErrore: 'I primi 6 caratteri devono essere lettere' };
  }

  // 1. Verifica del carattere di controllo (CIN) sui 15 caratteri originali
  const cinAtteso = calcolaCarattereDiControllo(cfNorm.slice(0, 15));
  const cinEffettivo = cfNorm[15];

  if (cinAtteso !== cinEffettivo) {
    return { valido: false, motivoErrore: 'Carattere di controllo del codice fiscale non valido' };
  }

  // 2. Decodifica omocodia per validazione semantica di data, mese e comune
  const cfDecodificato = decodificaOmocodia(cfNorm);

  // Posizioni 6-7: anno (2 cifre)
  const annoStr = cfDecodificato.slice(6, 8);
  if (!/^\d{2}$/.test(annoStr)) {
    return { valido: false, motivoErrore: 'Anno di nascita non valido nel codice fiscale' };
  }

  // Posizione 8: mese (lettera)
  const meseLettera = cfDecodificato[8];
  if (!MESI_VALIDI.has(meseLettera)) {
    return { valido: false, motivoErrore: 'Mese di nascita non valido nel codice fiscale' };
  }

  // Posizioni 9-10: giorno (2 cifre)
  const giornoStr = cfDecodificato.slice(9, 11);
  if (!/^\d{2}$/.test(giornoStr)) {
    return { valido: false, motivoErrore: 'Giorno di nascita non valido nel codice fiscale' };
  }
  const giornoNum = parseInt(giornoStr, 10);
  const isMaschio = giornoNum >= 1 && giornoNum <= 31;
  const isFemmina = giornoNum >= 41 && giornoNum <= 71;

  if (!isMaschio && !isFemmina) {
    return { valido: false, motivoErrore: 'Giorno di nascita o genere non valido nel codice fiscale' };
  }

  // Posizioni 11-14: codice catastale comune (1 lettera + 3 cifre decodificate)
  const catastale = cfDecodificato.slice(11, 15);
  if (!/^[A-Z]\d{3}$/.test(catastale)) {
    return { valido: false, motivoErrore: 'Codice catastale del comune o Stato estero non valido' };
  }

  return {
    valido: true,
    cfNormalizzato: cfNorm,
  };
}
