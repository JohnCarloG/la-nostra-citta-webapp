'use server';

import { getCurrentUser } from './auth';
import { caricaUploadTemporaneo, UploadResult } from '@/lib/domain/uploads';
import { createSegnalazioneAtomica } from '@/lib/domain/segnalazioni';

/**
 * Server Action per l'upload protetto di un allegato:
 * - Autenticazione e controllo autorizzativo
 * - Parsing e validazione binaria in streaming/buffer
 * - Ritorna uploadId, storageKey e metadati estratti dal server
 */
export async function uploadMediaAction(formData: FormData): Promise<{
  success: boolean;
  data?: UploadResult;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Accesso non autorizzato. Effettua prima il login.' };
  }

  if (user.stato_account !== 'ATTIVO' || !user.verificato_il) {
    return { success: false, error: 'Il tuo account deve essere attivo e verificato per allegare media.' };
  }

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: 'Nessun file selezionato o file vuoto' };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await caricaUploadTemporaneo(user.id, buffer);
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Server Action per l'invio della segnalazione atomica con allegati
 */
export async function submitSegnalazioneAction(formData: FormData): Promise<{
  success: boolean;
  segnalazioneId?: string;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Accesso non autorizzato. Effettua prima il login.' };
  }

  const descrizione = (formData.get('descrizione') as string)?.trim();
  const latStr = formData.get('latitudine') as string;
  const lonStr = formData.get('longitudine') as string;
  const storageKeysRaw = formData.get('storageKeys') as string;

  if (!descrizione) {
    return { success: false, error: 'La descrizione della segnalazione è obbligatoria' };
  }

  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  if (isNaN(lat) || isNaN(lon)) {
    return { success: false, error: 'Coordinate geografiche non valide' };
  }

  let storageKeys: string[] = [];
  try {
    storageKeys = JSON.parse(storageKeysRaw || '[]');
  } catch {
    return { success: false, error: 'Formato identificatori upload non valido' };
  }

  if (storageKeys.length === 0) {
    return { success: false, error: 'È obbligatorio allegare almeno una fotografia o un video' };
  }

  try {
    const seg = await createSegnalazioneAtomica(
      user.id,
      descrizione,
      lat,
      lon,
      storageKeys
    );
    return { success: true, segnalazioneId: seg.id };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}
