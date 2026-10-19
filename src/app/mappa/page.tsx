import { getSegnalazioniMappa, getCategorieAttive } from '@/lib/domain/segnalazioni';
import MapView from './map-view';

interface PageProps {
  searchParams: Promise<{ categoria?: string }>;
}

export default async function MappaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const categoriaId = params.categoria || undefined;

  let categorie: any[] = [];
  let segnalazioni: any[] = [];

  try {
    const [cats, segs] = await Promise.all([
      getCategorieAttive(),
      getSegnalazioniMappa(categoriaId)
    ]);
    categorie = cats;
    segnalazioni = segs;
  } catch (err) {
    console.error('Errore recupero punti mappa:', err);
  }

  return (
    <main className="page-container py-8 flex flex-col gap-6">
      {/* Testata */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border-light)] pb-4">
        <div>
          <h1 className="page-title">
            Mappa territoriale delle segnalazioni
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Visualizzazione geografica e alternativa testuale accessibile delle segnalazioni pubbliche.
          </p>
        </div>

        {/* Filtro per categoria */}
        <form method="GET" action="/mappa" className="flex items-center gap-2 shrink-0">
          <label htmlFor="categoria-mappa" className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap">
            Filtra categoria:
          </label>
          <select
            id="categoria-mappa"
            name="categoria"
            defaultValue={categoriaId ?? ''}
            className="form-input text-xs"
            style={{ maxWidth: 220 }}
          >
            <option value="">Tutte le categorie</option>
            {categorie.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary btn-sm" id="mappa-filtra">
            Filtra
          </button>
          {categoriaId && (
            <a href="/mappa" className="btn btn-secondary btn-sm" title="Azzera filtro">
              Tutte
            </a>
          )}
        </form>
      </div>

      <MapView segnalazioni={segnalazioni} />
    </main>
  );
}