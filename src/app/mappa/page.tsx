import { getSegnalazioniMappa, getCategorieAttive } from '@/lib/domain/segnalazioni';
import MapView from './map-view';

interface PageProps {
  searchParams: Promise<{
    categoria?: string;
  }>;
}

export default async function MappaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const categoriaId = params.categoria || undefined;

  const [categorie, segnalazioni] = await Promise.all([
    getCategorieAttive(),
    getSegnalazioniMappa(categoriaId)
  ]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Intestazione */}
      <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Mappa Territoriale delle Segnalazioni
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Visualizzazione georeferenziata delle priorità approvate sul territorio comunale di Milano.
          </p>
        </div>

        {/* Filtro Rapido per Categoria */}
        <form method="GET" className="flex items-center gap-2">
          <label htmlFor="categoria" className="text-xs font-semibold text-slate-600 uppercase">
            Categoria:
          </label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={categoriaId || ''}
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          >
            <option value="">Tutte</option>
            {categorie.map(c => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-3 py-1.5 bg-slate-800 text-white font-semibold text-xs rounded-lg hover:bg-slate-900 transition-colors cursor-pointer"
          >
            Filtra
          </button>
        </form>
      </div>

      {/* Mappa con Alternativa Testuale Integrata */}
      <MapView segnalazioni={segnalazioni} />
    </main>
  );
}
