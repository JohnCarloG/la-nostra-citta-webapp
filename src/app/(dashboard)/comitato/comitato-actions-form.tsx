'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  moderaSegnalazioneAction,
  avanzaStatoSegnalazioneAction,
  aggiornaCategorieAction
} from '@/actions/segnalazioni';

export interface ComitatoActionsFormProps {
  segnalazioneId: string;
  statoModerazione: string;
  statoAvanzamento: string;
  revisione: number;
  categorieDisponibili?: Array<{ id: string; nome: string }>;
  categorieAssegnateIds?: string[];
  mode?: 'all' | 'avanzamento-only' | 'moderazione-only';
}

/**
 * Costruttori di FormData usati effettivamente dal componente per inviare
 * i payload alle rispettive Server Action. Esportati per consentire ai test
 * di testare il payload del componente contro il server senza ricostruirlo a mano.
 */
export function buildComitatoModeraFormData(params: {
  segnalazioneId: string;
  decision: 'APPROVATA' | 'RIFIUTATA' | 'IN_REVISIONE';
  motivazione: string;
  revisione: number;
  statoModerazione: string;
}): FormData {
  const fd = new FormData();
  fd.set('segnalazioneId', params.segnalazioneId);
  fd.set('decision', params.decision);
  fd.set('decisione', params.decision);
  fd.set('motivazione', params.motivazione.trim());
  fd.set('expectedRevision', String(params.revisione));
  fd.set('revisioneAttesa', String(params.revisione));
  fd.set('expectedState', params.statoModerazione);
  fd.set('statoAtteso', params.statoModerazione);
  return fd;
}

export function buildComitatoAvanzaFormData(params: {
  segnalazioneId: string;
  nuovoStato: 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI' | 'RITIRATA';
  motivazione: string;
  revisione: number;
  statoAvanzamento: string;
}): FormData {
  const fd = new FormData();
  fd.set('segnalazioneId', params.segnalazioneId);
  fd.set('nuovoStato', params.nuovoStato);
  fd.set('newState', params.nuovoStato);
  fd.set('motivazione', params.motivazione.trim());
  fd.set('expectedRevision', String(params.revisione));
  fd.set('revisioneAttesa', String(params.revisione));
  fd.set('expectedState', params.statoAvanzamento);
  fd.set('statoAtteso', params.statoAvanzamento);
  return fd;
}

export function buildComitatoCategorieFormData(params: {
  segnalazioneId: string;
  categoryIds: string[];
  revisione: number;
}): FormData {
  const fd = new FormData();
  fd.set('segnalazioneId', params.segnalazioneId);
  params.categoryIds.forEach(catId => fd.append('categoryIds', catId));
  fd.set('expectedRevision', String(params.revisione));
  fd.set('revisioneAttesa', String(params.revisione));
  return fd;
}

function getAllowedNextStates(
  statoModerazione: string,
  statoAvanzamento: string
): Array<{ value: 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI' | 'RITIRATA'; label: string }> {
  if (statoModerazione !== 'APPROVATA') {
    return [];
  }
  if (statoAvanzamento === 'RICEVUTA') {
    return [
      { value: 'PRESA_IN_CARICO', label: 'Prendi in carico per istruttoria comitato' },
      { value: 'RITIRATA', label: 'Ritira la segnalazione' },
    ];
  }
  if (statoAvanzamento === 'PRESA_IN_CARICO') {
    return [
      { value: 'INVIATA_AI_CANDIDATI', label: 'Registra avvenuta trasmissione ai candidati' },
      { value: 'RITIRATA', label: 'Ritira la segnalazione' },
    ];
  }
  if (statoAvanzamento === 'INVIATA_AI_CANDIDATI') {
    return [
      { value: 'RITIRATA', label: 'Ritira la segnalazione (revoca trasmissione)' },
    ];
  }
  return [];
}

export default function ComitatoActionsForm({
  segnalazioneId,
  statoModerazione,
  statoAvanzamento,
  revisione,
  categorieDisponibili = [],
  categorieAssegnateIds: initialCatIds = [],
  mode = 'all'
}: ComitatoActionsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Stato form moderazione
  const [modDecision, setModDecision] = useState<'APPROVATA' | 'RIFIUTATA' | 'IN_REVISIONE'>(
    statoModerazione === 'PENDENTE' || statoModerazione === 'IN_REVISIONE' ? 'APPROVATA' : 'IN_REVISIONE'
  );
  const [modMotivazione, setModMotivazione] = useState('');

  // Opzioni consentite per avanzamento
  const allowedNextStates = getAllowedNextStates(statoModerazione, statoAvanzamento);
  const defaultNextState = allowedNextStates[0]?.value ?? 'PRESA_IN_CARICO';

  // Stato form avanzamento (gestione selezione utente senza useEffect)
  const [selectedAvStato, setSelectedAvStato] = useState<'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI' | 'RITIRATA' | null>(null);
  const avStato = (selectedAvStato && allowedNextStates.some(s => s.value === selectedAvStato))
    ? selectedAvStato
    : defaultNextState;
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
      const fd = buildComitatoModeraFormData({
        segnalazioneId,
        decision: modDecision,
        motivazione: modMotivazione,
        revisione,
        statoModerazione
      });

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
      setErrorMsg('La motivazione dell\'avanzamento è obbligatoria.');
      return;
    }

    startTransition(async () => {
      const fd = buildComitatoAvanzaFormData({
        segnalazioneId,
        nuovoStato: avStato,
        motivazione: avMotivazione,
        revisione,
        statoAvanzamento
      });

      const res = await avanzaStatoSegnalazioneAction(fd);
      if (res.success) {
        setSuccessMsg(`Avanzamento iter registrato: nuovo stato "${avStato}".`);
        setAvMotivazione('');
        router.refresh();
      } else {
        setErrorMsg(res.error || 'Errore durante l\'aggiornamento dell\'avanzamento.');
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
      const fd = buildComitatoCategorieFormData({
        segnalazioneId,
        categoryIds: selectedCats,
        revisione
      });

      const res = await aggiornaCategorieAction(fd);
      if (res.success) {
        setSuccessMsg('Categorie confermate e aggiornate con successo.');
        router.refresh();
      } else {
        setErrorMsg(res.error || 'Errore durante l\'aggiornamento delle categorie.');
      }
    });
  };

  const showModerazione = mode === 'all' || mode === 'moderazione-only';
  const showAvanzamento = mode === 'all' || mode === 'avanzamento-only';
  const showCategorie = mode === 'all' && categorieDisponibili.length > 0;

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

      <div className={`grid grid-cols-1 ${mode === 'all' ? 'lg:grid-cols-3' : ''} gap-4`}>
        {/* Blocco 1: Moderazione di conformità */}
        {showModerazione && (
          <div className="panel-subtle p-3 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-[var(--text-primary)] text-xs mb-1">
                1. Moderazione di ammissione
              </h3>
              <p className="text-[0.6875rem] text-[var(--text-muted)] mb-3">
                Stato attuale: <strong>{statoModerazione}</strong> &bull; Rev. {revisione}
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
                    <option value="APPROVATA">APPROVA (Ammessa e pubblicabile)</option>
                    <option value="IN_REVISIONE">IN REVISIONE (Approfondimento comitato)</option>
                    <option value="RIFIUTATA">RIFIUTA (Non conforme alle linee guida)</option>
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
                    placeholder="Indica la motivazione della delibera..."
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
        )}

        {/* Blocco 2: Avanzamento iter */}
        {showAvanzamento && (
          <div className="panel-subtle p-3 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-[var(--text-primary)] text-xs mb-1">
                2. Avanzamento iter territoriale
              </h3>
              <p className="text-[0.6875rem] text-[var(--text-muted)] mb-3">
                Stato attuale: <strong>{statoAvanzamento}</strong> (Moderazione: {statoModerazione})
              </p>

              {statoModerazione !== 'APPROVATA' ? (
                <div className="p-2.5 bg-[var(--bg-subtle)] border border-[var(--border-medium)] rounded text-[0.6875rem] text-[var(--text-secondary)]">
                  <p className="font-semibold text-[var(--text-primary)] mb-1">Avanzamento non consentito</p>
                  <p>
                    L&rsquo;iter territoriale (&ldquo;In carico al comitato&rdquo; o &ldquo;Trasmessa ai candidati&rdquo;) 
                    può essere avviato esclusivamente dopo che la segnalazione è stata deliberata con esito <strong>APPROVATA</strong>.
                  </p>
                </div>
              ) : allowedNextStates.length === 0 ? (
                <div className="p-2.5 bg-[var(--bg-subtle)] border border-[var(--border-medium)] rounded text-[0.6875rem] text-[var(--text-secondary)]">
                  <p className="font-semibold text-[var(--text-primary)] mb-1">Iter completato o terminale</p>
                  <p>
                    {statoAvanzamento === 'RITIRATA'
                      ? 'Segnalazione ritirata: nessuna ulteriore transizione possibile.'
                      : 'La segnalazione è già stata trasmessa ai candidati nel dossier civico.'}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleAvanza} className="flex flex-col gap-2.5">
                  <div>
                    <label htmlFor={`av-dec-${segnalazioneId}`} className="form-label text-[0.6875rem]">
                      Azione di avanzamento
                    </label>
                    <select
                      id={`av-dec-${segnalazioneId}`}
                      value={avStato}
                      onChange={e => setSelectedAvStato(e.target.value as 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI' | 'RITIRATA')}
                      className="form-input text-xs py-1"
                    >
                      {allowedNextStates.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {avStato === 'INVIATA_AI_CANDIDATI' && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[0.6875rem] text-amber-800">
                      <strong>Nota operativa sulla trasmissione:</strong> Questa azione registra formalmente nel registro storico il passaggio di stato a &ldquo;Trasmessa ai candidati&rdquo;. Il sistema non esegue l&rsquo;invio di email: la trasmissione materiale del dossier alle liste e ai candidati avviene mediante esportazione del Dossier Candidati (RF13).
                    </div>
                  )}

                  <div>
                    <label htmlFor={`av-mot-${segnalazioneId}`} className="form-label text-[0.6875rem]">
                      Note e motivazione del passaggio (obbligatoria)
                    </label>
                    <textarea
                      id={`av-mot-${segnalazioneId}`}
                      rows={2}
                      required
                      placeholder={
                        avStato === 'PRESA_IN_CARICO'
                          ? 'Es. Aperta istruttoria tecnica per verifica con gli uffici comunali...'
                          : avStato === 'INVIATA_AI_CANDIDATI'
                          ? 'Es. Segnalazione inclusa nel dossier trasmesso ai candidati sindaci per il dibattito...'
                          : 'Indica la motivazione...'
                      }
                      value={avMotivazione}
                      onChange={e => setAvMotivazione(e.target.value)}
                      className="form-input text-xs py-1"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isPending}
                    className="btn btn-secondary btn-sm mt-1"
                  >
                    {isPending ? 'Salvataggio…' : 'Registra avanzamento'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Blocco 3: Conferma categorie */}
        {showCategorie && (
          <div className="panel-subtle p-3 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-[var(--text-primary)] text-xs mb-1">
                3. Categorie confermate
              </h3>
              <p className="text-[0.6875rem] text-[var(--text-muted)] mb-3">
                Ambiti territoriali associati dal comitato
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
        )}
      </div>
    </div>
  );
}
