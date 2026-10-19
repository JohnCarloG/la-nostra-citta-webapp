'use client';

import { useState, useTransition } from 'react';
import { ritiraSegnalazioneAction } from '@/actions/segnalazioni';
import { useRouter } from 'next/navigation';

interface RitiraButtonProps {
  segnalazioneId: string;
  revisione: number;
}

export default function RitiraButton({ segnalazioneId, revisione }: RitiraButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [motivazione, setMotivazione] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRitira = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivazione.trim()) {
      setErrorMsg('La motivazione del ritiro è obbligatoria');
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set('segnalazioneId', segnalazioneId);
      fd.set('motivazione', motivazione.trim());
      fd.set('revisioneAttesa', String(revisione));

      const res = await ritiraSegnalazioneAction(fd);
      if (res.success) {
        setShowConfirm(false);
        router.refresh();
      } else {
        setErrorMsg(res.error || 'Errore durante il ritiro della segnalazione');
      }
    });
  };

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="btn btn-danger btn-sm"
      >
        Ritira segnalazione
      </button>
    );
  }

  return (
    <div className="panel alert-warning flex flex-col gap-3 text-xs max-w-sm">
      <div className="flex flex-col gap-1">
        <strong className="text-[var(--warning-text)]">Conferma ritiro definitivo:</strong>
        <p className="text-[var(--warning-text)]">
          Il ritiro è un&rsquo;azione irreversibile. La segnalazione non sarà più visibile al pubblico e non potrà più ricevere sostegni.
        </p>
      </div>

      {errorMsg && (
        <p className="text-[var(--error-text)] font-semibold">{errorMsg}</p>
      )}

      <form onSubmit={handleRitira} className="flex flex-col gap-2">
        <label htmlFor={`mot-ritiro-${segnalazioneId}`} className="form-label text-[0.6875rem]">
          Motivazione del ritiro (obbligatoria)
        </label>
        <textarea
          id={`mot-ritiro-${segnalazioneId}`}
          rows={2}
          required
          placeholder="Es. Problema già risolto autonomamente o duplicato..."
          value={motivazione}
          onChange={e => setMotivazione(e.target.value)}
          className="form-input text-xs py-1"
        />

        <div className="flex items-center gap-2 justify-end mt-1">
          <button
            type="button"
            onClick={() => { setShowConfirm(false); setErrorMsg(null); }}
            className="btn btn-secondary btn-sm text-xs py-1"
            disabled={isPending}
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="btn btn-danger btn-sm text-xs py-1"
          >
            {isPending ? 'Ritiro in corso…' : 'Conferma ritiro definitivo'}
          </button>
        </div>
      </form>
    </div>
  );
}