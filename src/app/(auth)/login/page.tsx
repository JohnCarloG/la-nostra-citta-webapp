'use client';

import { useActionState } from 'react';
import { loginAction } from '@/actions/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
      const res = await loginAction(formData);
      if (res.success) router.push('/dashboard');
      return res;
    },
    null
  );

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 bg-white">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="page-title text-xl mb-1">
            Accesso all&rsquo;area riservata
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Accedi con le tue credenziali civiche per inviare segnalazioni e sostenere le priorità.
          </p>
        </div>

        {state?.error && (
          <div className="alert alert-error mb-4" role="alert">
            <p className="text-xs">{state.error}</p>
          </div>
        )}

        <form action={formAction} id="login-form" className="panel flex flex-col gap-4">
          <div>
            <label htmlFor="login-email" className="form-label text-xs">
              Indirizzo email
            </label>
            <input
              id="login-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              className="form-input text-xs"
              placeholder="nome.cognome@esempio.it"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="login-password" className="form-label text-xs mb-0">
                Password
              </label>
              <Link
                href="/reset-password"
                className="text-[0.6875rem] text-[var(--blue-primary)] hover:underline"
              >
                Password dimenticata?
              </Link>
            </div>
            <input
              id="login-password"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="form-input text-xs"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            id="login-submit"
            disabled={isPending}
            className="btn btn-primary btn-sm w-full mt-2"
          >
            {isPending ? 'Verifica credenziali…' : 'Accedi'}
          </button>
        </form>

        <div className="panel-subtle mt-4 text-center text-xs text-[var(--text-secondary)] flex flex-col gap-2">
          <span>
            Non hai ancora un account?{' '}
            <Link href="/register" className="font-semibold text-[var(--blue-primary)] hover:underline">
              Registrati come cittadino
            </Link>
          </span>
          <span className="border-t border-[var(--border-light)] pt-2 text-[0.6875rem]">
            Non hai ricevuto l&rsquo;email di verifica?{' '}
            <Link href="/resend-verification" className="text-[var(--blue-primary)] hover:underline">
              Richiedi nuovo invio
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}