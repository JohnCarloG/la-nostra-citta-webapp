import Link from 'next/link';
import { getClassificaSegnalazioni, getCategorieAttive } from '@/lib/domain/segnalazioni';

interface PageProps {
  searchParams: Promise<{ categoria?: string }>;
}

export default async function ClassificaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const categoriaId = params.categoria || undefined;

  let categorie: Awaited<ReturnType<typeof getCategorieAttive>> = [];
  let classifica: Awaited<ReturnType<typeof getClassificaSegnalazioni>> = [];
  let dbError = false;

  try {
    const [cats, ranking] = await Promise.all([
      getCategorieAttive(),
      getClassificaSegnalazioni(50, 0, categoriaId)
    ]);
    categorie = cats;
    classifica = ranking;
  } catch (err) {
    dbError = true;
    console.error('Errore recupero priorità civiche:', err);
  }

  const categoriaSelezionata = categorie.find(c => c.id === categoriaId);

  return (
    <main className="page-container py-8 flex flex-col gap-6">
      {/* Testata della pagina con collegamento al Dossier */}
      <div className="border-b border-[var(--border-light)] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">
            Priorità civiche del territorio
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
            Elenco ordinato delle segnalazioni pubbliche in base al numero di sostegni espressi dai cittadini verificati.
            Questo elenco costituisce il riferimento civico per le richieste da sottoporre ai rappresentanti locali.
          </p>
        </div>

        <Link
          href={categoriaId ? `/dossier?categoria=${categoriaId}` : '/dossier'}
          className="btn btn-primary btn-sm flex items-center gap-1.5 self-start sm:self-auto shrink-0"
          id="btn-vai-dossier"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>Dossier Candidati (CSV/Stampa)</span>
        </Link>
      </div>

      {/* Riquadro istituzionale sulle regole di conteggio */}
      <div className="panel-subtle text-xs text-[var(--text-secondary)] border-l-4 border-l-[var(--blue-primary)] flex flex-col gap-1.5">
        <h2 className="font-bold text-[var(--text-primary)] text-xs">
          Criterio di ordinamento e garanzie di integrità:
        </h2>
        <ul className="list-disc pl-4 space-y-0.5 m-0">
          <li>
            <strong>Sostegni validi:</strong> conteggiati esclusivamente da cittadini con account verificato e attivo. L&rsquo;autosostegno è vietato.
          </li>
          <li>
            <strong>Criterio di spareggio:</strong> a parità di sostegni, precede la segnalazione inserita prima cronologicamente, garantendo un ordinamento deterministico.
          </li>
          <li>
            <strong>Trasparenza:</strong> le segnalazioni con 0 sostegni sono regolarmente incluse; quelle ritirate o in revisione sono escluse.
          </li>
        </ul>
      </div>

      {/* Filtro per categoria */}
      <form method="GET" action="/classifica" className="flex flex-wrap items-center gap-3 text-xs">
        <label htmlFor="categoria-filter" className="font-semibold text-[var(--text-primary)]">
          Filtra per ambito o categoria:
        </label>
        <select
          id="categoria-filter"
          name="categoria"
          defaultValue={categoriaId ?? ''}
          className="form-input text-xs"
          style={{ maxWidth: 280 }}
        >
          <option value="">Tutte le categorie</option>
          {categorie.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary btn-sm" id="classifica-filtra">
          Filtra
        </button>
        {categoriaId && (
          <Link href="/classifica" className="btn btn-secondary btn-sm">
            Mostra tutte
          </Link>
        )}
      </form>

      {/* Gestione Errore Database vs Stato Vuoto Reale */}
      {dbError ? (
        <div className="alert alert-error flex flex-col gap-2 py-4" role="alert">
          <strong className="text-sm font-bold">Servizio temporaneamente non disponibile</strong>
          <p className="text-xs text-[var(--text-secondary)]">
            Si è verificato un errore di comunicazione con il database durante il recupero della classifica.
          </p>
          <Link
            href={categoriaId ? `/classifica?categoria=${categoriaId}` : '/classifica'}
            className="btn btn-primary btn-xs self-start mt-1"
          >
            Ricarica pagina
          </Link>
        </div>
      ) : classifica.length === 0 ? (
        <div className="empty-state">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Nessuna segnalazione presente nella categoria selezionata
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
            {categoriaSelezionata
              ? `Non risultano ancora segnalazioni approvate per "${categoriaSelezionata.nome}".`
              : 'Non risultano al momento segnalazioni verificate e pubblicate.'}
          </p>
          {categoriaId && (
            <Link href="/classifica" className="btn btn-secondary btn-sm mt-3 inline-flex">
              Visualizza tutte le categorie
            </Link>
          )}
        </div>
      ) : (
        <div className="panel p-0 overflow-hidden">
          <table className="data-table" aria-label="Tabella delle priorità civiche">
            <thead>
              <tr>
                <th scope="col" className="w-16 text-center">N.</th>
                <th scope="col">Oggetto della segnalazione e ambito</th>
                <th scope="col" className="w-36 text-center hidden sm:table-cell">Stato iter</th>
                <th scope="col" className="w-28 text-center">Sostegni</th>
                <th scope="col" className="w-24 text-right">Azione</th>
              </tr>
            </thead>
            <tbody>
              {classifica.map((item, idx) => {
                const ordine = idx + 1;
                return (
                  <tr key={item.id}>
                    <td className="text-center font-mono font-bold text-xs text-[var(--text-secondary)]">
                      #{ordine}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {item.categorie?.map((catName: string, cIdx: number) => (
                          <span key={cIdx} className="badge badge-categoria">
                            {catName}
                          </span>
                        ))}
                      </div>
                      <Link
                        href={`/segnalazioni/${item.id}`}
                        className="font-semibold text-sm text-[var(--text-primary)] hover:text-[var(--blue-primary)] hover:underline block"
                      >
                        {item.descrizione}
                      </Link>
                      <span className="text-[0.6875rem] text-[var(--text-muted)] mt-0.5 block">
                        Inserita il {new Date(item.creata_il).toLocaleDateString('it-IT')}
                      </span>
                    </td>
                    <td className="text-center hidden sm:table-cell">
                      <span className="badge badge-categoria">
                        {item.stato_avanzamento.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="font-bold text-sm text-[var(--text-primary)]">
                        {item.totaleSostegniValidi}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/segnalazioni/${item.id}`}
                        className="btn btn-secondary btn-sm"
                        aria-label={`Dettaglio segnalazione posizione ${ordine}`}
                      >
                        Scheda
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