import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../db';
import { getStorageProvider } from '../storage';
import { inspectFileBuffer } from '../storage/mime-validator';

export interface UploadResult {
  uploadId: string;
  storageKey: string;
  tipo: 'FOTO' | 'VIDEO';
  mime: string;
  byteSize: number;
  sha256: string;
  exifCoords?: {
    lat: number;
    lon: number;
  };
  scadeIl: Date;
}

export interface CleanupResult {
  scadutiEliminatiDb: number;
  fileOrfaniRimossiStorage: number;
}

export interface OrphanRecord {
  storage_key: string;
  proprietario_id: string;
  byte_size: number;
  registrato_il: string;
  errore: string;
}

/**
 * Registro persistente dei file orfani:
 * Quando fallisce la cancellazione compensativa di un file caricato su storage privato
 * a fronte del fallimento della transazione DB, l'identificatore del file orfano viene
 * salvato in un registro persistente dedicato (.orphaned_storage_keys.json), consentendo
 * a un processo di audit o manutenzione successiva di recuperare e liberare lo spazio.
 */
export async function registraOrfanoIrrecuperabile(
  storageKey: string,
  proprietarioId: string,
  byteSize: number,
  errore: string
): Promise<void> {
  try {
    const orphanRecord: OrphanRecord = {
      storage_key: storageKey,
      proprietario_id: proprietarioId,
      byte_size: byteSize,
      registrato_il: new Date().toISOString(),
      errore
    };

    const orphanLogPath = path.resolve(process.cwd(), '.orphaned_storage_keys.json');
    let orphans: OrphanRecord[] = [];
    if (fs.existsSync(orphanLogPath)) {
      try {
        const raw = await fs.promises.readFile(orphanLogPath, 'utf8');
        orphans = JSON.parse(raw);
      } catch {
        orphans = [];
      }
    }
    orphans.push(orphanRecord);
    await fs.promises.writeFile(orphanLogPath, JSON.stringify(orphans, null, 2), 'utf8');
  } catch (err) {
    console.error(`[CRITICO] Impossibile persistere il log dell'orfano per ${storageKey}:`, err);
  }
}

/**
 * Gestione fisica e atomica del ciclo di vita UploadTemporaneo:
 * 1. Verifica autorizzazione e stato dell'utente proprietario (attivo e verificato)
 * 2. Valida la struttura interna effettiva (magic bytes, segmenti/chunk, limiti dimensionali, sha256)
 * 3. Genera chiave privata server-side univoca e imprevedibile
 * 4. Salva su storage privato (.private_storage)
 * 5. Registra record UploadTemporaneo con stato 'VALIDO' e scadenza
 * 6. Gestisce esplicitamente il fallimento (cancellazione compensativa; se fallisce anch'essa,
 *    registra l'orfano nel registro persistente per audit successivo)
 */
export async function caricaUploadTemporaneo(
  proprietarioId: string,
  buffer: Buffer
): Promise<UploadResult> {
  // 1. Verifica che il proprietario sia un utente attivo e verificato
  const utente = await prisma.utente.findUnique({
    where: { id: proprietarioId },
    select: { id: true, stato_account: true, verificato_il: true }
  });

  if (!utente || utente.stato_account !== 'ATTIVO' || !utente.verificato_il) {
    throw new Error('Caricamento non autorizzato: utente non valido, sospeso o non verificato');
  }

  // 2. Ispezione rigorosa del file tramite validazione strutturale e calcolo sha256
  const inspection = inspectFileBuffer(buffer);
  if (!inspection.valid || !inspection.tipoMedia || !inspection.realMime) {
    throw new Error(inspection.error || 'File non conforme alle specifiche');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const byteSize = buffer.length;

  // 3. Generazione chiave privata server-side univoca e imprevedibile
  const estensione = inspection.realMime === 'image/jpeg' ? 'jpg'
    : inspection.realMime === 'image/png' ? 'png'
    : inspection.realMime === 'image/webp' ? 'webp'
    : 'mp4';
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const storageKey = `uploads/${proprietarioId}/${Date.now()}_${randomSuffix}.${estensione}`;

  // 4. Scadenza upload temporaneo: 2 ore dalla creazione (RF04 / VI09)
  const scadeIl = new Date();
  scadeIl.setHours(scadeIl.getHours() + 2);

  const storage = getStorageProvider();

  // 5. Scrittura su storage privato
  await storage.putObject(storageKey, buffer, inspection.realMime);

  // 6. Registrazione atomica nel DB
  try {
    const record = await prisma.uploadTemporaneo.create({
      data: {
        proprietario_id: proprietarioId,
        storage_key: storageKey,
        tipo: inspection.tipoMedia,
        mime: inspection.realMime,
        byte_size: byteSize,
        sha256: sha256,
        exif_lat: inspection.exifCoords?.lat,
        exif_lon: inspection.exifCoords?.lon,
        stato: 'VALIDO',
        scade_il: scadeIl
      }
    });

    return {
      uploadId: record.id,
      storageKey: record.storage_key,
      tipo: record.tipo,
      mime: record.mime,
      byteSize: record.byte_size,
      sha256: record.sha256,
      exifCoords: inspection.exifCoords,
      scadeIl: record.scade_il
    };
  } catch (dbError) {
    // Gestione esplicita assenza 2PC / commit condiviso:
    // Se il DB fallisce, tentiamo la cancellazione compensativa su storage.
    // Se fallisce anche la compensazione, registriamo l'orfano in modo persistente.
    try {
      await storage.deleteObject(storageKey);
    } catch (compErr) {
      await registraOrfanoIrrecuperabile(
        storageKey,
        proprietarioId,
        byteSize,
        (compErr as Error)?.message || 'Cancellazione compensativa fallita'
      );
    }
    throw dbError;
  }
}

/**
 * Procedura controllata di pulizia upload temporanei scaduti o scartati (Garbage Collection VI09).
 * 
 * Salvaguardie assolute di concorrenza e integrità:
 * 1. Non elimina MAI record con stato 'CONSUMATO' o aventi consumato_il != null.
 * 2. Verifica preventiva che nessun record nella tabella `Media` referenzi lo storage_key.
 * 3. Concorrenza safe: esegue prima l'eliminazione atomica condizionata su DB
 *    (dove consumato_il IS NULL e scade_il < now). Se il record è stato consumato nel frattempo
 *    da createSegnalazioneAtomica, deleteMany restituirà 0 e il file su storage NON verrà toccato.
 * 4. Invocazione: manuale o da comando CLI (`npm run cleanup:uploads`), non da demone background.
 */
export async function pulisciUploadTemporaneiScaduti(): Promise<CleanupResult> {
  const ora = new Date();
  const storage = getStorageProvider();

  // 1. Identifica record candidati: solo scaduti e mai consumati
  const daPulire = await prisma.uploadTemporaneo.findMany({
    where: {
      stato: { in: ['VALIDO', 'IN_CARICAMENTO', 'SCARTATO'] },
      consumato_il: null,
      scade_il: { lt: ora }
    },
    select: { id: true, storage_key: true }
  });

  let rimossiStorage = 0;
  let scadutiEliminatiDb = 0;

  for (const item of daPulire) {
    // 2. Salvaguardia assoluta: verifica che nessun record Media definitivo punti allo storageKey
    const mediaCount = await prisma.media.count({
      where: { storage_key: item.storage_key }
    });

    if (mediaCount > 0) {
      // Se il file è referenziato da Media, non deve mai essere cancellato
      continue;
    }

    // 3. Concorrenza atomica con il consumo:
    // Eseguiamo il delete condizionato sul DB per primi.
    // Se una transazione concomitante ha appena eseguito createSegnalazioneAtomica,
    // il record avrà consumato_il != null e deleted.count sarà 0.
    const deleted = await prisma.uploadTemporaneo.deleteMany({
      where: {
        id: item.id,
        stato: { in: ['VALIDO', 'IN_CARICAMENTO', 'SCARTATO'] },
        consumato_il: null,
        scade_il: { lt: ora }
      }
    });

    if (deleted.count > 0) {
      scadutiEliminatiDb += deleted.count;
      try {
        await storage.deleteObject(item.storage_key);
        rimossiStorage++;
      } catch (delErr) {
        // Se la cancellazione fisica fallisce dopo aver eliminato il record DB, registriamo l'orfano
        await registraOrfanoIrrecuperabile(
          item.storage_key,
          'cleanup_scaduti',
          0,
          (delErr as Error)?.message || 'Errore eliminazione storage durante cleanup'
        );
      }
    }
  }

  return {
    scadutiEliminatiDb,
    fileOrfaniRimossiStorage: rimossiStorage
  };
}
