'use server';

import { cookies } from 'next/headers';
import { 
  login as domainLogin, 
  registraCittadino, 
  verificaEmail as domainVerificaEmail, 
  logout as domainLogout,
  getSessionUtente
} from '@/lib/domain/auth';

/**
 * Server Action per il Login
 */
export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) return { error: 'Campi mancanti' };

  try {
    const { sessionTokenInChiaro } = await domainLogin(email, password);

    // Imposta cookie di sessione
    const cookieStore = await cookies();
    cookieStore.set('session_token', sessionTokenInChiaro, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 // 7 giorni
    });

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Server Action per Registrazione
 */
export async function registerAction(formData: FormData) {
  const nome = formData.get('nome') as string;
  const cognome = formData.get('cognome') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  try {
    await registraCittadino(nome, cognome, email, password);
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Server Action per Verifica Email
 */
export async function verifyEmailAction(token: string) {
  try {
    await domainVerificaEmail(token);
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Server Action per il Logout
 */
export async function logoutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;

  if (token) {
    try {
      await domainLogout(token);
    } catch (e) {
      // Ignore
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
