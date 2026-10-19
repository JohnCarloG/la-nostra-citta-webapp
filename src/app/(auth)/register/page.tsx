'use client';

import { useActionState } from 'react';
import { registerAction } from '@/actions/auth';
import Link from 'next/link';

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
      return await registerAction(formData);
    },
    null
  );

  if (state?.success) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12 bg-white">
        <div className="panel alert-success max-w-md w-full text-center flex flex-col items-center gap-3">
          <h1 className="section-title text-base text-[var(--success-text)]">
            Registrazione completata con successo
          </h1>
          <p className="text-xs text-[var(--success-text)]">
            È stata inviata un&rsquo;email contenente il link monouso per verificare il tuo account civico.
            Verifica la tua casella di posta prima di accedere alla piattaforma.
          </p>
          <Link href="/login" className="btn btn-primary btn-sm mt-2">
            Vai alla schermata di accesso &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 bg-white">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="page-title text-xl mb-1">
            Registrazione cittadino
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Crea il tuo profilo civico per inviare proposte e partecipare alle decisioni sul territorio.
          </p>
        </div>

        {state?.error && (
          <div className="alert alert-error mb-4" role="alert">
            <p className="text-xs">{state.error}</p>
          </div>
        )}

        <form action={formAction} id="register-form" className="panel flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="register-nome" className="form-label text-xs">
                Nome <span className="text-[var(--error-text)]">*</span>
              </label>
              <input
                id="register-nome"
                type="text"
                name="nome"
                required
                autoComplete="given-name"
                className="form-input text-xs"
                placeholder="Mario"
              />
            </div>
            <div>
              <label htmlFor="register-cognome" className="form-label text-xs">
                Cognome <span className="text-[var(--error-text)]">*</span>
              </label>
              <input
                id="register-cognome"
                type="text"
                name="cognome"
                required
                autoComplete="family-name"
                className="form-input text-xs"
                placeholder="Rossi"
              />
            </div>
          </div>

          <div>
            <label htmlFor="register-email" className="form-label text-xs">
              Indirizzo email <span className="text-[var(--error-text)]">*</span>
            </label>
            <input
              id="register-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              className="form-input text-xs"
              placeholder="mario.rossi@esempio.it"
            />
            <p className="form-helper text-[0.6875rem] mt-1">
              Riceverai un link di verifica su questo indirizzo email.
            </p>
          </div>

          <div>
            <label htmlFor="register-password" className="form-label text-xs">
              Password (minimo 8 caratteri) <span className="text-[var(--error-text)]">*</span>
            </label>
            <input
              id="register-password"
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="form-input text-xs"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            id="register-submit"
            disabled={isPending}
            className="btn btn-primary btn-sm w-full mt-2"
          >
            {isPending ? 'Creazione account in corso…' : 'Completa registrazione'}
          </button>
        </form>

        <div className="panel-subtle mt-4 text-center text-xs text-[var(--text-secondary)]">
          Hai già un profilo registrato?{' '}
          <Link href="/login" className="font-semibold text-[var(--blue-primary)] hover:underline">
            Accedi
          </Link>
        </div>
      </div>
    </div>
  );
}