'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLinksProps {
  isComitato?: boolean;
}

export function DesktopNavLinks({ isComitato }: NavLinksProps) {
  const pathname = usePathname();
  const isHome = pathname === '/';

  return (
    <nav className="hidden md:flex items-center gap-1 lg:gap-2" aria-label="Navigazione principale">
      <Link
        href="/"
        className={`nav-link ${isHome ? 'nav-link-active' : ''}`}
        aria-current={isHome ? 'page' : undefined}
      >
        Home
      </Link>

      <Link
        href="/segnalazioni"
        className={`nav-link ${pathname === '/segnalazioni' ? 'nav-link-active' : ''}`}
        aria-current={pathname === '/segnalazioni' ? 'page' : undefined}
      >
        Esplora
      </Link>

      <Link
        href="/mappa"
        className={`nav-link ${pathname === '/mappa' ? 'nav-link-active' : ''}`}
        aria-current={pathname === '/mappa' ? 'page' : undefined}
      >
        Mappa
      </Link>

      <Link
        href="/classifica"
        className={`nav-link ${pathname === '/classifica' ? 'nav-link-active' : ''}`}
        aria-current={pathname === '/classifica' ? 'page' : undefined}
      >
        Priorità
      </Link>

      {isComitato && (
        <Link
          href="/comitato"
          className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border transition-colors ${
            pathname.startsWith('/comitato')
              ? 'bg-amber-100 text-amber-900 border-amber-400'
              : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
          }`}
          aria-current={pathname.startsWith('/comitato') ? 'page' : undefined}
        >
          Comitato
        </Link>
      )}
    </nav>
  );
}

export function MobileNavLinks({ isComitato }: NavLinksProps) {
  const pathname = usePathname();
  const isHome = pathname === '/';

  return (
    <div className="flex md:hidden items-center justify-between gap-1 py-2 border-t border-[var(--border-light)] overflow-x-auto text-xs" aria-label="Navigazione mobile">
      <Link
        href="/"
        className={`px-2.5 py-1 rounded font-semibold transition-colors ${
          isHome
            ? 'text-[var(--forest-700)] bg-[var(--bg-subtle-tint)] font-bold'
            : 'text-[var(--text-secondary)] hover:text-[var(--forest-700)]'
        }`}
        aria-current={isHome ? 'page' : undefined}
      >
        Home
      </Link>

      <Link
        href="/segnalazioni"
        className={`px-2.5 py-1 rounded font-semibold transition-colors ${
          pathname === '/segnalazioni'
            ? 'text-[var(--forest-700)] bg-[var(--bg-subtle-tint)] font-bold'
            : 'text-[var(--text-secondary)] hover:text-[var(--forest-700)]'
        }`}
        aria-current={pathname === '/segnalazioni' ? 'page' : undefined}
      >
        Esplora
      </Link>

      <Link
        href="/mappa"
        className={`px-2.5 py-1 rounded font-semibold transition-colors ${
          pathname === '/mappa'
            ? 'text-[var(--forest-700)] bg-[var(--bg-subtle-tint)] font-bold'
            : 'text-[var(--text-secondary)] hover:text-[var(--forest-700)]'
        }`}
        aria-current={pathname === '/mappa' ? 'page' : undefined}
      >
        Mappa
      </Link>

      <Link
        href="/classifica"
        className={`px-2.5 py-1 rounded font-semibold transition-colors ${
          pathname === '/classifica'
            ? 'text-[var(--forest-700)] bg-[var(--bg-subtle-tint)] font-bold'
            : 'text-[var(--text-secondary)] hover:text-[var(--forest-700)]'
        }`}
        aria-current={pathname === '/classifica' ? 'page' : undefined}
      >
        Priorità
      </Link>

      {isComitato && (
        <Link
          href="/comitato"
          className={`px-2 py-1 rounded font-bold transition-colors ${
            pathname.startsWith('/comitato')
              ? 'text-amber-900 bg-amber-100 border border-amber-300'
              : 'text-amber-800 bg-amber-50'
          }`}
          aria-current={pathname.startsWith('/comitato') ? 'page' : undefined}
        >
          Comitato
        </Link>
      )}
    </div>
  );
}
