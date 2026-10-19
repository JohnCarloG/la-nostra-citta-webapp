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
  const [isOpen, setIsOpen] = useState(false);
  const [motivazione, setMotivazione] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRitira = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivazione.trim()) {
      setErrorMsg('La motivazione del ritiro è obbligatoria');
      return;
    }

    setErrorMsg(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('segnalazioneId', segnalazioneId);
      formData.set('motivazione', motivazione.trim());
      formData.set('expectedRevision', revisione.toString());

      const res = await ritiraSegnalazioneAction(formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setIsOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <div>
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
        >
          Ritira Segnalazione
        </button>
      ) : (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Conferma Ritiro Segnalazione</h3>
            <p className="text-sm text-slate-600">
              Il ritiro è uno stato terminale (RF05). La segnalazione non comparirà più tra quelle pubbliche né nella classifica generale.
            </p>

            <form onSubmit={handleRitira} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Motivazione del ritiro (obbligatoria)
                </label>
                <textarea
                  value={motivazione}
                  onChange={(e) => setMotivazione(e.target.value)}
                  placeholder="Es. Problema risolto autonomamente, duplicato o richiesta errata..."
                  rows={3}
                  required
                  className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isPending ? 'Elaborazione...' : 'Conferma Ritiro Definitivo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
