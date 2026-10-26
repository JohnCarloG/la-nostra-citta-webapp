import { prisma } from '../db';
import { ConcurrencyConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';
import { Prisma, StatoModerazione, StatoAvanzamento } from '@prisma/client';

/**
 * Policy di visibilità unificata per tutti i percorsi pubblici (VI06):
 * Una segnalazione è visibile al pubblico se e solo se:
 * - stato_moderazione === 'APPROVATA'
 * - stato_avanzamento !== 'RITIRATA'
 */
export function isSegnalazionePubblica(segnalazione: {
  stato_moderazione: string;
  stato_avanzamento: string;
}): boolean {
  return (
    segnalazione.stato_moderazione === 'APPROVATA' &&
    segnalazione.stato_avanzamento !== 'RITIRATA'
  );
}

export const DEFAULT_CATEGORIE = [
  { codice: 'STRADE_MARCIAPIEDI', nome: 'Strade, buche e marciapiedi' },
  { codice: 'VERDE_ARREDO', nome: 'Verde pubblico e arredo urbano' },
  { codice: 'ILLUMINAZIONE', nome: 'Illuminazione pubblica e impianti' },
  { codice: 'RIFIUTI_PULIZIA', nome: 'Rifiuti e igiene urbana' },
  { codice: 'MOBILITA_SOSTENIBILE', nome: 'Mobilità sostenibile e ciclabili' },
  { codice: 'SICUREZZA_DEGRADO', nome: 'Sicurezza e degrado urbano' },
  { codice: 'ACCESSIBILITA', nome: 'Barriere architettoniche e accessibilità' }
];

/**
 * Assicura che le categorie predefinite siano presenti a catalogo.
 * Procedura esplicita di setup: preserva lo stato delle categorie esistenti
 * (comprese quelle disattivate) aggiornando solo il nome.
 */
export async function ensureDefaultCategorie() {
  for (const cat of DEFAULT_CATEGORIE) {
    await prisma.categoria.upsert({
      where: { codice: cat.codice },
      update: { nome: cat.nome },
      create: { codice: cat.codice, nome: cat.nome, attiva: true }
    });
  }
}

/**
 * Recupera l'elenco delle categorie attive (sola lettura)
 */
export async function getCategorieAttive() {
  return prisma.categoria.findMany({
    where: { attiva: true },
    orderBy: { nome: 'asc' }
  });
}

export async function createSegnalazioneAtomica(
  autoreId: string,
  descrizione: string,
  lat: number,
  lon: number,
  storageKeys: string[],
  quartiereId?: string,
  categoriaId?: string,
  originePosizione?: 'MANUALE' | 'EXIF_CONFERMATO'
) {
  // 1. Validazione requisiti cardinalità e allegati (RF04, VI04)
  if (!storageKeys || storageKeys.length === 0) {
    throw new ValidationError('La segnalazione richiede almeno un media');
  }

  if (storageKeys.length > 5) {
    throw new ValidationError('Massimo 5 allegati consentiti per segnalazione');
  }

  // Prevenzione identificatori upload duplicati nella richiesta
  const uniqueKeys = new Set(storageKeys);
  if (uniqueKeys.size !== storageKeys.length) {
    throw new ValidationError('Identificatori upload duplicati nella richiesta');
  }

  // Validazione coordinate geografiche (VI05)
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new ValidationError('Coordinate geografiche non valide (latitudine tra -90 e 90, longitudine tra -180 e 180)');
  }

  // Validazione descrizione (RF04)
  if (!descrizione || descrizione.trim().length === 0) {
    throw new ValidationError('La descrizione della segnalazione non può essere vuota');
  }

  // Creazione atomica: Segnalazione, Media e gli Eventi/Audit associati nella stessa transazione.
  return prisma.$transaction(async (tx) => {
    // 1. Validazione Autore: deve essere attivo e verificato
    const autore = await tx.utente.findUnique({
      where: { id: autoreId },
      select: { stato_account: true, verificato_il: true }
    });
    if (!autore || autore.stato_account !== 'ATTIVO' || !autore.verificato_il) {
      throw new ForbiddenError('Utente non autorizzato o account non verificato');
    }

    // 2. Acquisizione e Consumo Atomico UploadTemporaneo
    const res = await tx.uploadTemporaneo.updateMany({
      where: {
        proprietario_id: autoreId,
        storage_key: { in: storageKeys },
        stato: 'VALIDO',
        scade_il: { gt: new Date() }
      },
      data: {
        stato: 'CONSUMATO',
        consumato_il: new Date()
      }
    });

    if (res.count !== storageKeys.length) {
      throw new ValidationError('Impossibile consumare gli upload: non validi, scaduti, altrui o inesistenti');
    }

    // Lettura dei metadati ORIGINALI validati da backend
    const uploads = await tx.uploadTemporaneo.findMany({
      where: { storage_key: { in: storageKeys } }
    });

    const segnalazione = await tx.segnalazione.create({
      data: {
        autore_id: autoreId,
        descrizione,
        latitudine: lat,
        longitudine: lon,
        origine_posizione: originePosizione || 'MANUALE',
        stato_avanzamento: 'RICEVUTA',
        stato_moderazione: 'PENDENTE',
        revisione: 1,
        categorie: categoriaId ? {
          create: {
            categoria_id: categoriaId
          }
        } : undefined,
        
        media: {
          create: uploads.map(u => ({
            storage_key: u.storage_key,
            tipo: u.tipo,
            mime: u.mime,
            byte_size: u.byte_size,
            durata_secondi: u.durata_secondi,
            sha256: u.sha256,
            exif_lat: u.exif_lat,
            exif_lon: u.exif_lon,
            stato_file: 'READY'
          }))
        },

        eventi_stato: {
          create: [
            {
              tipo_attore: 'UTENTE',
              attore_id: autoreId,
              ambito: 'AVANZAMENTO',
              a_stato: 'RICEVUTA',
              motivazione: 'Creazione iniziale',
              revisione: 1
            },
            {
              tipo_attore: 'SISTEMA',
              ambito: 'MODERAZIONE',
              a_stato: 'PENDENTE',
              motivazione: 'Sottoposta ad analisi automatica',
              revisione: 1
            }
          ]
        },

        audit: {
          create: {
            tipo_attore: 'UTENTE',
            attore_id: autoreId,
            azione: 'CREATE_SEGNALAZIONE'
          }
        }
      }
    });

    await tx.outbox.create({
      data: {
        segnalazione_id: segnalazione.id,
        revisione: 1,
        tipo_evento: 'SEGNALAZIONE_CREATA',
        payload_json: JSON.stringify({ description: descrizione })
      }
    });

    return segnalazione;
  });
}

/**
 * Aggiunta di un sostegno a una segnalazione (RF06, VI03, RF12, T05)
 * Idempotente: se il sostegno è già presente, ritorna il record senza duplicare.
 */
export async function aggiungiSostegno(utenteId: string, segnalazioneId: string) {
  return prisma.$transaction(async (tx) => {
    const utente = await tx.utente.findUnique({
      where: { id: utenteId },
      select: { stato_account: true, verificato_il: true }
    });
    
    if (!utente || utente.stato_account !== 'ATTIVO' || !utente.verificato_il) {
      throw new ForbiddenError('Solo account attivi e verificati possono sostenere');
    }

    const segnalazione = await tx.segnalazione.findUnique({
      where: { id: segnalazioneId },
      select: { autore_id: true, stato_moderazione: true, stato_avanzamento: true }
    });

    if (!segnalazione) throw new NotFoundError('Segnalazione inesistente');
    if (segnalazione.autore_id === utenteId) throw new ValidationError('Autosostegno vietato');
    if (segnalazione.stato_moderazione !== 'APPROVATA' || segnalazione.stato_avanzamento === 'RITIRATA') {
      throw new ForbiddenError('Possibile sostenere solo segnalazioni pubbliche');
    }

    let sostegno;
    try {
      sostegno = await tx.sostegno.upsert({
        where: { utente_id_segnalazione_id: { utente_id: utenteId, segnalazione_id: segnalazioneId } },
        create: { utente_id: utenteId, segnalazione_id: segnalazioneId },
        update: {}
      });
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
        const found = await tx.sostegno.findUnique({
          where: { utente_id_segnalazione_id: { utente_id: utenteId, segnalazione_id: segnalazioneId } }
        });
        if (found) return found;
      }
      throw err;
    }

    await tx.auditEvento.create({
      data: {
        tipo_attore: 'UTENTE',
        attore_id: utenteId,
        segnalazione_id: segnalazioneId,
        azione: 'AGGIUNGI_SOSTEGNO'
      }
    });

    return sostegno;
  });
}

/**
 * Rimozione del sostegno (RF06, RF12, T05 - revocabilità idempotente)
 * Se throwOnNotFound è false, un DELETE ripetuto restituisce successo idempotente senza errori.
 */
export async function rimuoviSostegno(
  utenteId: string,
  segnalazioneId: string,
  throwOnNotFound = true
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.sostegno.findUnique({
      where: { utente_id_segnalazione_id: { utente_id: utenteId, segnalazione_id: segnalazioneId } }
    });

    if (!existing) {
      if (throwOnNotFound) {
        throw new Error('Sostegno non presente');
      }
      return true;
    }

    await tx.sostegno.delete({
      where: { utente_id_segnalazione_id: { utente_id: utenteId, segnalazione_id: segnalazioneId } }
    });

    await tx.auditEvento.create({
      data: {
        tipo_attore: 'UTENTE',
        attore_id: utenteId,
        segnalazione_id: segnalazioneId,
        azione: 'RIMUOVI_SOSTEGNO'
      }
    });

    return true;
  });
}

/**
 * Verifica se un utente ha sostenuto una determinata segnalazione
 */
export async function haSostenuto(utenteId: string, segnalazioneId: string): Promise<boolean> {
  const s = await prisma.sostegno.findUnique({
    where: { utente_id_segnalazione_id: { utente_id: utenteId, segnalazione_id: segnalazioneId } }
  });
  return !!s;
}

/**
 * Query di classifica pubblica (RF06, 04_MODELLO_LOGICO.md, T13)
 * Considera esclusivamente segnalazioni APPROVATA e diverse da RITIRATA.
 * Conta solo i voti di profili ATTIVI e VERIFICATI (COUNT(u.id)).
 * Spareggio rigoroso fissato: sostegni_validi DESC, creata_il ASC, id ASC.
 * Include le segnalazioni a 0 voti; esclude rigorosamente quelle nascoste/ritirate.
 * Più categorie o più media non moltiplicano i voti.
 */
export async function getClassificaSegnalazioni(limite = 20, offset = 0, categoriaId?: string) {
  interface RankingRow {
    id: string;
    descrizione: string;
    latitudine: number;
    longitudine: number;
    stato_avanzamento: string;
    stato_moderazione: string;
    creata_il: Date;
    autore_id: string;
    sostegni_validi: bigint | number;
  }

  let rawRows: RankingRow[];

  if (categoriaId) {
    rawRows = await prisma.$queryRaw<RankingRow[]>`
      SELECT 
        s.id,
        s.descrizione,
        s.latitudine,
        s.longitudine,
        s.stato_avanzamento,
        s.stato_moderazione,
        s.creata_il,
        s.autore_id,
        CAST(COUNT(u_supporter.id) AS SIGNED) AS sostegni_validi
      FROM Segnalazione s
      LEFT JOIN Sostegno v ON v.segnalazione_id = s.id
      LEFT JOIN Utente u_supporter ON u_supporter.id = v.utente_id
        AND u_supporter.stato_account = 'ATTIVO'
        AND u_supporter.verificato_il IS NOT NULL
      WHERE s.stato_moderazione = 'APPROVATA'
        AND s.stato_avanzamento <> 'RITIRATA'
        AND s.id IN (
          SELECT segnalazione_id FROM SegnalazioneCategoria WHERE categoria_id = ${categoriaId}
        )
      GROUP BY s.id
      ORDER BY sostegni_validi DESC, s.creata_il ASC, s.id ASC
      LIMIT ${limite} OFFSET ${offset};
    `;
  } else {
    rawRows = await prisma.$queryRaw<RankingRow[]>`
      SELECT 
        s.id,
        s.descrizione,
        s.latitudine,
        s.longitudine,
        s.stato_avanzamento,
        s.stato_moderazione,
        s.creata_il,
        s.autore_id,
        CAST(COUNT(u_supporter.id) AS SIGNED) AS sostegni_validi
      FROM Segnalazione s
      LEFT JOIN Sostegno v ON v.segnalazione_id = s.id
      LEFT JOIN Utente u_supporter ON u_supporter.id = v.utente_id
        AND u_supporter.stato_account = 'ATTIVO'
        AND u_supporter.verificato_il IS NOT NULL
      WHERE s.stato_moderazione = 'APPROVATA'
        AND s.stato_avanzamento <> 'RITIRATA'
      GROUP BY s.id
      ORDER BY sostegni_validi DESC, s.creata_il ASC, s.id ASC
      LIMIT ${limite} OFFSET ${offset};
    `;
  }

  if (rawRows.length === 0) {
    return [];
  }

  const ids = rawRows.map(r => r.id);

  // Arricchimento con media e categorie senza alterare la classifica
  const [mediaList, categorieList, autoriList] = await Promise.all([
    prisma.media.findMany({
      where: { segnalazione_id: { in: ids }, stato_file: 'READY' }
    }),
    prisma.segnalazioneCategoria.findMany({
      where: { segnalazione_id: { in: ids } },
      include: { categoria: true }
    }),
    prisma.utente.findMany({
      where: { id: { in: rawRows.map(r => r.autore_id) } },
      select: { id: true, nome: true, cognome: true }
    })
  ]);

  const mediaMap = new Map<string, typeof mediaList[0]>();
  for (const m of mediaList) {
    if (!mediaMap.has(m.segnalazione_id)) {
      mediaMap.set(m.segnalazione_id, m);
    }
  }

  const categorieMap = new Map<string, string[]>();
  for (const c of categorieList) {
    const list = categorieMap.get(c.segnalazione_id) || [];
    list.push(c.categoria.nome);
    categorieMap.set(c.segnalazione_id, list);
  }

  const autoreMap = new Map(autoriList.map(a => [a.id, a]));

  return rawRows.map(r => ({
    id: r.id,
    descrizione: r.descrizione,
    latitudine: r.latitudine,
    longitudine: r.longitudine,
    stato_avanzamento: r.stato_avanzamento,
    creata_il: r.creata_il,
    autore: autoreMap.get(r.autore_id) || { id: r.autore_id, nome: 'Utente', cognome: '' },
    categorie: categorieMap.get(r.id) || [],
    primoMedia: mediaMap.get(r.id) || null,
    totaleSostegniValidi: Number(r.sostegni_validi)
  }));
}

export interface FiltriSegnalazioni {
  page?: number;
  pageSize?: number;
  categoriaId?: string;
  statoAvanzamento?: 'RICEVUTA' | 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI';
  ordinamento?: 'piu_sostenute' | 'piu_recenti' | 'meno_recenti';
  q?: string;
}

/**
 * Elenco pubblico delle segnalazioni con visibilità autorizzata (RF05, RF06, VI06)
 * Condivide rigorosamente la policy di visibilità unificata.
 */
export async function getSegnalazioniPubbliche(filtri: FiltriSegnalazioni = {}) {
  const page = Math.max(1, filtri.page || 1);
  const pageSize = Math.min(100, Math.max(1, filtri.pageSize || 20));
  const offset = (page - 1) * pageSize;

  if (filtri.ordinamento === 'piu_sostenute') {
    const items = await getClassificaSegnalazioni(pageSize, offset, filtri.categoriaId);
    
    // Conteggio totale
    const totalCountRes = await prisma.segnalazione.count({
      where: {
        stato_moderazione: 'APPROVATA',
        stato_avanzamento: filtri.statoAvanzamento ? filtri.statoAvanzamento : { not: 'RITIRATA' },
        categorie: filtri.categoriaId ? { some: { categoria_id: filtri.categoriaId } } : undefined,
        descrizione: filtri.q ? { contains: filtri.q } : undefined
      }
    });

    return {
      items,
      total: totalCountRes,
      page,
      pageSize,
      totalPages: Math.ceil(totalCountRes / pageSize)
    };
  }

  const whereClause: Prisma.SegnalazioneWhereInput = {
    stato_moderazione: 'APPROVATA',
    stato_avanzamento: filtri.statoAvanzamento ? filtri.statoAvanzamento : { not: 'RITIRATA' },
    categorie: filtri.categoriaId ? { some: { categoria_id: filtri.categoriaId } } : undefined,
    descrizione: filtri.q ? { contains: filtri.q } : undefined
  };

  const orderByClause: Prisma.SegnalazioneOrderByWithRelationInput =
    filtri.ordinamento === 'meno_recenti'
      ? { creata_il: 'asc' }
      : { creata_il: 'desc' };

  const [total, segnalazioni] = await Promise.all([
    prisma.segnalazione.count({ where: whereClause }),
    prisma.segnalazione.findMany({
      where: whereClause,
      include: {
        autore: { select: { id: true, nome: true, cognome: true } },
        media: { where: { stato_file: 'READY' }, take: 1 },
        categorie: { include: { categoria: true } },
        sostegni: {
          where: {
            utente: {
              stato_account: 'ATTIVO',
              verificato_il: { not: null }
            }
          },
          select: { utente_id: true }
        }
      },
      orderBy: orderByClause,
      skip: offset,
      take: pageSize
    })
  ]);

  const items = segnalazioni.map(s => ({
    id: s.id,
    descrizione: s.descrizione,
    latitudine: s.latitudine,
    longitudine: s.longitudine,
    stato_avanzamento: s.stato_avanzamento,
    creata_il: s.creata_il,
    autore: s.autore,
    categorie: s.categorie.map(c => c.categoria.nome),
    primoMedia: s.media[0] || null,
    totaleSostegniValidi: s.sostegni.length
  }));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

/**
 * Dettaglio di una segnalazione con controllo autorizzativo di visibilità (VI06, T12)
 * Se pubblica: visibile a chiunque.
 * Se privata/nascosta: visibile esclusivamente all'autore o a membri del comitato.
 */
export async function getDettaglioSegnalazione(
  id: string,
  utenteId?: string,
  utenteRuolo?: string
) {
  const segnalazione = await prisma.segnalazione.findUnique({
    where: { id },
    include: {
      autore: { select: { id: true, nome: true, cognome: true } },
      media: { where: { stato_file: 'READY' } },
      categorie: { include: { categoria: true } },
      sostegni: {
        where: {
          utente: {
            stato_account: 'ATTIVO',
            verificato_il: { not: null }
          }
        },
        select: { utente_id: true }
      },
      eventi_stato: {
        orderBy: { creato_il: 'asc' },
        include: {
          attore: { select: { id: true, nome: true, cognome: true, ruolo: true } }
        }
      }
    }
  });

  if (!segnalazione) {
    return null;
  }

  const pubblica = isSegnalazionePubblica(segnalazione);

  if (!pubblica) {
    const isAutore = utenteId && utenteId === segnalazione.autore_id;
    const isComitato = utenteRuolo === 'COMITATO';
    if (!isAutore && !isComitato) {
      return null;
    }
  }

  let utenteHaSostenuto = false;
  if (utenteId) {
    utenteHaSostenuto = segnalazione.sostegni.some(s => s.utente_id === utenteId);
  }

  return {
    ...segnalazione,
    totaleSostegniValidi: segnalazione.sostegni.length,
    utenteHaSostenuto,
    isPubblica: pubblica
  };
}

/**
 * Punti georeferenziati per la mappa interattiva (RF09, VI06)
 * Restituisce solo segnalazioni pubbliche autorizzate con coordinate valide.
 */
export async function getSegnalazioniMappa(categoriaId?: string) {
  const segnalazioni = await prisma.segnalazione.findMany({
    where: {
      stato_moderazione: 'APPROVATA',
      stato_avanzamento: { not: 'RITIRATA' },
      categorie: categoriaId ? { some: { categoria_id: categoriaId } } : undefined
    },
    select: {
      id: true,
      descrizione: true,
      latitudine: true,
      longitudine: true,
      stato_avanzamento: true,
      creata_il: true,
      categorie: { include: { categoria: true } },
      media: { where: { stato_file: 'READY' }, select: { id: true, tipo: true }, take: 1 },
      sostegni: {
        where: {
          utente: {
            stato_account: 'ATTIVO',
            verificato_il: { not: null }
          }
        },
        select: { utente_id: true }
      }
    },
    take: 500
  });

  return segnalazioni.map(s => ({
    id: s.id,
    descrizione: s.descrizione,
    latitudine: s.latitudine,
    longitudine: s.longitudine,
    stato_avanzamento: s.stato_avanzamento,
    creata_il: s.creata_il,
    categorie: s.categorie.map(c => c.categoria.nome),
    mediaId: s.media[0]?.id || null,
    totaleSostegniValidi: s.sostegni.length
  }));
}

/**
 * Ritiro di una segnalazione (RF05, RF11, VI07, T06, T15)
 * Autore o comitato possono ritirare da qualunque stato, con motivazione.
 * Controllo concorrenza su expectedRevision.
 */
export async function ritiraSegnalazione(params: {
  utenteId: string;
  segnalazioneId: string;
  motivazione: string;
  expectedRevision?: number;
}) {
  const { utenteId, segnalazioneId, motivazione, expectedRevision } = params;

  if (!motivazione || motivazione.trim().length === 0) {
    throw new ValidationError('La motivazione del ritiro è obbligatoria');
  }

  return prisma.$transaction(async (tx) => {
    const utente = await tx.utente.findUnique({
      where: { id: utenteId },
      select: { stato_account: true, verificato_il: true, ruolo: true }
    });
    if (!utente || utente.stato_account !== 'ATTIVO' || !utente.verificato_il) {
      throw new ForbiddenError('Utente non autorizzato');
    }

    const segnalazione = await tx.segnalazione.findUnique({
      where: { id: segnalazioneId }
    });
    if (!segnalazione) {
      throw new NotFoundError('Segnalazione non trovata');
    }

    const isAutore = utenteId === segnalazione.autore_id;
    const isComitato = utente.ruolo === 'COMITATO';
    if (!isAutore && !isComitato) {
      throw new ForbiddenError('Solo l\'autore o un membro del comitato possono ritirare la segnalazione');
    }

    if (segnalazione.stato_avanzamento === 'RITIRATA') {
      throw new ValidationError('La segnalazione è già ritirata');
    }

    if (expectedRevision !== undefined && segnalazione.revisione !== expectedRevision) {
      throw new ConcurrencyConflictError(
        `Conflitto di versione: attesa revisione ${expectedRevision}, trovata ${segnalazione.revisione}`
      );
    }

    const aggiornata = await tx.segnalazione.update({
      where: { id: segnalazioneId },
      data: { stato_avanzamento: 'RITIRATA' }
    });

    await tx.eventoStato.create({
      data: {
        segnalazione_id: segnalazioneId,
        attore_id: utenteId,
        tipo_attore: 'UTENTE',
        ambito: 'AVANZAMENTO',
        da_stato: segnalazione.stato_avanzamento,
        a_stato: 'RITIRATA',
        motivazione: motivazione.trim(),
        revisione: segnalazione.revisione
      }
    });

    await tx.auditEvento.create({
      data: {
        tipo_attore: 'UTENTE',
        attore_id: utenteId,
        segnalazione_id: segnalazioneId,
        azione: 'RITIRA_SEGNALAZIONE',
        dati_json: JSON.stringify({ motivazione: motivazione.trim() })
      }
    });

    return aggiornata;
  });
}

/**
 * Decisione di moderazione del comitato (RF11, VI07, T06)
 * Transizioni consentite comitato:
 * - PENDENTE o IN_REVISIONE -> APPROVATA o RIFIUTATA
 * - APPROVATA -> IN_REVISIONE (criticità)
 * - RIFIUTATA -> IN_REVISIONE (riapertura motivata)
 * Controllo di concorrenza su expectedRevision o expectedState.
 */
export async function moderaSegnalazione(params: {
  comitatoId: string;
  segnalazioneId: string;
  decision: 'APPROVATA' | 'RIFIUTATA' | 'IN_REVISIONE';
  motivazione: string;
  expectedRevision?: number;
  expectedState?: 'PENDENTE' | 'IN_REVISIONE' | 'APPROVATA' | 'RIFIUTATA';
}) {
  const { comitatoId, segnalazioneId, decision, motivazione, expectedRevision, expectedState } = params;

  if (!motivazione || motivazione.trim().length === 0) {
    throw new ValidationError('La motivazione della moderazione è obbligatoria');
  }

  return prisma.$transaction(async (tx) => {
    const utente = await tx.utente.findUnique({
      where: { id: comitatoId },
      select: { stato_account: true, verificato_il: true, ruolo: true }
    });
    if (!utente || utente.stato_account !== 'ATTIVO' || !utente.verificato_il || utente.ruolo !== 'COMITATO') {
      throw new ForbiddenError('Solo membri attivi e verificati del comitato possono moderare');
    }

    const lockedRows = await tx.$queryRaw<Array<{ id: string; revisione: number; stato_moderazione: string; stato_avanzamento: string }>>`
      SELECT id, revisione, stato_moderazione, stato_avanzamento
      FROM Segnalazione
      WHERE id = ${segnalazioneId}
      FOR UPDATE;
    `;
    if (!lockedRows || lockedRows.length === 0) {
      throw new NotFoundError('Segnalazione non trovata');
    }
    const segnalazione = lockedRows[0];

    // Controllo di concorrenza ottimistica
    if (expectedRevision !== undefined && segnalazione.revisione !== expectedRevision) {
      throw new ConcurrencyConflictError(
        `Conflitto di versione: attesa revisione ${expectedRevision}, trovata ${segnalazione.revisione}`
      );
    }
    if (expectedState !== undefined && segnalazione.stato_moderazione !== expectedState) {
      throw new ConcurrencyConflictError(
        `Conflitto di stato: atteso stato ${expectedState}, trovato ${segnalazione.stato_moderazione}`
      );
    }

    const daStato = segnalazione.stato_moderazione;

    // Verifica transizioni consentite
    if (decision === 'APPROVATA' || decision === 'RIFIUTATA') {
      if (daStato !== 'PENDENTE' && daStato !== 'IN_REVISIONE') {
        throw new ValidationError(`Transizione non consentita da ${daStato} a ${decision}`);
      }
    } else if (decision === 'IN_REVISIONE') {
      if (daStato !== 'APPROVATA' && daStato !== 'RIFIUTATA' && daStato !== 'PENDENTE') {
        throw new ValidationError(`Transizione non consentita da ${daStato} a IN_REVISIONE`);
      }
    } else {
      throw new ValidationError(`Decisione non valida: ${decision}`);
    }

    const aggiornata = await tx.segnalazione.update({
      where: { id: segnalazioneId },
      data: { stato_moderazione: decision }
    });

    await tx.eventoStato.create({
      data: {
        segnalazione_id: segnalazioneId,
        attore_id: comitatoId,
        tipo_attore: 'UTENTE',
        ambito: 'MODERAZIONE',
        da_stato: daStato,
        a_stato: decision,
        motivazione: motivazione.trim(),
        revisione: segnalazione.revisione
      }
    });

    await tx.auditEvento.create({
      data: {
        tipo_attore: 'UTENTE',
        attore_id: comitatoId,
        segnalazione_id: segnalazioneId,
        azione: 'MODERA_SEGNALAZIONE',
        dati_json: JSON.stringify({ da: daStato, a: decision, motivazione: motivazione.trim() })
      }
    });

    return aggiornata;
  });
}

/**
 * Avanzamento stato segnalazione da parte del comitato (RF05, RF11, VI07, T06)
 * Transizioni consentite:
 * - RICEVUTA -> PRESA_IN_CARICO (richiede moderazione APPROVATA)
 * - PRESA_IN_CARICO -> INVIATA_AI_CANDIDATI (richiede moderazione APPROVATA)
 * - Qualsiasi -> RITIRATA (con motivazione)
 * Controllo di concorrenza su expectedRevision ed expectedState.
 */
export async function avanzaStatoSegnalazione(params: {
  comitatoId: string;
  segnalazioneId: string;
  nuovoStato: 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI' | 'RITIRATA';
  motivazione: string;
  expectedRevision?: number;
  expectedState?: 'RICEVUTA' | 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI';
}) {
  const { comitatoId, segnalazioneId, nuovoStato, motivazione, expectedRevision, expectedState } = params;

  if (!motivazione || motivazione.trim().length === 0) {
    throw new ValidationError('La motivazione del cambio stato è obbligatoria');
  }

  return prisma.$transaction(async (tx) => {
    const utente = await tx.utente.findUnique({
      where: { id: comitatoId },
      select: { stato_account: true, verificato_il: true, ruolo: true }
    });
    if (!utente || utente.stato_account !== 'ATTIVO' || !utente.verificato_il || utente.ruolo !== 'COMITATO') {
      throw new ForbiddenError('Solo membri attivi e verificati del comitato possono aggiornare l\'avanzamento');
    }

    const lockedRows = await tx.$queryRaw<Array<{ id: string; revisione: number; stato_moderazione: string; stato_avanzamento: string }>>`
      SELECT id, revisione, stato_moderazione, stato_avanzamento
      FROM Segnalazione
      WHERE id = ${segnalazioneId}
      FOR UPDATE;
    `;
    if (!lockedRows || lockedRows.length === 0) {
      throw new NotFoundError('Segnalazione non trovata');
    }
    const segnalazione = lockedRows[0];

    if (expectedRevision !== undefined && segnalazione.revisione !== expectedRevision) {
      throw new ConcurrencyConflictError(
        `Conflitto di versione: attesa revisione ${expectedRevision}, trovata ${segnalazione.revisione}`
      );
    }
    if (expectedState !== undefined && segnalazione.stato_avanzamento !== expectedState) {
      throw new ConcurrencyConflictError(
        `Conflitto di stato: atteso stato ${expectedState}, trovato ${segnalazione.stato_avanzamento}`
      );
    }

    const daStato = segnalazione.stato_avanzamento;

    if (daStato === 'RITIRATA') {
      throw new ValidationError('Nessuna transizione consentita da stato terminale RITIRATA');
    }

    if (nuovoStato === 'PRESA_IN_CARICO') {
      if (daStato !== 'RICEVUTA') {
        throw new ValidationError(`Transizione a PRESA_IN_CARICO consentita solo da RICEVUTA (stato attuale: ${daStato})`);
      }
      if (segnalazione.stato_moderazione !== 'APPROVATA') {
        throw new ValidationError('La transizione a PRESA_IN_CARICO richiede moderazione APPROVATA');
      }
    } else if (nuovoStato === 'INVIATA_AI_CANDIDATI') {
      if (daStato !== 'PRESA_IN_CARICO') {
        throw new ValidationError(`Transizione a INVIATA_AI_CANDIDATI consentita solo da PRESA_IN_CARICO (stato attuale: ${daStato})`);
      }
      if (segnalazione.stato_moderazione !== 'APPROVATA') {
        throw new ValidationError('La transizione a INVIATA_AI_CANDIDATI richiede moderazione APPROVATA');
      }
    } else if (nuovoStato !== 'RITIRATA') {
      throw new ValidationError(`Stato di destinazione non valido: ${nuovoStato}`);
    }

    const aggiornata = await tx.segnalazione.update({
      where: { id: segnalazioneId },
      data: { stato_avanzamento: nuovoStato }
    });

    await tx.eventoStato.create({
      data: {
        segnalazione_id: segnalazioneId,
        attore_id: comitatoId,
        tipo_attore: 'UTENTE',
        ambito: 'AVANZAMENTO',
        da_stato: daStato,
        a_stato: nuovoStato,
        motivazione: motivazione.trim(),
        revisione: segnalazione.revisione
      }
    });

    await tx.auditEvento.create({
      data: {
        tipo_attore: 'UTENTE',
        attore_id: comitatoId,
        segnalazione_id: segnalazioneId,
        azione: 'AVANZA_STATO',
        dati_json: JSON.stringify({ da: daStato, a: nuovoStato, motivazione: motivazione.trim() })
      }
    });

    return aggiornata;
  });
}

/**
 * Gestione delle categorie confermate (RF08, RF11, VI12)
 * Assegna o sostituisce le categorie confermate per la segnalazione.
 * Verifica che ogni ID esista nel catalogo e sia attiva. Nessun duplicato.
 */
export async function aggiornaCategorieSegnalazione(params: {
  comitatoId: string;
  segnalazioneId: string;
  categoryIds: string[];
  motivazione?: string;
  expectedRevision?: number;
}) {
  const { comitatoId, segnalazioneId, categoryIds, motivazione, expectedRevision } = params;

  return prisma.$transaction(async (tx) => {
    const utente = await tx.utente.findUnique({
      where: { id: comitatoId },
      select: { stato_account: true, verificato_il: true, ruolo: true }
    });
    if (!utente || utente.stato_account !== 'ATTIVO' || !utente.verificato_il || utente.ruolo !== 'COMITATO') {
      throw new ForbiddenError('Solo membri del comitato possono aggiornare le categorie confermate');
    }

    const segnalazione = await tx.segnalazione.findUnique({
      where: { id: segnalazioneId }
    });
    if (!segnalazione) {
      throw new NotFoundError('Segnalazione non trovata');
    }

    if (expectedRevision !== undefined && segnalazione.revisione !== expectedRevision) {
      throw new ConcurrencyConflictError('Conflitto di versione');
    }

    const uniqueIds = Array.from(new Set(categoryIds));
    if (uniqueIds.length > 0) {
      const validCategories = await tx.categoria.findMany({
        where: { id: { in: uniqueIds }, attiva: true },
        select: { id: true }
      });
      if (validCategories.length !== uniqueIds.length) {
        throw new ValidationError('Una o più categorie specificate non sono valide o non sono attive');
      }
    }

    await tx.segnalazioneCategoria.deleteMany({
      where: { segnalazione_id: segnalazioneId }
    });

    if (uniqueIds.length > 0) {
      await tx.segnalazioneCategoria.createMany({
        data: uniqueIds.map(catId => ({
          segnalazione_id: segnalazioneId,
          categoria_id: catId
        }))
      });
    }

    await tx.auditEvento.create({
      data: {
        tipo_attore: 'UTENTE',
        attore_id: comitatoId,
        segnalazione_id: segnalazioneId,
        azione: 'AGGIORNA_CATEGORIE',
        dati_json: JSON.stringify({ categoryIds: uniqueIds, motivazione })
      }
    });

    return true;
  });
}

/**
 * Coda di supervisione del comitato (RF11)
 * Restituisce le segnalazioni che richiedono revisione o decisione.
 */
export async function getCodaRevisioniComitato() {
  await ensureDefaultCategorie();

  return prisma.segnalazione.findMany({
    where: {
      stato_moderazione: { in: ['PENDENTE', 'IN_REVISIONE'] }
    },
    include: {
      autore: { select: { id: true, nome: true, cognome: true, email_normalizzata: true } },
      media: { where: { stato_file: 'READY' } },
      categorie: { include: { categoria: true } },
      eventi_stato: { orderBy: { creato_il: 'desc' }, take: 3 }
    },
    orderBy: { creata_il: 'asc' }
  });
}

/**
 * Tutte le segnalazioni per la supervisione comitato (RF11)
 */
export async function getTutteSegnalazioniComitato(filtroStato?: string) {
  await ensureDefaultCategorie();

  const whereClause: Prisma.SegnalazioneWhereInput = {};
  if (filtroStato) {
    if (['PENDENTE', 'IN_REVISIONE', 'APPROVATA', 'RIFIUTATA'].includes(filtroStato)) {
      whereClause.stato_moderazione = filtroStato as StatoModerazione;
    } else if (['RICEVUTA', 'PRESA_IN_CARICO', 'INVIATA_AI_CANDIDATI', 'RITIRATA'].includes(filtroStato)) {
      whereClause.stato_avanzamento = filtroStato as StatoAvanzamento;
    }
  }

  return prisma.segnalazione.findMany({
    where: whereClause,
    include: {
      autore: { select: { id: true, nome: true, cognome: true, email_normalizzata: true } },
      media: { where: { stato_file: 'READY' } },
      categorie: { include: { categoria: true } },
      eventi_stato: { orderBy: { creato_il: 'desc' } }
    },
    orderBy: { creata_il: 'desc' }
  });
}

/**
 * Modifica del contenuto di una segnalazione da parte dell'autore (RF04, 05 riga 19, T10, T15)
 * - Consentito solo all'autore mentre avanzamento è 'RICEVUTA'
 * - Convalida revisione corrente (concorrenza ottimistica)
 * - Incrementa la revisione (+1) e forza stato_moderazione a 'PENDENTE'
 * - Genera un nuovo job Outbox per la nuova revisione
 */
export async function modificaSegnalazione(params: {
  autoreId: string;
  segnalazioneId: string;
  expectedRevision: number;
  nuovaDescrizione?: string;
  nuovaLatitudine?: number;
  nuovaLongitudine?: number;
}) {
  const { autoreId, segnalazioneId, expectedRevision, nuovaDescrizione, nuovaLatitudine, nuovaLongitudine } = params;

  return prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<Array<{
      id: string;
      autore_id: string;
      revisione: number;
      stato_moderazione: string;
      stato_avanzamento: string;
      descrizione: string;
    }>>`
      SELECT id, autore_id, revisione, stato_moderazione, stato_avanzamento, descrizione
      FROM Segnalazione
      WHERE id = ${segnalazioneId}
      FOR UPDATE
    `;

    if (lockedRows.length === 0) {
      throw new NotFoundError('Segnalazione non trovata');
    }

    const segnalazione = lockedRows[0];

    if (segnalazione.autore_id !== autoreId) {
      throw new ForbiddenError('Solo l autore originario può modificare la segnalazione');
    }

    if (segnalazione.stato_avanzamento !== 'RICEVUTA') {
      throw new ValidationError(`Impossibile modificare il contenuto: stato avanzamento è ${segnalazione.stato_avanzamento} (ammesso solo RICEVUTA)`);
    }

    if (segnalazione.revisione !== expectedRevision) {
      throw new ConcurrencyConflictError(
        `Conflitto di versione: attesa revisione ${expectedRevision}, trovata ${segnalazione.revisione}`
      );
    }

    const nuovaRevisione = segnalazione.revisione + 1;
    const finalDesc = nuovaDescrizione !== undefined ? nuovaDescrizione.trim() : segnalazione.descrizione;
    if (finalDesc.length === 0) {
      throw new ValidationError('La descrizione non può essere vuota');
    }

    const updated = await tx.segnalazione.update({
      where: { id: segnalazioneId },
      data: {
        descrizione: finalDesc,
        latitudine: nuovaLatitudine !== undefined ? nuovaLatitudine : undefined,
        longitudine: nuovaLongitudine !== undefined ? nuovaLongitudine : undefined,
        revisione: nuovaRevisione,
        stato_moderazione: 'PENDENTE',
        aggiornata_il: new Date()
      }
    });

    await tx.eventoStato.create({
      data: {
        segnalazione_id: segnalazioneId,
        tipo_attore: 'UTENTE',
        attore_id: autoreId,
        ambito: 'MODERAZIONE',
        da_stato: segnalazione.stato_moderazione,
        a_stato: 'PENDENTE',
        motivazione: `Modifica del contenuto alla revisione ${nuovaRevisione}: rimessa in moderazione`,
        revisione: nuovaRevisione
      }
    });

    await tx.auditEvento.create({
      data: {
        tipo_attore: 'UTENTE',
        attore_id: autoreId,
        segnalazione_id: segnalazioneId,
        azione: 'UPDATE_SEGNALAZIONE_REVISIONE',
        dati_json: JSON.stringify({
          da_revisione: segnalazione.revisione,
          a_revisione: nuovaRevisione
        })
      }
    });

    await tx.outbox.create({
      data: {
        segnalazione_id: segnalazioneId,
        revisione: nuovaRevisione,
        tipo_evento: 'SEGNALAZIONE_MODIFICATA',
        payload_json: JSON.stringify({ description: finalDesc })
      }
    });

    return updated;
  });
}

