import Link from 'next/link';
import { getSegnalazioniPubbliche, getCategorieAttive } from '@/lib/domain/segnalazioni';
import ReportThumbnail from '@/components/report-thumbnail';

type Categoria = Awaited<ReturnType<typeof getCategorieAttive>>[number];
type SegnalazioniResult = Awaited<ReturnType<typeof getSegnalazioniPubbliche>>;

interface PageProps {
  searchParams: Promise<{
    page?: string;
    categoria?: string;
    stato?: string;
    ord?: 'piu_sostenute' | 'piu_recenti' | 'meno_recenti';
    q?: string;
  }>;
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

export default async function SegnalazioniPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = params.page ? parseInt(params.page, 10) : 1;
  const categoriaId = params.categoria || undefined;
  const statoAvanzamento = (params.stato as 'RICEVUTA' | 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI') || undefined;
  const ordinamento = params.ord || 'piu_recenti';
  const q = params.q || undefined;

  let categorie: Categoria[] = [];
  let result: SegnalazioniResult = { items: [], total: 0, page: 1, pageSize: 12, totalPages: 1 };
  let loadError: string | null = null;

  try {
    const [cats, res] = await Promise.all([
      getCategorieAttive(),
      getSegnalazioniPubbliche({ page, pageSize: 12, categoriaId, statoAvanzamento, ordinamento, q })
    ]);
    categorie = cats;
    result = res;
  } catch (err) {
    console.error('Errore caricamento segnalazioni pubbliche:', err);
    loadError = 'Si è verificato un errore durante il caricamento delle segnalazioni. Riprova più tardi.';
  }

  const { items, total, totalPages } = result;

  const buildHref = (overrides: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const vals = { page: '1', categoria: categoriaId ?? '', stato: statoAvanzamento ?? '', ord: ordinamento, q: q ?? '', ...overrides };
    Object.entries(vals).forEach(([k, v]) => { if (v) p.set(k, String(v)); });
    return `/segnalazioni?${p.toString()}`;
  };

  const categoriaSelezionata = categorie.find(c => c.id === categoriaId);
  const filtriAttivi = Boolean(categoriaId || statoAvanzamento || q || ordinamento !== 'piu_recenti');

  return (
    <main className="page-container py-8 sm:py-10 flex flex-col gap-6">
      {/* Testata della pagina */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-[var(--border-light)] pb-5">
        <div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[var(--forest-900)] tracking-tight">
            Esplora le segnalazioni
          </h1>
          <p className="text-[17px] text-[var(--text-secondary)] mt-1 max-w-2xl">
            Tutte le segnalazioni verificate dal comitato di garanzia e aperte alla consultazione pubblica.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link href="/mappa" className="btn btn-secondary btn-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            <span>Mappa</span>
          </Link>
          <Link href="/dashboard#nuova-segnalazione" className="btn btn-accent btn-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Invia segnalazione</span>
          </Link>
        </div>
      </div>

      {/* Riquadro filtri compatto: ricerca evidente + controlli su riga singola */}
      <form
        method="GET"
        action="/segnalazioni"
        className="bg-white rounded-2xl border border-[var(--border-light)] p-4 sm:p-5 shadow-[var(--shadow-card)] flex flex-col gap-3"
      >
        {/* Barra di ricerca evidente */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--forest-700)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            id="search-input"
            name="q"
            type="search"
            defaultValue={q ?? ''}
            placeholder="Cerca per parola chiave (es. buca, illuminazione, parco, marciapiede...)"
            className="w-full pl-10 pr-24 py-2.5 rounded-xl border border-[var(--border-medium)] focus:border-[var(--forest-700)] text-base outline-none transition-all placeholder-[var(--text-muted)]"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1.5 bottom-1.5 btn btn-primary btn-sm px-4"
          >
            Cerca
          </button>
        </div>

        {/* Versione Desktop: controlli compatti in linea */}
        <div className="hidden sm:grid sm:grid-cols-12 gap-3 items-end pt-1">
          <div className="sm:col-span-4">
            <label htmlFor="categoria-select-desktop" className="form-label text-sm mb-1">
              Tematica
            </label>
            <select
              id="categoria-select-desktop"
              name="categoria"
              defaultValue={categoriaId ?? ''}
              className="w-full py-2 px-3 rounded-xl border border-[var(--border-medium)] text-sm bg-white outline-none focus:border-[var(--forest-700)]"
            >
              <option value="">Tutte le tematiche</option>
              {categorie.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.nome}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="stato-select-desktop" className="form-label text-sm mb-1">
              Stato
            </label>
            <select
              id="stato-select-desktop"
              name="stato"
              defaultValue={statoAvanzamento ?? ''}
              className="w-full py-2 px-3 rounded-xl border border-[var(--border-medium)] text-sm bg-white outline-none focus:border-[var(--forest-700)]"
            >
              <option value="">Tutti gli stati</option>
              <option value="RICEVUTA">Ricevuta</option>
              <option value="PRESA_IN_CARICO">In carico al comitato</option>
              <option value="INVIATA_AI_CANDIDATI">Trasmessa ai candidati</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="ord-select-desktop" className="form-label text-sm mb-1">
              Ordina per
            </label>
            <select
              id="ord-select-desktop"
              name="ord"
              defaultValue={ordinamento}
              className="w-full py-2 px-3 rounded-xl border border-[var(--border-medium)] text-sm bg-white outline-none focus:border-[var(--forest-700)]"
            >
              <option value="piu_recenti">Più recenti</option>
              <option value="piu_sostenute">Più sostenute</option>
              <option value="meno_recenti">Meno recenti</option>
            </select>
          </div>

          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            {filtriAttivi && (
              <Link
                href="/segnalazioni"
                className="text-xs font-semibold text-[var(--forest-700)] hover:underline whitespace-nowrap"
              >
                Azzera
              </Link>
            )}
            <button type="submit" className="btn btn-secondary btn-sm whitespace-nowrap">
              Filtra
            </button>
          </div>
        </div>

        {/* Versione Mobile: sezione filtri espandibile accessibile con <details> */}
        <details className="sm:hidden group border-t border-[var(--border-light)] pt-2 text-sm">
          <summary className="flex items-center justify-between cursor-pointer py-1 font-semibold text-[var(--forest-800)] select-none">
            <span className="flex items-center gap-1.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filtri avanzati e ordinamento
            </span>
            <span className="text-xs text-[var(--forest-700)] group-open:rotate-180 transition-transform">
              &#9660;
            </span>
          </summary>

          <div className="flex flex-col gap-3 pt-3">
            <div>
              <label htmlFor="categoria-select-mobile" className="form-label text-sm">
                Tematica
              </label>
              <select
                id="categoria-select-mobile"
                name="categoria"
                defaultValue={categoriaId ?? ''}
                className="w-full py-2 px-3 rounded-xl border border-[var(--border-medium)] text-sm bg-white outline-none"
              >
                <option value="">Tutte le tematiche</option>
                {categorie.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.nome}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="stato-select-mobile" className="form-label text-sm">
                  Stato
                </label>
                <select
                  id="stato-select-mobile"
                  name="stato"
                  defaultValue={statoAvanzamento ?? ''}
                  className="w-full py-2 px-3 rounded-xl border border-[var(--border-medium)] text-sm bg-white outline-none"
                >
                  <option value="">Tutti</option>
                  <option value="RICEVUTA">Ricevuta</option>
                  <option value="PRESA_IN_CARICO">In carico</option>
                  <option value="INVIATA_AI_CANDIDATI">Ai candidati</option>
                </select>
              </div>

              <div>
                <label htmlFor="ord-select-mobile" className="form-label text-sm">
                  Ordina
                </label>
                <select
                  id="ord-select-mobile"
                  name="ord"
                  defaultValue={ordinamento}
                  className="w-full py-2 px-3 rounded-xl border border-[var(--border-medium)] text-sm bg-white outline-none"
                >
                  <option value="piu_recenti">Più recenti</option>
                  <option value="piu_sostenute">Più sostenute</option>
                  <option value="meno_recenti">Meno recenti</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {filtriAttivi && (
                <Link href="/segnalazioni" className="text-xs font-semibold text-[var(--forest-700)] hover:underline">
                  Azzera filtri
                </Link>
              )}
              <button type="submit" className="btn btn-primary btn-sm ml-auto">
                Applica filtri
              </button>
            </div>
          </div>
        </details>
      </form>

      {/* Conteggio dei risultati posizionato subito vicino all'inizio dell'elenco */}
      <div className="flex items-center justify-between text-sm sm:text-base text-[var(--text-secondary)] px-1">
        <span>
          Visualizzate <strong>{items.length}</strong> su <strong>{total}</strong> segnalazioni
          {categoriaSelezionata ? ` per "${categoriaSelezionata.nome}"` : ''}
          {q ? ` contenenti "${q}"` : ''}
        </span>
        {totalPages > 1 && (
          <span className="font-semibold text-[var(--forest-800)] text-sm">
            Pagina {page} di {totalPages}
          </span>
        )}
      </div>

      {/* GESTIONE STATI: 1. Errore di caricamento, 2. Ricerca senza risultati, 3. Archivio vuoto, 4. Lista */}
      {loadError ? (
        <div className="alert alert-error" role="alert">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <strong className="block font-bold">Errore di comunicazione</strong>
            <span>{loadError}</span>
          </div>
        </div>
      ) : total === 0 && filtriAttivi ? (
        /* Caso 2: Ricerca o filtri attivi senza corrispondenza */
        <div className="empty-state">
          <div className="w-12 h-12 rounded-full bg-[var(--forest-light)] text-[var(--forest-700)] flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h2 className="font-display font-bold text-lg text-[var(--forest-900)] mb-1">
            Nessun risultato con i filtri correnti
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-4">
            Nessuna segnalazione corrisponde ai criteri impostati. Prova a modificare le parole chiave o azzera i filtri per vedere tutte le segnalazioni.
          </p>
          <Link href="/segnalazioni" className="btn btn-secondary btn-sm">
            Azzera tutti i filtri
          </Link>
        </div>
      ) : total === 0 && !filtriAttivi ? (
        /* Caso 3: Archivio pubblico privo di segnalazioni */
        <div className="empty-state">
          <div className="w-12 h-12 rounded-full bg-[var(--forest-light)] text-[var(--forest-700)] flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
          </div>
          <h2 className="font-display font-bold text-lg text-[var(--forest-900)] mb-1">
            Le segnalazioni della comunità compariranno qui
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-4">
            Non ci sono ancora segnalazioni approvate nell’archivio pubblico. Sii il primo cittadino a inviare una proposta o una criticità per la cura del quartiere.
          </p>
          <Link href="/dashboard#nuova-segnalazione" className="btn btn-primary btn-sm">
            Invia la prima segnalazione
          </Link>
        </div>
      ) : (
        /* Caso 4: Griglia segnalazioni */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
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

              {/* Contenuto principale */}
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

                  <h2 className="font-display font-bold text-base sm:text-lg text-[var(--forest-900)] group-hover:text-[var(--forest-700)] transition-colors line-clamp-3 mb-2">
                    <Link href={`/segnalazioni/${item.id}`} className="hover:underline text-inherit">
                      {item.descrizione}
                    </Link>
                  </h2>

                  <div className="flex items-center gap-3 text-xs sm:text-sm text-[var(--text-muted)] mt-2">
                    <span className="flex items-center gap-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--forest-600)]">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {item.latitudine.toFixed(3)}, {item.longitudine.toFixed(3)}
                    </span>
                    <span>&bull;</span>
                    <span>{new Date(item.creata_il).toLocaleDateString('it-IT')}</span>
                  </div>
                </div>

                {/* Sostegni e accesso al dettaglio */}
                <div className="border-t border-[var(--border-light)] pt-3.5 mt-4 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 font-bold text-[var(--forest-800)]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--emerald-accent)]">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                    <span>
                      {item.totaleSostegniValidi} {item.totaleSostegniValidi === 1 ? 'sostegno' : 'sostegni'}
                    </span>
                  </div>

                  <Link
                    href={`/segnalazioni/${item.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Dettaglio &rarr;
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Paginazione */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between border-t border-[var(--border-light)] pt-6 text-sm" aria-label="Paginazione">
          <div>
            {page > 1 ? (
              <Link href={buildHref({ page: page - 1 })} className="btn btn-secondary btn-sm">
                &larr; Precedente
              </Link>
            ) : (
              <span className="btn btn-secondary btn-sm opacity-40 pointer-events-none">
                &larr; Precedente
              </span>
            )}
          </div>

          <span className="font-semibold text-[var(--text-secondary)]">
            Pagina {page} di {totalPages}
          </span>

          <div>
            {page < totalPages ? (
              <Link href={buildHref({ page: page + 1 })} className="btn btn-secondary btn-sm">
                Successiva &rarr;
              </Link>
            ) : (
              <span className="btn btn-secondary btn-sm opacity-40 pointer-events-none">
                Successiva &rarr;
              </span>
            )}
          </div>
        </nav>
      )}
    </main>
  );
}
