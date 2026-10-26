import Link from 'next/link';
import { getCategorieAttive } from '@/lib/domain/segnalazioni';
import { getDossierSegnalazioni, DossierFiltri, DossierItem } from '@/lib/domain/dossier';
import DossierPrintButton from './print-button';

interface PageProps {
  searchParams: Promise<{
    categoria?: string;
    stato?: string;
    ordinamento?: string;
  }>;
}

export default async function DossierPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const categoriaId = params.categoria || undefined;
  const statoParam = params.stato || undefined;
  const ordinamentoParam = params.ordinamento || undefined;

  let statoAvanzamento: DossierFiltri['statoAvanzamento'];
  if (
    statoParam === 'RICEVUTA' ||
    statoParam === 'PRESA_IN_CARICO' ||
    statoParam === 'INVIATA_AI_CANDIDATI'
  ) {
    statoAvanzamento = statoParam;
  }

  let ordinamento: DossierFiltri['ordinamento'] = 'piu_sostenute';
  if (ordinamentoParam === 'piu_recenti' || ordinamentoParam === 'meno_recenti') {
    ordinamento = ordinamentoParam;
  }

  let categorie: Awaited<ReturnType<typeof getCategorieAttive>> = [];
  let items: DossierItem[] = [];
  let dbError = false;

  try {
    const [cats, dossierItems] = await Promise.all([
      getCategorieAttive(),
      getDossierSegnalazioni({
        categoriaId,
        statoAvanzamento,
        ordinamento,
        limite: 1000,
      }),
    ]);
    categorie = cats;
    items = dossierItems;
  } catch (err: unknown) {
    dbError = true;
    console.error('[ERRORE CARICAMENTO DOSSIER]:', err);
  }

  const categoriaSelezionata = categorie.find(c => c.id === categoriaId);
  const now = new Date();
  const dataEstrazioneFormattata = now.toLocaleString('it-IT', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Rome',
  });

  const queryParams = new URLSearchParams();
  if (categoriaId) queryParams.set('categoria', categoriaId);
  if (statoAvanzamento) queryParams.set('stato', statoAvanzamento);
  if (ordinamento && ordinamento !== 'piu_sostenute') queryParams.set('ordinamento', ordinamento);
  const queryString = queryParams.toString();
  const csvDownloadUrl = `/api/dossier/csv${queryString ? `?${queryString}` : ''}`;

  const totaleSostegni = items.reduce((acc, curr) => acc + curr.sostegni_validi, 0);

  return (
    <main className="page-container py-8 flex flex-col gap-6" id="dossier-main-content">
      {/* Testata Istituzionale Dossier */}
      <div className="border-b border-[var(--border-light)] pb-4 flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--forest-700)] bg-[var(--forest-50)] px-2.5 py-1 rounded">
              Documento Ufficiale per Forze Politiche e Candidati (RF13, T18)
            </span>
            <h1 className="page-title text-2xl sm:text-3xl text-[var(--forest-900)] mt-2">
              Dossier Priorità Territoriali — Città di Milano
            </h1>
          </div>

          {/* Azioni rapide di esportazione (nascoste nella stampa) */}
          <div className="flex items-center gap-2 print:hidden self-start sm:self-auto" data-print-hidden="true">
            <a
              href={csvDownloadUrl}
              download
              className="btn btn-primary btn-sm flex items-center gap-1.5"
              aria-label="Scarica il dossier in formato CSV"
              id="btn-download-dossier-csv"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Scarica CSV</span>
            </a>
            <DossierPrintButton />
          </div>
        </div>

        <p className="text-sm text-[var(--text-secondary)] max-w-4xl mt-1">
          Riepilogo delle segnalazioni pubbliche documentate e sostenute dalla comunità civica di Milano.
          I dati riportati sono calcolati all&rsquo;atto della consultazione applicando le regole di integrità:
          esclusione delle segnalazioni ritirate o in revisione e conteggio rigoroso dei soli sostenitori verificati e attivi.
        </p>
      </div>

      {/* Riquadro Metadati Estrazione e Garanzie di Integrità */}
      <div className="panel-subtle text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[var(--border-medium)]">
        <div className="flex flex-col gap-1">
          <div>
            <strong className="text-[var(--text-primary)]">Data di estrazione: </strong>
            <span className="font-mono text-[var(--text-secondary)]">{dataEstrazioneFormattata}</span>
          </div>
          <div>
            <strong className="text-[var(--text-primary)]">Filtri applicati: </strong>
            <span className="text-[var(--text-secondary)]">
              {categoriaSelezionata ? `Categoria: ${categoriaSelezionata.nome}` : 'Tutte le categorie'}
              {' • '}
              {statoAvanzamento ? `Avanzamento: ${statoAvanzamento}` : 'Tutti gli stati (Ricevuta, Presa in carico, Inviata ai candidati)'}
              {' • '}
              {ordinamento === 'piu_recenti' ? 'Ordina per data decrescente' : ordinamento === 'meno_recenti' ? 'Ordina per data crescente' : 'Ordina per sostegni decrescenti (Classifica)'}
            </span>
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Nota: I dati visualizzati e l&rsquo;export CSV condividono i medesimi filtri e regole di aggregazione, calcolati in tempo reale su ciascuna richiesta.
          </div>
        </div>

        {!dbError && (
          <div className="flex sm:flex-col items-baseline sm:items-end gap-3 sm:gap-0.5 shrink-0 bg-white p-2.5 rounded border border-[var(--border-light)]">
            <span className="text-xs text-[var(--text-muted)]">Totale segnalazioni: <strong className="text-[var(--forest-900)] text-sm">{items.length}</strong></span>
            <span className="text-xs text-[var(--text-muted)]">Sostegni complessivi: <strong className="text-[var(--forest-900)] text-sm">{totaleSostegni}</strong></span>
          </div>
        )}
      </div>

      {/* Controlli di Filtro e Selezione (Nascosti nella stampa cartacea) */}
      <div className="panel p-3 border border-[var(--border-light)] print:hidden flex flex-wrap items-center justify-between gap-3 text-xs" data-print-hidden="true">
        <form method="GET" action="/dossier" className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label htmlFor="filtro-categoria-dossier" className="font-semibold text-[var(--text-primary)]">
              Categoria:
            </label>
            <select
              id="filtro-categoria-dossier"
              name="categoria"
              defaultValue={categoriaId || ''}
              className="form-input text-xs py-1 px-2.5"
            >
              <option value="">Tutte le categorie</option>
              {categorie.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="filtro-stato-dossier" className="font-semibold text-[var(--text-primary)]">
              Stato avanzamento:
            </label>
            <select
              id="filtro-stato-dossier"
              name="stato"
              defaultValue={statoAvanzamento || ''}
              className="form-input text-xs py-1 px-2.5"
            >
              <option value="">Tutti gli stati</option>
              <option value="RICEVUTA">Ricevuta</option>
              <option value="PRESA_IN_CARICO">Presa in carico</option>
              <option value="INVIATA_AI_CANDIDATI">Inviata ai candidati</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="filtro-ordine-dossier" className="font-semibold text-[var(--text-primary)]">
              Ordinamento:
            </label>
            <select
              id="filtro-ordine-dossier"
              name="ordinamento"
              defaultValue={ordinamento}
              className="form-input text-xs py-1 px-2.5"
            >
              <option value="piu_sostenute">Più sostenute (Priorità)</option>
              <option value="piu_recenti">Più recenti</option>
              <option value="meno_recenti">Meno recenti</option>
            </select>
          </div>

          <button type="submit" className="btn btn-secondary btn-xs">
            Applica filtri
          </button>

          {(categoriaId || statoAvanzamento || ordinamento !== 'piu_sostenute') && (
            <Link href="/dossier" className="text-xs text-[var(--forest-600)] underline hover:text-[var(--forest-800)] ml-1">
              Azzera filtri
            </Link>
          )}
        </form>
      </div>

      {/* Gestione Indisponibilità Database (RF13, Requisito 4) */}
      {dbError ? (
        <div className="alert alert-error flex flex-col gap-3 py-6 px-4" role="alert">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">⚠️</span>
            <div className="flex flex-col gap-1">
              <strong className="text-sm font-bold">Servizio Dossier temporaneamente non disponibile</strong>
              <p className="text-xs text-[var(--text-secondary)]">
                Si è verificato un errore di connessione con il database durante l&rsquo;estrazione delle priorità civiche.
                Per tutelare l&rsquo;integrità del documento, il sistema non mostra conteggi zero inventati né tabelle parziali.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start pl-9">
            <Link href={`/dossier${queryString ? `?${queryString}` : ''}`} className="btn btn-primary btn-xs">
              Riprova caricamento
            </Link>
            <Link href="/classifica" className="btn btn-secondary btn-xs">
              Torna alla classifica
            </Link>
          </div>
        </div>
      ) : items.length === 0 ? (
        /* Stato vuoto autentico (query riuscita senza segnalazioni corrispondenti) */
        <div className="empty-state text-center py-12 px-4 border-2 border-dashed border-[var(--border-medium)] rounded-[var(--radius-lg)]">
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            Nessuna segnalazione corrisponde ai filtri selezionati
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1.5 max-w-md mx-auto">
            Non sono presenti segnalazioni pubbliche approvate per la categoria o lo stato specificato.
            Modifica i criteri di ricerca per visualizzare altre priorità civiche.
          </p>
          <Link href="/dossier" className="btn btn-secondary btn-sm mt-4">
            Visualizza tutte le priorità del dossier
          </Link>
        </div>
      ) : (
        /* Tabella Dossier Accessibile e Ottimizzata per la Stampa */
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-medium)] bg-white shadow-sm">
          <table className="dossier-table w-full text-left text-xs border-collapse">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-primary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-medium)]">
              <tr>
                <th scope="col" className="p-2.5 font-bold w-12 text-center">#</th>
                <th scope="col" className="p-2.5 font-bold w-24">Codice</th>
                <th scope="col" className="p-2.5 font-bold min-w-[280px]">Descrizione</th>
                <th scope="col" className="p-2.5 font-bold min-w-[140px]">Categorie</th>
                <th scope="col" className="p-2.5 font-bold w-36">Coordinate</th>
                <th scope="col" className="p-2.5 font-bold w-24 text-center">Sostegni</th>
                <th scope="col" className="p-2.5 font-bold w-32">Stato Avanzamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-light)]">
              {items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-[var(--forest-50)]/50 transition-colors">
                  <td className="p-2.5 text-center font-bold text-[var(--forest-900)]">
                    {idx + 1}
                  </td>
                  <td className="p-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                    <Link
                      href={`/segnalazioni/${item.id}`}
                      className="hover:underline hover:text-[var(--forest-700)]"
                      title="Apri dettaglio segnalazione"
                    >
                      {item.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="p-2.5 text-[var(--text-primary)] leading-relaxed">
                    <p className="line-clamp-3 sm:line-clamp-none m-0 whitespace-pre-line">
                      {item.descrizione}
                    </p>
                  </td>
                  <td className="p-2.5 text-[var(--text-secondary)]">
                    {item.categorie.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.categorie.map(cat => (
                          <span
                            key={cat}
                            className="bg-[var(--bg-subtle)] text-[var(--forest-800)] px-1.5 py-0.5 rounded text-[10px] border border-[var(--border-light)]"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)] italic">Nessuna categoria</span>
                    )}
                  </td>
                  <td className="p-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                    {item.latitudine.toFixed(4)}, {item.longitudine.toFixed(4)}
                  </td>
                  <td className="p-2.5 text-center font-bold text-[var(--forest-800)] text-sm">
                    {item.sostegni_validi}
                  </td>
                  <td className="p-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                        item.stato_avanzamento === 'INVIATA_AI_CANDIDATI'
                          ? 'bg-blue-100 text-blue-900 border border-blue-200'
                          : item.stato_avanzamento === 'PRESA_IN_CARICO'
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                      }`}
                    >
                      {item.stato_avanzamento === 'INVIATA_AI_CANDIDATI'
                        ? 'Inviata candidati'
                        : item.stato_avanzamento === 'PRESA_IN_CARICO'
                        ? 'Presa in carico'
                        : 'Ricevuta'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
