'use client';

import { useActionState, Suspense } from 'react';
import { confirmPasswordResetAction } from '@/actions/auth';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordConfirmForm() {
  const searchParams = useSearchParams();
  const initialToken = searchParams.get('token') ?? '';

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
      return await confirmPasswordResetAction(formData);
    },
    null
  );

  if (state?.success) {
    return (
      <div className="panel alert-success max-w-md mx-auto text-center flex flex-col items-center gap-3">
        <h1 className="section-title text-base text-[var(--success-text)]">
          Password aggiornata con successo
        </h1>
        <p className="text-xs text-[var(--success-text)]">
          La nuova password è stata salvata. Tutte le sessioni precedenti sono state revocate per garantire la sicurezza del profilo.
        </p>
        <Link
          href="/login"
          className="btn btn-primary btn-sm mt-2"
        >
          Accedi con la nuova password &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="mb-6">
        <h1 className="page-title text-xl mb-1">
          Imposta nuova password
        </h1>
        <p className="text-xs text-[var(--text-secondary)]">
          Inserisci il token di sicurezza monouso ricevuto via email e definisci la nuova password.
        </p>
      </div>

      <div className="panel flex flex-col gap-4">
        {state?.error && (
          <div className="alert alert-error" role="alert">
            <p className="text-xs">{state.error}</p>
          </div>
        )}

        <form action={formAction} className="flex flex-col gap-4">
          <div>
            <label htmlFor="confirm-token" className="form-label text-xs">
              Token di sicurezza
            </label>
            <input
              id="confirm-token"
              type="text"
              name="token"
              defaultValue={initialToken}
              required
              className="form-input text-xs font-mono"
              placeholder="Incolla il token monouso"
            />
          </div>

          <div>
            <label htmlFor="confirm-new-password" className="form-label text-xs">
              Nuova password (minimo 8 caratteri)
            </label>
            <input
              id="confirm-new-password"
              type="password"
              name="newPassword"
              required
              minLength={8}
              autoComplete="new-password"
              className="form-input text-xs"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="btn btn-primary btn-sm w-full mt-2"
          >
            {isPending ? 'Aggiornamento…' : 'Salva nuova password'}
          </button>
        </form>

        <div className="pt-3 border-t border-[var(--border-light)] text-center text-xs">
          <Link href="/login" className="text-[var(--blue-primary)] hover:underline">
            &larr; Torna alla schermata di accesso
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordConfirmPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 bg-white">
      <Suspense fallback={<div className="text-xs text-[var(--text-muted)]">Caricamento…</div>}>
        <ResetPasswordConfirmForm />
      </Suspense>
    </div>
  );
}
