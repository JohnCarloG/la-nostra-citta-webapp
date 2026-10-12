import { getCurrentUser } from '@/actions/auth';
import { redirect } from 'next/navigation';
import LogoutButton from './logout-button';
import Link from 'next/link';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header di benvenuto */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Bentornato, {user.nome} {user.cognome}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Area riservata della piattaforma civica &quot;La Nostra Città&quot;
            </p>
          </div>
          <LogoutButton />
        </div>

        {/* Scheda stato account */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ruolo</span>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {user.ruolo}
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Stato Account</span>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                {user.stato_account}
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Verificata</span>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                {user.verificato_il ? 'Verificato' : 'Non Verificato'}
              </span>
            </div>
          </div>
        </div>

        {/* Dettagli utente */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 border-b pb-2">Riepilogo Profilo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Email di accesso</p>
              <p className="font-medium text-slate-900">{user.email_normalizzata}</p>
            </div>
            <div>
              <p className="text-slate-500">Identificativo Univoco</p>
              <p className="font-mono text-xs text-slate-700 bg-slate-100 p-1.5 rounded">{user.id}</p>
            </div>
            <div>
              <p className="text-slate-500">Iscritto il</p>
              <p className="font-medium text-slate-900">
                {new Date(user.creato_il).toLocaleDateString('it-IT', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Quartiere di riferimento</p>
              <p className="font-medium text-slate-900">
                {user.quartiere_id ?? 'Non assegnato'}
              </p>
            </div>
          </div>
        </div>

        {/* Pannello Segnalazioni Civiche */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Le Tue Segnalazioni Civiche</h2>
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Torna alla Home &rarr;
            </Link>
          </div>
          <p className="text-sm text-slate-600">
            Nessuna segnalazione attiva in lavorazione per questo account.
            Le funzionalità di invio segnalazione con upload protetto e analisi automatica (Fase 3) verranno abilitate al completamento del collaudo.
          </p>
        </div>
      </div>
    </div>
  );
}
