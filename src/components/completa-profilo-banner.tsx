'use client';

import React, { useActionState, useState } from 'react';
import { completaProfiloAction } from '@/actions/auth';
import QuartiereSelector, { QuartiereItem } from './quartiere-selector';

interface CompletaProfiloProps {
  user: {
    id: string;
    nome: string;
    cognome: string;
    codice_fiscale?: string | null;
    quartiere_id?: string | null;
    quartiere?: {
      id: string;
      nome: string;
      is_ufficiale?: boolean;
    } | null;
  };
  quartieri: QuartiereItem[];
}

export default function CompletaProfiloBanner({ user, quartieri }: CompletaProfiloProps) {
  const [cfInput, setCfInput] = useState(user.codice_fiscale || '');
  const [isSuccess, setIsSuccess] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
      const res = await completaProfiloAction(formData);
      if (res?.success) {
        setIsSuccess(true);
        // Ricarica la pagina per sincronizzare i dati utente
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      }
      return res;
    },
    null
  );

  const isLegacy = user.quartiere && user.quartiere.is_ufficiale === false;
  const isMissingQuartiere = !user.quartiere_id;
  const isMissingCf = !user.codice_fiscale;

  // Se l'utente ha già sia CF che un quartiere ufficiale e non ha salvato appena adesso
  if (!isLegacy && !isMissingQuartiere && !isMissingCf && !isSuccess) {
    return null;
  }

  if (isSuccess) {
    return (
      <div className="panel alert-success py-3 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[var(--success-text)]">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>Profilo e quartiere di residenza aggiornati con successo nel catalogo ufficiale NIL!</span>
        </div>
      </div>
    );
  }

  return (
    <section className="panel border-amber-300 bg-amber-50/40 p-4 sm:p-5" aria-labelledby="aggiorna-profilo-title">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-full bg-amber-100 text-amber-800 shrink-0 mt-0.5">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div className="flex-1">
          <h2 id="aggiorna-profilo-title" className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
            {isLegacy
              ? 'Conferma il tuo quartiere nel catalogo ufficiale NIL'
              : 'Completa il tuo profilo civico'}
          </h2>

          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
            {isLegacy ? (
              <>
                Il tuo profilo è attualmente associato alla voce <strong>«{user.quartiere?.nome}»</strong>, proveniente da una catalogazione preliminare.
                La piattaforma adotta ora i <strong>Nuclei d’Identità Locale (NIL) vigenti del Comune di Milano</strong>.
                La tua precedente associazione è stata mantenuta, ma ti chiediamo di selezionare il NIL ufficiale corrispondente per la corretta attribuzione territoriale.
              </>
            ) : (
              <>
                Per partecipare pienamente alle attività civiche del territorio, specifica il tuo codice fiscale e il tuo quartiere di residenza ufficiale.
              </>
            )}
          </p>

          {state?.error && (
            <div className="alert alert-error text-xs p-2.5 mt-3" role="alert">
              {state.error}
            </div>
          )}

          <form action={formAction} className="mt-4 flex flex-col sm:flex-row items-end gap-3">
            <div className="w-full sm:w-1/3">
              <label htmlFor="comp-cf" className="form-label text-xs block mb-1">
                Codice fiscale <span className="text-[var(--error-text)]">*</span>
              </label>
              <input
                id="comp-cf"
                type="text"
                name="codice_fiscale"
                required
                maxLength={16}
                value={cfInput}
                onChange={(e) => setCfInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                autoComplete="off"
                className="form-input text-xs uppercase font-mono"
                placeholder="RSSMRA85M01H501Q"
              />
            </div>

            <div className="w-full sm:flex-1">
              <QuartiereSelector
                id="comp-quartiere"
                name="quartiere_id"
                quartieri={quartieri}
                required
                label="Quartiere di residenza (NIL ufficiale)"
                placeholder="Seleziona il tuo NIL ufficiale del Comune di Milano…"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="btn btn-primary btn-sm shrink-0 w-full sm:w-auto mt-2 sm:mt-0"
            >
              {isPending ? 'Salvataggio…' : 'Conferma selezione'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
