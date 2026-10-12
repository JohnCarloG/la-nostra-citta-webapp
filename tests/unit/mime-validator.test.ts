import { describe, it, expect } from 'vitest';
import {
  inspectFileBuffer,
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

function createValidMp4(): Buffer {
  // ftyp box: 20 bytes
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x14]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isom', 'ascii')
  ]);
  // moov box: 8 bytes
  const moov = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x08]),
    Buffer.from('moov', 'ascii')
  ]);
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

  it('Riconosce file MP4 validi con box ftyp e moov/mdat', () => {
    const validMp4 = createValidMp4();
    const res = inspectFileBuffer(validMp4);
    expect(res.valid).toBe(true);
    expect(res.tipoMedia).toBe('VIDEO');
    expect(res.realMime).toBe('video/mp4');
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
