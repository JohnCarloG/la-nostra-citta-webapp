import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';
import LogoutButton from '@/app/(dashboard)/dashboard/logout-button';

export default async function Navbar() {
  const user = await getCurrentUser();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-bold text-xl text-blue-700 tracking-tight">
              La Nostra Città
            </span>
            <span className="hidden sm:inline-block text-xs bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
              Civic Platform
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
            <Link href="/segnalazioni" className="hover:text-blue-600 transition-colors">
              Segnalazioni
            </Link>
            <Link href="/mappa" className="hover:text-blue-600 transition-colors">
              Mappa
            </Link>
            <Link href="/classifica" className="hover:text-blue-600 transition-colors">
              Classifica
            </Link>
            {user?.ruolo === 'COMITATO' && (
              <Link href="/comitato" className="text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1 transition-colors">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                Area Comitato
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="px-3.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium rounded-md transition-colors border border-blue-200"
              >
                Dashboard ({user.nome})
              </Link>
              <LogoutButton />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
              >
                Accedi
              </Link>
              <Link
                href="/register"
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-xs transition-colors"
              >
                Registrati
              </Link>
            </div>
          )}
        </div>
      </div>
      {/* Mobile nav */}
      <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center justify-around text-xs font-medium text-slate-600 bg-slate-50">
        <Link href="/segnalazioni" className="py-1 hover:text-blue-600">Segnalazioni</Link>
        <Link href="/mappa" className="py-1 hover:text-blue-600">Mappa</Link>
        <Link href="/classifica" className="py-1 hover:text-blue-600">Classifica</Link>
        {user?.ruolo === 'COMITATO' && (
          <Link href="/comitato" className="py-1 text-amber-600 font-semibold">Comitato</Link>
        )}
      </div>
    </header>
  );
}
