'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  moderaSegnalazioneAction,
  avanzaStatoSegnalazioneAction,
  aggiornaCategorieAction
} from '@/actions/segnalazioni';
import ComitatoMediaGallery, { ComitatoMediaItem } from '@/components/comitato/comitato-media-gallery';

export interface ComitatoActionsFormProps {
  segnalazioneId: string;
  statoModerazione: string;
  statoAvanzamento: string;
  revisione: number;
  categorieDisponibili?: Array<{ id: string; nome: string }>;
  categorieAssegnateIds?: string[];
  media?: ComitatoMediaItem[];
  segnalazioneDescrizione?: string;
  mode?: 'all' | 'avanzamento-only' | 'moderazione-only';
  showHeader?: boolean;
  showMedia?: boolean;
  onCancel?: () => void;
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
      { value: 'PRESA_IN_CARICO', label: 'Prendi in carico' },
      { value: 'RITIRATA', label: 'Ritira la segnalazione' },
    ];
  }
  if (statoAvanzamento === 'PRESA_IN_CARICO') {
    return [
      { value: 'INVIATA_AI_CANDIDATI', label: 'Registra trasmissione ai candidati' },
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

function StatoBadgeMini({ stato, tipo }: { stato: string; tipo: 'mod' | 'avanz' }) {
  const modMap: Record<string, { cls: string; label: string }> = {
    PENDENTE:     { cls: 'badge badge-mod-pendente',  label: 'In attesa' },
    IN_REVISIONE: { cls: 'badge badge-mod-revisione', label: 'In revisione' },
    APPROVATA:    { cls: 'badge badge-mod-approvata', label: 'Approvata' },
    RIFIUTATA:    { cls: 'badge badge-mod-rifiutata', label: 'Rifiutata' },
  };
  const avanzMap: Record<string, { cls: string; label: string }> = {
    RICEVUTA:             { cls: 'badge badge-ricevuta',  label: 'Ricevuta' },
    PRESA_IN_CARICO:      { cls: 'badge badge-carico',    label: 'In carico' },
    INVIATA_AI_CANDIDATI: { cls: 'badge badge-candidati', label: 'Ai candidati' },
    RITIRATA:             { cls: 'badge badge-ritirata',  label: 'Ritirata' },
  };
  const map = tipo === 'mod' ? modMap : avanzMap;
  const item = map[stato] ?? { cls: 'badge badge-categoria', label: stato.replace(/_/g, ' ') };
  return <span className={item.cls}>{item.label}</span>;
}

export default function ComitatoActionsForm({
  segnalazioneId,
  statoModerazione,
  statoAvanzamento,
  revisione,
  categorieDisponibili = [],
  categorieAssegnateIds: initialCatIds = [],
  media = [],
  segnalazioneDescrizione = 'segnalazione',
  mode = 'all',
  showHeader = true,
  showMedia = true,
  onCancel
}: ComitatoActionsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Stato form moderazione
  const isPendenteORevisione = statoModerazione === 'PENDENTE' || statoModerazione === 'IN_REVISIONE';
  const [modDecision, setModDecision] = useState<'APPROVATA' | 'RIFIUTATA' | 'IN_REVISIONE'>(
    isPendenteORevisione ? 'APPROVATA' : 'IN_REVISIONE'
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
        // La motivazione inserita viene preservata in modMotivazione
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
        // La motivazione inserita viene preservata in avMotivazione
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

  const isTerminalState = statoAvanzamento === 'RITIRATA' || (statoModerazione === 'RIFIUTATA' && mode !== 'moderazione-only');
  const showModerazione = (mode === 'all' || mode === 'moderazione-only') && isPendenteORevisione;
  const showAvanzamento = (mode === 'all' || mode === 'avanzamento-only') && statoModerazione === 'APPROVATA' && !isTerminalState;

  return (
    <div className="flex flex-col gap-4 text-xs w-full" data-testid="comitato-actions-form">
      {/* ── 1. STATO ATTUALE (mostrato se richiesto) ── */}
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-light)]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[var(--text-secondary)]">Stato attuale:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[0.6875rem] text-[var(--text-muted)]">Moderazione:</span>
              <StatoBadgeMini stato={statoModerazione} tipo="mod" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[0.6875rem] text-[var(--text-muted)]">Iter:</span>
              <StatoBadgeMini stato={statoAvanzamento} tipo="avanz" />
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-[0.6875rem] text-[var(--text-muted)]">
            <span>Rev. {revisione}</span>
          </div>
        </div>
      )}

      {/* ── 2. ALLEGATI DI PROVA (mostrati se richiesto) ── */}
      {showMedia && media && media.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-bold text-xs text-[var(--text-primary)]">
            Allegati e prove documentali
          </h3>
          <ComitatoMediaGallery
            media={media}
            segnalazioneDescrizione={segnalazioneDescrizione}
          />
        </div>
      )}

      {/* Messaggi di feedback ed errore (visibili accanto al form) */}
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

      {/* ── 3. AZIONE DISPONIBILE, 4. MOTIVAZIONE, 5. PULSANTE DI CONFERMA ── */}
      <div className="flex flex-col gap-3">
        {/* CASO A: MODERAZIONE DI AMMISSIONE (SE PENDENTE O IN REVISIONE) */}
        {showModerazione && (
          <form onSubmit={handleModera} className="scroll-mt-28 flex flex-col gap-3 p-3.5 bg-white rounded border border-[var(--border-medium)] shadow-sm">
            {/* Selezione esplicita della decisione */}
            <div id={`decision-box-${segnalazioneId}`} className="scroll-mt-28 flex flex-col gap-1.5">
              <span className="font-bold text-xs text-[var(--text-primary)]">Decisione:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label
                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    modDecision === 'APPROVATA'
                      ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-text)] font-bold'
                      : 'border-[var(--border-medium)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <input
                    type="radio"
                    id={`mod-dec-${segnalazioneId}-APPROVATA`}
                    name={`mod-dec-${segnalazioneId}`}
                    value="APPROVATA"
                    checked={modDecision === 'APPROVATA'}
                    onChange={() => setModDecision('APPROVATA')}
                    className="accent-[var(--success-text)]"
                  />
                  <span>Approva</span>
                </label>

                <label
                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    modDecision === 'RIFIUTATA'
                      ? 'border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-text)] font-bold'
                      : 'border-[var(--border-medium)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <input
                    type="radio"
                    name={`mod-dec-${segnalazioneId}`}
                    value="RIFIUTATA"
                    checked={modDecision === 'RIFIUTATA'}
                    onChange={() => setModDecision('RIFIUTATA')}
                    className="accent-[var(--error-text)]"
                  />
                  <span>Rifiuta</span>
                </label>

                <label
                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    modDecision === 'IN_REVISIONE'
                      ? 'border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)] font-bold'
                      : 'border-[var(--border-medium)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <input
                    type="radio"
                    name={`mod-dec-${segnalazioneId}`}
                    value="IN_REVISIONE"
                    checked={modDecision === 'IN_REVISIONE'}
                    onChange={() => setModDecision('IN_REVISIONE')}
                    className="accent-[var(--warning-text)]"
                  />
                  <span>In revisione</span>
                </label>
              </div>
            </div>

            {/* Motivazione obbligatoria con suggerimento neutro */}
            <div className="flex flex-col gap-1">
              <label htmlFor={`mod-mot-${segnalazioneId}`} className="form-label text-[0.6875rem]">
                Motivazione (obbligatoria)
              </label>
              <textarea
                id={`mod-mot-${segnalazioneId}`}
                rows={2}
                required
                placeholder="Spiega il motivo della decisione"
                value={modMotivazione}
                onChange={e => setModMotivazione(e.target.value)}
                className="form-input text-xs py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue-primary)]"
              />
            </div>

            {/* Pulsante di conferma primario con controllo secondario Chiudi opzionale */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-light)]">
              <button
                type="submit"
                disabled={isPending}
                className={`btn btn-sm font-semibold flex items-center gap-1.5 shadow-sm ${
                  modDecision === 'APPROVATA'
                    ? 'btn-primary'
                    : modDecision === 'RIFIUTATA'
                    ? 'btn-danger'
                    : 'btn-secondary'
                }`}
              >
                <span>
                  {isPending
                    ? 'Salvataggio in corso…'
                    : modDecision === 'APPROVATA'
                    ? 'Approva segnalazione'
                    : modDecision === 'RIFIUTATA'
                    ? 'Rifiuta segnalazione'
                    : 'Conferma stato in revisione'}
                </span>
              </button>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="btn btn-secondary btn-sm font-normal"
                >
                  Chiudi
                </button>
              )}
            </div>
          </form>
        )}

        {/* CASO B: AVANZAMENTO ITER FORMALE (SE GIÀ APPROVATA) */}
        {showAvanzamento && (
          <form onSubmit={handleAvanza} className="flex flex-col gap-3 p-3.5 bg-white rounded border border-[var(--border-medium)] shadow-sm">
            <div>
              <h3 className="font-bold text-xs text-[var(--text-primary)] mb-0.5">
                Azione disponibile: Avanzamento iter territoriale
              </h3>
              <p className="text-[0.6875rem] text-[var(--text-muted)]">
                {statoAvanzamento === 'RICEVUTA' && 'La proposta è stata approvata. L\'operatore può ora prenderla in carico per l\'istruttoria del comitato.'}
                {statoAvanzamento === 'PRESA_IN_CARICO' && 'La proposta è in carico al comitato. È possibile registrare l\'avvenuta trasmissione formale ai candidati.'}
                {statoAvanzamento === 'INVIATA_AI_CANDIDATI' && 'La proposta è già stata registrata come trasmessa ai candidati.'}
              </p>
            </div>

            {/* Selezione esplicita del passaggio di stato */}
            <div className="flex flex-col gap-1.5">
              <span className="form-label text-[0.6875rem]">Passaggio di stato:</span>
              <div className="flex flex-col gap-1.5">
                {allowedNextStates.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                      avStato === opt.value
                        ? 'border-[var(--blue-primary)] bg-[var(--blue-light)] text-[var(--blue-primary)] font-bold'
                        : 'border-[var(--border-medium)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`av-opt-${segnalazioneId}`}
                      value={opt.value}
                      checked={avStato === opt.value}
                      onChange={() => setSelectedAvStato(opt.value)}
                      className="accent-[var(--blue-primary)]"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Avviso esplicito per registrazione trasmissione ai candidati */}
            {avStato === 'INVIATA_AI_CANDIDATI' && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-blue-900 text-[0.6875rem]">
                Registra una trasmissione già avvenuta. Non viene inviata alcuna email.
              </div>
            )}

            {/* Motivazione obbligatoria dell'avanzamento */}
            <div className="flex flex-col gap-1">
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
                    ? 'Es. Proposta inclusa nel dossier ufficiale per il confronto tra liste e candidati...'
                    : 'Indica la motivazione...'
                }
                value={avMotivazione}
                onChange={e => setAvMotivazione(e.target.value)}
                className="form-input text-xs py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue-primary)]"
              />
            </div>

            {/* Pulsante di conferma primario */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-light)]">
              <button
                type="submit"
                disabled={isPending}
                className={`btn btn-sm font-semibold flex items-center gap-1.5 ${
                  avStato === 'RITIRATA' ? 'btn-danger' : 'btn-primary'
                }`}
              >
                <span>
                  {isPending
                    ? 'Salvataggio in corso…'
                    : avStato === 'PRESA_IN_CARICO'
                    ? 'Prendi in carico'
                    : avStato === 'INVIATA_AI_CANDIDATI'
                    ? 'Registra trasmissione ai candidati'
                    : 'Ritira segnalazione'}
                </span>
              </button>
              <span className="text-[0.625rem] text-[var(--text-muted)]">
                Aggiorna stato iter
              </span>
            </div>
          </form>
        )}

        {/* CASO C: STATO TERMINALE O INIBITO */}
        {isTerminalState && (
          <div className="p-3 bg-[var(--bg-subtle)] border border-[var(--border-medium)] rounded text-[var(--text-muted)] flex flex-col gap-1">
            <span className="font-semibold text-xs text-[var(--text-primary)]">
              Stato terminale della segnalazione
            </span>
            <p className="text-[0.6875rem]">
              Questa segnalazione si trova nello stato conclusivo ({statoAvanzamento === 'RITIRATA' ? 'Ritirata' : 'Rifiutata'}) e non consente ulteriori modifiche di stato.
            </p>
          </div>
        )}
      </div>

      {/* ── 6. SEZIONE SECONDARIA: MODIFICA CATEGORIE CONFERMATE ── */}
      {categorieDisponibili.length > 0 && (
        <details className="mt-2 border-t border-[var(--border-light)] pt-3">
          <summary className="cursor-pointer font-semibold text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-1 flex items-center justify-between list-none">
            <span>Modifica categorie</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-[var(--text-muted)]"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </summary>

          <form onSubmit={handleSalvaCategorie} className="mt-3 flex flex-col gap-2 p-3 bg-white border border-[var(--border-light)] rounded">
            <p className="text-[0.6875rem] text-[var(--text-muted)] mb-1">
              Spunta le categorie pertinenti per l&rsquo;indicizzazione civica della proposta.
            </p>

            <div className="max-h-36 overflow-y-auto flex flex-col gap-1 border border-[var(--border-medium)] rounded-[var(--radius-xs)] p-2 bg-white">
              {categorieDisponibili.map(cat => (
                <label key={cat.id} className="flex items-center gap-2 cursor-pointer text-[0.6875rem]">
                  <input
                    type="checkbox"
                    checked={selectedCats.includes(cat.id)}
                    onChange={() => handleToggleCat(cat.id)}
                    className="rounded accent-[var(--blue-primary)]"
                  />
                  <span className="truncate">{cat.nome}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="btn btn-secondary btn-xs font-semibold"
              >
                {isPending ? 'Salvataggio…' : 'Conferma categorie'}
              </button>
              <span className="text-[0.625rem] text-[var(--text-muted)]">
                {selectedCats.length} selezionate
              </span>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
