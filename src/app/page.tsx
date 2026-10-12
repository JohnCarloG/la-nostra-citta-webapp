import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Navbar di navigazione */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xl text-blue-700 tracking-tight">
              La Nostra Città
            </span>
            <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
              Civic Platform
            </span>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors"
              >
                Dashboard ({user.nome})
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
                >
                  Accedi
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors"
                >
                  Registrati
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-semibold tracking-wider text-blue-600 uppercase mb-3">
          Partecipazione Civica &amp; Trasparenza
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight max-w-3xl">
          La Nostra Città, Il Nostro Futuro
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-2xl">
          Piattaforma digitale per la raccolta, gestione e monitoraggio certificato delle segnalazioni civiche urbane.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          {user ? (
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
            >
              Apri la tua Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
              >
                Registrati come Cittadino
              </Link>
              <Link
                href="/login"
                className="px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg shadow-sm transition-colors"
              >
                Accedi alla Piattaforma
              </Link>
            </>
          )}
        </div>

        {/* Feature Highlights */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-left w-full max-w-4xl">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-900 text-lg">Integrità Transazionale</h3>
            <p className="mt-2 text-sm text-slate-600">
              Modello dati conforme su MySQL InnoDB con vincoli relazionali compositi, auditing puntuale e rollback protetto.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-900 text-lg">Sicurezza &amp; Rate Limiting</h3>
            <p className="mt-2 text-sm text-slate-600">
              Protezione su finestre mobili scorrevoli contro brute force, sessioni server crittografate e verifica token.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-900 text-lg">Trasparenza Amministrativa</h3>
            <p className="mt-2 text-sm text-slate-600">
              Flusso di avanzamento degli stati di presa in carico e moderazione pubblica consultabile e auditabile.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} La Nostra Città, Il Nostro Futuro &bull; Piattaforma Civica Territoriale</p>
      </footer>
    </div>
  );
}
