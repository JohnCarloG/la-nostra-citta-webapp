import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';
import {
  getCodaRevisioniComitato,
  getTutteSegnalazioniComitato,
  getCategorieAttive
} from '@/lib/domain/segnalazioni';
import ComitatoActionsForm from './comitato-actions-form';

interface PageProps {
  searchParams: Promise<{ filtro?: string }>;
}

function StatoBadge({ stato, tipo }: { stato: string; tipo: 'mod' | 'avanz' }) {
  const modMap: Record<string, { cls: string; label: string }> = {
    PENDENTE:     { cls: 'badge badge-mod-pendente',  label: 'In attesa' },
    IN_REVISIONE: { cls: 'badge badge-mod-revisione', label: 'In revisione' },
    APPROVATA:    { cls: 'badge badge-mod-approvata', label: 'Approvata' },
    RIFIUTATA:    { cls: 'badge badge-mod-rifiutata', label: 'Rifiutata' },
  };
  const avanzMap: Record<string, { cls: string; label: string }> = {
    RICEVUTA:             { cls: 'badge badge-ricevuta',  label: 'Ricevuta' },
    PRESA_IN_CARICO:      { cls: 'badge badge-carico',    label: 'In carico' },
    INVIATA_AI_CANDIDATI: { cls: 'badge badge-candidati', label: 'Ai candidati' },
    RITIRATA:             { cls: 'badge badge-ritirata',  label: 'Ritirata' },
  };
  const map = tipo === 'mod' ? modMap : avanzMap;
  const item = map[stato] ?? { cls: 'badge badge-categoria', label: stato.replace(/_/g, ' ') };
  return <span className={item.cls}>{item.label}</span>;
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

  return (
    <main className="page-container py-8 flex flex-col gap-8">
      {/* Testata istituzionale */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-light)] pb-4">
        <div>
          <h1 className="page-title text-xl sm:text-2xl">
            Area operativa del Comitato di Garanzia
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Operatore: <strong>{user.nome} {user.cognome}</strong> &bull; Ogni decisione viene registrata con firma e motivazione nel registro di audit.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="badge badge-mod-revisione font-bold">
            {coda.length} in coda di verifica
          </span>
          <span className="badge badge-categoria">
            {tutte.length} totali gestite
          </span>
        </div>
      </div>

      {/* ── SEZIONE 1: CODA DELLE REVISIONI PRIORITARIE ── */}
      <section className="panel" aria-labelledby="coda-title">
        <div className="border-b border-[var(--border-light)] pb-3 mb-4 flex items-center justify-between">
          <div>
            <h2 id="coda-title" className="section-title text-base">
              Coda di verifica e moderazione ({coda.length})
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Segnalazioni in attesa di ammissione pubblica o revisione da parte del comitato
            </p>
          </div>
        </div>

        {coda.length === 0 ? (
          <div className="empty-state py-6">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Nessuna segnalazione pendente nella coda di verifica
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Tutte le segnalazioni inserite sono state valutate e deliberate.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {coda.map((seg) => (
              <div
                key={seg.id}
                className="panel-subtle border-l-4 border-l-[var(--warning-text)] flex flex-col gap-4"
              >
                {/* Intestazione scheda in coda */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-[var(--border-light)] pb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <StatoBadge stato={seg.stato_moderazione} tipo="mod" />
                      <StatoBadge stato={seg.stato_avanzamento} tipo="avanz" />
                      <span className="text-[0.6875rem] font-mono text-[var(--text-muted)]">
                        Rev. {seg.revisione}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        Inserita il {new Date(seg.creata_il).toLocaleDateString('it-IT')} da {seg.autore.nome} {seg.autore.cognome?.[0]}.
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      {seg.descrizione}
                    </h3>
                  </div>

                  <Link
                    href={`/segnalazioni/${seg.id}`}
                    className="btn btn-secondary btn-sm self-start"
                    target="_blank"
                  >
                    Vedi scheda pubblica ↗
                  </Link>
                </div>

                {/* Allegati */}
                {seg.media.length > 0 && (
                  <div className="text-xs text-[var(--text-secondary)]">
                    <span className="font-semibold block mb-1">Allegati di documentazione:</span>
                    <div className="flex gap-2 flex-wrap">
                      {seg.media.map((m) => (
                        <a
                          key={m.id}
                          href={`/api/media/${m.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 rounded-[var(--radius-xs)] border border-[var(--border-medium)] bg-white hover:bg-[var(--bg-subtle)] text-[var(--blue-primary)]"
                        >
                          Apri {m.tipo} ({(m.byte_size / 1024).toFixed(0)} KB) ↗
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Form operativo di delibera e categorizzazione */}
                <div className="bg-white p-3 rounded-[var(--radius-sm)] border border-[var(--border-light)]">
                  <ComitatoActionsForm
                    segnalazioneId={seg.id}
                    statoModerazione={seg.stato_moderazione}
                    statoAvanzamento={seg.stato_avanzamento}
                    revisione={seg.revisione}
                    categorieDisponibili={categorie.map(c => ({ id: c.id, nome: c.nome }))}
                    categorieAssegnateIds={seg.categorie.map(c => c.categoria.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── SEZIONE 2: REGISTRO COMPLETO DELLE SEGNALAZIONI ── */}
      <section className="panel" aria-labelledby="registro-title">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-light)] pb-3 mb-4">
          <div>
            <h2 id="registro-title" className="section-title text-base">
              Registro generale e archivio decisioni ({tutte.length})
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Consultazione di tutte le segnalazioni gestite e storico delle deliberazioni
            </p>
          </div>

          {/* Filtro per stato */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {FILTRI.map((f) => (
              <Link
                key={f.value}
                href={f.value ? `/comitato?filtro=${f.value}` : '/comitato'}
                className={`px-2 py-1 rounded-[var(--radius-xs)] border transition-colors ${
                  filtroAttivo === f.value
                    ? 'bg-[var(--blue-primary)] text-white border-[var(--blue-primary)] font-semibold'
                    : 'bg-white text-[var(--text-secondary)] border-[var(--border-medium)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>

        {tutte.length === 0 ? (
          <div className="empty-state py-6">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Nessuna segnalazione corrisponde al filtro selezionato
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table" aria-label="Registro generale delle segnalazioni">
              <thead>
                <tr>
                  <th scope="col">Segnalazione</th>
                  <th scope="col" className="w-28 text-center">Moderazione</th>
                  <th scope="col" className="w-32 text-center">Avanzamento</th>
                  <th scope="col" className="w-20 text-center">Rev.</th>
                  <th scope="col" className="w-24 text-center">Data</th>
                  <th scope="col" className="w-20 text-right">Azione</th>
                </tr>
              </thead>
              <tbody>
                {tutte.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <p className="font-semibold text-sm line-clamp-1 mb-0.5">
                        <Link href={`/segnalazioni/${s.id}`} className="hover:text-[var(--blue-primary)] hover:underline">
                          {s.descrizione}
                        </Link>
                      </p>
                      <div className="flex gap-1 flex-wrap">
                        {s.categorie?.map((c) => (
                          <span key={c.categoria.id} className="badge badge-categoria text-[0.625rem]">
                            {c.categoria.nome}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-center">
                      <StatoBadge stato={s.stato_moderazione} tipo="mod" />
                    </td>
                    <td className="text-center">
                      <StatoBadge stato={s.stato_avanzamento} tipo="avanz" />
                    </td>
                    <td className="text-center font-mono text-xs text-[var(--text-muted)]">
                      {s.revisione}
                    </td>
                    <td className="text-center text-xs text-[var(--text-muted)]">
                      {new Date(s.creata_il).toLocaleDateString('it-IT')}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/segnalazioni/${s.id}`}
                        className="btn btn-secondary btn-sm text-xs py-0.5 px-2"
                      >
                        Scheda
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}