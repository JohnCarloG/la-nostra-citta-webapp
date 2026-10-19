import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';
import { getSegnalazioniPubbliche, getCategorieAttive } from '@/lib/domain/segnalazioni';
import ReportThumbnail from '@/components/report-thumbnail';

type Categoria = Awaited<ReturnType<typeof getCategorieAttive>>[number];
type SegnalazioneCard = Awaited<ReturnType<typeof getSegnalazioniPubbliche>>['items'][number];

function StatoBadge({ stato }: { stato: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    RICEVUTA: { cls: 'badge badge-ricevuta', label: 'Ricevuta' },
    PRESA_IN_CARICO: { cls: 'badge badge-carico', label: 'In carico al comitato' },
    INVIATA_AI_CANDIDATI: { cls: 'badge badge-candidati', label: 'Trasmessa ai candidati' },
    RITIRATA: { cls: 'badge badge-ritirata', label: 'Ritirata' },
  };
  const item = map[stato] ?? { cls: 'badge badge-categoria', label: stato.replace(/_/g, ' ') };
  return <span className={item.cls}>{item.label}</span>;
}

function CategoryIcon({ codice }: { codice: string }) {
  switch (codice) {
    case 'STRADE_MARCIAPIEDI':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19L8 5M20 19L16 5" />
          <line x1="12" y1="8" x2="12" y2="10" strokeDasharray="2 2" />
          <line x1="12" y1="14" x2="12" y2="16" strokeDasharray="2 2" />
        </svg>
      );
    case 'VERDE_ARREDO':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 5.5V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-5.5c1.5-1 3-3 3-5.5a7 7 0 0 0-7-7z" />
          <path d="M12 9v13" />
        </svg>
      );
    case 'ILLUMINAZIONE':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
        </svg>
      );
    case 'RIFIUTI_PULIZIA':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case 'MOBILITA_SOSTENIBILE':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5.5" cy="17.5" r="3.5" />
          <circle cx="18.5" cy="17.5" r="3.5" />
          <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5L9 9l4-3 3 3h4" />
        </svg>
      );
    case 'SICUREZZA_DEGRADO':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'ACCESSIBILITA':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="4" r="2" />
          <path d="M9 20v-6L5 8h14l-4 6v6" />
        </svg>
      );
    default:
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
  }
}

export default async function Home() {
  const user = await getCurrentUser();
  let recenti: SegnalazioneCard[] = [];
  let categorie: Categoria[] = [];

  try {
    const [cats, res] = await Promise.all([
      getCategorieAttive(),
      getSegnalazioniPubbliche({ pageSize: 6, ordinamento: 'piu_recenti' })
    ]);
    categorie = cats;
    recenti = res.items;
  } catch (err) {
    console.error('Errore recupero dati per la home:', err);
  }

  return (
    <main className="flex-1">
      {/* ── 1. APERTURA CON PERSONALITÀ (HERO) ── */}
      <section className="bg-gradient-to-b from-[var(--bg-subtle)] via-white to-white border-b border-[var(--border-light)] pt-12 pb-16 lg:pt-16 lg:pb-20">
        <div className="page-container">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            {/* Testo Hero */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              <h1 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-[var(--forest-900)] leading-[1.15] tracking-tight">
                La città cambia <br className="hidden sm:inline" /> anche con te.
              </h1>

              <p className="text-[17px] sm:text-[18px] text-[var(--text-secondary)] leading-relaxed max-w-xl">
                Segnala ciò che non funziona, sostieni le priorità del tuo quartiere e segui il percorso delle segnalazioni.
              </p>

              {/* Azioni principali */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href={user ? "/dashboard#nuova-segnalazione" : "/login?redirect=/dashboard"}
                  className="btn btn-primary"
                  id="hero-invia-segnalazione"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span>Invia una segnalazione</span>
                </Link>

                <Link
                  href="/mappa"
                  className="btn btn-secondary"
                  id="hero-esplora-mappa"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                  <span>Esplora la mappa</span>
                </Link>
              </div>

              {/* Trasparenza del percorso */}
              <div className="flex items-center gap-4 text-sm text-[var(--text-muted)] pt-3 border-t border-[var(--border-light)] max-w-md">
                <div className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--emerald-accent)]">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Verifica del comitato
                </div>
                <span>&bull;</span>
                <div className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--emerald-accent)]">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  Avanzamenti pubblici
                </div>
              </div>
            </div>

            {/* Fotografia urbana autentica e documentata (spazi condivisi e partecipazione) */}
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-lg">
                <div className="relative rounded-2xl overflow-hidden shadow-[var(--shadow-card-hover)] border border-[var(--border-light)] aspect-[4/3] w-full bg-[var(--bg-subtle)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/hero-civic.jpg"
                    alt="Cittadini e comunità in uno spazio pubblico condiviso"
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[var(--forest-900)]/85 via-[var(--forest-900)]/40 to-transparent p-4 text-white">
                    <span className="font-display font-bold text-sm block">
                      Spazi condivisi e partecipazione attiva
                    </span>
                    <span className="text-emerald-200 text-xs block mt-0.5">
                      Fotografia documentata: Priscilla Du Preez (Unsplash License)
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── 2. RICERCA UTILE: “Cosa succede nel tuo quartiere?” ── */}
      <section className="py-10 bg-white border-b border-[var(--border-light)]" aria-labelledby="ricerca-title">
        <div className="page-container">
          <div className="max-w-3xl mx-auto text-center mb-6">
            <h2 id="ricerca-title" className="section-title mb-2">
              Cosa succede nel tuo quartiere?
            </h2>
            <p className="text-[17px] text-[var(--text-secondary)]">
              Cerca per parola chiave o tema per trovare le segnalazioni aperte dalla comunità.
            </p>
          </div>

          {/* Form di ricerca reale collegato a /segnalazioni?q=... */}
          <form method="GET" action="/segnalazioni" className="max-w-2xl mx-auto">
            <div className="relative flex items-center shadow-[var(--shadow-card)] rounded-2xl bg-white border-2 border-[var(--border-medium)] focus-within:border-[var(--forest-700)] transition-all p-1.5">
              <span className="pl-3.5 pr-2 text-[var(--text-muted)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="search"
                name="q"
                placeholder="Cerca per parola chiave (es. buca, illuminazione, parco, pista ciclabile...)"
                className="w-full py-2.5 px-2 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] bg-transparent outline-none"
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm px-5 shrink-0"
              >
                Cerca
              </button>
            </div>

            {/* Temi frequenti reali */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3 text-sm text-[var(--text-muted)]">
              <span>Temi frequenti:</span>
              <Link href="/segnalazioni?q=marciapiede" className="px-3 py-1 rounded-full bg-[var(--bg-subtle)] text-[var(--forest-800)] hover:bg-[var(--bg-subtle-tint)] transition-colors">
                Marciapiedi
              </Link>
              <Link href="/segnalazioni?q=illuminazione" className="px-3 py-1 rounded-full bg-[var(--bg-subtle)] text-[var(--forest-800)] hover:bg-[var(--bg-subtle-tint)] transition-colors">
                Illuminazione
              </Link>
              <Link href="/segnalazioni?q=parco" className="px-3 py-1 rounded-full bg-[var(--bg-subtle)] text-[var(--forest-800)] hover:bg-[var(--bg-subtle-tint)] transition-colors">
                Parchi e verde
              </Link>
              <Link href="/segnalazioni?q=rifiuti" className="px-3 py-1 rounded-full bg-[var(--bg-subtle)] text-[var(--forest-800)] hover:bg-[var(--bg-subtle-tint)] transition-colors">
                Rifiuti
              </Link>
            </div>
          </form>
        </div>
      </section>

      {/* ── 3. TEMATICHE REALI DEL CATALOGO ── */}
      <section className="py-12 bg-[var(--bg-subtle)] border-b border-[var(--border-light)]" aria-labelledby="tematiche-title">
        <div className="page-container">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <span className="font-display font-bold text-xs uppercase tracking-wider text-[var(--forest-700)] block mb-1">
                Aree di intervento
              </span>
              <h2 id="tematiche-title" className="section-title">
                Esplora per tematica
              </h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-1">
                Seleziona una categoria per visualizzare tutte le segnalazioni relative.
              </p>
            </div>
            <Link href="/segnalazioni" className="text-sm font-bold text-[var(--forest-700)] hover:underline inline-flex items-center gap-1">
              Tutte le categorie &rarr;
            </Link>
          </div>

          {/* Griglia categorie reali */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {categorie.map((cat) => (
              <Link
                key={cat.id}
                href={`/segnalazioni?categoria=${cat.id}`}
                className="group p-4 sm:p-5 rounded-2xl bg-white border border-[var(--border-light)] hover:border-[var(--forest-border)] hover:shadow-[var(--shadow-card)] transition-all flex flex-col justify-between gap-3 text-decoration-none"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--forest-light)] text-[var(--forest-700)] flex items-center justify-center group-hover:scale-110 group-hover:bg-[var(--emerald-light)] group-hover:text-[var(--emerald-dark)] transition-all">
                  <CategoryIcon codice={cat.codice} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm sm:text-base text-[var(--forest-900)] group-hover:text-[var(--forest-700)] transition-colors line-clamp-2">
                    {cat.nome}
                  </h3>
                  <span className="text-xs font-semibold text-[var(--text-muted)] group-hover:text-[var(--forest-600)] mt-1 block">
                    Apri segnalazioni &rarr;
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. SEGNALAZIONI DAL TERRITORIO (DATI REALI) ── */}
      <section className="py-14 bg-white border-b border-[var(--border-light)]" aria-labelledby="territorio-title">
        <div className="page-container">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <span className="font-display font-bold text-xs uppercase tracking-wider text-[var(--forest-700)] block mb-1">
                La voce dei cittadini
              </span>
              <h2 id="territorio-title" className="section-title">
                Ultime segnalazioni dal territorio
              </h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-1">
                Richieste documentate dalla comunità, verificate dal comitato e aperte al sostegno civico.
              </p>
            </div>
            <Link
              href="/segnalazioni"
              className="btn btn-secondary btn-sm shrink-0"
            >
              Consulta tutte ({recenti.length})
            </Link>
          </div>

          {recenti.length === 0 ? (
            <div className="empty-state">
              <div className="w-12 h-12 rounded-full bg-[var(--forest-light)] text-[var(--forest-700)] flex items-center justify-center mx-auto mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3 className="font-display font-bold text-lg text-[var(--text-primary)]">
                Le segnalazioni della comunità compariranno qui
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
                Non ci sono ancora segnalazioni approvate nell’archivio pubblico. Sii il primo cittadino a segnalare una criticità o una proposta per la cura del quartiere.
              </p>
              <Link
                href={user ? "/dashboard#nuova-segnalazione" : "/login?redirect=/dashboard"}
                className="btn btn-primary btn-sm mt-4 inline-flex"
              >
                Invia la prima segnalazione
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {recenti.map((item) => (
                <article
                  key={item.id}
                  className="group rounded-2xl bg-white border border-[var(--border-light)] hover:border-[var(--forest-border)] hover:shadow-[var(--shadow-card-hover)] transition-all overflow-hidden flex flex-col justify-between"
                >
                  {/* Anteprima fotografica o placeholder universale senza salti di layout */}
                  <ReportThumbnail
                    mediaId={item.primoMedia?.id}
                    tipo={item.primoMedia?.tipo}
                    alt={item.descrizione}
                    badge={<StatoBadge stato={item.stato_avanzamento} />}
                  />

                  {/* Corpo della scheda */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="mb-2">
                        {item.categorie?.length > 0 ? (
                          <span className="badge badge-categoria">
                            {item.categorie[0]}
                          </span>
                        ) : (
                          <span className="badge badge-categoria">Segnalazione civica</span>
                        )}
                      </div>

                      <h3 className="font-display font-bold text-base text-[var(--forest-900)] group-hover:text-[var(--forest-700)] transition-colors line-clamp-2 mb-2">
                        <Link href={`/segnalazioni/${item.id}`} className="hover:underline text-inherit">
                          {item.descrizione}
                        </Link>
                      </h3>

                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--forest-600)]">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span>
                          Coord. {item.latitudine.toFixed(3)}, {item.longitudine.toFixed(3)}
                        </span>
                      </div>
                    </div>

                    {/* Sostegni e azione */}
                    <div className="border-t border-[var(--border-light)] pt-3.5 mt-4 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-[var(--forest-800)] font-bold">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--emerald-accent)]">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                        <span>
                          {item.totaleSostegniValidi} {item.totaleSostegniValidi === 1 ? 'sostegno' : 'sostegni'}
                        </span>
                      </div>

                      <Link
                        href={`/segnalazioni/${item.id}`}
                        className="font-bold text-[var(--forest-700)] hover:text-[var(--forest-600)] group-hover:translate-x-0.5 transition-transform"
                      >
                        Vedi scheda &rarr;
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 5. COME PARTECIPARE (SEGNALA, SOSTIENI, SEGUI GLI AGGIORNAMENTI) ── */}
      <section id="come-funziona" className="py-16 bg-[var(--bg-subtle)] border-b border-[var(--border-light)]" aria-labelledby="funziona-title">
        <div className="page-container">
          <div className="max-w-2xl mb-12">
            <span className="font-display font-bold text-xs uppercase tracking-wider text-[var(--forest-700)] block mb-1">
              Guida semplice
            </span>
            <h2 id="funziona-title" className="section-title mb-2">
              Come partecipare al miglioramento della città
            </h2>
            <p className="text-[17px] text-[var(--text-secondary)]">
              Tre passi chiari per trasformare una criticità quotidiana in una proposta civica visibile e tracciata.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1: Segnala */}
            <div className="p-6 rounded-2xl bg-white border border-[var(--border-light)] shadow-[var(--shadow-card)] flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[var(--forest-light)] text-[var(--forest-700)] font-display font-extrabold text-sm flex items-center justify-center mb-4">
                  01
                </div>
                <h3 className="font-display font-bold text-lg text-[var(--forest-900)] mb-2">
                  Segnala
                </h3>
                <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                  Descrivi la situazione con parole semplici, localizzala sulla mappa cittadina e allega fotografie per rendere la segnalazione chiara e documentata.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-[var(--border-light)] text-xs text-[var(--forest-700)] font-semibold">
                Richiede account con email verificata
              </div>
            </div>

            {/* Step 2: Sostieni */}
            <div className="p-6 rounded-2xl bg-white border border-[var(--border-light)] shadow-[var(--shadow-card)] flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[var(--emerald-light)] text-[var(--emerald-dark)] font-display font-extrabold text-sm flex items-center justify-center mb-4">
                  02
                </div>
                <h3 className="font-display font-bold text-lg text-[var(--forest-900)] mb-2">
                  Sostieni
                </h3>
                <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                  Naviga tra le segnalazioni del tuo quartiere ed esprimi il tuo sostegno. Ogni cittadino con email verificata può votare una volta per proposta.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-[var(--border-light)] text-xs text-[var(--forest-700)] font-semibold">
                1 voto per utente verificato
              </div>
            </div>

            {/* Step 3: Segui gli aggiornamenti */}
            <div className="p-6 rounded-2xl bg-white border border-[var(--border-light)] shadow-[var(--shadow-card)] flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[var(--forest-light)] text-[var(--forest-700)] font-display font-extrabold text-sm flex items-center justify-center mb-4">
                  03
                </div>
                <h3 className="font-display font-bold text-lg text-[var(--forest-900)] mb-2">
                  Segui gli aggiornamenti
                </h3>
                <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                  Il Comitato Civico verifica le richieste e le raggruppa in proposte organiche, presentandole ai candidati e documentando ogni passaggio.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-[var(--border-light)] text-xs text-[var(--forest-700)] font-semibold">
                Tracciamento pubblico dello stato
              </div>
            </div>
          </div>

          {/* Riquadro di chiarezza sul perimetro del comitato */}
          <div className="mt-8 p-5 rounded-2xl bg-white border border-[var(--forest-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="p-2 rounded-xl bg-[var(--forest-light)] text-[var(--forest-700)] shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </span>
              <div className="text-sm leading-relaxed text-[var(--text-secondary)]">
                <strong className="text-[var(--forest-900)] block mb-0.5">Ruolo del Comitato e limiti del servizio:</strong>
                Il Comitato Civico di Garanzia è composto da cittadini indipendenti che curano la pertinenza territoriale e la moderazione delle richieste. 
                La piattaforma non sostituisce i canali di pronto intervento o emergenza e non può garantire tempi certi di risoluzione da parte dell’amministrazione, ma assicura che ogni priorità sia verificabile e visibile pubblicamente.
              </div>
            </div>
            <Link href="/classifica" className="btn btn-secondary btn-sm shrink-0 whitespace-nowrap">
              Classifica priorità
            </Link>
          </div>
        </div>
      </section>

      {/* ── 6. CHIUSURA: INVITO CONCRETO A CONTRIBUIRE ── */}
      <section className="py-16 bg-gradient-to-br from-[var(--forest-900)] to-[var(--forest-800)] text-white">
        <div className="page-container text-center max-w-2xl mx-auto">
          <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white mb-3">
            Hai notato una priorità nel tuo quartiere?
          </h2>
          <p className="text-[17px] text-emerald-100/90 leading-relaxed mb-6">
            Bastano pochi passaggi per descrivere la situazione, localizzarla e allegare foto a supporto.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={user ? "/dashboard#nuova-segnalazione" : "/login?redirect=/dashboard"}
              className="btn btn-accent"
              id="cta-segnala-btn"
            >
              Invia una segnalazione
            </Link>
            <Link
              href="/segnalazioni"
              className="btn bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              Consulta le segnalazioni
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
