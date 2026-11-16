import crypto from 'node:crypto';
import sharp from 'sharp';
import { GeminiClient, type Check, type TextAssessment, type ImageAssessment, type Reason } from './gemini';

export interface CloudMedia {
  id: string; segnalazione_id: string; storage_key: string; sha256: string;
  tipo: string; mime: string; stato_file: string; byte_size: number;
}
export interface CloudReport { id: string; revisione: number; descrizione: string; media: CloudMedia[] }
export interface CloudCheckResult {
  target: 'Testo' | `Allegato ${number}`;
  text?: TextAssessment;
  image?: ImageAssessment;
  error?: 'TEXT_UNAVAILABLE' | 'MEDIA_UNAVAILABLE' | 'PROVIDER_UNAVAILABLE';
}
export interface CloudEvaluation {
  state: 'APPROVATA' | 'RIFIUTATA' | 'IN_REVISIONE';
  reason: string;
  checks: CloudCheckResult[];
}
const reasonLabels: Record<Reason, string> = {
  SAFE: 'controllo superato', CIVIC: 'contenuto pertinente', OFF_TOPIC: 'contenuto estraneo a problemi o proposte civiche',
  THREATS: 'minacce', HARASSMENT: 'molestie mirate', HATE: 'contenuto di odio', SPAM: 'spam',
  PERSONAL_DATA: 'diffusione di dati personali altrui', EXPLICIT: 'contenuto sessuale esplicito', UNCLEAR: 'valutazione dubbia'
};

/** Decode/re-encode, never copy EXIF/XMP/ICC/comments or original compressed bytes. */
export async function stripPrivateImageMetadata(buffer: Buffer, mime: string): Promise<Buffer> {
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('UNREADABLE_IMAGE');
  const formats: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!formats[mime]) throw new Error('UNSUPPORTED_IMAGE');
  const input = sharp(buffer, { failOn: 'warning', limitInputPixels: 16_000_000, animated: false });
  const metadata = await input.metadata();
  if (metadata.format !== formats[mime] || (metadata.pages ?? 1) !== 1) throw new Error('UNSUPPORTED_IMAGE');
  const clean = await input.rotate().toColourspace('srgb').png().timeout({ seconds: 5 }).toBuffer();
  if (clean.length > 10 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE');
  return clean;
}

/** Clear violations take precedence over uncertainty anywhere else; reasons never quote user/provider text. */
export function decideCloudEvaluation(checks: CloudCheckResult[]): CloudEvaluation {
  const failures: string[] = [], doubts: string[] = [];
  const consider = (target: string, name: string, value: Check) => {
    if (value.verdict === 'FAIL') failures.push(`${target}: ${reasonLabels[value.reason]}.`);
    if (value.verdict === 'UNCERTAIN') doubts.push(`${target}: verificare ${name}.`);
  };
  for (const c of checks) {
    if (c.error) doubts.push(`${c.target}: ${c.error === 'MEDIA_UNAVAILABLE' ? 'verificare allegato mancante, illeggibile o non supportato' : 'ripetere il controllo automatico non disponibile; nessuna violazione accertata'}.`);
    if (c.text) { consider(c.target, 'pertinenza civica', c.text.relevance); consider(c.target, 'rispetto delle regole della community', c.text.community); }
    if (c.image) {
      if (c.image.coherence === 'INCONSISTENT') failures.push(`${c.target}: immagine chiaramente incompatibile con la descrizione.`);
      if (c.image.coherence === 'UNCERTAIN') doubts.push(`${c.target}: verificare il collegamento con la descrizione; l'immagine non conferma da sola il racconto.`);
      consider(c.target, 'idoneità alla pubblicazione', c.image.publication);
    }
    if (!c.text && !c.image && !c.error) doubts.push(`${c.target}: controllo incompleto.`);
  }
  if (!checks.some(c => c.target === 'Testo' && c.text)) doubts.push('Testo: controllo non completato.');
  if (!checks.some(c => c.target.startsWith('Allegato '))) doubts.push('Allegato 1: verificare allegato mancante.');
  return failures.length ? { state: 'RIFIUTATA', reason: failures.join(' '), checks }
    : doubts.length ? { state: 'IN_REVISIONE', reason: doubts.join(' '), checks }
    : { state: 'APPROVATA', reason: 'Testo pertinente e conforme; tutti gli allegati coerenti e idonei alla pubblicazione.', checks };
}

export async function evaluateCloudReport(
  report: CloudReport,
  getObject: (key: string) => Promise<Buffer>,
  client: GeminiClient,
  timeoutMs = 20_000
): Promise<CloudEvaluation> {
  // Normal reports have at most five media. Still account for every persisted attachment,
  // including unexpected legacy manifests, within a job deadline below the worker lease.
  const callTimeout = Math.max(1, Math.min(timeoutMs, 20_000));
  const deadline = Date.now() + 150_000;
  const checks: CloudCheckResult[] = [];
  if (!report.descrizione.trim()) checks.push({ target: 'Testo', error: 'TEXT_UNAVAILABLE' });
  else try { checks.push({ target: 'Testo', text: await client.assessText(report.descrizione, callTimeout) }); }
  catch { checks.push({ target: 'Testo', error: 'PROVIDER_UNAVAILABLE' }); }

  for (const [index, media] of report.media.entries()) {
    const target = `Allegato ${index + 1}` as const;
    if (Date.now() >= deadline) { checks.push({ target, error: 'PROVIDER_UNAVAILABLE' }); continue; }
    let clean: Buffer;
    try {
      if (media.segnalazione_id !== report.id || media.stato_file !== 'READY' || media.tipo !== 'FOTO') throw new Error('UNAUTHORIZED_OR_UNSUPPORTED');
      const buffer = await getObject(media.storage_key);
      if (buffer.length !== media.byte_size || crypto.createHash('sha256').update(buffer).digest('hex') !== media.sha256) throw new Error('CONTENT_CHANGED');
      clean = await stripPrivateImageMetadata(buffer, media.mime);
    } catch { checks.push({ target, error: 'MEDIA_UNAVAILABLE' }); continue; }
    try { checks.push({ target, image: await client.assessImage(report.descrizione, index + 1, clean, Math.max(1, Math.min(callTimeout, deadline - Date.now()))) }); }
    catch { checks.push({ target, error: 'PROVIDER_UNAVAILABLE' }); }
  }
  return decideCloudEvaluation(checks);
}
