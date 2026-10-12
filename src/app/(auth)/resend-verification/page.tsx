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
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md border border-slate-200">
      <h1 className="text-2xl font-bold mb-2 text-center text-slate-900">Reinvio Email di Verifica</h1>
      <p className="text-sm text-slate-500 text-center mb-6">
        Se non hai ricevuto l&apos;email di attivazione dell&apos;account, inserisci l&apos;indirizzo email registrato per richiederne una nuova copia.
      </p>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4 text-sm">
          {state.error}
        </div>
      )}

      {state?.success && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded mb-4 text-sm">
          {state.message}
          <div className="mt-3">
            <Link
              href="/login"
              className="text-blue-600 underline font-medium hover:text-blue-800"
            >
              Vai alla pagina di login &rarr;
            </Link>
          </div>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Email di registrazione</label>
          <input
            type="email"
            name="email"
            required
            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 border focus:border-blue-500 focus:ring focus:ring-blue-200"
            placeholder="nome@comune.it"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:bg-blue-300 transition-colors"
        >
          {isPending ? 'Invio in corso...' : 'Invia nuova email di verifica'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-600 border-t pt-4 space-y-2">
        <div>
          <Link href="/login" className="text-blue-600 hover:underline">
            Torna al login
          </Link>
        </div>
        <div>
          <Link href="/register" className="text-slate-500 hover:underline">
            Non sei ancora registrato? Crea un account
          </Link>
        </div>
      </div>
    </div>
  );
}
