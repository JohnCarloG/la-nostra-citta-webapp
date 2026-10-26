'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  moderaSegnalazioneAction,
  avanzaStatoSegnalazioneAction,
  aggiornaCategorieAction
} from '@/actions/segnalazioni';

interface ComitatoActionsFormProps {
  segnalazioneId: string;
  statoModerazione: string;
  statoAvanzamento: string;
  revisione: number;
  categorieDisponibili: Array<{ id: string; nome: string }>;
  categorieAssegnateIds: string[];
}

export default function ComitatoActionsForm({
  segnalazioneId,
  statoModerazione,
  statoAvanzamento,
  revisione,
  categorieDisponibili,
  categorieAssegnateIds: initialCatIds
}: ComitatoActionsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Stato form moderazione
  const [modDecision, setModDecision] = useState<'APPROVATA' | 'RIFIUTATA' | 'IN_REVISIONE'>('APPROVATA');
  const [modMotivazione, setModMotivazione] = useState('');

  // Stato form avanzamento
  const [avStato, setAvStato] = useState<'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI' | 'RITIRATA'>('PRESA_IN_CARICO');
  const [avMotivazione, setAvMotivazione] = useState('');

  // Stato categorie selezionate
  const [selectedCats, setSelectedCats] = useState<string[]>(initialCatIds);

  const clearMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // 1. MODERAZIONE
  const handleModera = (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!modMotivazione.trim()) {
      setErrorMsg('La motivazione della moderazione è obbligatoria per garantire la tracciabilità.');
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set('segnalazioneId', segnalazioneId);
      fd.set('decisione', modDecision);
      fd.set('motivazione', modMotivazione.trim());
      fd.set('revisioneAttesa', String(revisione));

      const res = await moderaSegnalazioneAction(fd);
      if (res.success) {
        setSuccessMsg(`Moderazione registrata con successo: stato impostato a "${modDecision}".`);
        setModMotivazione('');
        router.refresh();
      } else {
        setErrorMsg(res.error || 'Errore durante la registrazione della decisione di moderazione.');
      }
    });
  };

  // 2. AVANZAMENTO STATO
  const handleAvanza = (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!avMotivazione.trim()) {
      setErrorMsg('La motivazione dell&rsquo;avanzamento è obbligatoria.');
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set('segnalazioneId', segnalazioneId);
      fd.set('nuovoStato', avStato);
      fd.set('motivazione', avMotivazione.trim());
      fd.set('revisioneAttesa', String(revisione));

      const res = await avanzaStatoSegnalazioneAction(fd);
      if (res.success) {
        setSuccessMsg(`Avanzamento iter registrato: nuovo stato "${avStato}".`);
        setAvMotivazione('');
        router.refresh();
      } else {
        setErrorMsg(res.error || 'Errore durante l&rsquo;aggiornamento dell&rsquo;avanzamento.');
      }
    });
  };

  // 3. CATEGORIE
  const handleToggleCat = (catId: string) => {
    setSelectedCats(prev =>
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  };

  const handleSalvaCategorie = (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (selectedCats.length === 0) {
      setErrorMsg('Seleziona almeno una categoria valida per la segnalazione.');
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set('segnalazioneId', segnalazioneId);
      selectedCats.forEach(catId => fd.append('categoryIds', catId));
      fd.set('expectedRevision', String(revisione));

      const res = await aggiornaCategorieAction(fd);
      if (res.success) {
        setSuccessMsg('Categorie confermate e aggiornate con successo.');
        router.refresh();
      } else {
        setErrorMsg(res.error || 'Errore durante l&rsquo;aggiornamento delle categorie.');
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Messaggi di feedback */}
      {errorMsg && (
        <div className="alert alert-error" role="alert">
          <p>{errorMsg}</p>
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success" role="alert">
          <p>{successMsg}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Blocco 1: Moderazione di conformità */}
        <div className="panel-subtle p-3 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-[var(--text-primary)] text-xs mb-1">
              1. Moderazione di ammissione
            </h3>
            <p className="text-[0.6875rem] text-[var(--text-muted)] mb-3">
              Stato attuale: <strong>{statoModerazione}</strong>
            </p>

            <form onSubmit={handleModera} className="flex flex-col gap-2.5">
              <div>
                <label htmlFor={`mod-dec-${segnalazioneId}`} className="form-label text-[0.6875rem]">
                  Decisione comitato
                </label>
                <select
                  id={`mod-dec-${segnalazioneId}`}
                  value={modDecision}
                  onChange={e => setModDecision(e.target.value as 'APPROVATA' | 'IN_REVISIONE' | 'RIFIUTATA')}
                  className="form-input text-xs py-1"
                >
                  <option value="APPROVATA">APPROVA (Pubblica per sostegno)</option>
                  <option value="IN_REVISIONE">IN REVISIONE (Richiede approfondimento)</option>
                  <option value="RIFIUTATA">RIFIUTA (Non ammessa)</option>
                </select>
              </div>

              <div>
                <label htmlFor={`mod-mot-${segnalazioneId}`} className="form-label text-[0.6875rem]">
                  Motivazione della decisione (tracciata in audit)
                </label>
                <textarea
                  id={`mod-mot-${segnalazioneId}`}
                  rows={2}
                  required
                  placeholder="Indica la ragione della delibera..."
                  value={modMotivazione}
                  onChange={e => setModMotivazione(e.target.value)}
                  className="form-input text-xs py-1"
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="btn btn-primary btn-sm mt-1"
              >
                {isPending ? 'Salvataggio…' : 'Applica decisione'}
              </button>
            </form>
          </div>
        </div>

        {/* Blocco 2: Avanzamento iter */}
        <div className="panel-subtle p-3 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-[var(--text-primary)] text-xs mb-1">
              2. Avanzamento iter territoriale
            </h3>
            <p className="text-[0.6875rem] text-[var(--text-muted)] mb-3">
              Stato attuale: <strong>{statoAvanzamento}</strong>
            </p>

            <form onSubmit={handleAvanza} className="flex flex-col gap-2.5">
              <div>
                <label htmlFor={`av-dec-${segnalazioneId}`} className="form-label text-[0.6875rem]">
                  Nuovo stato iter
                </label>
                <select
                  id={`av-dec-${segnalazioneId}`}
                  value={avStato}
                  onChange={e => setAvStato(e.target.value as 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI' | 'RITIRATA')}
                  className="form-input text-xs py-1"
                >
                  <option value="PRESA_IN_CARICO">In carico al comitato</option>
                  <option value="INVIATA_AI_CANDIDATI">Trasmessa ai candidati</option>
                  <option value="RITIRATA">Ritirata (Stato terminale)</option>
                </select>
              </div>

              <div>
                <label htmlFor={`av-mot-${segnalazioneId}`} className="form-label text-[0.6875rem]">
                  Note e motivazione avanzamento
                </label>
                <textarea
                  id={`av-mot-${segnalazioneId}`}
                  rows={2}
                  required
                  placeholder="Es. Inserita nel dossier per il dibattito pubblico del 24..."
                  value={avMotivazione}
                  onChange={e => setAvMotivazione(e.target.value)}
                  className="form-input text-xs py-1"
                />
              </div>

              <button
                type="submit"
                disabled={isPending || statoModerazione !== 'APPROVATA'}
                className="btn btn-secondary btn-sm mt-1"
                title={statoModerazione !== 'APPROVATA' ? 'Disponibile solo dopo l&rsquo;approvazione' : ''}
              >
                {isPending ? 'Salvataggio…' : 'Avanza iter'}
              </button>
            </form>
          </div>
        </div>

        {/* Blocco 3: Conferma categorie */}
        <div className="panel-subtle p-3 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-[var(--text-primary)] text-xs mb-1">
              3. Categorie confermate
            </h3>
            <p className="text-[0.6875rem] text-[var(--text-muted)] mb-3">
              Seleziona gli ambiti territoriali corretti
            </p>

            <form onSubmit={handleSalvaCategorie} className="flex flex-col gap-2">
              <div className="max-h-28 overflow-y-auto flex flex-col gap-1 border border-[var(--border-medium)] rounded-[var(--radius-xs)] p-2 bg-white">
                {categorieDisponibili.map(cat => (
                  <label key={cat.id} className="flex items-center gap-2 cursor-pointer text-[0.6875rem]">
                    <input
                      type="checkbox"
                      checked={selectedCats.includes(cat.id)}
                      onChange={() => handleToggleCat(cat.id)}
                      className="rounded"
                    />
                    <span className="truncate">{cat.nome}</span>
                  </label>
                ))}
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="btn btn-secondary btn-sm mt-1"
              >
                {isPending ? 'Salvataggio…' : 'Conferma categorie'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
