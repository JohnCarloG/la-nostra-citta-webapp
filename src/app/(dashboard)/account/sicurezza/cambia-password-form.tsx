'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cambiaPasswordAction } from '@/actions/auth';

export default function CambiaPasswordForm() {
  const router = useRouter();

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string; success?: boolean; message?: string } | null, formData: FormData) => {
      const res = await cambiaPasswordAction(formData);
      if (res.success) {
        router.push('/login?message=' + encodeURIComponent(res.message || 'Password aggiornata. Accedi di nuovo.'));
      }
      return res;
    },
    null
  );

  return (
    <div className="panel flex flex-col gap-4">
      {state?.error && (
        <div className="alert alert-error" role="alert">
          <p className="text-xs">{state.error}</p>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4" id="cambia-password-form">
        <div>
          <label htmlFor="password-attuale" className="form-label text-xs">
            Password attuale
          </label>
          <input
            id="password-attuale"
            type="password"
            name="passwordAttuale"
            required
            autoComplete="current-password"
            className="form-input text-xs"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label htmlFor="nuova-password" className="form-label text-xs">
            Nuova password (minimo 8 caratteri)
          </label>
          <input
            id="nuova-password"
            type="password"
            name="nuovaPassword"
            required
            minLength={8}
            autoComplete="new-password"
            className="form-input text-xs"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label htmlFor="conferma-password" className="form-label text-xs">
            Conferma nuova password
          </label>
          <input
            id="conferma-password"
            type="password"
            name="confermaPassword"
            required
            minLength={8}
            autoComplete="new-password"
            className="form-input text-xs"
            placeholder="••••••••"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            type="submit"
            id="cambia-password-submit"
            disabled={isPending}
            className="btn btn-primary btn-sm w-full sm:w-auto"
          >
            {isPending ? 'Verifica e aggiornamento in corso…' : 'Aggiorna password'}
          </button>

          <Link
            href="/dashboard"
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline text-center"
          >
            &larr; Annulla e torna alla dashboard
          </Link>
        </div>
      </form>
    </div>
  );
}
