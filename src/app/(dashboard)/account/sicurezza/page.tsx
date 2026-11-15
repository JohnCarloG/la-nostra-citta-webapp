import { getCurrentUser } from '@/actions/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import CambiaPasswordForm from './cambia-password-form';

export const metadata = {
  title: 'Sicurezza Account - Cambia password | La Nostra Città',
  description: 'Modifica la password del tuo profilo civico.',
};

export default async function AccountSicurezzaPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <main className="page-container py-8 max-w-xl flex flex-col gap-6">
      {/* Percorso di navigazione istituzionale: Account → Sicurezza → Cambia password */}
      <nav aria-label="Percorso di navigazione" className="text-xs text-[var(--text-secondary)]">
        <ol className="flex items-center gap-1.5 flex-wrap">
          <li>
            <Link href="/dashboard" className="hover:text-[var(--text-primary)] hover:underline">
              Account
            </Link>
          </li>
          <li aria-hidden="true" className="text-[var(--text-muted)]">&rarr;</li>
          <li>
            <span className="text-[var(--text-secondary)]">Sicurezza</span>
          </li>
          <li aria-hidden="true" className="text-[var(--text-muted)]">&rarr;</li>
          <li aria-current="page" className="font-semibold text-[var(--text-primary)]">
            Cambia password
          </li>
        </ol>
      </nav>

      <div className="border-b border-[var(--border-light)] pb-4">
        <h1 className="page-title text-xl sm:text-2xl mb-1">
          Cambia password
        </h1>
        <p className="text-xs text-[var(--text-secondary)]">
          Aggiorna le credenziali di accesso per l&rsquo;account civico di <strong>{user.nome} {user.cognome}</strong> ({user.email_normalizzata}).
        </p>
      </div>

      <div className="panel-subtle text-xs text-[var(--text-secondary)] flex flex-col gap-1.5 border-l-4 border-l-[var(--forest-600)]">
        <p className="font-semibold text-[var(--text-primary)]">
          Nota di sicurezza sulle sessioni
        </p>
        <p>
          Per proteggere il tuo account, il salvataggio della nuova password revocherà immediatamente tutte le sessioni attive su tutti i dispositivi. Dovrai eseguire nuovamente il login con la nuova chiave d&rsquo;accesso.
        </p>
      </div>

      <CambiaPasswordForm />
    </main>
  );
}
