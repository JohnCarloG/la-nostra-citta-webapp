'use client';

import { useState, useTransition } from 'react';
import { sostieniSegnalazioneAction, revocaSostegnoAction } from '@/actions/segnalazioni';
import { useRouter } from 'next/navigation';

interface SostegnoButtonProps {
  segnalazioneId: string;
  totaleSostegni: number;
  inizialmenteSostenuto: boolean;
  isAutore: boolean;
  isAuthenticated: boolean;
}

export default function SostegnoButton({
  segnalazioneId,
  totaleSostegni: initialCount,
  inizialmenteSostenuto,
  isAutore,
  isAuthenticated
}: SostegnoButtonProps) {
  const router = useRouter();
  const [sostenuto, setSostenuto] = useState(inizialmenteSostenuto);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleToggle = () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (isAutore) {
      setErrorMsg('Autosostegno vietato: non puoi sostenere una tua segnalazione.');
      return;
    }

    setErrorMsg(null);
    const nextState = !sostenuto;
    const nextCount = nextState ? count + 1 : Math.max(0, count - 1);

    // Aggiornamento ottimistico
    setSostenuto(nextState);
    setCount(nextCount);

    startTransition(async () => {
      let res;
      if (nextState) {
        res = await sostieniSegnalazioneAction(segnalazioneId);
      } else {
        res = await revocaSostegnoAction(segnalazioneId);
      }

      if (res.error) {
        // Rollback ottimistico in caso di errore
        setSostenuto(!nextState);
        setCount(count);
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    });
  };

  if (isAutore) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          disabled
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-400 font-medium text-sm rounded-lg border border-slate-200 cursor-not-allowed"
          title="Autosostegno vietato (RF06, VI03)"
        >
          <span>❤️</span>
          <span>{count} sostegni</span>
          <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded ml-1">Autore</span>
        </button>
        <span className="text-xs text-slate-400 italic">Non puoi sostenere la tua stessa segnalazione</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`inline-flex items-center gap-2 px-4 py-2 font-medium text-sm rounded-lg transition-all shadow-xs ${
          sostenuto
            ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400'
        } ${isPending ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
      >
        <span className={sostenuto ? 'scale-110' : ''}>
          {sostenuto ? '❤️' : '🤍'}
        </span>
        <span>{count}</span>
        <span className="text-xs font-normal">
          {sostenuto ? 'Sostegno attivo (clicca per revocare)' : 'Sostieni'}
        </span>
      </button>

      {errorMsg && (
        <span className="text-xs text-rose-600 font-medium mt-1">{errorMsg}</span>
      )}
    </div>
  );
}
