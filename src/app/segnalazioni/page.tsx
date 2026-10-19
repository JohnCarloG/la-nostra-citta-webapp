import Link from 'next/link';
import Image from 'next/image';
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

export default async function SegnalazioniPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = params.page ? parseInt(params.page, 10) : 1;
  const categoriaId = params.categoria || undefined;
  const statoAvanzamento = (params.stato as 'RICEVUTA' | 'PRESA_IN_CARICO' | 'INVIATA_AI_CANDIDATI') || undefined;
  const ordinamento = params.ord || 'piu_recenti';
  const q = params.q || undefined;

  const [categorie, result] = await Promise.all([
    getCategorieAttive(),
    getSegnalazioniPubbliche({
      page,
      pageSize: 12,
      categoriaId,
      statoAvanzamento,
      ordinamento,
      q
    })
  ]);

  const { items, total, totalPages } = result;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Header e Titolo */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Segnalazioni Pubbliche
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Consulta le segnalazioni approvate dalla moderazione civica e sostieni le priorità per la città.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/mappa"
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg shadow-xs transition-colors"
          >
            Visualizza Mappa
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors"
          >
            Nuova Segnalazione
          </Link>
        </div>
      </div>

      {/* Barra Filtri e Ricerca */}
      <form method="GET" className="mt-6 bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label htmlFor="q" className="block text-xs font-semibold text-slate-600 uppercase mb-1">
            Cerca testo
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Parole chiave nella descrizione..."
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          />
        </div>

        <div>
          <label htmlFor="categoria" className="block text-xs font-semibold text-slate-600 uppercase mb-1">
            Categoria
          </label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={categoriaId || ''}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          >
            <option value="">Tutte le categorie</option>
            {categorie.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="stato" className="block text-xs font-semibold text-slate-600 uppercase mb-1">
            Stato Avanzamento
          </label>
          <select
            id="stato"
            name="stato"
            defaultValue={statoAvanzamento || ''}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          >
            <option value="">Tutti gli stati</option>
            <option value="RICEVUTA">RICEVUTA</option>
            <option value="PRESA_IN_CARICO">PRESA_IN_CARICO</option>
            <option value="INVIATA_AI_CANDIDATI">INVIATA_AI_CANDIDATI</option>
          </select>
        </div>

        <div>
          <label htmlFor="ord" className="block text-xs font-semibold text-slate-600 uppercase mb-1">
            Ordinamento
          </label>
          <div className="flex gap-2">
            <select
              id="ord"
              name="ord"
              defaultValue={ordinamento}
              className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            >
              <option value="piu_recenti">Più recenti</option>
              <option value="piu_sostenute">Più sostenute</option>
              <option value="meno_recenti">Meno recenti</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer"
            >
              Filtra
            </button>
          </div>
        </div>
      </form>

      {/* Risultati e Conteggio */}
      <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
        <span>Trovate {total} segnalazioni pubbliche</span>
        {totalPages > 1 && <span>Pagina {page} di {totalPages}</span>}
      </div>

      {/* Grid delle Segnalazioni */}
      {items.length === 0 ? (
        <div className="mt-8 bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-600 font-medium">Nessuna segnalazione corrisponde ai filtri selezionati.</p>
          <Link
            href="/segnalazioni"
            className="inline-block mt-3 text-sm text-blue-600 font-semibold hover:underline"
          >
            Azzera tutti i filtri
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((seg) => {
            const badgeColor =
              seg.stato_avanzamento === 'INVIATA_AI_CANDIDATI'
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                : seg.stato_avanzamento === 'PRESA_IN_CARICO'
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-blue-100 text-blue-800 border-blue-200';

            return (
              <article
                key={seg.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  {/* Anteprima Media Protetta se presente */}
                  {seg.primoMedia ? (
                    <div className="relative h-48 bg-slate-100 border-b border-slate-100 overflow-hidden">
                      {seg.primoMedia.tipo === 'FOTO' ? (
                        <Image
                          src={`/api/media/${seg.primoMedia.id}`}
                          alt="Allegato segnalazione"
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white">
                          <span className="text-3xl mb-1">▶️</span>
                          <span className="text-xs font-semibold">Video allegato</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shadow-xs ${badgeColor}`}>
                          {seg.stato_avanzamento.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-400">Nessun media</span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${badgeColor}`}>
                        {seg.stato_avanzamento.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}

                  <div className="p-5">
                    {/* Categorie */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {seg.categorie.map((c) => (
                        <span
                          key={c}
                          className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded"
                        >
                          {c}
                        </span>
                      ))}
                    </div>

                    <p className="text-slate-800 font-medium text-sm line-clamp-3">
                      {seg.descrizione}
                    </p>

                    <div className="mt-4 text-xs text-slate-400 flex items-center justify-between">
                      <span>
                        {new Date(seg.creata_il).toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </span>
                      <span>
                        Autore: {seg.autore.nome} {seg.autore.cognome?.[0]}.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md">
                    ❤️ {seg.totaleSostegniValidi} {seg.totaleSostegniValidi === 1 ? 'sostegno' : 'sostegni'}
                  </span>
                  <Link
                    href={`/segnalazioni/${seg.id}`}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Visualizza Dettagli &rarr;
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Paginazione */}
      {totalPages > 1 && (
        <nav aria-label="Paginazione" className="mt-10 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/segnalazioni?page=${page - 1}&categoria=${categoriaId || ''}&stato=${statoAvanzamento || ''}&ord=${ordinamento}&q=${q || ''}`}
              className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              &larr; Precedente
            </Link>
          )}

          <span className="text-sm text-slate-600 px-3">
            {page} / {totalPages}
          </span>

          {page < totalPages && (
            <Link
              href={`/segnalazioni?page=${page + 1}&categoria=${categoriaId || ''}&stato=${statoAvanzamento || ''}&ord=${ordinamento}&q=${q || ''}`}
              className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Successiva &rarr;
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
