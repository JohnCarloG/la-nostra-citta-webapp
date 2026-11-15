import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';
import {
  getCodaRevisioniComitato,
  getTutteSegnalazioniComitato,
  getCategorieAttive
} from '@/lib/domain/segnalazioni';
import ComitatoDashboardClient from './comitato-dashboard-client';

interface PageProps {
  searchParams: Promise<{ filtro?: string }>;
}

const FILTRI = [
  { value: '',                    label: 'Tutte le segnalazioni' },
  { value: 'APPROVATA',           label: 'Solo approvate' },
  { value: 'RIFIUTATA',           label: 'Solo rifiutate' },
  { value: 'PRESA_IN_CARICO',    label: 'In carico comitato' },
  { value: 'INVIATA_AI_CANDIDATI',label: 'Trasmessa candidati' },
];

export default async function ComitatoPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();

  if (!user) redirect('/login');

  if (user.ruolo !== 'COMITATO') {
    return (
      <main className="page-container py-12 text-center flex flex-col items-center gap-3">
        <h1 className="page-title text-xl">Accesso riservato al Comitato di Garanzia</h1>
        <p className="text-xs text-[var(--text-secondary)] max-w-md">
          L&rsquo;utenza corrente ({user.email_normalizzata}) non possiede le autorizzazioni da membro del comitato.
        </p>
        <Link href="/dashboard" className="btn btn-secondary btn-sm mt-2">
          Torna all&rsquo;area personale
        </Link>
      </main>
    );
  }

  const params = await searchParams;
  const filtroAttivo = params.filtro || '';

  const [coda, tutte, categorie] = await Promise.all([
    getCodaRevisioniComitato(),
    getTutteSegnalazioniComitato(filtroAttivo || undefined),
    getCategorieAttive()
  ]);

  const categorieOptions = categorie.map(c => ({ id: c.id, nome: c.nome }));

  return (
    <main className="page-container py-8 flex flex-col gap-8">
      {/* Testata istituzionale */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-light)] pb-3">
        <div>
          <h1 className="page-title text-xl sm:text-2xl">
            Area comitato
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Operatore: <strong>{user.nome} {user.cognome}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/dossier"
            className="btn btn-secondary btn-xs flex items-center gap-1 font-semibold"
            id="comitato-link-dossier"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>Dossier candidati</span>
          </Link>
          <span className="badge badge-mod-revisione font-bold">
            {coda.length} da esaminare
          </span>
          <span className="badge badge-categoria">
            {tutte.length} nel registro
          </span>
        </div>
      </div>

      {/* Sezioni Coda e Registro gestite con stato unificato per garantire un solo pannello aperto */}
      <ComitatoDashboardClient
        coda={coda}
        tutte={tutte}
        categorie={categorieOptions}
        filtroAttivo={filtroAttivo}
        filtri={FILTRI}
      />
    </main>
  );
}
