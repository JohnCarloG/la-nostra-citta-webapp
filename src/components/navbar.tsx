import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';
import LogoutButton from '@/app/(dashboard)/dashboard/logout-button';
import { DesktopNavLinks, MobileNavLinks } from './nav-links';

export default async function Navbar() {
  const user = await getCurrentUser();
  const isComitato = user?.ruolo === 'COMITATO';

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[var(--border-light)] transition-all">
      <div className="page-container">
        <div className="flex items-center justify-between h-16 md:h-18 gap-3">
          
          {/* Identità del progetto con logo civico */}
          <Link href="/" className="flex items-center gap-2.5 text-decoration-none group shrink-0" aria-label="Home page La Nostra Città">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--forest-800)] to-[var(--forest-600)] text-white flex items-center justify-center font-display font-extrabold text-sm shadow-sm group-hover:scale-105 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18" />
                <path d="M5 21V7l7-4 7 4v14" />
                <path d="M9 10h1" />
                <path d="M14 10h1" />
                <path d="M9 14h1" />
                <path d="M14 14h1" />
                <path d="M9 18h1" />
                <path d="M14 18h1" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-base md:text-lg text-[var(--forest-900)] leading-tight tracking-tight group-hover:text-[var(--forest-700)] transition-colors">
                La Nostra Città
              </span>
              <span className="text-xs font-semibold text-[var(--forest-600)] tracking-wide uppercase">
                Partecipazione Civica
              </span>
            </div>
          </Link>

          {/* Navigazione centrale desktop: Home (prima voce), Esplora, Mappa, Priorità */}
          <DesktopNavLinks isComitato={isComitato} />

          {/* Accesso personale e pulsante "Segnala" */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[var(--forest-800)] bg-[var(--forest-light)] hover:bg-[var(--bg-subtle-tint)] px-3 py-1.5 rounded-full border border-[var(--forest-border)] transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="hidden sm:inline">Area personale:</span>
                  <span className="font-bold truncate max-w-[100px]">{user.nome}</span>
                </Link>
                <LogoutButton />
              </div>
            ) : (
              <Link
                href="/login"
                className="text-xs sm:text-sm font-semibold text-[var(--forest-800)] hover:text-[var(--forest-600)] px-2.5 py-1.5 transition-colors"
              >
                Accedi
              </Link>
            )}

            {/* Pulsante primario: "Segnala" */}
            <Link
              href={user ? "/dashboard#nuova-segnalazione" : "/login?redirect=/dashboard"}
              className="btn btn-accent btn-sm shadow-sm"
              id="header-invia-segnalazione"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Segnala</span>
            </Link>
          </div>

        </div>

        {/* Barra di navigazione mobile secondaria con Home come prima voce */}
        <MobileNavLinks isComitato={isComitato} />
      </div>
    </header>
  );
}
