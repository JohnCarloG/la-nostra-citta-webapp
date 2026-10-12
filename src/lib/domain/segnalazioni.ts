import { prisma } from '../db';

/**
 * STATO IMPLEMENTATIVO - PERCORSI NON IMPLEMENTATI / LIMITI APERTI:
 * 
 * 1. Rimozione Media:
 *    Il percorso di cancellazione di singoli media o dell'ultimo media da una segnalazione
 *    è formalmente NON IMPLEMENTATO nel dominio. Nessuna API, Server Action o procedura non protetta
 *    è esposta ai client, garantendo che nessuna segnalazione possa essere lasciata priva di prove probatorie.
 * 
 * 2. Background Retry Worker:
 *    Nessun demone o loop di riesecuzione automatica in background è attualmente attivo.
 *    I campi 'tentativi' e 'prossimo_tentativo_il' in Outbox e AnalisiIa sono predisposizioni di schema.
 * 
 * 3. File Upload Fisico su Storage S3 e Moderazione Asincrona IA (Fase 3):
 *    Rigorosamente SOSPESE fino all'autorizzazione e collaudo completo della Fase 2.
 */

export async function createSegnalazioneAtomica(
  autoreId: string,
  descrizione: string,
  lat: number,
  lon: number,
  storageKeys: string[],
  quartiereId?: string,
  categoriaId?: string
) {
  // 1. Validazione requisiti cardinalità e allegati (RF04, VI04)
  if (!storageKeys || storageKeys.length === 0) {
    throw new Error('La segnalazione richiede almeno un media');
  }

  if (storageKeys.length > 5) {
    throw new Error('Massimo 5 allegati consentiti per segnalazione');
  }

  // Prevenzione identificatori upload duplicati nella richiesta
  const uniqueKeys = new Set(storageKeys);
  if (uniqueKeys.size !== storageKeys.length) {
    throw new Error('Identificatori upload duplicati nella richiesta');
  }

  // Validazione coordinate geografiche (VI05)
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error('Coordinate geografiche non valide (latitudine tra -90 e 90, longitudine tra -180 e 180)');
  }

  // Validazione descrizione (RF04)
  if (!descrizione || descrizione.trim().length === 0) {
    throw new Error('La descrizione della segnalazione non può essere vuota');
  }

  // Creazione atomica: Segnalazione, Media e gli Eventi/Audit associati nella stessa transazione.
  return prisma.$transaction(async (tx) => {
    // 1. Validazione Autore: deve essere attivo e verificato
    const autore = await tx.utente.findUnique({
      where: { id: autoreId },
      select: { stato_account: true, verificato_il: true }
    });
    if (!autore || autore.stato_account !== 'ATTIVO' || !autore.verificato_il) {
      throw new Error('Utente non autorizzato o account non verificato');
    }

    // 2. Acquisizione e Consumo Atomico UploadTemporaneo
    // Lock e consumo esplicito
    const res = await tx.uploadTemporaneo.updateMany({
      where: {
        proprietario_id: autoreId,
        storage_key: { in: storageKeys },
        stato: 'VALIDO',
        scade_il: { gt: new Date() } // controllo validità e scadenza
      },
      data: {
        stato: 'CONSUMATO',
        consumato_il: new Date()
      }
    });

    if (res.count !== storageKeys.length) {
      throw new Error('Impossibile consumare gli upload: non validi, scaduti, altrui o inesistenti');
    }

    // Lettura dei metadati ORIGINALI validati da backend (ignorando il client payload)
    const uploads = await tx.uploadTemporaneo.findMany({
      where: { storage_key: { in: storageKeys } }
    });

    const segnalazione = await tx.segnalazione.create({
      data: {
        autore_id: autoreId,
        descrizione,
        latitudine: lat,
        longitudine: lon,
        origine_posizione: 'MANUALE',
        stato_avanzamento: 'RICEVUTA',
        stato_moderazione: 'PENDENTE',
        revisione: 1,
        categorie: categoriaId ? {
          create: {
            categoria_id: categoriaId
          }
        } : undefined,
        
        // Creazione innestata dei Media usando ESCLUSIVAMENTE dati validati dal DB
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

        // Creazione Eventi iniziali (creazione + avanzamento a RICEVUTA, moderazione a PENDENTE)
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

        // Creazione Audit (append-only)
        audit: {
          create: {
            tipo_attore: 'UTENTE',
            attore_id: autoreId,
            azione: 'CREATE_SEGNALAZIONE'
          }
        }
      }
    });

    // Inserimento Outbox per l'analisi e i processi asincroni
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
 * Aggiunta di un sostegno a una segnalazione (RF06, VI03, RF12)
 * Verifica:
 * - Utente attivo e verificato
 * - Segnalazione esistente, approvata e non ritirata
 * - Divieto assoluto di autosostegno (autore_id !== utenteId)
 * - Inserimento traccia in AuditEvento
 */
export async function aggiungiSostegno(utenteId: string, segnalazioneId: string) {
  return prisma.$transaction(async (tx) => {
    const utente = await tx.utente.findUnique({
      where: { id: utenteId },
      select: { stato_account: true, verificato_il: true }
    });
    
    if (!utente || utente.stato_account !== 'ATTIVO' || !utente.verificato_il) {
      throw new Error('Solo account attivi e verificati possono sostenere');
    }

    const segnalazione = await tx.segnalazione.findUnique({
      where: { id: segnalazioneId },
      select: { autore_id: true, stato_moderazione: true, stato_avanzamento: true }
    });

    if (!segnalazione) throw new Error('Segnalazione inesistente');
    if (segnalazione.autore_id === utenteId) throw new Error('Autosostegno vietato');
    if (segnalazione.stato_moderazione !== 'APPROVATA' || segnalazione.stato_avanzamento === 'RITIRATA') {
      throw new Error('Possibile sostenere solo segnalazioni pubbliche');
    }

    // Upsert gestisce il vincolo di unicità / PK composta (utente_id, segnalazione_id)
    const sostegno = await tx.sostegno.upsert({
      where: { utente_id_segnalazione_id: { utente_id: utenteId, segnalazione_id: segnalazioneId } },
      create: { utente_id: utenteId, segnalazione_id: segnalazioneId },
      update: {}
    });

    // Tracciamento Audit append-only (RF12)
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
 * Rimozione del sostegno (RF06 - revocabilità, RF12)
 */
export async function rimuoviSostegno(utenteId: string, segnalazioneId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.sostegno.findUnique({
      where: { utente_id_segnalazione_id: { utente_id: utenteId, segnalazione_id: segnalazioneId } }
    });

    if (!existing) {
      throw new Error('Sostegno non presente');
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
 * Query di classifica pubblica (RF06, 04_MODELLO_LOGICO.md)
 * Considera solo segnalazioni APPROVATA e diverse da RITIRATA.
 * Conta solo i sostegni provenienti da profili ATTIVI e VERIFICATI.
 */
export async function getClassificaSegnalazioni(limite = 20, offset = 0) {
  const segnalazioni = await prisma.segnalazione.findMany({
    where: {
      stato_moderazione: 'APPROVATA',
      stato_avanzamento: { not: 'RITIRATA' }
    },
    include: {
      autore: {
        select: { id: true, nome: true, cognome: true }
      },
      media: {
        where: { stato_file: 'READY' },
        take: 1
      },
      categorie: {
        include: { categoria: true }
      },
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
    skip: offset,
    take: limite
  });

  return segnalazioni
    .map((s) => ({
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
    }))
    .sort((a, b) => {
      if (b.totaleSostegniValidi !== a.totaleSostegniValidi) {
        return b.totaleSostegniValidi - a.totaleSostegniValidi;
      }
      return new Date(a.creata_il).getTime() - new Date(b.creata_il).getTime();
    });
}
