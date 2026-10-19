import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';
import { getClassificaSegnalazioni } from '@/lib/domain/segnalazioni';

export default async function Home() {
  const user = await getCurrentUser();
  const topSegnalazioni = await getClassificaSegnalazioni(3, 0);

  return (
    <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col items-center">
      {/* Hero Section */}
      <div className="text-center max-w-3xl py-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide bg-blue-100 text-blue-800 uppercase mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
          Partecipazione Civica &amp; Trasparenza Territoriale
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          La Nostra Città, Il Nostro Futuro
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
          Piattaforma civica indipendente per raccogliere, documentare e sostenere le priorità urbane del territorio prima delle consultazioni elettorali.
        </p>

        <div className="mt-8 flex flex-wrap gap-4 justify-center">
          <Link
            href="/segnalazioni"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors text-sm sm:text-base"
          >
            Esplora le Segnalazioni
          </Link>
          <Link
            href="/mappa"
            className="px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg shadow-sm transition-colors text-sm sm:text-base"
          >
            Mappa del Territorio
          </Link>
          <Link
            href="/classifica"
            className="px-6 py-3 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 font-semibold rounded-lg shadow-sm transition-colors text-sm sm:text-base"
          >
            Classifica Priorità
          </Link>
        </div>
      </div>

      {/* Top 3 Priorità */}
      {topSegnalazioni.length > 0 && (
        <section className="w-full mt-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Priorità più sostenute</h2>
              <p className="text-sm text-slate-500">Le segnalazioni con il maggior numero di sostegni verificati</p>
            </div>
            <Link href="/classifica" className="text-sm font-semibold text-blue-600 hover:text-blue-800">
              Vedi classifica completa &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {topSegnalazioni.map((s, index) => (
              <div
                key={s.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                  #{index + 1}
                </div>
                <div>
                  <div className="flex flex-wrap gap-1.5 mb-2 pr-10">
                    {s.categorie.map(cat => (
                      <span key={cat} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {cat}
                      </span>
                    ))}
                  </div>
                  <p className="text-slate-800 font-medium text-sm line-clamp-3 mt-1">
                    {s.descrizione}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                    ❤️ {s.totaleSostegniValidi} {s.totaleSostegniValidi === 1 ? 'sostegno' : 'sostegni'}
                  </span>
                  <Link
                    href={`/segnalazioni/${s.id}`}
                    className="font-semibold text-slate-600 hover:text-blue-600"
                  >
                    Dettagli &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Feature Highlights */}
      <section className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-left w-full">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg mb-4">
            ✓
          </div>
          <h3 className="font-semibold text-slate-900 text-lg">Integrità &amp; Trasparenza</h3>
          <p className="mt-2 text-sm text-slate-600">
            Ogni segnalazione, avanzamento e sostegno è tracciato atomicamente con audit storico append-only e vincoli relazionali certificati.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg mb-4">
            🔒
          </div>
          <h3 className="font-semibold text-slate-900 text-lg">Storage Privato e Media Sicuri</h3>
          <p className="mt-2 text-sm text-slate-600">
            I contenuti fotografici e video sono archiviati su storage protetto. Nessun file o metadato privato viene esposto senza autorizzazione.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg mb-4">
            ⚖️
          </div>
          <h3 className="font-semibold text-slate-900 text-lg">Supervisione &amp; Democrazia Civica</h3>
          <p className="mt-2 text-sm text-slate-600">
            Controllo delle decisioni concorrenti del comitato, categorie confermate a catalogo e classifica deterministica senza duplicazioni.
          </p>
        </div>
      </section>

      {/* Call to action */}
      <section className="mt-16 w-full bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-8 sm:p-10 text-white text-center shadow-md">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Fai sentire la tua voce per il futuro della città
        </h2>
        <p className="mt-3 text-blue-100 max-w-xl mx-auto text-sm sm:text-base">
          Partecipa come cittadino verificato per inviare priorità documentate con foto e coordinate, e sostenere le istanze della tua comunità.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          {user ? (
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-white text-blue-800 hover:bg-blue-50 font-semibold rounded-lg shadow-xs transition-colors"
            >
              Vai alla tua Dashboard
            </Link>
          ) : (
            <Link
              href="/register"
              className="px-6 py-3 bg-white text-blue-800 hover:bg-blue-50 font-semibold rounded-lg shadow-xs transition-colors"
            >
              Registrati Gratuitamente
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
