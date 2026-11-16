'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { modificaSegnalazioneAction } from '@/actions/segnalazioni';

export default function ModificaSegnalazioneForm({ id, revisione, descrizione }: { id: string; revisione: number; descrizione: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  return (
    <details className="panel">
      <summary className="font-semibold cursor-pointer">Modifica la tua segnalazione</summary>
      <p className="text-sm my-3">Salvando la modifica, la segnalazione torna privata in attesa di nuovi controlli automatici.</p>
      <form onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await modificaSegnalazioneAction(data);
          setMessage(result.error ?? 'Modifica salvata: pubblicazione bloccata in attesa dei nuovi controlli.');
          if (result.success) router.refresh();
        });
      }} className="flex flex-col gap-3">
        <input type="hidden" name="segnalazioneId" value={id} />
        <input type="hidden" name="expectedRevision" value={revisione} />
        <label htmlFor="modifica-descrizione">Nuova descrizione</label>
        <textarea id="modifica-descrizione" name="descrizione" defaultValue={descrizione} required rows={4} className="form-input" />
        <button className="btn btn-primary self-start" disabled={pending} type="submit">{pending ? 'Salvataggio…' : 'Salva e richiedi nuovi controlli'}</button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
