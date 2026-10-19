import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/navbar';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'La Nostra Città, Il Nostro Futuro | Piattaforma Civica Territoriale',
  description: 'Piattaforma digitale per la raccolta, gestione trasparente e monitoraggio certificato delle priorità civiche urbane.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <Navbar />
        <div className="flex-1 flex flex-col">{children}</div>
        <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
          <div className="max-w-6xl mx-auto px-4">
            <p>&copy; {new Date().getFullYear()} La Nostra Città, Il Nostro Futuro &bull; Piattaforma Civica Territoriale Trasparente</p>
            <p className="mt-1 text-slate-400">Verifica integrità transazionale &bull; Modello dati certificato</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
