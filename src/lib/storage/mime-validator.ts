/**
 * Validazione strutturale e rilevamento del tipo MIME reale dai formati binari.
 * 
 * Requisiti di sicurezza (RF04, VI04, VI05, VI10):
 * - I magic bytes identificano un formato candidato ma NON garantiscono un file valido.
 * - Verifica struttura interna e decodificabilità minima (segmenti, chunk, box ISO/IEC).
 * - Rifiuta file troncati, dati arbitrari preceduti da sole intestazioni, e buffer corrotti.
 * - Limiti stringenti di computazione per prevenire attacchi DoS/risorse su file forgiati.
 * - Parser EXIF resiliente che non va mai in crash su payload malformati.
 * 
 * AVVERTENZA PROBATORIA SU EXIF GPS:
 * Le coordinate geografiche estratte dai metadati EXIF provengono interamente dal client,
 * non sono autenticate né firmate crittograficamente e sono facilmente fabbricabili o
 * alterabili con strumenti banali. Di conseguenza, esse NON COSTITUISCONO in alcun modo
 * prova attendibile o probatoria del reale luogo dello scatto (principio Zero-Trust e VI05).
 * Esse sono impiegate esclusivamente come suggerimento indicativo per l'utente nel form.
 */

export interface FileValidationResult {
  valid: boolean;
  tipoMedia?: 'FOTO' | 'VIDEO';
  realMime?: string;
  error?: string;
  exifCoords?: {
    lat: number;
    lon: number;
  };
}

// Limiti di dimensione stabiliti dalle specifiche di progetto:
// - Foto: JPEG, PNG, WebP fino a 10 MiB (10 * 1024 * 1024 = 10,485,760 bytes)
// - Video: MP4 fino a 50 MiB (50 * 1024 * 1024 = 52,428,800 bytes)
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function inspectFileBuffer(buffer: Buffer): FileValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'File vuoto o privo di contenuto' };
  }

  // 1. JPEG: SOI marker 0xFF 0xD8
  if (buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    if (buffer.length > MAX_PHOTO_BYTES) {
      return { valid: false, error: `Dimensione immagine JPEG supera il limite di 10 MiB (${buffer.length} bytes)` };
    }
    const jpegCheck = validateJpegStructure(buffer);
    if (!jpegCheck.valid) {
      return { valid: false, error: jpegCheck.error };
    }

    const coords = extractJpegExifGps(buffer);
    return {
      valid: true,
      tipoMedia: 'FOTO',
      realMime: 'image/jpeg',
      exifCoords: coords
    };
  }

  // 2. PNG: 8-byte signature 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    if (buffer.length > MAX_PHOTO_BYTES) {
      return { valid: false, error: `Dimensione immagine PNG supera il limite di 10 MiB (${buffer.length} bytes)` };
    }
    const pngCheck = validatePngStructure(buffer);
    if (!pngCheck.valid) {
      return { valid: false, error: pngCheck.error };
    }
    return {
      valid: true,
      tipoMedia: 'FOTO',
      realMime: 'image/png'
    };
  }

  // 3. WebP: 'RIFF' + 4-byte size + 'WEBP'
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    if (buffer.length > MAX_PHOTO_BYTES) {
      return { valid: false, error: `Dimensione immagine WebP supera il limite di 10 MiB (${buffer.length} bytes)` };
    }
    const webpCheck = validateWebpStructure(buffer);
    if (!webpCheck.valid) {
      return { valid: false, error: webpCheck.error };
    }
    return {
      valid: true,
      tipoMedia: 'FOTO',
      realMime: 'image/webp'
    };
  }

  // 4. MP4: box ftyp nei primi 8 byte
  if (
    buffer.length >= 16 &&
    buffer.toString('ascii', 4, 8) === 'ftyp'
  ) {
    if (buffer.length > MAX_VIDEO_BYTES) {
      return { valid: false, error: `Dimensione video MP4 supera il limite di 50 MiB (${buffer.length} bytes)` };
    }
    const mp4Check = validateMp4Structure(buffer);
    if (!mp4Check.valid) {
      return { valid: false, error: mp4Check.error };
    }
    return {
      valid: true,
      tipoMedia: 'VIDEO',
      realMime: 'video/mp4'
    };
  }

  return {
    valid: false,
    error: 'Formato file non supportato o firma binaria (magic bytes) non riconosciuta. Ammessi solo JPEG, PNG, WebP o MP4.'
  };
}

/**
 * Validazione strutturale JPEG:
 * - Inizia con SOI (0xFF 0xD8).
 * - Scansiona i segmenti di marcatura con controllo stringente dei limiti di memoria e computazione.
 * - Richiede la presenza di un marcatore Start of Frame (SOF0..SOF15 eccetto DHT/JPG) con dimensioni valide > 0.
 * - Richiede la presenza del terminatore EOI (0xFF 0xD9) per prevenire file troncati o payload arbitrari.
 */
function validateJpegStructure(buffer: Buffer): { valid: boolean; error?: string } {
  try {
    let offset = 2;
    let foundSof = false;
    let foundEoi = false;
    let iterations = 0;
    const maxIterations = 200;

    while (offset < buffer.length && iterations < maxIterations) {
      iterations++;
      // Salta eventuali byte di padding 0xFF consecutivi
      if (buffer[offset] !== 0xFF) {
        return { valid: false, error: 'Struttura JPEG non valida: marcatore atteso mancante o segmento corrotto' };
      }
      while (offset < buffer.length && buffer[offset] === 0xFF) {
        offset++;
      }
      if (offset >= buffer.length) break;

      const marker = buffer[offset++];

      // EOI (End of Image)
      if (marker === 0xD9) {
        foundEoi = true;
        break;
      }

      // Marcatori senza lunghezza (RST0..RST7, SOI, TEM)
      if ((marker >= 0xD0 && marker <= 0xD7) || marker === 0xD8 || marker === 0x01) {
        continue;
      }

      // Tutti gli altri marcatori hanno lunghezza indicata da 2 byte (inclusi i 2 byte stessi)
      if (offset + 2 > buffer.length) {
        return { valid: false, error: 'File JPEG troncato: lunghezza del segmento fuori dai limiti del file' };
      }
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) {
        return { valid: false, error: 'File JPEG troncato o segmento con dimensione incoerente' };
      }

      // Start of Frame (SOF) marcatori ordinari: 0xC0..0xC3, 0xC5..0xC7, 0xC9..0xCB, 0xCD..0xCF
      const isSof = (marker >= 0xC0 && marker <= 0xC3) ||
                    (marker >= 0xC5 && marker <= 0xC7) ||
                    (marker >= 0xC9 && marker <= 0xCB) ||
                    (marker >= 0xCD && marker <= 0xCF);

      if (isSof) {
        // Un segmento SOF ha almeno precision (1 byte) + height (2 bytes) + width (2 bytes) + components (1 byte) = 6 byte oltre la lunghezza
        if (segmentLength >= 8 && offset + 7 <= buffer.length) {
          const height = buffer.readUInt16BE(offset + 3);
          const width = buffer.readUInt16BE(offset + 5);
          if (width > 0 && height > 0) {
            foundSof = true;
          }
        }
      }

      // Se raggiungiamo SOS (Start of Scan 0xDA), i dati compressi arrivano fino a EOI (0xFF 0xD9)
      if (marker === 0xDA) {
        const eoiIndex = buffer.indexOf(Buffer.from([0xFF, 0xD9]), offset);
        if (eoiIndex !== -1) {
          foundEoi = true;
        }
        break;
      }

      offset += segmentLength;
    }

    if (!foundSof) {
      return { valid: false, error: 'File JPEG non valido o privo di intestazione fotogramma (SOF) decodificabile' };
    }

    if (!foundEoi) {
      return { valid: false, error: 'File JPEG troncato: terminatore EOI (End of Image) mancante' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Errore di parsing strutturale del file JPEG' };
  }
}

/**
 * Validazione strutturale PNG (RFC 2083 / ISO/IEC 15948):
 * - Inizia con firma PNG 8-byte.
 * - Il primo chunk DEVE essere 'IHDR' con larghezza > 0 e altezza > 0.
 * - Deve contenere almeno un chunk 'IDAT' (dati immagine compressi).
 * - Deve terminare con chunk 'IEND' (lunghezza 0) per escludere file troncati o corrotti.
 */
function validatePngStructure(buffer: Buffer): { valid: boolean; error?: string } {
  try {
    let offset = 8;
    let foundIhdr = false;
    let foundIdat = false;
    let foundIend = false;
    let iterations = 0;
    const maxIterations = 300;

    while (offset + 8 <= buffer.length && iterations < maxIterations) {
      iterations++;
      const chunkLen = buffer.readUInt32BE(offset);
      const chunkType = buffer.toString('ascii', offset + 4, offset + 8);

      // Ogni chunk occupa: 4 byte len + 4 byte type + chunkLen byte data + 4 byte CRC = chunkLen + 12
      const totalChunkSize = chunkLen + 12;
      if (offset + totalChunkSize > buffer.length) {
        return { valid: false, error: `File PNG troncato: il chunk '${chunkType}' dichiara dimensione oltre la fine del file` };
      }

      if (iterations === 1) {
        if (chunkType !== 'IHDR' || chunkLen < 13) {
          return { valid: false, error: 'File PNG non valido: primo chunk atteso IHDR mancante' };
        }
        const width = buffer.readUInt32BE(offset + 8);
        const height = buffer.readUInt32BE(offset + 12);
        if (width === 0 || height === 0) {
          return { valid: false, error: 'File PNG non valido: dimensioni immagine nulle' };
        }
        foundIhdr = true;
      }

      if (chunkType === 'IDAT') {
        foundIdat = true;
      }

      if (chunkType === 'IEND') {
        if (chunkLen !== 0) {
          return { valid: false, error: 'File PNG non valido: chunk IEND con lunghezza non nulla' };
        }
        foundIend = true;
        break;
      }

      offset += totalChunkSize;
    }

    if (!foundIhdr) {
      return { valid: false, error: 'File PNG non valido: intestazione IHDR non trovata' };
    }
    if (!foundIdat) {
      return { valid: false, error: 'File PNG non valido o vuoto: nessun chunk di dati (IDAT) presente' };
    }
    if (!foundIend) {
      return { valid: false, error: 'File PNG troncato: chunk terminatore IEND mancante' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Errore di parsing strutturale del file PNG' };
  }
}

/**
 * Validazione strutturale WebP (RIFF container):
 * - Dimensione totale dichiarata nel container RIFF coerente con il buffer.
 * - Presenza di chunk valido (VP8 , VP8L, VP8X).
 * - Verifica del codice di sincronizzazione fotogramma/bitstream per escludere file forgiati.
 */
function validateWebpStructure(buffer: Buffer): { valid: boolean; error?: string } {
  try {
    if (buffer.length < 20) {
      return { valid: false, error: 'File WebP troncato: intestazione insufficiente' };
    }

    const riffSize = buffer.readUInt32LE(4);
    // Dimensione attesa del file: riffSize + 8 (RIFF + 4 byte size).
    // È consentito fino a 1 byte di padding alla fine.
    if (buffer.length < riffSize + 8) {
      return { valid: false, error: `File WebP troncato: dimensione file (${buffer.length} bytes) inferiore a quella dichiarata nel container RIFF (${riffSize + 8} bytes)` };
    }

    const chunkType = buffer.toString('ascii', 12, 16);
    const chunkLen = buffer.readUInt32LE(16);

    if (20 + chunkLen > buffer.length) {
      return { valid: false, error: `File WebP troncato: chunk '${chunkType}' eccede la dimensione del file` };
    }

    if (chunkType === 'VP8 ') {
      // VP8 lossy: richiede almeno 10 byte di header per verificare il keyframe
      if (chunkLen < 10) {
        return { valid: false, error: 'File WebP VP8 non valido: dati fotogramma insufficienti' };
      }
      // I byte 23, 24, 25 in VP8 intra-frame devono corrispondere a 0x9D 0x01 0x2A
      const sync0 = buffer[23];
      const sync1 = buffer[24];
      const sync2 = buffer[25];
      if (sync0 !== 0x9D || sync1 !== 0x01 || sync2 !== 0x2A) {
        return { valid: false, error: 'File WebP VP8 non valido: firma bitstream fotogramma errata' };
      }
    } else if (chunkType === 'VP8L') {
      // VP8L lossless: primo byte dei dati deve essere la firma 0x2F
      if (chunkLen < 5 || buffer[20] !== 0x2F) {
        return { valid: false, error: 'File WebP VP8L non valido: firma lossless non riconosciuta' };
      }
    } else if (chunkType === 'VP8X') {
      // Extended WebP: chunk deve contenere almeno i flag e le dimensioni del canvas (10 byte)
      if (chunkLen < 10) {
        return { valid: false, error: 'File WebP VP8X esteso non valido: chunk dati troncato' };
      }
    } else {
      return { valid: false, error: `File WebP non supportato o tipo chunk sconosciuto: '${chunkType}'` };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Errore di parsing strutturale del file WebP' };
  }
}

/**
 * Validazione strutturale MP4 (ISO Base Media File Format ISO/IEC 14496-12):
 * - Inizia con atomo 'ftyp' con dimensione valida.
 * - Scansiona la gerarchia di box di primo livello verificando limiti e consistenza.
 * - Richiede la presenza di 'moov' (metadati del filmato) oppure 'mdat' (media payload)
 *   senza sforamento dei limiti fisici del buffer.
 */
function validateMp4Structure(buffer: Buffer): { valid: boolean; error?: string } {
  try {
    let offset = 0;
    let foundFtyp = false;
    let foundMediaOrMetadata = false;
    let iterations = 0;
    const maxIterations = 150;

    while (offset + 8 <= buffer.length && iterations < maxIterations) {
      iterations++;
      const boxSize = buffer.readUInt32BE(offset);
      const boxType = buffer.toString('ascii', offset + 4, offset + 8);

      if (boxSize < 8 && boxSize !== 0 && boxSize !== 1) {
        return { valid: false, error: `File MP4 corrotto: dimensione del box '${boxType}' non valida (${boxSize})` };
      }

      let actualBoxSize = boxSize;
      if (boxSize === 0) {
        // box runs to end of file
        actualBoxSize = buffer.length - offset;
      } else if (boxSize === 1) {
        // 64-bit large box
        if (offset + 16 > buffer.length) {
          return { valid: false, error: 'File MP4 troncato nel box a 64-bit' };
        }
        const high = buffer.readUInt32BE(offset + 8);
        const low = buffer.readUInt32BE(offset + 12);
        if (high > 0) {
          return { valid: false, error: 'File MP4 supera le dimensioni massime gestibili' };
        }
        actualBoxSize = low;
      }

      if (offset + actualBoxSize > buffer.length) {
        return { valid: false, error: `File MP4 troncato: il box '${boxType}' eccede la fine del file` };
      }

      if (iterations === 1) {
        if (boxType !== 'ftyp') {
          return { valid: false, error: 'File MP4 non valido: box ftyp non presente all\'inizio' };
        }
        foundFtyp = true;
      }

      if (boxType === 'moov' || boxType === 'mdat') {
        foundMediaOrMetadata = true;
      }

      offset += actualBoxSize;
    }

    if (!foundFtyp) {
      return { valid: false, error: 'File MP4 non valido: ftyp box mancante' };
    }
    if (!foundMediaOrMetadata) {
      return { valid: false, error: 'File MP4 privo di tracce audio/video o metadati (moov/mdat mancanti)' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Errore di parsing strutturale del file MP4' };
  }
}

/**
 * Parser resiliente EXIF GPS senza librerie esterne:
 * Esplora i segmenti APP1 (0xFF 0xE1) per identificare latitudine/longitudine se presenti.
 * Garantisce zero-crash su metadati malformati o troncati.
 */
export function extractJpegExifGps(buffer: Buffer): { lat: number; lon: number } | undefined {
  try {
    let offset = 2;
    while (offset < buffer.length - 4) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];

      // SOS o EOI: fine dei metadati
      if (marker === 0xDA || marker === 0xD9) break;

      if (offset + 4 > buffer.length) break;
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) break;

      if (marker === 0xE1) {
        // APP1 Exif segment
        if (offset + 10 <= buffer.length) {
          const exifHeader = buffer.toString('ascii', offset + 4, offset + 8);
          if (exifHeader === 'Exif') {
            return parseExifTiffGps(buffer.subarray(offset + 10, offset + 2 + length));
          }
        }
      }
      offset += 2 + length;
    }
  } catch {
    // Gestione silenziosa e robusta: EXIF malformato non invalida l'immagine
  }
  return undefined;
}

function parseExifTiffGps(tiffBuffer: Buffer): { lat: number; lon: number } | undefined {
  try {
    if (tiffBuffer.length < 8) return undefined;
    const isLittleEndian = tiffBuffer.toString('ascii', 0, 2) === 'II';
    const readUInt16 = (o: number) => {
      if (o + 2 > tiffBuffer.length) return 0;
      return isLittleEndian ? tiffBuffer.readUInt16LE(o) : tiffBuffer.readUInt16BE(o);
    };
    const readUInt32 = (o: number) => {
      if (o + 4 > tiffBuffer.length) return 0;
      return isLittleEndian ? tiffBuffer.readUInt32LE(o) : tiffBuffer.readUInt32BE(o);
    };

    const ifd0Offset = readUInt32(4);
    if (ifd0Offset >= tiffBuffer.length || ifd0Offset < 8) return undefined;

    let gpsIfdOffset: number | null = null;
    const entries0 = readUInt16(ifd0Offset);
    for (let i = 0; i < entries0; i++) {
      const entryOffset = ifd0Offset + 2 + (i * 12);
      if (entryOffset + 12 > tiffBuffer.length) break;
      const tag = readUInt16(entryOffset);
      if (tag === 0x8825) { // GPS Info IFD pointer
        gpsIfdOffset = readUInt32(entryOffset + 8);
        break;
      }
    }

    if (!gpsIfdOffset || gpsIfdOffset >= tiffBuffer.length) return undefined;

    let latRef: string | null = null;
    let lonRef: string | null = null;
    let latVal: number | null = null;
    let lonVal: number | null = null;

    const entriesGps = readUInt16(gpsIfdOffset);
    for (let i = 0; i < entriesGps; i++) {
      const entryOffset = gpsIfdOffset + 2 + (i * 12);
      if (entryOffset + 12 > tiffBuffer.length) break;
      const tag = readUInt16(entryOffset);

      if (tag === 0x0001) { // GPSLatitudeRef
        latRef = String.fromCharCode(tiffBuffer[entryOffset + 8]);
      } else if (tag === 0x0003) { // GPSLongitudeRef
        lonRef = String.fromCharCode(tiffBuffer[entryOffset + 8]);
      } else if (tag === 0x0002) { // GPSLatitude
        const valOffset = readUInt32(entryOffset + 8);
        latVal = readRationalCoord(tiffBuffer, valOffset, isLittleEndian);
      } else if (tag === 0x0004) { // GPSLongitude
        const valOffset = readUInt32(entryOffset + 8);
        lonVal = readRationalCoord(tiffBuffer, valOffset, isLittleEndian);
      }
    }

    if (latVal !== null && lonVal !== null) {
      if (latRef === 'S') latVal = -latVal;
      if (lonRef === 'W') lonVal = -lonVal;

      if (latVal >= -90 && latVal <= 90 && lonVal >= -180 && lonVal <= 180) {
        return {
          lat: Math.round(latVal * 1e6) / 1e6,
          lon: Math.round(lonVal * 1e6) / 1e6
        };
      }
    }
  } catch {
    // Malformed EXIF handled gracefully
  }
  return undefined;
}

function readRationalCoord(buf: Buffer, offset: number, isLE: boolean): number | null {
  if (offset + 24 > buf.length) return null;
  const readU32 = (o: number) => isLE ? buf.readUInt32LE(o) : buf.readUInt32BE(o);

  const degNum = readU32(offset);
  const degDen = readU32(offset + 4);
  const minNum = readU32(offset + 8);
  const minDen = readU32(offset + 12);
  const secNum = readU32(offset + 16);
  const secDen = readU32(offset + 20);

  if (degDen === 0 || minDen === 0 || secDen === 0) return null;

  const deg = degNum / degDen;
  const min = minNum / minDen;
  const sec = secNum / secDen;

  return deg + (min / 60) + (sec / 3600);
}
