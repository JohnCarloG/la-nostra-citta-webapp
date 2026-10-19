import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/navbar';

export const metadata: Metadata = {
  title: 'La Nostra Città, Il Nostro Futuro | Piattaforma Civica',
  description: 'Piattaforma civica per raccogliere, documentare e sostenere le priorità del territorio prima delle consultazioni elettorali.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className="h-full">
      <body className="min-h-full flex flex-col bg-white text-[var(--text-primary)] font-sans antialiased">
        <a href="#main-content" className="skip-link">
          Vai al contenuto principale
        </a>
        <Navbar />
        <div id="main-content" className="flex-1 flex flex-col">
          {children}
        </div>
        <footer className="border-t border-[var(--border-light)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-xs py-8 mt-12">
          <div className="page-container">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <p className="font-bold text-[var(--text-primary)] text-sm mb-1">
                  La Nostra Città, Il Nostro Futuro
                </p>
                <p className="text-[var(--text-muted)] max-w-xl">
                  Iniziativa civica indipendente di partecipazione per documentare e organizzare le priorità del territorio. 
                  Tutte le segnalazioni e le decisioni del comitato di garanzia sono tracciate e verificabili.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 shrink-0 text-[var(--text-secondary)]">
                <a href="/segnalazioni" className="hover:underline">Elenco segnalazioni</a>
                <a href="/mappa" className="hover:underline">Mappa territoriale</a>
                <a href="/classifica" className="hover:underline">Priorità civiche</a>
                <a href="/#come-funziona" className="hover:underline">Guida al servizio</a>
              </div>
            </div>
            <div className="border-t border-[var(--border-medium)] pt-4 mt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[var(--text-muted)]">
              <span>&copy; {new Date().getFullYear()} La Nostra Città, Il Nostro Futuro</span>
              <span>Protezione media riservati &bull; Registro eventi e audit tracciato</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
