import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';
import { getDettaglioSegnalazione } from '@/lib/domain/segnalazioni';
import SostegnoButton from '@/components/sostegno-button';
import RitiraButton from '@/components/ritira-button';

interface PageProps {
  params: Promise<{ id: string }>;
}

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
    IN_REVISIONE: { cls: 'badge badge-mod-revisione', label: 'In revisione comitato' },
    APPROVATA:    { cls: 'badge badge-mod-approvata', label: 'Approvata dal comitato' },
    RIFIUTATA:    { cls: 'badge badge-mod-rifiutata', label: 'Non ammessa' },
  };
  const { cls, label } = map[stato] ?? { cls: 'badge badge-categoria', label: stato };
  return <span className={cls}>{label}</span>;
}

export default async function SegnalazioneDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  const seg = await getDettaglioSegnalazione(id, user?.id, user?.ruolo);

  if (!seg) notFound();

  const isAutore = !!user && user.id === seg.autore_id;
  const isComitato = !!user && user.ruolo === 'COMITATO';
  const canRitirare = (isAutore || isComitato) && seg.stato_avanzamento !== 'RITIRATA';

  return (
    <main className="page-container py-8 flex flex-col gap-6">
      {/* Percorso di navigazione */}
      <nav aria-label="Percorso" className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <Link href="/" className="hover:underline text-[var(--blue-primary)]">Home</Link>
        <span>&rsaquo;</span>
        <Link href="/segnalazioni" className="hover:underline text-[var(--blue-primary)]">Segnalazioni</Link>
        <span>&rsaquo;</span>
        <span className="font-mono text-[var(--text-muted)]">ID: {id.slice(0, 8)}</span>
      </nav>

      {/* Avviso se la segnalazione non è pubblica */}
      {!seg.isPubblica && (
        <div className="alert alert-warning" role="alert">
          <div>
            <strong>Visibilità riservata.</strong> Questa segnalazione si trova nello stato di moderazione{' '}
            <strong>{seg.stato_moderazione}</strong> e non è visibile al pubblico.
          </div>
          {isComitato && (
            <Link href="/comitato" className="btn btn-secondary btn-sm ml-auto">
              Vai alla coda di gestione &rarr;
            </Link>
          )}
        </div>
      )}

      {/* Scheda principale della segnalazione */}
      <article className="panel flex flex-col gap-6">
        {/* Testata della scheda */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--border-light)] pb-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <StatoBadge stato={seg.stato_avanzamento} />
              <ModerazioneBadge stato={seg.stato_moderazione} />
              <span className="text-xs text-[var(--text-muted)] font-mono">
                Rev. {seg.revisione}
              </span>
              {seg.categorie.map(c => (
                <span key={c.categoria.id} className="badge badge-categoria">
                  {c.categoria.nome}
                </span>
              ))}
            </div>

            <h1 className="page-title text-xl sm:text-2xl mt-1">
              {seg.descrizione.length > 80 ? `${seg.descrizione.slice(0, 80)}…` : seg.descrizione}
            </h1>

            <p className="text-xs text-[var(--text-muted)] mt-1.5">
              Inserita il{' '}
              <time dateTime={new Date(seg.creata_il).toISOString()}>
                {new Date(seg.creata_il).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
              </time>
              {' '}da {seg.autore.nome} {seg.autore.cognome?.[0] ? `${seg.autore.cognome[0]}.` : ''}
            </p>
          </div>

          {canRitirare && (
            <div className="shrink-0">
              <RitiraButton segnalazioneId={seg.id} revisione={seg.revisione} />
            </div>
          )}
        </div>

        {/* Chiarimento istituzionale su moderazione vs avanzamento */}
        <div className="panel-subtle text-xs text-[var(--text-secondary)] border-l-4 border-l-[var(--blue-primary)] flex flex-col gap-1">
          <span className="font-bold text-[var(--text-primary)]">
            Guida alla comprensione dello stato:
          </span>
          <p>
            <strong>Approvazione della moderazione:</strong> conferma che il testo e gli allegati rispettano le linee guida 
            e sono pertinenti al territorio locale.
          </p>
          <p>
            <strong>Stato di avanzamento:</strong> descrive l&rsquo;iter civico (Ricevuta &rarr; In carico al comitato &rarr; Trasmessa ai candidati). 
            <em> L&rsquo;approvazione del comitato non equivale alla risoluzione materiale del problema sul territorio.</em>
          </p>
        </div>

        {/* Testo completo della segnalazione */}
        <div>
          <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
            Descrizione completa
          </h2>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-line bg-[var(--bg-subtle)] p-4 rounded-[var(--radius-sm)] border border-[var(--border-light)]">
            {seg.descrizione}
          </p>
        </div>

        {/* Allegati fotografici e documentali (se presenti) */}
        {seg.media.length > 0 && (
          <div>
            <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Documentazione allegata ({seg.media.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {seg.media.map((m) => (
                <div
                  key={m.id}
                  className="border border-[var(--border-medium)] rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-subtle)] flex flex-col items-center justify-center p-2"
                >
                  {m.tipo === 'FOTO' ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/media/${m.id}`}
                      alt="Allegato segnalazione documentato dal cittadino"
                      className="max-h-56 w-auto object-contain rounded-[var(--radius-xs)]"
                    />
                  ) : (
                    <video controls src={`/api/media/${m.id}`} className="max-h-56 w-full rounded-[var(--radius-xs)]">
                      Il tuo browser non supporta il tag video.
                    </video>
                  )}
                  <span className="text-[0.6875rem] text-[var(--text-muted)] mt-1.5">
                    {m.tipo} &bull; {(m.byte_size / 1024).toFixed(0)} KB &bull; Accesso protetto
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Localizzazione territoriale */}
        <div>
          <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
            Localizzazione territoriale
          </h2>
          <div className="panel-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-semibold text-[var(--text-primary)]">Coordinate geografiche: </span>
              <span className="font-mono text-[var(--text-secondary)]">
                {seg.latitudine.toFixed(6)}, {seg.longitudine.toFixed(6)}
              </span>
              <span className="ml-2 text-[var(--text-muted)]">
                (Rilevamento: {seg.origine_posizione.toLowerCase()})
              </span>
            </div>
            <a
              href={`https://www.openstreetmap.org/?mlat=${seg.latitudine}&mlon=${seg.longitudine}#map=16/${seg.latitudine}/${seg.longitudine}`}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--blue-primary)] font-semibold hover:underline inline-flex items-center gap-1"
            >
              Consulta mappa territoriale &rarr;
            </a>
          </div>
        </div>

        {/* Blocco separato di Sostegno Civico */}
        {seg.isPubblica && (
          <div className="border-t border-[var(--border-light)] pt-6 mt-2">
            <div className="panel bg-[var(--bg-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Sostegno civico dei residenti
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Il sostegno esprime l&rsquo;accordo della comunità sulla rilevanza prioritaria di questa segnalazione.
                </p>
              </div>
              <div className="shrink-0">
                <SostegnoButton
                  segnalazioneId={seg.id}
                  totaleSostegni={seg.totaleSostegniValidi}
                  inizialmenteSostenuto={seg.utenteHaSostenuto}
                  isAutore={isAutore}
                  isAuthenticated={!!user}
                />
              </div>
            </div>
          </div>
        )}
      </article>

      {/* Cronologia e registro decisioni */}
      <section className="panel" aria-labelledby="cronologia-title">
        <h2 id="cronologia-title" className="section-title text-base mb-4">
          Registro delle decisioni e avanzamento
        </h2>

        {seg.eventi_stato.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            Nessun evento ancora registrato per questa segnalazione.
          </p>
        ) : (
          <ol className="flex flex-col gap-3 m-0 p-0 list-none">
            {seg.eventi_stato.map((ev, idx) => (
              <li
                key={ev.id}
                className="panel-subtle text-xs flex flex-col sm:flex-row sm:items-start justify-between gap-2"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-[var(--text-primary)]">
                      Passaggio #{idx + 1}:
                    </span>
                    <span className="font-mono text-[var(--text-secondary)]">
                      {ev.da_stato ? `${ev.da_stato} → ` : ''}{ev.a_stato}
                    </span>
                    <span className="text-[var(--text-muted)] font-mono">
                      (Ambito: {ev.ambito})
                    </span>
                  </div>

                  {ev.motivazione && (
                    <p className="text-[var(--text-secondary)] italic mb-1">
                      &ldquo;{ev.motivazione}&rdquo;
                    </p>
                  )}

                  <p className="text-[var(--text-muted)] text-[0.6875rem]">
                    Attore: {ev.tipo_attore}
                    {ev.attore ? ` (${ev.attore.nome} ${ev.attore.cognome?.[0] ? `${ev.attore.cognome[0]}.` : ''})` : ''}
                    {' '}&bull; Revisione: {ev.revisione}
                  </p>
                </div>

                <time dateTime={new Date(ev.creato_il).toISOString()} className="text-[var(--text-muted)] text-right shrink-0">
                  {new Date(ev.creato_il).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}