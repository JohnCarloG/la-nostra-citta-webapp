'use client';

import { useTransition, useState } from 'react';
import { logoutAction } from '@/actions/auth';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleLogout = () => {
    startTransition(async () => {
      setErrorMessage(null);
      const res = await logoutAction();
      if (res.success) {
        router.push('/login');
        router.refresh();
      } else {
        setErrorMessage(res.error ?? 'Errore durante la disconnessione');
      }
    });
  };

  return (
    <div>
      {errorMessage && (
        <p className="text-sm text-red-600 mb-2">{errorMessage}</p>
      )}
      <button
        onClick={handleLogout}
        disabled={isPending}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md shadow-sm transition-colors disabled:bg-red-300"
      >
        {isPending ? 'Disconnessione...' : 'Esci dall\'account'}
      </button>
    </div>
  );
}
