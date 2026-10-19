'use server';

import { getCurrentUser } from './auth';
import { revalidatePath } from 'next/cache';
import {
  aggiungiSostegno,
  rimuoviSostegno,
  ritiraSegnalazione,
  moderaSegnalazione,
  avanzaStatoSegnalazione,
  aggiornaCategorieSegnalazione
} from '@/lib/domain/segnalazioni';
import { ConcurrencyConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/domain/errors';

export async function sostieniSegnalazioneAction(segnalazioneId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Devi autenticarti per sostenere una segnalazione' };
  }

  try {
    await aggiungiSostegno(user.id, segnalazioneId);
    revalidatePath('/segnalazioni');
    revalidatePath(`/segnalazioni/${segnalazioneId}`);
    revalidatePath('/classifica');
    revalidatePath('/mappa');
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { error: err.message };
    }
    return { error: (err as Error).message || 'Errore durante l\'aggiunta del sostegno' };
  }
}

export async function revocaSostegnoAction(segnalazioneId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Devi autenticarti per revocare il sostegno' };
  }

  try {
    await rimuoviSostegno(user.id, segnalazioneId, false);
    revalidatePath('/segnalazioni');
    revalidatePath(`/segnalazioni/${segnalazioneId}`);
    revalidatePath('/classifica');
    revalidatePath('/mappa');
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message || 'Errore durante la revoca del sostegno' };
  }
}

export async function ritiraSegnalazioneAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Devi autenticarti per ritirare la segnalazione' };
  }

  const segnalazioneId = formData.get('segnalazioneId') as string;
  const motivazione = (formData.get('motivazione') as string)?.trim();
  const revStr = formData.get('expectedRevision') as string;
  const expectedRevision = revStr ? parseInt(revStr, 10) : undefined;

  if (!segnalazioneId) return { error: 'Identificativo segnalazione mancante' };
  if (!motivazione) return { error: 'La motivazione del ritiro è obbligatoria' };

  try {
    await ritiraSegnalazione({
      utenteId: user.id,
      segnalazioneId,
      motivazione,
      expectedRevision
    });

    revalidatePath('/segnalazioni');
    revalidatePath(`/segnalazioni/${segnalazioneId}`);
    revalidatePath('/classifica');
    revalidatePath('/mappa');
    revalidatePath('/comitato');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof ConcurrencyConflictError) {
      return { error: `[Conflitto Concorrenza]: ${err.message}` };
    }
    return { error: (err as Error).message || 'Errore durante il ritiro della segnalazione' };
  }
}

export async function moderaSegnalazioneAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.ruolo !== 'COMITATO') {
    return { error: 'Accesso negato: operazione riservata al comitato' };
  }

  const segnalazioneId = formData.get('segnalazioneId') as string;
  const decision = formData.get('decision') as 'APPROVATA' | 'RIFIUTATA' | 'IN_REVISIONE';
  const motivazione = (formData.get('motivazione') as string)?.trim();
  const revStr = formData.get('expectedRevision') as string;
  const expectedRevision = revStr ? parseInt(revStr, 10) : undefined;
  const expectedState = (formData.get('expectedState') as 'PENDENTE' | 'IN_REVISIONE' | 'APPROVATA' | 'RIFIUTATA') || undefined;

  if (!segnalazioneId || !decision) return { error: 'Dati di moderazione incompleti' };
  if (!motivazione) return { error: 'La motivazione della moderazione è obbligatoria' };

  try {
    await moderaSegnalazione({
      comitatoId: user.id,
      segnalazioneId,
      decision,
      motivazione,
      expectedRevision,
      expectedState
    });

    revalidatePath('/segnalazioni');
    revalidatePath(`/segnalazioni/${segnalazioneId}`);
    revalidatePath('/classifica');
    revalidatePath('/mappa');
    revalidatePath('/comitato');
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof ConcurrencyConflictError) {
      return { error: `[Conflitto Concorrenza]: ${err.message}` };
    }
    return { error: (err as Error).message || 'Errore durante la moderazione' };
  }
}

export async function avanzaStatoSegnalazioneAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.ruolo !== 'COMITATO') {
    return { error: 'Accesso negato: operazione riservata al comitato' };
  }

  const segnalazioneId = formData.get('segnalazioneId') as string;
  const nuovoStato = formData.get('nuovoStato') as 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI' | 'RITIRATA';
  const motivazione = (formData.get('motivazione') as string)?.trim();
  const revStr = formData.get('expectedRevision') as string;
  const expectedRevision = revStr ? parseInt(revStr, 10) : undefined;
  const expectedState = (formData.get('expectedState') as 'RICEVUTA' | 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI') || undefined;

  if (!segnalazioneId || !nuovoStato) return { error: 'Dati di avanzamento incompleti' };
  if (!motivazione) return { error: 'La motivazione del cambio stato è obbligatoria' };

  try {
    await avanzaStatoSegnalazione({
      comitatoId: user.id,
      segnalazioneId,
      nuovoStato,
      motivazione,
      expectedRevision,
      expectedState
    });

    revalidatePath('/segnalazioni');
    revalidatePath(`/segnalazioni/${segnalazioneId}`);
    revalidatePath('/classifica');
    revalidatePath('/mappa');
    revalidatePath('/comitato');
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof ConcurrencyConflictError) {
      return { error: `[Conflitto Concorrenza]: ${err.message}` };
    }
    return { error: (err as Error).message || 'Errore durante il cambio di stato' };
  }
}

export async function aggiornaCategorieAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.ruolo !== 'COMITATO') {
    return { error: 'Accesso negato: operazione riservata al comitato' };
  }

  const segnalazioneId = formData.get('segnalazioneId') as string;
  const motivazione = (formData.get('motivazione') as string)?.trim() || undefined;
  const categoryIds = formData.getAll('categoryIds') as string[];
  const revStr = formData.get('expectedRevision') as string;
  const expectedRevision = revStr ? parseInt(revStr, 10) : undefined;

  if (!segnalazioneId) return { error: 'Identificativo segnalazione mancante' };

  try {
    await aggiornaCategorieSegnalazione({
      comitatoId: user.id,
      segnalazioneId,
      categoryIds,
      motivazione,
      expectedRevision
    });

    revalidatePath('/segnalazioni');
    revalidatePath(`/segnalazioni/${segnalazioneId}`);
    revalidatePath('/classifica');
    revalidatePath('/mappa');
    revalidatePath('/comitato');
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof ConcurrencyConflictError) {
      return { error: `[Conflitto Concorrenza]: ${err.message}` };
    }
    return { error: (err as Error).message || 'Errore durante l\'aggiornamento delle categorie' };
  }
}
