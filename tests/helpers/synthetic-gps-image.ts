import sharp from 'sharp';

/** Real decodable synthetic pixels with a complete GPS IFD; no private photo. */
export const SYNTHETIC_GPS = { lat: 45.4642, lon: 9.19 };
export async function syntheticGpsJpeg() {
  return sharp({ create: { width: 32, height: 32, channels: 3, background: '#227744' } })
    .withExif({ IFD3: {
      GPSLatitudeRef: 'N', GPSLatitude: '45/1 27/1 5112/100',
      GPSLongitudeRef: 'E', GPSLongitude: '9/1 11/1 2400/100'
    } }).jpeg().toBuffer();
}
