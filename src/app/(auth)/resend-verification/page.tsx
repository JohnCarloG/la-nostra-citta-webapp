'use client';

import { useActionState } from 'react';
import { resendVerificationEmailAction } from '@/actions/auth';
import Link from 'next/link';

export default function ResendVerificationPage() {
  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string; success?: boolean; message?: string } | null, formData: FormData) => {
      return await resendVerificationEmailAction(formData);
    },
    null
  );

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 bg-white">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="page-title text-xl mb-1">
            Reinvio email di verifica
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Inserisci l&rsquo;email del tuo profilo per ricevere un nuovo link di attivazione account.
          </p>
        </div>

        <div className="panel flex flex-col gap-4">
          {state?.error && (
            <div className="alert alert-error" role="alert">
              <p className="text-xs">{state.error}</p>
            </div>
          )}
          {state?.success && (
            <div className="alert alert-success" role="status">
              <div>
                <p className="text-xs">{state.message}</p>
                <Link href="/login" className="text-xs font-semibold mt-1 inline-block text-[var(--success-text)] underline">
                  Vai alla schermata di accesso &rarr;
                </Link>
              </div>
            </div>
          )}

          <form action={formAction} id="resend-verification-form" className="flex flex-col gap-4">
            <div>
              <label htmlFor="resend-email" className="form-label text-xs">
                Email registrata
              </label>
              <input
                id="resend-email"
                type="email"
                name="email"
                required
                autoComplete="email"
                className="form-input text-xs"
                placeholder="nome.cognome@esempio.it"
              />
            </div>
            <button
              type="submit"
              id="resend-submit"
              disabled={isPending}
              className="btn btn-primary btn-sm w-full"
            >
              {isPending ? 'Invio in corso…' : 'Invia nuovo link di verifica'}
            </button>
          </form>

          <div className="flex justify-between text-xs pt-3 border-t border-[var(--border-light)] text-[var(--text-secondary)]">
            <Link href="/login" className="hover:underline text-[var(--blue-primary)]">
              &larr; Torna al login
            </Link>
            <Link href="/register" className="hover:underline text-[var(--blue-primary)]">
              Crea un account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}