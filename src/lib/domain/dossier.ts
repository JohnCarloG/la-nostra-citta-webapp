/**
 * Modulo Dominio Dossier (Fase 6 - RF13, T18)
 *
 * Linee guida e requisiti inderogabili:
 * 1. Estrazione condivisa:
 *    - Include solo segnalazioni pubbliche autorizzate (stato_moderazione = 'APPROVATA' e stato_avanzamento <> 'RITIRATA').
 *    - Conteggia solo i sostegni validi da utenti attivi e verificati (escludendo l'autore).
 *    - Applica l'ordinamento e lo spareggio deterministico fissato per la classifica (sostegni_validi DESC, creata_il ASC, id ASC).
 * 2. Privacy e tutela dati personali (T18):
 *    - Nessuna esportazione di email, codici fiscali, password_hash, token, residenza o storage key private.
 * 3. Protezione da CSV/Formula Injection:
 *    - Neutralizzazione rigorosa di qualsiasi cella controllata dall'utente che inizi con =, +, -, @, \t, \r,
 *      inclusi i casi con spazi bianchi o caratteri di controllo iniziali.
 * 4. Encoding e formattazione:
 *    - Standard RFC 4180 con quoting di virgole, doppi apici e ritorni a capo.
 *    - Byte Order Mark UTF-8 (\uFEFF) per corretta interpretazione Unicode su fogli di calcolo (es. Microsoft Excel).
 */

import { prisma } from '../db';
import { Prisma } from '@prisma/client';

export interface DossierFiltri {
  categoriaId?: string;
  statoAvanzamento?: 'RICEVUTA' | 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI';
  ordinamento?: 'piu_sostenute' | 'piu_recenti' | 'meno_recenti';
  limite?: number;
}

export interface DossierItem {
  id: string;
  descrizione: string;
  stato_avanzamento: string;
  categorie: string[];
  latitudine: number;
  longitudine: number;
  sostegni_validi: number;
  creata_il: Date;
}

/**
 * Neutralizza i vettori di Formula Injection (CSV Injection / DDE).
 * Protegge celle che iniziano con '=', '+', '-', '@', '\t', '\r',
 * anche quando preceduti da spazi o caratteri di controllo non stampabili.
 *
 * La protezione consiste nell'anteporre un singolo apice (') che forza
 * il visualizzatore (Excel, Calc) a interpretare il valore come testo letterale.
 */
export function sanitizeCsvFormula(value: string): string {
  if (!value || typeof value !== 'string') {
    return value ?? '';
  }

  // Rileva se, ignorando spazi e caratteri di controllo iniziali, la stringa inizia con un operatore di formula
  const match = value.match(/^[\s\u0000-\u001f]*([=+\-@\t\r])/);
  if (match) {
    // Prefissa con singolo apice per neutralizzare l'esecuzione della formula
    return `'${value}`;
  }

  return value;
}

/**
 * Esegue l'escaping di un singolo campo CSV secondo lo standard RFC 4180.
 * Neutralizza prima le formule e poi racchiude tra doppi apici se contiene delimitatori o spazi estremi.
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }

  let str = String(val);
  str = sanitizeCsvFormula(str);

  // Se contiene doppi apici, virgola, punto e virgola, ritorni a capo o spazi iniziali/finali
  if (/[",;\r\n]/.test(str) || str.startsWith(' ') || str.endsWith(' ')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Servizio di estrazione condiviso per il Dossier Civico (RF13, T18).
 * Riutilizza esattamente i vincoli di dominio:
 * - Visibilità: APPROVATA e NON RITIRATA
 * - Sostegni: solo sostenitori ATTIVI e VERIFICATI (divieto autosostegno garantito da schema e transazione)
 * - Nessun dato riservato dell'utente presente nel payload
 */
export async function getDossierSegnalazioni(filtri?: DossierFiltri): Promise<DossierItem[]> {
  const limite = filtri?.limite && filtri.limite > 0 && filtri.limite <= 1000 ? filtri.limite : 500;
  const categoriaId = filtri?.categoriaId;
  const statoAvanzamento = filtri?.statoAvanzamento;
  const ordinamento = filtri?.ordinamento || 'piu_sostenute';

  interface RawDossierRow {
    id: string;
    descrizione: string;
    latitudine: number;
    longitudine: number;
    stato_avanzamento: string;
    creata_il: Date;
    sostegni_validi: bigint | number;
  }

  // Costruzione della query SQL sicura parametrizzata per preservare il calcolo esatto della classifica
  // Vincolo VI06: solo APPROVATA e diversa da RITIRATA
  // Determinazione clausola ORDER BY condivisa con la classifica
  let orderByClause = Prisma.sql`ORDER BY sostegni_validi DESC, s.creata_il ASC, s.id ASC`;
  if (ordinamento === 'piu_recenti') {
    orderByClause = Prisma.sql`ORDER BY s.creata_il DESC, s.id ASC`;
  } else if (ordinamento === 'meno_recenti') {
    orderByClause = Prisma.sql`ORDER BY s.creata_il ASC, s.id ASC`;
  }

  // Costruzione condizioni dinamiche parametrizzate
  const conditions: Prisma.Sql[] = [
    Prisma.sql`s.stato_moderazione = 'APPROVATA'`,
    Prisma.sql`s.stato_avanzamento <> 'RITIRATA'`
  ];

  if (statoAvanzamento) {
    conditions.push(Prisma.sql`s.stato_avanzamento = ${statoAvanzamento}`);
  }

  if (categoriaId) {
    conditions.push(Prisma.sql`s.id IN (SELECT segnalazione_id FROM SegnalazioneCategoria WHERE categoria_id = ${categoriaId})`);
  }

  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

  const rawRows = await prisma.$queryRaw<RawDossierRow[]>`
    SELECT 
      s.id,
      s.descrizione,
      s.latitudine,
      s.longitudine,
      s.stato_avanzamento,
      s.creata_il,
      CAST(COUNT(u_supporter.id) AS SIGNED) AS sostegni_validi
    FROM Segnalazione s
    LEFT JOIN Sostegno v ON v.segnalazione_id = s.id
    LEFT JOIN Utente u_supporter ON u_supporter.id = v.utente_id
      AND u_supporter.stato_account = 'ATTIVO'
      AND u_supporter.verificato_il IS NOT NULL
    ${whereClause}
    GROUP BY s.id
    ${orderByClause}
    LIMIT ${limite};
  `;

  if (rawRows.length === 0) {
    return [];
  }

  const ids = rawRows.map(r => r.id);

  // Arricchimento categorie confermate dal catalogo
  const categorieList = await prisma.segnalazioneCategoria.findMany({
    where: { segnalazione_id: { in: ids } },
    include: { categoria: true }
  });

  const categorieMap = new Map<string, string[]>();
  for (const c of categorieList) {
    const list = categorieMap.get(c.segnalazione_id) || [];
    list.push(c.categoria.nome);
    categorieMap.set(c.segnalazione_id, list);
  }

  return rawRows.map(r => ({
    id: r.id,
    descrizione: r.descrizione,
    stato_avanzamento: r.stato_avanzamento,
    categorie: categorieMap.get(r.id) || [],
    latitudine: Number(r.latitudine),
    longitudine: Number(r.longitudine),
    sostegni_validi: Number(r.sostegni_validi || 0),
    creata_il: r.creata_il
  }));
}

/**
 * Genera il contenuto testuale CSV del Dossier conforme a RFC 4180 e protetto da Formula Injection.
 * Inserisce il Byte Order Mark UTF-8 (\uFEFF) per garantire corretta decodifica degli accenti in Excel.
 */
export function generateDossierCsv(
  items: DossierItem[]
): string {
  const UTF8_BOM = '\uFEFF';
  const headers = [
    'Posizione',
    'ID Segnalazione',
    'Descrizione',
    'Stato Avanzamento',
    'Categorie',
    'Latitudine',
    'Longitudine',
    'Sostegni Validi',
    'Data Inserimento UTC'
  ];

  const headerLine = headers.map(h => escapeCsvField(h)).join(',');

  const rows = items.map((item, index) => {
    const fields = [
      index + 1,
      item.id,
      item.descrizione,
      item.stato_avanzamento,
      item.categorie.join('; '),
      item.latitudine.toFixed(6),
      item.longitudine.toFixed(6),
      item.sostegni_validi,
      item.creata_il.toISOString()
    ];
    return fields.map(f => escapeCsvField(f)).join(',');
  });

  // Metadati di apertura facoltativi nei commenti CSV o riga descrittiva se richiesto
  // Lo standard dei dati parte direttamente con gli header
  return UTF8_BOM + [headerLine, ...rows].join('\r\n') + '\r\n';
}
