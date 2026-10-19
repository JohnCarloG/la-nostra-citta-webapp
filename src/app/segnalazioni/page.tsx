import Link from 'next/link';
import { getSegnalazioniPubbliche, getCategorieAttive } from '@/lib/domain/segnalazioni';

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
    PRESA_IN_CARICO:      { cls: 'badge badge-carico',    label: 'In carico' },
    INVIATA_AI_CANDIDATI: { cls: 'badge badge-candidati', label: 'Ai candidati' },
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

  let categorie: any[] = [];
  let result = { items: [] as any[], total: 0, totalPages: 1 };

  try {
    const [cats, res] = await Promise.all([
      getCategorieAttive(),
      getSegnalazioniPubbliche({ page, pageSize: 15, categoriaId, statoAvanzamento, ordinamento, q })
    ]);
    categorie = cats;
    result = res;
  } catch (err) {
    console.error('Errore caricamento segnalazioni pubbliche:', err);
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
    <main className="page-container py-8 flex flex-col gap-6">
      {/* Testata della pagina */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border-light)] pb-4">
        <div>
          <h1 className="page-title">
            Elenco delle segnalazioni civiche
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Segnalazioni verificate dal comitato di garanzia e aperte alla consultazione pubblica.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/mappa" className="btn btn-secondary btn-sm">
            Visualizza su mappa
          </Link>
          <Link href="/dashboard#nuova-segnalazione" className="btn btn-primary btn-sm">
            Invia segnalazione
          </Link>
        </div>
      </div>

      {/* Riquadro di ricerca e filtri sobrio */}
      <form method="GET" action="/segnalazioni" className="panel-subtle flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Cerca testo */}
          <div>
            <label htmlFor="search-input" className="form-label text-xs">
              Cerca per parola chiave
            </label>
            <input
              id="search-input"
              name="q"
              type="search"
              defaultValue={q ?? ''}
              placeholder="Es. marciapiede, illuminazione..."
              className="form-input text-xs"
            />
          </div>

          {/* Filtro Categoria */}
          <div>
            <label htmlFor="categoria-select" className="form-label text-xs">
              Categoria
            </label>
            <select
              id="categoria-select"
              name="categoria"
              defaultValue={categoriaId ?? ''}
              className="form-input text-xs"
            >
              <option value="">Tutte le categorie</option>
              {categorie.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Stato */}
          <div>
            <label htmlFor="stato-select" className="form-label text-xs">
              Stato avanzamento
            </label>
            <select
              id="stato-select"
              name="stato"
              defaultValue={statoAvanzamento ?? ''}
              className="form-input text-xs"
            >
              <option value="">Tutti gli stati</option>
              <option value="RICEVUTA">Ricevuta</option>
              <option value="PRESA_IN_CARICO">In carico al comitato</option>
              <option value="INVIATA_AI_CANDIDATI">Trasmessa ai candidati</option>
            </select>
          </div>

          {/* Ordinamento */}
          <div>
            <label htmlFor="ord-select" className="form-label text-xs">
              Ordina per
            </label>
            <select
              id="ord-select"
              name="ord"
              defaultValue={ordinamento}
              className="form-input text-xs"
            >
              <option value="piu_recenti">Più recenti</option>
              <option value="piu_sostenute">Più sostenute</option>
              <option value="meno_recenti">Meno recenti</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-light)] text-xs">
          <div className="text-[var(--text-secondary)]">
            {filtriAttivi && (
              <Link href="/segnalazioni" className="text-[var(--blue-primary)] hover:underline">
                Azzera filtri
              </Link>
            )}
          </div>
          <button type="submit" className="btn btn-primary btn-sm">
            Applica filtri
          </button>
        </div>
      </form>

      {/* Conteggio dei risultati */}
      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] px-1">
        <span>
          Trovate <strong>{total}</strong> segnalazioni
          {categoriaSelezionata ? ` per "${categoriaSelezionata.nome}"` : ''}
          {q ? ` contenenti "${q}"` : ''}
        </span>
        {totalPages > 1 && (
          <span>
            Pagina <strong>{page}</strong> di <strong>{totalPages}</strong>
          </span>
        )}
      </div>

      {/* Elenco segnalazioni a righe sobrie */}
      {items.length === 0 ? (
        <div className="empty-state">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Nessuna segnalazione trovata con i filtri correnti
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
            Prova a modificare i criteri di ricerca o azzera i filtri per vedere tutte le segnalazioni pubblicate.
          </p>
          {filtriAttivi && (
            <Link href="/segnalazioni" className="btn btn-secondary btn-sm mt-3 inline-flex">
              Mostra tutte le segnalazioni
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="panel hover:border-[var(--blue-primary-border)] transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {item.categorie?.length > 0 ? (
                    item.categorie.map((c: string, idx: number) => (
                      <span key={idx} className="badge badge-categoria">
                        {c}
                      </span>
                    ))
                  ) : (
                    <span className="badge badge-categoria">Segnalazione civica</span>
                  )}
                  <StatoBadge stato={item.stato_avanzamento} />
                  <span className="text-xs text-[var(--text-muted)]">
                    Inserita il {new Date(item.creata_il).toLocaleDateString('it-IT')}
                  </span>
                </div>

                <h2 className="text-sm font-bold text-[var(--text-primary)] mb-1">
                  <Link href={`/segnalazioni/${item.id}`} className="hover:text-[var(--blue-primary)] hover:underline">
                    {item.descrizione}
                  </Link>
                </h2>

                <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] mt-2">
                  <span>
                    Coordinate: {item.latitudine.toFixed(4)}, {item.longitudine.toFixed(4)}
                  </span>
                  {item.primoMedia && (
                    <span>&bull; Documento/Foto allegata</span>
                  )}
                </div>
              </div>

              {/* Azione rapida e conteggio sostenitori */}
              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--border-light)]">
                <div className="text-right">
                  <span className="text-sm font-bold text-[var(--text-primary)] block">
                    {item.totaleSostegniValidi}
                  </span>
                  <span className="text-[0.6875rem] text-[var(--text-muted)] uppercase tracking-wider block">
                    {item.totaleSostegniValidi === 1 ? 'sostegno' : 'sostegni'}
                  </span>
                </div>
                <Link
                  href={`/segnalazioni/${item.id}`}
                  className="btn btn-secondary btn-sm"
                >
                  Dettagli
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Paginazione */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between border-t border-[var(--border-light)] pt-4 text-xs" aria-label="Paginazione">
          <div>
            {page > 1 ? (
              <Link href={buildHref({ page: page - 1 })} className="btn btn-secondary btn-sm">
                &larr; Precedente
              </Link>
            ) : (
              <span className="btn btn-secondary btn-sm opacity-50 pointer-events-none">
                &larr; Precedente
              </span>
            )}
          </div>

          <span className="text-[var(--text-secondary)]">
            Pagina {page} di {totalPages}
          </span>

          <div>
            {page < totalPages ? (
              <Link href={buildHref({ page: page + 1 })} className="btn btn-secondary btn-sm">
                Successiva &rarr;
              </Link>
            ) : (
              <span className="btn btn-secondary btn-sm opacity-50 pointer-events-none">
                Successiva &rarr;
              </span>
            )}
          </div>
        </nav>
      )}
    </main>
  );
}
