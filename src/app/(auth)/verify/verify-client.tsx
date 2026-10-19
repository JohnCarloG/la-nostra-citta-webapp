'use client';

import { useActionState, useState } from 'react';
import { verifyEmailAction } from '@/actions/auth';
import Link from 'next/link';

export default function VerifyEmailClient({ initialToken }: { initialToken?: string }) {
  const [confirmed, setConfirmed] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
      const res = await verifyEmailAction(formData);
      if (res.success) {
        setConfirmed(true);
      }
      return res;
    },
    null
  );

  if (confirmed || state?.success) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12 bg-white">
        <div className="panel alert-success max-w-md w-full text-center flex flex-col items-center gap-3">
          <h1 className="section-title text-base text-[var(--success-text)]">
            Account civico attivato con successo
          </h1>
          <p className="text-xs text-[var(--success-text)]">
            Il tuo indirizzo email è stato verificato. Ora puoi accedere con le tue credenziali, inserire segnalazioni e sostenere le priorità.
          </p>
          <Link
            href="/login"
            className="btn btn-primary btn-sm mt-2"
          >
            Accedi alla piattaforma &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 bg-white">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="page-title text-xl mb-1">
            Attivazione account
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Conferma l&rsquo;indirizzo email associato al tuo profilo civico.
          </p>
        </div>

        <div className="panel flex flex-col gap-4">
          {state?.error && (
            <div className="alert alert-error" role="alert">
              <p className="text-xs">{state.error}</p>
            </div>
          )}

          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="token" value={initialToken ?? ''} />

            {!initialToken && (
              <div>
                <label htmlFor="verify-token-input" className="form-label text-xs">
                  Token di verifica
                </label>
                <input
                  id="verify-token-input"
                  type="text"
                  name="token"
                  required
                  className="form-input text-xs font-mono"
                  placeholder="Incolla il token ricevuto via email"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="btn btn-primary btn-sm w-full"
            >
              {isPending ? 'Verifica in corso…' : 'Conferma e attiva account'}
            </button>
          </form>

          <div className="text-center pt-3 border-t border-[var(--border-light)] text-xs">
            <Link href="/resend-verification" className="text-[var(--blue-primary)] hover:underline">
              Non hai ricevuto il link? Richiedi nuovo invio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
