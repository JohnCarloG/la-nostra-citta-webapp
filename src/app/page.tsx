import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';
import { getSegnalazioniPubbliche } from '@/lib/domain/segnalazioni';

function StatoBadge({ stato }: { stato: string }) {
  const map: Record<string, string> = {
    RICEVUTA: 'badge badge-ricevuta',
    PRESA_IN_CARICO: 'badge badge-carico',
    INVIATA_AI_CANDIDATI: 'badge badge-candidati',
    RITIRATA: 'badge badge-ritirata',
  };
  const label: Record<string, string> = {
    RICEVUTA: 'Ricevuta',
    PRESA_IN_CARICO: 'In carico al comitato',
    INVIATA_AI_CANDIDATI: 'Trasmessa ai candidati',
    RITIRATA: 'Ritirata',
  };
  return <span className={map[stato] ?? 'badge badge-categoria'}>{label[stato] ?? stato.replace(/_/g, ' ')}</span>;
}

export default async function Home() {
  const user = await getCurrentUser();
  let recenti: any[] = [];
  try {
    const res = await getSegnalazioniPubbliche({ pageSize: 4, ordinamento: 'piu_recenti' });
    recenti = res.items;
  } catch (err) {
    console.error('Errore recupero segnalazioni recenti:', err);
  }

  return (
    <main className="flex-1">
      {/* ── INTRODUZIONE CONCRETA AL SERVIZIO ── */}
      <section className="bg-[var(--bg-subtle)] border-b border-[var(--border-light)] py-10 sm:py-14" aria-labelledby="intro-title">
        <div className="page-container">
          <div className="max-w-3xl">
            <h1 id="intro-title" className="page-title mb-3">
              Segnala un problema. Segui i miglioramenti.
            </h1>
            <p className="subheading mb-6 max-w-2xl text-base">
              Uno spazio civico trasparente per documentare le necessità del quartiere, raccogliere il sostegno 
              dei residenti e presentare le priorità del territorio ai candidati alle consultazioni elettorali.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={user ? "/dashboard#nuova-segnalazione" : "/login?redirect=/dashboard"}
                className="btn btn-primary"
                id="hero-invia-btn"
              >
                Invia una segnalazione
              </Link>
              <Link href="/segnalazioni" className="btn btn-secondary">
                Esplora le segnalazioni
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── SEGNALAZIONI RECENTI DEI CITTADINI ── */}
      <section className="py-10 border-b border-[var(--border-light)]" aria-labelledby="recenti-title">
        <div className="page-container">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 id="recenti-title" className="section-title">
                Ultime segnalazioni pubblicate
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Verificate dal comitato di garanzia e aperte al sostegno dei cittadini
              </p>
            </div>
            <Link href="/segnalazioni" className="text-xs font-semibold text-[var(--blue-primary)] hover:underline">
              Vedi tutte &rarr;
            </Link>
          </div>

          {recenti.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Nessuna segnalazione ancora registrata
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
                Sii il primo residente a segnalare una criticità o una proposta per la cura del territorio.
              </p>
              <Link
                href={user ? "/dashboard#nuova-segnalazione" : "/login?redirect=/dashboard"}
                className="btn btn-primary btn-sm mt-3 inline-flex"
              >
                Invia la prima segnalazione
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recenti.map((item) => (
                <article
                  key={item.id}
                  className="panel flex flex-col justify-between hover:border-[var(--blue-primary-border)] transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.categorie?.length > 0 ? (
                          item.categorie.slice(0, 2).map((c: string, idx: number) => (
                            <span key={idx} className="badge badge-categoria">
                              {c}
                            </span>
                          ))
                        ) : (
                          <span className="badge badge-categoria">Segnalazione civica</span>
                        )}
                      </div>
                      <StatoBadge stato={item.stato_avanzamento} />
                    </div>

                    <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2 line-clamp-2">
                      <Link href={`/segnalazioni/${item.id}`} className="hover:text-[var(--blue-primary)] hover:underline">
                        {item.descrizione}
                      </Link>
                    </h3>
                  </div>

                  <div className="border-t border-[var(--border-light)] pt-3 mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <div className="flex items-center gap-2">
                      <span>Inserita il {new Date(item.creata_il).toLocaleDateString('it-IT')}</span>
                      <span>&bull;</span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {item.totaleSostegniValidi} {item.totaleSostegniValidi === 1 ? 'sostegno' : 'sostegni'}
                      </span>
                    </div>
                    <Link
                      href={`/segnalazioni/${item.id}`}
                      className="font-semibold text-[var(--blue-primary)] hover:underline"
                    >
                      Dettaglio
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── COME FUNZIONA ── */}
      <section id="come-funziona" className="py-12 bg-[var(--bg-subtle)] border-b border-[var(--border-light)]" aria-labelledby="funziona-title">
        <div className="page-container">
          <div className="max-w-2xl mb-8">
            <h2 id="funziona-title" className="section-title mb-2">
              Come funziona la piattaforma
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Un percorso semplice, tracciato e rigoroso che tutela sia i cittadini sia la qualità delle segnalazioni.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="panel bg-white">
              <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--blue-primary-light)] text-[var(--blue-primary)] font-bold text-xs flex items-center justify-center mb-3">
                1
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">
                Documenta e invia
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Descrivi la situazione, indica la posizione precisa sulla mappa e carica eventuali foto a supporto.
              </p>
            </div>

            <div className="panel bg-white">
              <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--blue-primary-light)] text-[var(--blue-primary)] font-bold text-xs flex items-center justify-center mb-3">
                2
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">
                Verifica del comitato
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Il comitato verifica la conformità alle linee guida e l’assenza di contenuti lesivi prima della pubblicazione.
              </p>
            </div>

            <div className="panel bg-white">
              <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--blue-primary-light)] text-[var(--blue-primary)] font-bold text-xs flex items-center justify-center mb-3">
                3
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">
                Sostegno dei residenti
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                I cittadini con account verificato possono esprimere il loro sostegno per far emergere i temi prioritari.
              </p>
            </div>

            <div className="panel bg-white">
              <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--blue-primary-light)] text-[var(--blue-primary)] font-bold text-xs flex items-center justify-center mb-3">
                4
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">
                Presentazione pubblica
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Le segnalazioni con maggiore rilevanza vengono raggruppate e portate all’attenzione dei candidati locali.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── RUOLO DEL COMITATO CIVICO DI GARANZIA ── */}
      <section className="py-10" aria-labelledby="comitato-title">
        <div className="page-container">
          <div className="panel-subtle flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <h2 id="comitato-title" className="text-base font-bold text-[var(--text-primary)] mb-1">
                Il ruolo del Comitato Civico di Garanzia
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Il comitato è formato da cittadini volontari indipendenti. Si occupa di verificare la pertinenza territoriale 
                delle richieste, confermare le categorie corrette e garantire che ogni decisione sia motivata e registrata 
                in un registro immutabile. <strong>La moderazione non certifica la risoluzione dei lavori</strong>, ma assicura 
                un dibattito corretto e documentato.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link href="/classifica" className="btn btn-secondary btn-sm">
                Consulta le priorità
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
