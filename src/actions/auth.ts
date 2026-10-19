'use server';

import { cookies } from 'next/headers';
import { 
  login as domainLogin, 
  registraCittadino, 
  verificaEmail as domainVerificaEmail, 
  logout as domainLogout,
  richiediResetPassword as domainRichiediResetPassword,
  eseguiResetPassword as domainEseguiResetPassword,
  reinviaVerificaEmail as domainReinviaVerificaEmail,
  getSessionUtente,
  completaProfiloUtente
} from '@/lib/domain/auth';
import { validaCodiceFiscale } from '@/lib/domain/codice-fiscale';
import { authRateLimiter, resetPasswordRateLimiter } from '@/lib/rate-limiter';

/**
 * Validatore standard del formato email
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Server Action per il Login con Rate Limiting e Validazione
 */
export async function loginAction(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;

  if (!email || !password) return { error: 'Campi obbligatori mancanti' };
  if (!isValidEmail(email)) return { error: 'Formato email non valido' };

  // Rate Limiting per email/tentativo
  const limit = authRateLimiter.check(`login:${email}`);
  if (!limit.allowed) {
    return { 
      error: `Troppi tentativi di accesso. Riprova tra ${limit.retryAfterSeconds ?? 60} secondi.` 
    };
  }

  try {
    const { sessionTokenInChiaro } = await domainLogin(email, password);

    // Imposta cookie di sessione sicuro
    const cookieStore = await cookies();
    cookieStore.set('session_token', sessionTokenInChiaro, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 // 7 giorni
    });

    // Reset rate limiter su successo
    authRateLimiter.reset(`login:${email}`);
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
}

/**
 * Server Action per Registrazione Cittadino con Rate Limiting e Validazione
 */
export async function registerAction(formData: FormData) {
  const nome = (formData.get('nome') as string)?.trim();
  const cognome = (formData.get('cognome') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const codiceFiscale = (formData.get('codice_fiscale') as string)?.trim();
  const quartiereId = (formData.get('quartiere_id') as string)?.trim();

  if (!nome || !cognome || !email || !password || !codiceFiscale || !quartiereId) {
    return { error: 'Tutti i campi contrassegnati da asterisco sono obbligatori, inclusi codice fiscale e quartiere di residenza.' };
  }

  if (!isValidEmail(email)) {
    return { error: 'Formato email non valido' };
  }

  if (password.length < 8) {
    return { error: 'La password deve contenere almeno 8 caratteri' };
  }

  const cfCheck = validaCodiceFiscale(codiceFiscale);
  if (!cfCheck.valido || !cfCheck.cfNormalizzato) {
    return { error: cfCheck.motivoErrore || 'Codice fiscale non valido' };
  }

  const limit = authRateLimiter.check(`register:${email}`);
  if (!limit.allowed) {
    return { 
      error: `Troppe registrazioni richieste per questo account. Riprova tra ${limit.retryAfterSeconds ?? 60} secondi.` 
    };
  }

  try {
    const res = await registraCittadino(
      nome,
      cognome,
      email,
      password,
      cfCheck.cfNormalizzato,
      quartiereId
    );
    return { 
      success: true, 
      emailDelivered: Boolean(res.emailDelivered),
      message: res.emailDelivered
        ? 'Registrazione completata: l\'email di verifica è stata accettata dal server SMTP per la consegna.'
        : 'Registrazione completata: Email di verifica in attesa di invio.'
    };
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
}

/**
 * Server Action per Completamento Profilo Utenti Esistenti
 */
export async function completaProfiloAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Sessione non valida o scaduta. Effettua nuovamente l\'accesso.' };
  }

  const codiceFiscale = (formData.get('codice_fiscale') as string)?.trim();
  const quartiereId = (formData.get('quartiere_id') as string)?.trim();

  if (!codiceFiscale || !quartiereId) {
    return { error: 'Codice fiscale e quartiere di residenza sono entrambi obbligatori per completare il profilo.' };
  }

  const cfCheck = validaCodiceFiscale(codiceFiscale);
  if (!cfCheck.valido || !cfCheck.cfNormalizzato) {
    return { error: cfCheck.motivoErrore || 'Codice fiscale non valido' };
  }

  try {
    await completaProfiloUtente(user.id, cfCheck.cfNormalizzato, quartiereId);
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
}

/**
 * Server Action per Verifica Email (supporta sia chiamata diretta che invio da form)
 */
export async function verifyEmailAction(input: string | FormData) {
  let token = '';
  if (typeof input === 'string') {
    token = input;
  } else if (input && typeof input.get === 'function') {
    token = (input.get('token') as string) ?? '';
  }

  if (!token?.trim()) {
    return { error: 'Token di verifica mancante o non valido' };
  }

  try {
    await domainVerificaEmail(token.trim());
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
}

/**
 * Server Action per Reinvio Email di Verifica con Rate Limiting
 */
export async function resendVerificationEmailAction(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();

  if (!email) {
    return { error: 'Indirizzo email obbligatorio' };
  }

  if (!isValidEmail(email)) {
    return { error: 'Formato email non valido' };
  }

  const limit = authRateLimiter.check(`resend:${email}`);
  if (!limit.allowed) {
    return { 
      error: `Troppe richieste di reinvio. Riprova tra ${limit.retryAfterSeconds ?? 60} secondi.` 
    };
  }

  try {
    await domainReinviaVerificaEmail(email);
    // Risposta neutra per prevenire user enumeration
    return { 
      success: true, 
      message: 'Se l\'account è presente e non ancora verificato, è stata inviata una nuova email di verifica.' 
    };
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
}

/**
 * Server Action per Richiesta Reset Password con Rate Limiting
 */
export async function requestPasswordResetAction(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();

  if (!email) {
    return { error: 'Indirizzo email obbligatorio' };
  }

  if (!isValidEmail(email)) {
    return { error: 'Formato email non valido' };
  }

  const limit = resetPasswordRateLimiter.check(`reset:${email}`);
  if (!limit.allowed) {
    return { 
      error: `Troppe richieste di recupero password. Riprova tra ${limit.retryAfterSeconds ?? 300} secondi.` 
    };
  }

  try {
    await domainRichiediResetPassword(email);
    return { 
      success: true, 
      message: 'Se l\'indirizzo è associato a un account attivo, riceverai una email con le istruzioni di reset.' 
    };
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
}

/**
 * Server Action per Conferma Reset Password
 */
export async function confirmPasswordResetAction(formData: FormData) {
  const token = (formData.get('token') as string)?.trim();
  const password = formData.get('password') as string;
  const confermaPassword = formData.get('confermaPassword') as string;

  if (!token || !password || !confermaPassword) {
    return { error: 'Tutti i campi sono obbligatori' };
  }

  if (password !== confermaPassword) {
    return { error: 'Le password inserite non coincidono' };
  }

  if (password.length < 8) {
    return { error: 'La nuova password deve contenere almeno 8 caratteri' };
  }

  try {
    await domainEseguiResetPassword(token, password);
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
}

/**
 * Server Action per Logout con gestione esplicita degli errori
 */
export async function logoutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;

  if (token) {
    try {
      await domainLogout(token);
    } catch (err: unknown) {
      // In caso di errore sul DB durante la revoca, assicuriamo comunque la pulizia del cookie locale
      // ma segnaliamo esplicitamente l'anomalia
      cookieStore.delete('session_token');
      return { 
        success: false, 
        error: `Revoca token sul server non riuscita: ${(err as Error).message}. Cookie locale rimosso.` 
      };
    }
  }

  cookieStore.delete('session_token');
  return { success: true };
}

/**
 * Utility per leggere l'utente loggato in un Server Component / Route Handler
 */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;

  if (!token) return null;
  return getSessionUtente(token);
}
