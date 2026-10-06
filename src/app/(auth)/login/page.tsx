'use client';

import { useActionState } from 'react';
import { loginAction } from '@/actions/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(async (prevState: any, formData: FormData) => {
    const res = await loginAction(formData);
    if (res.success) {
      window.location.href = '/dashboard'; // Redirect pieno per forzare il ricaricamento sessione
    }
    return res;
  }, null);

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6 text-center">Login Cittadino</h1>
      
      {state?.error && (
        <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input 
            type="email" 
            name="email" 
            required 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <input 
            type="password" 
            name="password" 
            required 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
          />
        </div>

        <button 
          type="submit" 
          disabled={isPending}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300"
        >
          {isPending ? 'Accesso in corso...' : 'Accedi'}
        </button>
      </form>
    </div>
  );
}
