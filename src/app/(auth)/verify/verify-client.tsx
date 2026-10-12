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
      <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md border border-slate-200 text-center">
        <h1 className="text-2xl font-bold mb-4 text-green-600">Account Verificato!</h1>
        <p className="text-slate-600 mb-6 text-sm">
          Il tuo indirizzo email è stato confermato con successo. Ora puoi accedere con le tue credenziali.
        </p>
        <Link
          href="/login"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors text-sm"
        >
          Vai al Login
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md border border-slate-200 text-center">
      <h1 className="text-2xl font-bold mb-2 text-slate-900">Verifica Account</h1>
      <p className="text-sm text-slate-500 mb-6">
        Fai clic sul pulsante sottostante per confermare e attivare il tuo account civico.
      </p>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4 text-sm text-left">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={initialToken ?? ''} />

        {!initialToken && (
          <div className="text-left">
            <label className="block text-sm font-medium text-slate-700">Token di Verifica</label>
            <input
              type="text"
              name="token"
              required
              className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border font-mono text-sm"
              placeholder="Incolla il token qui"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:bg-blue-300 transition-colors"
        >
          {isPending ? 'Verifica in corso...' : 'Conferma e Attiva Account'}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-slate-500 border-t pt-4">
        Problemi con il link?{' '}
        <Link href="/resend-verification" className="text-blue-600 hover:underline">
          Richiedi una nuova email di verifica
        </Link>
      </div>
    </div>
  );
}
