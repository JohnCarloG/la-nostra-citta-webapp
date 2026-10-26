import { getCurrentUser } from '@/actions/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import NuovaSegnalazioneForm from './nuova-segnalazione-form';
import CompletaProfiloBanner from '@/components/completa-profilo-banner';

function StatoBadge({ stato }: { stato: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    RICEVUTA:             { cls: 'badge badge-ricevuta',  label: 'Ricevuta' },
    PRESA_IN_CARICO:      { cls: 'badge badge-carico',    label: 'In carico al comitato' },
    INVIATA_AI_CANDIDATI: { cls: 'badge badge-candidati', label: 'Trasmessa ai candidati' },
    RITIRATA:             { cls: 'badge badge-ritirata',  label: 'Ritirata' },
  };
  const { cls, label } = map[stato] ?? { cls: 'badge badge-categoria', label: stato.replace(/_/g, ' ') };
  return <span className={cls}>{label}</span>;
}

function ModerazioneBadge({ stato }: { stato: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    PENDENTE:     { cls: 'badge badge-mod-pendente',  label: 'In attesa di verifica' },
    IN_REVISIONE: { cls: 'badge badge-mod-revisione', label: 'In revisione' },
    APPROVATA:    { cls: 'badge badge-mod-approvata', label: 'Approvata' },
    RIFIUTATA:    { cls: 'badge badge-mod-rifiutata', label: 'Rifiutata' },
  };
  const { cls, label } = map[stato] ?? { cls: 'badge badge-categoria', label: stato };
  return <span className={cls}>{label}</span>;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const isComitato = user.ruolo === 'COMITATO';

  const quartieriUfficiali = await prisma.quartiere.findMany({
    where: { is_ufficiale: true },
    select: { id: true, nome: true, codice: true, is_ufficiale: true },
    orderBy: { nome: 'asc' },
  });

  type SegnalazioneConCategorie = Prisma.SegnalazioneGetPayload<{
    include: {
      categorie: {
        include: { categoria: true }
      };
      _count: {
        select: { sostegni: true }
      };
    }
  }>;

  // Recupero delle segnalazioni inserite dall'utente loggato
  let mieSegnalazioni: SegnalazioneConCategorie[] = [];
  try {
    mieSegnalazioni = await prisma.segnalazione.findMany({
      where: { autore_id: user.id },
      orderBy: { creata_il: 'desc' },
      include: {
        categorie: {
          include: { categoria: true }
        },
        _count: {
          select: { sostegni: true }
        }
      }
    });
  } catch (err) {
    console.error('Errore recupero segnalazioni utente:', err);
  }

  return (
    <main className="page-container py-8 flex flex-col gap-8">
      {/* Testata di benvenuto istituzionale */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-light)] pb-4">
        <div>
          <h1 className="page-title text-xl sm:text-2xl">
            Area personale di {user.nome} {user.cognome}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Account: <strong>{user.email_normalizzata}</strong> &bull; Ruolo: <strong>{user.ruolo}</strong> &bull; Residenza: <strong>{user.quartiere?.nome || 'Non specificato'}</strong>
            {user.quartiere && !user.quartiere.is_ufficiale && (
              <span className="ml-1 text-amber-700 font-semibold">(catalogazione preliminare)</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isComitato && (
            <Link
              href="/comitato"
              className="btn btn-secondary btn-sm border-[var(--warning-border)] text-[var(--warning-text)] bg-[var(--warning-bg)]"
            >
              Coda operativa Comitato &rarr;
            </Link>
          )}
        </div>
      </div>

      {/* Banner di conferma/completamento quartiere NIL se preliminare o mancante */}
      <CompletaProfiloBanner user={user} quartieri={quartieriUfficiali} />

      {/* Form di inserimento nuova segnalazione */}
      <div id="nuova-segnalazione">
        <NuovaSegnalazioneForm />
      </div>

      {/* Elenco reale delle proprie segnalazioni */}
      <section className="panel" aria-labelledby="mie-segnalazioni-title">
        <div className="flex items-center justify-between border-b border-[var(--border-light)] pb-3 mb-4">
          <h2 id="mie-segnalazioni-title" className="section-title text-base">
            Le tue segnalazioni ({mieSegnalazioni.length})
          </h2>
          <span className="text-xs text-[var(--text-muted)]">
            Stato e tracciamento in tempo reale
          </span>
        </div>

        {mieSegnalazioni.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Non hai ancora inserito alcuna segnalazione
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
              Utilizza il modulo sopra per inviare la tua prima segnalazione documentata per il territorio.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {mieSegnalazioni.map((seg) => (
              <div
                key={seg.id}
                className="panel-subtle flex flex-col sm:flex-row sm:items-start justify-between gap-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <StatoBadge stato={seg.stato_avanzamento} />
                    <ModerazioneBadge stato={seg.stato_moderazione} />
                    <span className="text-[0.6875rem] font-mono text-[var(--text-muted)]">
                      Rev. {seg.revisione}
                    </span>
                    {seg.categorie.map((c) => (
                      <span key={c.categoria.id} className="badge badge-categoria">
                        {c.categoria.nome}
                      </span>
                    ))}
                  </div>

                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    <Link href={`/segnalazioni/${seg.id}`} className="hover:text-[var(--blue-primary)] hover:underline">
                      {seg.descrizione}
                    </Link>
                  </h3>

                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-1.5">
                    <span>Inserita il {new Date(seg.creata_il).toLocaleDateString('it-IT')}</span>
                    <span>&bull;</span>
                    <span>Sostegni ricevuti: <strong>{seg._count.sostegni}</strong></span>
                  </div>
                </div>

                <div className="shrink-0 self-start sm:self-center">
                  <Link
                    href={`/segnalazioni/${seg.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Visualizza scheda
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}