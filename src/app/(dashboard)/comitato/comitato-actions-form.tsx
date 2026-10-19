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
      setErrorMsg('La motivazione della moderazione è obbligatoria');
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set('segnalazioneId', segnalazioneId);
      fd.set('decision', modDecision);
      fd.set('motivazione', modMotivazione.trim());
      fd.set('expectedRevision', revisione.toString());
      fd.set('expectedState', statoModerazione);

      const res = await moderaSegnalazioneAction(fd);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(`Decisione applicata: ${modDecision}`);
        setModMotivazione('');
        router.refresh();
      }
    });
  };

  // 2. AVANZAMENTO FLUSSO
  const handleAvanza = (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!avMotivazione.trim()) {
      setErrorMsg('La motivazione del cambio stato è obbligatoria');
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set('segnalazioneId', segnalazioneId);
      fd.set('nuovoStato', avStato);
      fd.set('motivazione', avMotivazione.trim());
      fd.set('expectedRevision', revisione.toString());
      fd.set('expectedState', statoAvanzamento);

      const res = await avanzaStatoSegnalazioneAction(fd);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(`Stato avanzamento aggiornato a: ${avStato}`);
        setAvMotivazione('');
        router.refresh();
      }
    });
  };

  // 3. CATEGORIE CONFERMATE
  const handleToggleCat = (id: string) => {
    setSelectedCats(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSalvaCategorie = (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    startTransition(async () => {
      const fd = new FormData();
      fd.set('segnalazioneId', segnalazioneId);
      fd.set('expectedRevision', revisione.toString());
      selectedCats.forEach(catId => fd.append('categoryIds', catId));

      const res = await aggiornaCategorieAction(fd);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg('Categorie confermate aggiornate con successo');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200">
      {/* Feedback Messaggi */}
      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
          ⚠️ {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
          ✓ {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* Blocco 1: Moderazione */}
        <form onSubmit={handleModera} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2">
          <div>
            <span className="font-bold text-slate-800 uppercase tracking-wider block">
              1. Decisione di Moderazione
            </span>
            <span className="text-slate-500 text-[11px] block mt-0.5">
              Attuale: <strong className="text-blue-700">{statoModerazione}</strong> (Rev. {revisione})
            </span>

            <div className="mt-2 space-y-2">
              <select
                value={modDecision}
                onChange={e => setModDecision(e.target.value as 'APPROVATA' | 'RIFIUTATA' | 'IN_REVISIONE')}
                className="w-full border border-slate-300 rounded p-1.5 bg-white font-medium"
              >
                <option value="APPROVATA">APPROVATA (Rende pubblica)</option>
                <option value="RIFIUTATA">RIFIUTATA (Esclude e blocca)</option>
                <option value="IN_REVISIONE">IN_REVISIONE (Richiede analisi)</option>
              </select>

              <textarea
                value={modMotivazione}
                onChange={e => setModMotivazione(e.target.value)}
                placeholder="Motivazione della decisione (obbligatoria)..."
                rows={2}
                required
                className="w-full border border-slate-300 rounded p-1.5 bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isPending ? 'Elaborazione...' : 'Applica Moderazione'}
          </button>
        </form>

        {/* Blocco 2: Avanzamento Flusso */}
        <form onSubmit={handleAvanza} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2">
          <div>
            <span className="font-bold text-slate-800 uppercase tracking-wider block">
              2. Stato Avanzamento
            </span>
            <span className="text-slate-500 text-[11px] block mt-0.5">
              Attuale: <strong className="text-blue-700">{statoAvanzamento}</strong>
            </span>

            <div className="mt-2 space-y-2">
              <select
                value={avStato}
                onChange={e => setAvStato(e.target.value as 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI' | 'RITIRATA')}
                className="w-full border border-slate-300 rounded p-1.5 bg-white font-medium"
              >
                <option value="PRESA_IN_CARICO">PRESA_IN_CARICO (Richiede APPROVATA)</option>
                <option value="INVIATA_AI_CANDIDATI">INVIATA_AI_CANDIDATI (Dossier finale)</option>
                <option value="RITIRATA">RITIRATA (Uscita definitiva)</option>
              </select>

              <textarea
                value={avMotivazione}
                onChange={e => setAvMotivazione(e.target.value)}
                placeholder="Motivazione del cambio stato..."
                rows={2}
                required
                className="w-full border border-slate-300 rounded p-1.5 bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isPending ? 'Elaborazione...' : 'Aggiorna Avanzamento'}
          </button>
        </form>

        {/* Blocco 3: Categorie Confermate */}
        <form onSubmit={handleSalvaCategorie} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2">
          <div>
            <span className="font-bold text-slate-800 uppercase tracking-wider block">
              3. Categorie Confermate
            </span>
            <span className="text-slate-500 text-[11px] block mt-0.5">
              Tassonomia controllata a catalogo
            </span>

            <div className="mt-2 max-h-24 overflow-y-auto space-y-1 bg-white p-2 border border-slate-200 rounded">
              {categorieDisponibili.map(cat => (
                <label key={cat.id} className="flex items-center gap-2 cursor-pointer text-[11px]">
                  <input
                    type="checkbox"
                    checked={selectedCats.includes(cat.id)}
                    onChange={() => handleToggleCat(cat.id)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="truncate">{cat.nome}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isPending ? 'Elaborazione...' : 'Salva Categorie'}
          </button>
        </form>
      </div>
    </div>
  );
}
