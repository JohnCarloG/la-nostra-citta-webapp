import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';
import {
  getCodaRevisioniComitato,
  getTutteSegnalazioniComitato,
  getCategorieAttive
} from '@/lib/domain/segnalazioni';
import ComitatoActionsForm from './comitato-actions-form';

interface PageProps {
  searchParams: Promise<{
    filtro?: string;
  }>;
}

export default async function ComitatoPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.ruolo !== 'COMITATO') {
    return (
      <main className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-3xl mx-auto">
          ⛔
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Accesso Riservato al Comitato</h1>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Il tuo account ({user.email_normalizzata}) ha ruolo <strong>{user.ruolo}</strong>.
          Solo i membri verificati del comitato possono accedere a questa area di supervisione (RF03).
        </p>
        <Link
          href="/dashboard"
          className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
        >
          Torna alla tua Dashboard
        </Link>
      </main>
    );
  }

  const params = await searchParams;
  const filtroStato = params.filtro || undefined;

  const [coda, tutteSegnalazioni, categorie] = await Promise.all([
    getCodaRevisioniComitato(),
    getTutteSegnalazioniComitato(filtroStato),
    getCategorieAttive()
  ]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header Comitato */}
      <div className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full uppercase">
              Supervisione &amp; Governance
            </span>
            <span className="text-xs text-slate-500 font-mono">
              Operatore: {user.nome} {user.cognome}
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Area Operativa Comitato
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Gestione delle code di moderazione, avanzamento formale verso i candidati e validazione delle categorie confermate.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/segnalazioni"
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs"
          >
            Vista Cittadino
          </Link>
          <Link
            href="/classifica"
            className="px-4 py-2 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-lg shadow-xs"
          >
            Classifica Ufficiale
          </Link>
        </div>
      </div>

      {/* Riquadri Metriche */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase">Coda in Attesa</span>
          <p className="text-2xl font-black text-amber-600 mt-1">
            {coda.length}
          </p>
          <span className="text-[11px] text-slate-500">PENDENTE o IN_REVISIONE</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase">Totale Segnalazioni</span>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {tutteSegnalazioni.length}
          </p>
          <span className="text-[11px] text-slate-500">Archivio completo</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase">Categorie a Catalogo</span>
          <p className="text-2xl font-black text-emerald-600 mt-1">
            {categorie.length}
          </p>
          <span className="text-[11px] text-slate-500">Tassonomia attiva</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase">Controllo Concorrenza</span>
          <p className="text-sm font-bold text-blue-700 mt-2">
            Optimistic Locking
          </p>
          <span className="text-[11px] text-slate-500">Prevenzione decisioni sovrapposte (VI07)</span>
        </div>
      </div>

      {/* CODA DI REVISIONE PRIORITARIA */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>⏱️</span> Coda di Revisione Prioritaria ({coda.length})
          </h2>
          <span className="text-xs text-slate-500">In attesa di approvazione o valutazione</span>
        </div>

        {coda.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 font-medium">
            Ottimo lavoro! Nessuna segnalazione è attualmente in attesa di moderazione.
          </div>
        ) : (
          <div className="space-y-4">
            {coda.map(seg => (
              <div
                key={seg.id}
                className="bg-white rounded-xl border-2 border-amber-300 p-5 shadow-xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      {seg.stato_moderazione}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      ID: {seg.id.slice(0, 8)}... (Rev. {seg.revisione})
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    Autore: {seg.autore.nome} {seg.autore.cognome} ({seg.autore.email_normalizzata})
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Anteprima Media Protetta */}
                  <div className="md:col-span-1">
                    {seg.media[0] ? (
                      <div className="rounded-lg overflow-hidden bg-slate-900 h-28 flex items-center justify-center">
                        {seg.media[0].tipo === 'FOTO' ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={`/api/media/${seg.media[0].id}`}
                            alt="Media"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-white text-xs font-semibold">Video allegato</span>
                        )}
                      </div>
                    ) : (
                      <div className="h-28 bg-slate-100 rounded-lg flex items-center justify-center text-xs text-slate-400">
                        Nessun media
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-3 space-y-2">
                    <p className="text-sm font-medium text-slate-800">
                      {seg.descrizione}
                    </p>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-4">
                      <span>Lat: {seg.latitudine.toFixed(5)}, Lon: {seg.longitudine.toFixed(5)}</span>
                      <span>Inserita il: {new Date(seg.creata_il).toLocaleDateString('it-IT')}</span>
                    </div>
                  </div>
                </div>

                {/* Modulo Operativo Comitato con Concorrenza Protetta */}
                <ComitatoActionsForm
                  segnalazioneId={seg.id}
                  statoModerazione={seg.stato_moderazione}
                  statoAvanzamento={seg.stato_avanzamento}
                  revisione={seg.revisione}
                  categorieDisponibili={categorie}
                  categorieAssegnateIds={seg.categorie.map(c => c.categoria_id)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ELENCO COMPLETO DELLE SEGNALAZIONI GESTIBILI */}
      <section className="space-y-4 pt-6 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">
            Tutte le Segnalazioni Gestibili ({tutteSegnalazioni.length})
          </h2>

          {/* Filtro Rapido Stato */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Link
              href="/comitato"
              className={`px-2.5 py-1 rounded-md font-medium ${
                !filtroStato ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Tutte
            </Link>
            <Link
              href="/comitato?filtro=APPROVATA"
              className={`px-2.5 py-1 rounded-md font-medium ${
                filtroStato === 'APPROVATA' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Approvate
            </Link>
            <Link
              href="/comitato?filtro=RIFIUTATA"
              className={`px-2.5 py-1 rounded-md font-medium ${
                filtroStato === 'RIFIUTATA' ? 'bg-rose-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Rifiutate
            </Link>
            <Link
              href="/comitato?filtro=PRESA_IN_CARICO"
              className={`px-2.5 py-1 rounded-md font-medium ${
                filtroStato === 'PRESA_IN_CARICO' ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              In Carico
            </Link>
            <Link
              href="/comitato?filtro=INVIATA_AI_CANDIDATI"
              className={`px-2.5 py-1 rounded-md font-medium ${
                filtroStato === 'INVIATA_AI_CANDIDATI' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Inviate ai Candidati
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          {tutteSegnalazioni.map(seg => (
            <div
              key={seg.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-slate-100 text-slate-800">
                    Mod: {seg.stato_moderazione}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Avanzamento: {seg.stato_avanzamento}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Rev. {seg.revisione}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">
                    {seg.autore.nome} {seg.autore.cognome}
                  </span>
                  <Link
                    href={`/segnalazioni/${seg.id}`}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    Dettaglio &rarr;
                  </Link>
                </div>
              </div>

              <p className="text-sm font-medium text-slate-800">
                {seg.descrizione}
              </p>

              {/* Form Operativo per Avanzamento, Moderazione o Categorie */}
              <ComitatoActionsForm
                segnalazioneId={seg.id}
                statoModerazione={seg.stato_moderazione}
                statoAvanzamento={seg.stato_avanzamento}
                revisione={seg.revisione}
                categorieDisponibili={categorie}
                categorieAssegnateIds={seg.categorie.map(c => c.categoria_id)}
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
