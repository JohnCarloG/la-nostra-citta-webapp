import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/navbar';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'La Nostra Città, Il Nostro Futuro | Piattaforma Civica Partecipata',
  description: 'Piattaforma civica aperta per raccogliere, sostenere e seguire le priorità del tuo quartiere insieme alla comunità locale.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col bg-white text-[var(--text-primary)] font-sans antialiased">
        <a href="#main-content" className="skip-link">
          Vai al contenuto principale
        </a>
        
        {/* Banner discreto ambiente dimostrativo */}
        <aside aria-label="Indicazione ambiente dimostrativo" className="bg-[var(--bg-subtle)] border-b border-[var(--border-light)] py-1.5 px-4 text-center">
          <div className="page-container flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden="true"></span>
            <span>
              <strong>Ambiente dimostrativo</strong>: dati sintetici per la valutazione funzionale delle proposte sul territorio di Milano.
            </span>
          </div>
        </aside>

        {/* Header principale della piattaforma */}
        <Navbar />

        {/* Contenuto dinamico della pagina */}
        <div id="main-content" className="flex-1 flex flex-col">
          {children}
        </div>

        {/* Footer essenziale, chiaro e umano */}
        <footer className="border-t border-[var(--border-light)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-sm py-12 mt-16">
          <div className="page-container">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-[var(--border-light)]">
              {/* Missione e identità */}
              <div className="md:col-span-6 flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-[var(--forest-700)] text-white flex items-center justify-center font-bold text-sm">
                    NC
                  </span>
                  <span className="font-display font-extrabold text-[var(--forest-900)] text-lg tracking-tight">
                    La Nostra Città, Il Nostro Futuro
                  </span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-lg">
                  Uno spazio civico indipendente e partecipato per dare voce a chi vive ogni giorno la città.
                  Segnala ciò che non va, sostieni le proposte del tuo quartiere e contribuisci a portare le priorità reali della comunità all’attenzione pubblica.
                </p>
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--forest-700)] mt-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--emerald-accent)]"></span>
                  Piattaforma civica aperta e indipendente
                </div>
              </div>

              {/* Navigazione rapida */}
              <div className="md:col-span-3 flex flex-col gap-2.5">
                <span className="font-display font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
                  Esplora la città
                </span>
                <Link href="/segnalazioni" className="text-sm text-[var(--text-secondary)] hover:text-[var(--forest-700)] transition-colors">
                  Tutte le segnalazioni
                </Link>
                <Link href="/mappa" className="text-sm text-[var(--text-secondary)] hover:text-[var(--forest-700)] transition-colors">
                  Mappa del territorio
                </Link>
                <Link href="/classifica" className="text-sm text-[var(--text-secondary)] hover:text-[var(--forest-700)] transition-colors">
                  Priorità più sostenute
                </Link>
                <Link href="/#come-funziona" className="text-sm text-[var(--text-secondary)] hover:text-[var(--forest-700)] transition-colors">
                  Come funziona il percorso
                </Link>
              </div>

              {/* Partecipazione */}
              <div className="md:col-span-3 flex flex-col gap-2.5">
                <span className="font-display font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
                  Partecipa
                </span>
                <Link href="/login" className="text-sm text-[var(--text-secondary)] hover:text-[var(--forest-700)] transition-colors">
                  Accedi al tuo profilo
                </Link>
                <Link href="/register" className="text-sm text-[var(--text-secondary)] hover:text-[var(--forest-700)] transition-colors">
                  Crea un nuovo account
                </Link>
                <Link href="/dashboard#nuova-segnalazione" className="text-sm text-[var(--text-secondary)] hover:text-[var(--forest-700)] transition-colors">
                  Invia una nuova segnalazione
                </Link>
              </div>
            </div>

            {/* Note civiche e copyright */}
            <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-[var(--text-muted)]">
              <span>&copy; {new Date().getFullYear()} La Nostra Città, Il Nostro Futuro &bull; Iniziativa civica indipendente</span>
              <span>Tracciamento pubblico delle priorità comunitarie</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
