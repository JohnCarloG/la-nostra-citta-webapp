'use client';

import { useActionState } from 'react';
import { registerAction } from '@/actions/auth';

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(async (prevState: any, formData: FormData) => {
    return await registerAction(formData);
  }, null);

  if (state?.success) {
    return (
      <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold mb-4 text-green-600">Registrazione Completata!</h1>
        <p className="text-gray-600">
          Controlla la tua email per il link di verifica. L'account deve essere verificato prima di effettuare l'accesso.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6 text-center">Registrazione</h1>
      
      {state?.error && (
        <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Nome</label>
          <input type="text" name="nome" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Cognome</label>
          <input type="text" name="cognome" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input type="email" name="email" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <input type="password" name="password" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
        </div>

        <button 
          type="submit" 
          disabled={isPending}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:bg-blue-300"
        >
          {isPending ? 'Registrazione...' : 'Registrati'}
        </button>
      </form>
    </div>
  );
}
