'use client';

import { useActionState, useState } from 'react';
import { registerAction } from '@/actions/auth';
import Link from 'next/link';
import QuartiereSelector, { QuartiereItem } from '@/components/quartiere-selector';

export default function RegisterForm({ quartieri }: { quartieri: QuartiereItem[] }) {
  const [cfInput, setCfInput] = useState('');

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error?: string; success?: boolean; message?: string; emailDelivered?: boolean } | null, formData: FormData) => {
      return await registerAction(formData);
    },
    null
  );

  if (state?.success) {
    const isAccepted = Boolean(state.emailDelivered);
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12 bg-white">
        <div className={`panel ${isAccepted ? 'alert-success border-green-200' : 'bg-amber-50 border border-amber-200'} max-w-md w-full text-center flex flex-col items-center gap-3`}>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide uppercase">
            {isAccepted ? (
              <span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded-full border border-green-300">
                Email accettata dal server di posta
              </span>
            ) : (
              <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-300">
                Email di verifica in attesa di invio
              </span>
            )}
          </div>
          <h1 className="section-title text-base text-[var(--text-primary)]">
            Registrazione completata
          </h1>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {isAccepted
              ? "Il server SMTP ha accettato il messaggio per la spedizione. Controlla la tua casella di posta (inclusa la cartella spam o promozioni). L'effettiva ricezione dipende dal provider di destinazione."
              : "L'account è stato registrato nel sistema. L'email di verifica è in attesa di invio nella coda dell'esecutore e verrà trasmessa a breve."}
          </p>
          <div className="bg-white/90 rounded p-3 text-[0.6875rem] text-[var(--text-secondary)] text-left mt-2 w-full border border-slate-200">
            <span className="font-semibold text-slate-800 block mb-1">Procedura di attivazione:</span>
            {isAccepted
              ? "Apri il link ricevuto via email per accedere alla schermata di conferma attivazione prima di effettuare il login."
              : "Se non ricevi l'email entro pochi minuti o se il servizio SMTP era momentaneamente non raggiungibile, puoi richiedere un nuovo invio."}
          </div>
          <div className="flex gap-2 mt-2 w-full">
            <Link href="/login" className="btn btn-primary btn-sm flex-1">
              Vai al login &rarr;
            </Link>
            <Link href="/resend-verification" className="btn btn-outline btn-sm flex-1">
              Richiedi nuovo invio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 bg-white">
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <h1 className="page-title text-xl mb-1">
            Registrazione cittadino
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Crea il tuo profilo per partecipare attivamente alla cura della città, sostenere le proposte e seguire le decisioni del comitato.
          </p>
        </div>

        {state?.error && (
          <div className="alert alert-error mb-4" role="alert">
            <p className="text-xs font-medium">{state.error}</p>
          </div>
        )}

        <form action={formAction} id="register-form" className="panel flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="register-nome" className="form-label text-xs">
                Nome <span className="text-[var(--error-text)]">*</span>
              </label>
              <input
                id="register-nome"
                type="text"
                name="nome"
                required
                autoComplete="given-name"
                className="form-input text-xs"
                placeholder="Mario"
              />
            </div>
            <div>
              <label htmlFor="register-cognome" className="form-label text-xs">
                Cognome <span className="text-[var(--error-text)]">*</span>
              </label>
              <input
                id="register-cognome"
                type="text"
                name="cognome"
                required
                autoComplete="family-name"
                className="form-input text-xs"
                placeholder="Rossi"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="register-cf" className="form-label text-xs">
                Codice fiscale <span className="text-[var(--error-text)]">*</span>
              </label>
              <input
                id="register-cf"
                type="text"
                name="codice_fiscale"
                required
                maxLength={16}
                value={cfInput}
                onChange={(e) => setCfInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                autoComplete="off"
                className="form-input text-xs uppercase font-mono tracking-wider"
                placeholder="RSSMRA85M01H501Q"
              />
              <p className="form-helper text-[0.6875rem] mt-1">
                16 caratteri alfanumerici. Utilizzato esclusivamente per verificare l&rsquo;unicità dell&rsquo;utenza.
              </p>
            </div>

            <div>
              <QuartiereSelector
                id="register-quartiere"
                name="quartiere_id"
                quartieri={quartieri}
                required
                label="Quartiere di residenza"
                placeholder="Cerca o seleziona il tuo quartiere (NIL)…"
              />
            </div>
          </div>

          <div>
            <label htmlFor="register-email" className="form-label text-xs">
              Indirizzo email <span className="text-[var(--error-text)]">*</span>
            </label>
            <input
              id="register-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              className="form-input text-xs"
              placeholder="mario.rossi@esempio.it"
            />
            <p className="form-helper text-[0.6875rem] mt-1">
              Riceverai il messaggio contenente il link di attivazione del tuo account.
            </p>
          </div>

          <div>
            <label htmlFor="register-password" className="form-label text-xs">
              Password (almeno 8 caratteri) <span className="text-[var(--error-text)]">*</span>
            </label>
            <input
              id="register-password"
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="form-input text-xs"
              placeholder="••••••••"
            />
          </div>

          {/* Informativa privacy sintetica e trasparente */}
          <div className="bg-[var(--surface-subtle)] border border-[var(--border-light)] rounded p-3 text-[0.6875rem] text-[var(--text-secondary)] leading-relaxed">
            <span className="font-semibold text-[var(--text-primary)] block mb-1">
              Trattamento dati e tutela dell&rsquo;identità civica
            </span>
            I dati richiesti (inclusi codice fiscale e quartiere di residenza) sono raccolti al solo scopo di prevenire la creazione di account duplicati e consentire l&rsquo;attribuzione territoriale delle proposte. Il codice fiscale viene validato con algoritmi ministeriali, non viene mostrato in profili o elenchi pubblici e non è ceduto a terzi.
          </div>

          <button
            type="submit"
            id="register-submit"
            disabled={isPending}
            className="btn btn-primary btn-sm w-full mt-2"
          >
            {isPending ? 'Creazione profilo in corso…' : 'Completa registrazione'}
          </button>
        </form>

        <div className="panel-subtle mt-4 text-center text-xs text-[var(--text-secondary)]">
          Hai già un profilo registrato?{' '}
          <Link href="/login" className="font-semibold text-[var(--blue-primary)] hover:underline">
            Accedi
          </Link>
        </div>
      </div>
    </div>
  );
}
