import { describe, it, expect } from 'vitest';
import {
  inspectFileBuffer,
  extractMp4Duration,
  hasMp4VideoTrack,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES
} from '../../src/lib/storage/mime-validator';

// Costruzione buffer di test validi e strutturati
function createValidJpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xFF, 0xD8]), // SOI
    Buffer.from([0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]), // APP0
    Buffer.from([0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00]), // SOF0: 16x16 px
    Buffer.from([0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00]), // SOS
    Buffer.from([0xAA, 0xBB]), // Compressed scan data
    Buffer.from([0xFF, 0xD9])  // EOI
  ]);
}

function createValidPng(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // Signature (8 bytes)
    // IHDR chunk: 13 bytes data + 4 len + 4 type + 4 crc = 25 bytes
    Buffer.from([0x00, 0x00, 0x00, 0x0D]), // Length 13
    Buffer.from('IHDR', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x20, 0x08, 0x02, 0x00, 0x00, 0x00]), // 32x32 px
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // CRC
    // IDAT chunk: 4 bytes data
    Buffer.from([0x00, 0x00, 0x00, 0x04]),
    Buffer.from('IDAT', 'ascii'),
    Buffer.from([0x78, 0x9C, 0x00, 0x00]),
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // CRC
    // IEND chunk: 0 bytes data
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from('IEND', 'ascii'),
    Buffer.from([0xAE, 0x42, 0x60, 0x82])  // CRC
  ]);
}

function createValidWebp(): Buffer {
  const vp8Data = Buffer.from([0x00, 0x00, 0x00, 0x9D, 0x01, 0x2A, 0x10, 0x00, 0x10, 0x00]); // 10 bytes con firma 9D 01 2A
  const vp8ChunkLen = vp8Data.length;
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.write('VP8 ', 0, 'ascii');
  chunkHeader.writeUInt32LE(vp8ChunkLen, 4);

  const payload = Buffer.concat([chunkHeader, vp8Data]);
  const riffSize = 4 + payload.length; // 'WEBP' (4) + payload

  const riffHeader = Buffer.alloc(12);
  riffHeader.write('RIFF', 0, 'ascii');
  riffHeader.writeUInt32LE(riffSize, 4);
  riffHeader.write('WEBP', 8, 'ascii');

  return Buffer.concat([riffHeader, payload]);
}

function createHdlrBox(handlerType = 'vide'): Buffer {
  const name = Buffer.from('VideoHandler\0', 'ascii');
  const size = 8 + 4 + 4 + 4 + name.length; // 8 header + 4 ver/flags + 4 predefined + 4 handler + name
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(size, 0);
  buf.write('hdlr', 4, 'ascii');
  buf.writeUInt8(0, 8); // version 0
  buf.writeUInt32BE(0, 12); // pre_defined
  buf.write(handlerType, 16, 'ascii'); // 'vide' o 'soun'
  name.copy(buf, 20);
  return buf;
}

function createMdiaBox(handlerType = 'vide'): Buffer {
  const hdlr = createHdlrBox(handlerType);
  const size = 8 + hdlr.length;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(size, 0);
  buf.write('mdia', 4, 'ascii');
  return Buffer.concat([buf, hdlr]);
}

function createTrakBox(handlerType = 'vide'): Buffer {
  const mdia = createMdiaBox(handlerType);
  const size = 8 + mdia.length;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(size, 0);
  buf.write('trak', 4, 'ascii');
  return Buffer.concat([buf, mdia]);
}

export function createMp4WithoutVideoTrack(durationSeconds = 10, timescale = 1000): Buffer {
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x14]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isom', 'ascii')
  ]);
  const durationVal = Math.round(durationSeconds * timescale);
  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0);
  mvhd.write('mvhd', 4, 'ascii');
  mvhd.writeUInt8(0, 8);
  mvhd.writeUInt32BE(timescale, 20);
  mvhd.writeUInt32BE(durationVal, 24);

  const moovHeader = Buffer.alloc(8);
  moovHeader.writeUInt32BE(8 + mvhd.length, 0);
  moovHeader.write('moov', 4, 'ascii');
  const moov = Buffer.concat([moovHeader, mvhd]);
  return Buffer.concat([ftyp, moov]);
}

export function createMp4WithAudioTrackOnly(durationSeconds = 10, timescale = 1000): Buffer {
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x14]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isom', 'ascii')
  ]);
  const durationVal = Math.round(durationSeconds * timescale);
  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0);
  mvhd.write('mvhd', 4, 'ascii');
  mvhd.writeUInt8(0, 8);
  mvhd.writeUInt32BE(timescale, 20);
  mvhd.writeUInt32BE(durationVal, 24);

  const trak = createTrakBox('soun'); // Solo audio!
  const moovHeader = Buffer.alloc(8);
  moovHeader.writeUInt32BE(8 + mvhd.length + trak.length, 0);
  moovHeader.write('moov', 4, 'ascii');
  const moov = Buffer.concat([moovHeader, mvhd, trak]);
  return Buffer.concat([ftyp, moov]);
}

export function createMp4WithTruncatedHdlrAndVideInNextBox(): Buffer {
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x14]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isom', 'ascii')
  ]);
  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0);
  mvhd.write('mvhd', 4, 'ascii');
  mvhd.writeUInt8(0, 8);
  mvhd.writeUInt32BE(1000, 20);
  mvhd.writeUInt32BE(10000, 24);

  // Box 1: hdlr troncato a soli 12 byte (header 8 + 4 byte version/flags, privo di predefined e handler_type)
  const truncatedHdlr = Buffer.alloc(12);
  truncatedHdlr.writeUInt32BE(12, 0);
  truncatedHdlr.write('hdlr', 4, 'ascii');
  truncatedHdlr.writeUInt8(0, 8);

  // Box 2: box successivo (minf) in mdia il cui payload contiene 'vide'
  const nextBox = Buffer.alloc(16);
  nextBox.writeUInt32BE(16, 0);
  nextBox.write('minf', 4, 'ascii');
  nextBox.write('vide', 8, 'ascii');

  const mdiaPayload = Buffer.concat([truncatedHdlr, nextBox]);
  const mdiaHeader = Buffer.alloc(8);
  mdiaHeader.writeUInt32BE(8 + mdiaPayload.length, 0);
  mdiaHeader.write('mdia', 4, 'ascii');
  const mdia = Buffer.concat([mdiaHeader, mdiaPayload]);

  const trakHeader = Buffer.alloc(8);
  trakHeader.writeUInt32BE(8 + mdia.length, 0);
  trakHeader.write('trak', 4, 'ascii');
  const trak = Buffer.concat([trakHeader, mdia]);

  const moovHeader = Buffer.alloc(8);
  moovHeader.writeUInt32BE(8 + mvhd.length + trak.length, 0);
  moovHeader.write('moov', 4, 'ascii');
  const moov = Buffer.concat([moovHeader, mvhd, trak]);

  return Buffer.concat([ftyp, moov]);
}

export function createMp4WithLargeBoxHighBitsSet(): Buffer {
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x14]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isom', 'ascii')
  ]);

  // Box esteso a 64-bit con bit alti non nulli (high = 1) e parte bassa plausibile (low = 24)
  const largeBox = Buffer.alloc(24);
  largeBox.writeUInt32BE(1, 0); // size = 1 indica estensione 64-bit
  largeBox.write('free', 4, 'ascii');
  largeBox.writeUInt32BE(1, 8); // Parte alta non nulla (> 0)
  largeBox.writeUInt32BE(24, 12); // Parte bassa plausibile

  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0);
  mvhd.write('mvhd', 4, 'ascii');
  mvhd.writeUInt8(0, 8);
  mvhd.writeUInt32BE(1000, 20);
  mvhd.writeUInt32BE(10000, 24);

  const trak = createTrakBox('vide');
  const moovHeader = Buffer.alloc(8);
  moovHeader.writeUInt32BE(8 + mvhd.length + trak.length, 0);
  moovHeader.write('moov', 4, 'ascii');
  const moov = Buffer.concat([moovHeader, mvhd, trak]);

  return Buffer.concat([ftyp, largeBox, moov]);
}

export function createMinimalReproducibleMp4(): Buffer {
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x14]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isom', 'ascii')
  ]);
  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0);
  mvhd.write('mvhd', 4, 'ascii');
  mvhd.writeUInt8(0, 8);
  mvhd.writeUInt32BE(1000, 20);
  mvhd.writeUInt32BE(5000, 24); // 5.0 secondi

  const trak = createTrakBox('vide');
  const moovHeader = Buffer.alloc(8);
  moovHeader.writeUInt32BE(8 + mvhd.length + trak.length, 0);
  moovHeader.write('moov', 4, 'ascii');
  const moov = Buffer.concat([moovHeader, mvhd, trak]);

  return Buffer.concat([ftyp, moov]);
}

export function createValidMp4(durationSeconds = 10, timescale = 1000): Buffer {
  // ftyp box: 20 bytes
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x14]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isom', 'ascii')
  ]);

  // mvhd box (Movie Header): 108 bytes
  const durationVal = Math.round(durationSeconds * timescale);
  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0);
  mvhd.write('mvhd', 4, 'ascii');
  mvhd.writeUInt8(0, 8); // Version 0
  mvhd.writeUInt32BE(timescale, 20);
  mvhd.writeUInt32BE(durationVal, 24);

  // trak box con traccia video 'vide'
  const trak = createTrakBox('vide');

  // moov box container: 8 byte header + mvhd length + trak length
  const moovHeader = Buffer.alloc(8);
  moovHeader.writeUInt32BE(8 + mvhd.length + trak.length, 0);
  moovHeader.write('moov', 4, 'ascii');

  const moov = Buffer.concat([moovHeader, mvhd, trak]);
  return Buffer.concat([ftyp, moov]);
}

describe('Validazione Strutturale Binaria e Anti-Tampering (inspectFileBuffer)', () => {
  it('Riconosce file JPEG validi e completi', () => {
    const validJpeg = createValidJpeg();
    const res = inspectFileBuffer(validJpeg);
    expect(res.valid).toBe(true);
    expect(res.tipoMedia).toBe('FOTO');
    expect(res.realMime).toBe('image/jpeg');
  });

  it('Rifiuta JPEG troncato o privo di SOF / EOI anche se inizia con magic bytes FF D8 FF', () => {
    // Magic bytes validi seguiti da dati arbitrari senza SOF o EOI
    const fakeJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x41, 0x42, 0x43]);
    const res = inspectFileBuffer(fakeJpeg);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/troncato|non valido|SOF|EOI/i);
  });

  it('Riconosce file PNG validi con struttura IHDR, IDAT e IEND', () => {
    const validPng = createValidPng();
    const res = inspectFileBuffer(validPng);
    expect(res.valid).toBe(true);
    expect(res.tipoMedia).toBe('FOTO');
    expect(res.realMime).toBe('image/png');
  });

  it('Rifiuta PNG troncato con sola firma iniziale o privo di IEND', () => {
    // Solo firma di 8 byte
    const headerOnlyPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const res1 = inspectFileBuffer(headerOnlyPng);
    expect(res1.valid).toBe(false);
    expect(res1.error).toMatch(/troncato|IHDR|mancante/i);

    // PNG con IHDR e IDAT ma privo di IEND (terminatore finale mancante)
    const withoutIend = createValidPng().subarray(0, 49);
    const res2 = inspectFileBuffer(withoutIend);
    expect(res2.valid).toBe(false);
    expect(res2.error).toMatch(/troncato|IEND/i);
  });

  it('Riconosce file WebP validi con chunk VP8 sincrono', () => {
    const validWebp = createValidWebp();
    const res = inspectFileBuffer(validWebp);
    expect(res.valid).toBe(true);
    expect(res.tipoMedia).toBe('FOTO');
    expect(res.realMime).toBe('image/webp');
  });

  it('Rifiuta file WebP con dimensione RIFF incoerente o chunk troncato', () => {
    const fakeWebp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0xFF, 0x00, 0x00, 0x00]), // Dichiara 255 bytes ma ne contiene solo 12
      Buffer.from('WEBP', 'ascii')
    ]);
    const res = inspectFileBuffer(fakeWebp);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/troncato|inferiore/i);
  });

  it('Riconosce file MP4 validi con box ftyp, moov e durata valida <= 60s', () => {
    const validMp4 = createValidMp4(10);
    const res = inspectFileBuffer(validMp4);
    expect(res.valid).toBe(true);
    expect(res.tipoMedia).toBe('VIDEO');
    expect(res.realMime).toBe('video/mp4');
    expect(res.durataSecondi).toBe(10);
  });

  it('RF04: Accetta video MP4 sintetico di durata esattamente pari a 60 secondi', () => {
    const exactly60 = createValidMp4(60.0);
    const res = inspectFileBuffer(exactly60);
    expect(res.valid).toBe(true);
    expect(res.tipoMedia).toBe('VIDEO');
    expect(res.durataSecondi).toBe(60);
  });

  it('RF04: Rifiuta video MP4 con durata poco oltre 60 secondi (60.5s e 61s) confrontando prima dell arrotondamento anche sotto 50 MiB', () => {
    // 60.5s: se arrotondato per difetto sarebbe 60s, ma prima dell'arrotondamento supera il limite
    const slightlyOver = createValidMp4(60.5, 1000);
    expect(slightlyOver.length).toBeLessThan(MAX_VIDEO_BYTES); // Ampiamente sotto 50 MiB
    const resSlightlyOver = inspectFileBuffer(slightlyOver);
    expect(resSlightlyOver.valid).toBe(false);
    expect(resSlightlyOver.error).toContain('supera il limite massimo consentito di 60 secondi');
    expect(resSlightlyOver.error).toContain('60.5 s');

    const video61 = createValidMp4(61.0, 1000);
    const res61 = inspectFileBuffer(video61);
    expect(res61.valid).toBe(false);
    expect(res61.error).toContain('supera il limite massimo consentito di 60 secondi');
    expect(res61.error).toContain('61.0 s');
  });

  it('RF04: Rifiuta video MP4 con durata non leggibile o assente nei metadati (moov senza mvhd o timescale nullo)', () => {
    // moov privo di mvhd
    const moovWithoutMvhd = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x14]),
      Buffer.from('ftyp', 'ascii'),
      Buffer.from('isom', 'ascii'),
      Buffer.from([0x00, 0x00, 0x02, 0x00]),
      Buffer.from('isom', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x08]),
      Buffer.from('moov', 'ascii')
    ]);
    const resNoMvhd = inspectFileBuffer(moovWithoutMvhd);
    expect(resNoMvhd.valid).toBe(false);
    expect(resNoMvhd.error).toContain('Durata del video non leggibile');

    // timescale nullo (divisione per zero / durata infinita)
    const zeroTimescaleMp4 = createValidMp4(10, 0);
    const resZeroTimescale = inspectFileBuffer(zeroTimescaleMp4);
    expect(resZeroTimescale.valid).toBe(false);
    expect(resZeroTimescale.error).toContain('Durata del video non valida');
  });

  it('RF04: Il parser reale extractMp4Duration legge direttamente i byte binari dell atomo mvhd', () => {
    const rawMp4 = createValidMp4(45.2, 1000);
    const parsed = extractMp4Duration(rawMp4);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.durationSeconds).toBeCloseTo(45.2, 1);
    }
  });

  it('RF04 Regressione: Rifiuta file MP4 contenente solo ftyp/moov/mvhd privo di tracce multimediali (nessun box trak)', () => {
    const mp4NoTrak = createMp4WithoutVideoTrack(10);
    const res = inspectFileBuffer(mp4NoTrak);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('privo di tracce multimediali');

    const trackCheck = hasMp4VideoTrack(mp4NoTrak);
    expect(trackCheck.hasVideoTrack).toBe(false);
    expect(trackCheck.error).toContain('nessun box trak presente');
  });

  it('RF04 Regressione: Rifiuta file MP4 con solo traccia audio (handler "soun") e nessuna traccia video ("vide")', () => {
    const mp4AudioOnly = createMp4WithAudioTrackOnly(10);
    const res = inspectFileBuffer(mp4AudioOnly);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("privo di traccia video: nessun flusso con handler 'vide'");

    const trackCheck = hasMp4VideoTrack(mp4AudioOnly);
    expect(trackCheck.hasVideoTrack).toBe(false);
    expect(trackCheck.error).toContain("nessun flusso con handler 'vide'");
  });

  it('RF04: hasMp4VideoTrack riconosce correttamente la presenza della traccia video ("vide")', () => {
    const validVideo = createValidMp4(15);
    const trackCheck = hasMp4VideoTrack(validVideo);
    expect(trackCheck.hasVideoTrack).toBe(true);
    expect(trackCheck.error).toBeUndefined();
  });

  it('RF04 Regressione: Rifiuta box hdlr troncato anche se il box successivo contiene i byte "vide"', () => {
    const mp4TruncatedHdlr = createMp4WithTruncatedHdlrAndVideInNextBox();
    const trackCheck = hasMp4VideoTrack(mp4TruncatedHdlr);
    // Deve fallire perché i 12 byte non sono dentro hdlr, nonostante 'vide' sia nel box successivo
    expect(trackCheck.hasVideoTrack).toBe(false);

    const res = inspectFileBuffer(mp4TruncatedHdlr);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/privo di traccia video|non rilevabile/i);
  });

  it('RF04 Regressione: Rifiuta box esteso a 64-bit con 32 bit alti non nulli anche con parte bassa plausibile', () => {
    const mp4WithLargeBoxHighBits = createMp4WithLargeBoxHighBitsSet();
    const res = inspectFileBuffer(mp4WithLargeBoxHighBits);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('bit alti non nulli');
  });

  it('RF04: Fixture strutturale senza fotogrammi da 185 byte validata con successo e durata 5.0s letta dall app', () => {
    const minimalMp4 = createMinimalReproducibleMp4();
    expect(minimalMp4.length).toBe(185);

    const res = inspectFileBuffer(minimalMp4);
    expect(res.valid).toBe(true);
    expect(res.tipoMedia).toBe('VIDEO');
    expect(res.realMime).toBe('video/mp4');
    expect(res.durataSecondi).toBe(5);

    const durationCheck = extractMp4Duration(minimalMp4);
    expect(durationCheck.success).toBe(true);
    if (durationCheck.success) {
      expect(durationCheck.durationSeconds).toBe(5.0);
    }

    const trackCheck = hasMp4VideoTrack(minimalMp4);
    expect(trackCheck.hasVideoTrack).toBe(true);
  });

  it('Rifiuta MP4 privo di tracce audio/video (senza moov o mdat) o troncato', () => {
    const ftypOnly = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x14]),
      Buffer.from('ftyp', 'ascii'),
      Buffer.from('isom', 'ascii'),
      Buffer.from([0x00, 0x00, 0x02, 0x00]),
      Buffer.from('isom', 'ascii')
    ]);
    const res = inspectFileBuffer(ftypOnly);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/moov|mdat|mancanti/i);
  });

  it('Non va in crash su segmenti EXIF malformati o intenzionalmente corrotti', () => {
    // JPEG con segmento APP1 corrotto con puntatori IFD invalidi
    const corruptedExifJpeg = Buffer.concat([
      Buffer.from([0xFF, 0xD8]),
      Buffer.from([0xFF, 0xE1, 0x00, 0x10]), // APP1 lunghezza 16
      Buffer.from('Exif\0\0II*\0', 'latin1'),
      Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), // offset IFD fuori range
      Buffer.from([0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00]), // SOF0
      Buffer.from([0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00]), // SOS
      Buffer.from([0x00]),
      Buffer.from([0xFF, 0xD9]) // EOI
    ]);

    expect(() => {
      const res = inspectFileBuffer(corruptedExifJpeg);
      expect(res.valid).toBe(true);
      expect(res.exifCoords).toBeUndefined(); // EXIF malformato ignorato senza errori fatali
    }).not.toThrow();
  });

  it('Rifiuta file vuoti o non supportati', () => {
    expect(inspectFileBuffer(Buffer.alloc(0)).valid).toBe(false);
    expect(inspectFileBuffer(Buffer.from('<html><body>Fake</body></html>')).valid).toBe(false);
  });

  it('Rifiuta immagini oltre 10 MiB e video oltre 50 MiB', () => {
    const hugeBuf = Buffer.alloc(MAX_PHOTO_BYTES + 1);
    hugeBuf[0] = 0xFF; hugeBuf[1] = 0xD8; hugeBuf[2] = 0xFF; hugeBuf[3] = 0xE0;
    const resPhoto = inspectFileBuffer(hugeBuf);
    expect(resPhoto.valid).toBe(false);
    expect(resPhoto.error).toContain('supera il limite di 10 MiB');

    const hugeVideo = Buffer.alloc(MAX_VIDEO_BYTES + 1);
    hugeVideo.write('ftyp', 4, 'ascii');
    const resVideo = inspectFileBuffer(hugeVideo);
    expect(resVideo.valid).toBe(false);
    expect(resVideo.error).toContain('supera il limite di 50 MiB');
  });
});
