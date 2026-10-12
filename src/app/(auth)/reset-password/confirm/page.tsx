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
      <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md border border-slate-200 text-center">
        <h1 className="text-2xl font-bold mb-4 text-green-600">Password Aggiornata!</h1>
        <p className="text-slate-600 mb-6 text-sm">
          La password del tuo account è stata reimpostata con successo. Tutte le sessioni precedenti sono state revocate per sicurezza.
        </p>
        <Link
          href="/login"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors text-sm"
        >
          Accedi con la nuova password
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md border border-slate-200">
      <h1 className="text-2xl font-bold mb-2 text-center text-slate-900">Nuova Password</h1>
      <p className="text-sm text-slate-500 text-center mb-6">
        Inserisci il token di sicurezza ricevuto e la nuova password scelta.
      </p>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4 text-sm">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Token di Reset</label>
          <input
            type="text"
            name="token"
            defaultValue={initialToken}
            required
            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border font-mono text-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            placeholder="Incolla il token qui"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Nuova Password</label>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border focus:border-blue-500 focus:ring focus:ring-blue-200"
            placeholder="Almeno 8 caratteri"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Conferma Nuova Password</label>
          <input
            type="password"
            name="confermaPassword"
            required
            minLength={8}
            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border focus:border-blue-500 focus:ring focus:ring-blue-200"
            placeholder="Ripeti la nuova password"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:bg-blue-300 transition-colors"
        >
          {isPending ? 'Salvataggio in corso...' : 'Reimposta Password'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-600 border-t pt-4">
        <Link href="/login" className="text-blue-600 hover:underline">
          Annulla e torna al login
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordConfirmPage() {
  return (
    <Suspense fallback={<div className="text-center mt-20 text-slate-500">Caricamento...</div>}>
      <ResetPasswordConfirmForm />
    </Suspense>
  );
}
