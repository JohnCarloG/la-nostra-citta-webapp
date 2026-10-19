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
        <p className="text-sm mb-1" style={{ color: 'var(--rose-700)' }}>{errorMessage}</p>
      )}
      <button
        id="logout-button"
        onClick={handleLogout}
        disabled={isPending}
        className="btn btn-danger btn-sm"
      >
        {isPending ? 'Uscita...' : 'Esci'}
      </button>
    </div>
  );
}
