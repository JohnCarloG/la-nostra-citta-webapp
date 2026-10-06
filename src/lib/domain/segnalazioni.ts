import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function createSegnalazioneAtomica(
  autoreId: string,
  descrizione: string,
  lat: number,
  lon: number,
  storageKeys: string[],
  quartiereId?: string,
  categoriaId?: string
) {
  if (!storageKeys || storageKeys.length === 0) {
    throw new Error('La segnalazione richiede almeno un media');
  }

  // Assicuriamoci che non ci siano duplicati richiesti prima ancora di aprire la transazione
  const uniqueKeys = new Set(storageKeys);
  if (uniqueKeys.size !== storageKeys.length) {
    throw new Error('Identificatori upload duplicati nella richiesta');
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
        quartiere_id: quartiereId,
        categoria_id: categoriaId,
        
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

        // Creazione Audit
        audit: {
          create: {
            tipo_attore: 'UTENTE',
            attore_id: autoreId,
            azione: 'CREATE_SEGNALAZIONE'
          }
        }
      }
    });

    // Inserimento Outbox per l'analisi NLP e l'invio ai candidati o processi asincroni
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

export async function aggiungiSostegno(utenteId: string, segnalazioneId: string) {
  // Il vincolo utente_id != segnalazione.autore_id e account attivo
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

    // Upsert o create gestiscono il vincolo di unicità / PK
    return tx.sostegno.upsert({
      where: { utente_id_segnalazione_id: { utente_id: utenteId, segnalazione_id: segnalazioneId } },
      create: { utente_id: utenteId, segnalazione_id: segnalazioneId },
      update: {}
    });
  });
}
