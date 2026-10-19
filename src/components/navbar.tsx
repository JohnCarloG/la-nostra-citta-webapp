import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';
import LogoutButton from '@/app/(dashboard)/dashboard/logout-button';

export default async function Navbar() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-[var(--border-light)] bg-white sticky top-0 z-50">
      {/* Barra superiore di contesto istituzionale */}
      <div className="bg-[var(--bg-subtle)] border-b border-[var(--border-light)] text-xs text-[var(--text-secondary)] py-1.5">
        <div className="page-container flex items-center justify-between">
          <span>Iniziativa civica locale per la trasparenza e la cura del territorio</span>
          <span className="hidden sm:inline">Consultazione partecipata prima delle elezioni</span>
        </div>
      </div>

      {/* Testata principale */}
      <div className="page-container py-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Identità del progetto */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex flex-col text-decoration-none group" aria-label="Home page La Nostra Città">
              <span className="text-lg font-bold text-[var(--blue-primary)] tracking-tight leading-tight group-hover:underline">
                La Nostra Città, Il Nostro Futuro
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                Piattaforma civica per le priorità urbane e la partecipazione territoriale
              </span>
            </Link>
          </div>

          {/* Azioni rapide di testata */}
          <div className="flex items-center gap-3 shrink-0 self-start md:self-auto">
            {user ? (
              <div className="flex items-center gap-2 text-sm">
                <Link
                  href="/dashboard"
                  className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--blue-primary)] px-2 py-1 border border-[var(--border-medium)] rounded-[var(--radius-sm)]"
                >
                  Area personale ({user.nome})
                </Link>
                <LogoutButton />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <Link
                  href="/login"
                  className="text-xs font-semibold text-[var(--blue-primary)] hover:underline px-2.5 py-1"
                >
                  Accedi
                </Link>
                <Link
                  href="/register"
                  className="text-xs font-semibold text-[var(--text-secondary)] border border-[var(--border-medium)] rounded-[var(--radius-sm)] px-2.5 py-1 hover:bg-[var(--bg-subtle)]"
                >
                  Registrati
                </Link>
              </div>
            )}

            <Link
              href={user ? "/dashboard#nuova-segnalazione" : "/login?redirect=/dashboard"}
              className="btn btn-primary btn-sm"
              id="header-invia-segnalazione"
            >
              Invia una segnalazione
            </Link>
          </div>
        </div>
      </div>

      {/* Barra di navigazione stabile */}
      <nav className="border-t border-[var(--border-light)] bg-white" aria-label="Menu principale">
        <div className="page-container">
          <ul className="flex items-center gap-6 overflow-x-auto py-2 text-sm font-medium list-none m-0 p-0">
            <li>
              <Link href="/segnalazioni" className="nav-link">
                Segnalazioni
              </Link>
            </li>
            <li>
              <Link href="/mappa" className="nav-link">
                Mappa
              </Link>
            </li>
            <li>
              <Link href="/classifica" className="nav-link">
                Priorità
              </Link>
            </li>
            <li>
              <Link href="/#come-funziona" className="nav-link">
                Come funziona
              </Link>
            </li>
            {user?.ruolo === 'COMITATO' && (
              <li className="ml-auto">
                <Link
                  href="/comitato"
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--warning-bg)] text-[var(--warning-text)] border border-[var(--warning-border)]"
                >
                  Area Comitato
                </Link>
              </li>
            )}
          </ul>
        </div>
      </nav>
    </header>
  );
}
