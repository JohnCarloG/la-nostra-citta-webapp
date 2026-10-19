import Link from 'next/link';
import { getClassificaSegnalazioni, getCategorieAttive } from '@/lib/domain/segnalazioni';

interface PageProps {
  searchParams: Promise<{
    categoria?: string;
  }>;
}

export default async function ClassificaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const categoriaId = params.categoria || undefined;

  const [categorie, classifica] = await Promise.all([
    getCategorieAttive(),
    getClassificaSegnalazioni(50, 0, categoriaId)
  ]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6">
        <span className="text-xs font-bold tracking-wider text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full uppercase">
          Dossier Civico Elettorale
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-2">
          Classifica Ufficiale delle Priorità
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-3xl">
          Graduatoria ponderata deterministica basata sui sostegni espressi da cittadini attivi e verificati.
          Ordinamento stabilito dai requisiti di progetto: <strong>numero sostegni decrescente</strong>, poi <strong>data di inserimento crescente</strong>, poi <strong>identificativo univoco</strong>.
        </p>
      </div>

      {/* Box Regole di Integrità e Spareggio */}
      <div className="bg-slate-100 border border-slate-200 p-4 rounded-xl text-xs text-slate-700 space-y-1">
        <p className="font-semibold text-slate-900">Garanzie di Integrità del Conteggio (RF06, VI03, T13):</p>
        <ul className="list-disc list-inside space-y-0.5 text-slate-600">
          <li>Sono conteggiati esclusivamente i voti di profili con account attivo e canale email verificato.</li>
          <li>Le segnalazioni ritirate o in attesa di approvazione sono categoricamente escluse dalla classifica.</li>
          <li>L&apos;autosostegno è severamente vietato; le segnalazioni con zero sostegni compaiono in coda con spareggio temporale.</li>
          <li>La presenza di molteplici allegati o categorie confermate non altera né duplica il conteggio dei voti.</li>
        </ul>
      </div>

      {/* Filtro Categoria */}
      <form method="GET" className="flex items-center gap-3">
        <label htmlFor="categoria" className="text-xs font-semibold text-slate-700 uppercase">
          Filtra per Categoria:
        </label>
        <select
          id="categoria"
          name="categoria"
          defaultValue={categoriaId || ''}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
        >
          <option value="">Tutte le categorie</option>
          {categorie.map(c => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-medium text-xs rounded-lg transition-colors cursor-pointer"
        >
          Applica
        </button>
      </form>

      {/* Tabella / Lista Classifica */}
      {classifica.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-600 font-medium">Nessuna segnalazione presente nella classifica per i filtri selezionati.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th scope="col" className="py-3.5 px-4 sm:px-6 w-16 text-center">Pos.</th>
                <th scope="col" className="py-3.5 px-4 sm:px-6">Descrizione &amp; Categorie</th>
                <th scope="col" className="py-3.5 px-4 sm:px-6 w-36 text-center">Avanzamento</th>
                <th scope="col" className="py-3.5 px-4 sm:px-6 w-32 text-center">Sostegni</th>
                <th scope="col" className="py-3.5 px-4 sm:px-6 w-28 text-right">Azione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {classifica.map((item, idx) => {
                const rank = idx + 1;
                const isPodium = rank <= 3;
                const medal =
                  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

                const badgeColor =
                  item.stato_avanzamento === 'INVIATA_AI_CANDIDATI'
                    ? 'bg-emerald-100 text-emerald-800'
                    : item.stato_avanzamento === 'PRESA_IN_CARICO'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-blue-100 text-blue-800';

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isPodium ? 'bg-amber-50/20' : ''
                    }`}
                  >
                    {/* Posizione */}
                    <td className="py-4 px-4 sm:px-6 text-center font-bold">
                      {medal ? (
                        <span className="text-xl" title={`Posizione #${rank}`}>
                          {medal}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">#{rank}</span>
                      )}
                    </td>

                    {/* Descrizione e Categorie */}
                    <td className="py-4 px-4 sm:px-6">
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {item.categorie.map(c => (
                          <span
                            key={c}
                            className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                      <Link
                        href={`/segnalazioni/${item.id}`}
                        className="font-semibold text-slate-900 hover:text-blue-600 line-clamp-2"
                      >
                        {item.descrizione}
                      </Link>
                      <p className="text-xs text-slate-400 mt-1">
                        Inserita il {new Date(item.creata_il).toLocaleDateString('it-IT')} da {item.autore.nome} {item.autore.cognome?.[0]}.
                      </p>
                    </td>

                    {/* Stato */}
                    <td className="py-4 px-4 sm:px-6 text-center">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeColor}`}>
                        {item.stato_avanzamento.replace(/_/g, ' ')}
                      </span>
                    </td>

                    {/* Sostegni */}
                    <td className="py-4 px-4 sm:px-6 text-center">
                      <span className="inline-flex items-center gap-1 text-sm font-extrabold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-lg">
                        <span>❤️</span>
                        <span>{item.totaleSostegniValidi}</span>
                      </span>
                    </td>

                    {/* Dettagli */}
                    <td className="py-4 px-4 sm:px-6 text-right">
                      <Link
                        href={`/segnalazioni/${item.id}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Vedi scheda &rarr;
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
