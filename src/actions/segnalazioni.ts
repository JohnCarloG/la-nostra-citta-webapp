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

  const segnalazioneId = ((formData.get('segnalazioneId') ?? formData.get('id')) as string)?.trim();
  const decision = ((formData.get('decision') ?? formData.get('decisione')) as string)?.trim();
  const motivazione = ((formData.get('motivazione') ?? formData.get('reason')) as string)?.trim();
  const revRaw = formData.get('expectedRevision') ?? formData.get('revisioneAttesa');
  const expectedStateRaw = ((formData.get('expectedState') ?? formData.get('statoAtteso')) as string)?.trim();

  if (!segnalazioneId) return { error: 'Identificativo segnalazione mancante' };

  const validDecisions = ['APPROVATA', 'RIFIUTATA', 'IN_REVISIONE'] as const;
  type ValidDecision = (typeof validDecisions)[number];
  if (!decision || !validDecisions.includes(decision as ValidDecision)) {
    return { error: 'Decisione di moderazione non valida o mancante' };
  }

  if (!motivazione) {
    return { error: 'La motivazione della moderazione è obbligatoria per garantire la tracciabilità' };
  }

  if (revRaw === null || revRaw === undefined || String(revRaw).trim() === '') {
    return { error: 'Revisione attesa obbligatoria per il controllo di concorrenza' };
  }
  const expectedRevision = Number(revRaw);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return { error: 'Revisione attesa non valida' };
  }

  const validModStates = ['PENDENTE', 'IN_REVISIONE', 'APPROVATA', 'RIFIUTATA'] as const;
  type ValidModState = (typeof validModStates)[number];
  if (!expectedStateRaw || !validModStates.includes(expectedStateRaw as ValidModState)) {
    return { error: 'Stato atteso di moderazione obbligatorio o non valido' };
  }
  const expectedState = expectedStateRaw as 'PENDENTE' | 'IN_REVISIONE' | 'APPROVATA' | 'RIFIUTATA';

  try {
    await moderaSegnalazione({
      comitatoId: user.id,
      segnalazioneId,
      decision: decision as 'APPROVATA' | 'RIFIUTATA' | 'IN_REVISIONE',
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

  const segnalazioneId = ((formData.get('segnalazioneId') ?? formData.get('id')) as string)?.trim();
  const nuovoStato = ((formData.get('nuovoStato') ?? formData.get('newState')) as string)?.trim();
  const motivazione = ((formData.get('motivazione') ?? formData.get('reason')) as string)?.trim();
  const revRaw = formData.get('expectedRevision') ?? formData.get('revisioneAttesa');
  const expectedStateRaw = ((formData.get('expectedState') ?? formData.get('statoAtteso')) as string)?.trim();

  if (!segnalazioneId) return { error: 'Identificativo segnalazione mancante' };

  const validNextStates = ['PRESA_IN_CARICO', 'INVIATA_AI_CANDIDATI', 'RITIRATA'] as const;
  type ValidNextState = (typeof validNextStates)[number];
  if (!nuovoStato || !validNextStates.includes(nuovoStato as ValidNextState)) {
    return { error: 'Stato di avanzamento non valido o mancante' };
  }

  if (!motivazione) {
    return { error: 'La motivazione del cambio stato è obbligatoria' };
  }

  if (revRaw === null || revRaw === undefined || String(revRaw).trim() === '') {
    return { error: 'Revisione attesa obbligatoria per il controllo di concorrenza' };
  }
  const expectedRevision = Number(revRaw);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return { error: 'Revisione attesa non valida' };
  }

  const validAvanzStates = ['RICEVUTA', 'PRESA_IN_CARICO', 'INVIATA_AI_CANDIDATI', 'RITIRATA'] as const;
  type ValidAvanzState = (typeof validAvanzStates)[number];
  if (!expectedStateRaw || !validAvanzStates.includes(expectedStateRaw as ValidAvanzState)) {
    return { error: 'Stato atteso di avanzamento obbligatorio o non valido' };
  }
  const expectedState = expectedStateRaw as 'RICEVUTA' | 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI';

  try {
    await avanzaStatoSegnalazione({
      comitatoId: user.id,
      segnalazioneId,
      nuovoStato: nuovoStato as 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI' | 'RITIRATA',
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

  const segnalazioneId = ((formData.get('segnalazioneId') ?? formData.get('id')) as string)?.trim();
  const motivazione = ((formData.get('motivazione') ?? formData.get('reason')) as string)?.trim() || undefined;
  const categoryIds = formData.getAll('categoryIds').map(c => String(c).trim()).filter(Boolean);
  const revRaw = formData.get('expectedRevision') ?? formData.get('revisioneAttesa');

  if (!segnalazioneId) return { error: 'Identificativo segnalazione mancante' };

  let expectedRevision: number | undefined;
  if (revRaw !== null && revRaw !== undefined && String(revRaw).trim() !== '') {
    expectedRevision = Number(revRaw);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return { error: 'Revisione attesa non valida' };
    }
  }

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
