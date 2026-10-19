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
  isAuthenticated,
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
      setErrorMsg('Autosostegno non consentito: non puoi votare la tua segnalazione.');
      return;
    }

    setErrorMsg(null);
    const nextState = !sostenuto;
    const nextCount = nextState ? count + 1 : Math.max(0, count - 1);
    setSostenuto(nextState);
    setCount(nextCount);

    startTransition(async () => {
      const res = nextState
        ? await sostieniSegnalazioneAction(segnalazioneId)
        : await revocaSostegnoAction(segnalazioneId);

      if (res.error) {
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
      <div className="flex flex-col items-end gap-1">
        <button
          id="sostegno-button"
          disabled
          className="btn btn-secondary btn-sm opacity-60"
          aria-label="Autosostegno non consentito"
        >
          Autore della segnalazione &bull; {count} sostegni
        </button>
        <span className="text-[0.6875rem] text-[var(--text-muted)]">
          L&rsquo;autore non può esprimere sostegno alla propria segnalazione
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        id="sostegno-button"
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={`btn btn-sm ${
          sostenuto ? 'btn-secondary border-[var(--blue-primary)] text-[var(--blue-primary)] font-bold' : 'btn-primary'
        }`}
        aria-pressed={sostenuto}
      >
        {isPending
          ? 'Salvataggio…'
          : sostenuto
          ? `Hai espresso sostegno (${count})`
          : `Sostieni questa priorità (${count})`}
      </button>

      {errorMsg && (
        <span className="text-[0.6875rem] text-[var(--error-text)] font-medium">
          {errorMsg}
        </span>
      )}
    </div>
  );
}