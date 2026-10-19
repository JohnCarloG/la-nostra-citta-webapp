'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

export interface SegnalazionePunto {
  id: string;
  descrizione: string;
  latitudine: number;
  longitudine: number;
  stato_avanzamento: string;
  creata_il: Date | string;
  categorie: string[];
  mediaId: string | null;
  totaleSostegniValidi: number;
}

export interface MapViewProps {
  segnalazioni: SegnalazionePunto[];
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

const PAGE_SIZE = 6;

export default function MapView({ segnalazioni }: MapViewProps) {
  const [selectedPunto, setSelectedPunto] = useState<SegnalazionePunto | null>(
    segnalazioni.length > 0 ? segnalazioni[0] : null
  );
  const [activeTab, setActiveTab] = useState<'map' | 'list'>('map');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const defaultLat = 45.4642;
  const defaultLon = 9.19;

  // Lista degli altri punti (tutti tranne quello attualmente selezionato nel dettaglio, oppure tutti con indicatore attivo)
  // Qui manteniamo l'intero catalogo per garantire la navigazione completa
  const altriPunti = useMemo(() => {
    return segnalazioni.filter((p) => p.id !== selectedPunto?.id);
  }, [segnalazioni, selectedPunto]);

  const displayedPunti = useMemo(() => {
    return altriPunti.slice(0, visibleCount);
  }, [altriPunti, visibleCount]);

  const hasMore = altriPunti.length > visibleCount;
  const remainingCount = altriPunti.length - visibleCount;

  const handleSelectPunto = (punto: SegnalazionePunto) => {
    setSelectedPunto(punto);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Selettore Vista Mappa / Elenco accessibile */}
      <div className="flex items-center justify-between border-b border-[var(--border-light)] pb-3">
        <div className="flex items-center gap-2" role="tablist" aria-label="Modalità di visualizzazione">
          <button
            role="tab"
            aria-selected={activeTab === 'map'}
            aria-controls="panel-map"
            id="tab-map"
            onClick={() => setActiveTab('map')}
            className={`btn btn-sm ${activeTab === 'map' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Mappa interattiva
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'list'}
            aria-controls="panel-list"
            id="tab-list"
            onClick={() => setActiveTab('list')}
            className={`btn btn-sm ${activeTab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Elenco testuale accessibile ({segnalazioni.length})
          </button>
        </div>

        <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">
          {segnalazioni.length} punti geolocalizzati sul territorio
        </span>
      </div>

      {/* Vista Mappa */}
      {activeTab === 'map' && (
        <div
          id="panel-map"
          role="tabpanel"
          aria-labelledby="tab-map"
          className="flex flex-col lg:flex-row gap-6 items-start"
        >
          {/* Riquadro OpenStreetMap con fallback e iframe leggero */}
          <div className="panel p-0 flex-1 w-full overflow-hidden border border-[var(--border-medium)] rounded-[var(--radius-md)] min-h-[460px] lg:min-h-[640px] relative bg-[var(--bg-subtle)] flex flex-col">
            <div className="bg-white border-b border-[var(--border-light)] p-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">Mappa territoriale &bull; OpenStreetMap</span>
              {selectedPunto ? (
                <span className="font-mono text-[var(--text-primary)]">
                  {selectedPunto.latitudine.toFixed(4)}, {selectedPunto.longitudine.toFixed(4)}
                </span>
              ) : (
                <span className="text-[var(--text-muted)]">Nessun punto selezionato</span>
              )}
            </div>

            <div className="flex-1 w-full min-h-[420px]">
              <iframe
                title="Mappa territoriale delle segnalazioni"
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: '440px' }}
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${(selectedPunto?.longitudine ?? defaultLon) - 0.03}%2C${(selectedPunto?.latitudine ?? defaultLat) - 0.02}%2C${(selectedPunto?.longitudine ?? defaultLon) + 0.03}%2C${(selectedPunto?.latitudine ?? defaultLat) + 0.02}&layer=mapnik&marker=${selectedPunto?.latitudine ?? defaultLat}%2C${selectedPunto?.longitudine ?? defaultLon}`}
              />
            </div>
          </div>

          {/* Pannello laterale (desktop) o verticale naturale (mobile) */}
          <aside className="w-full lg:w-[420px] flex flex-col gap-5 shrink-0" aria-label="Dettagli e altri punti geolocalizzati">
            {/* Scheda del punto attualmente selezionato */}
            <div className="panel flex flex-col gap-3 shadow-sm border border-[var(--border-medium)]">
              <div className="flex items-center justify-between border-b border-[var(--border-light)] pb-2.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Punto selezionato sulla mappa
                </h2>
                {selectedPunto && <StatoBadge stato={selectedPunto.stato_avanzamento} />}
              </div>

              {selectedPunto ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedPunto.categorie.map((c, idx) => (
                      <span key={idx} className="badge badge-categoria">
                        {c}
                      </span>
                    ))}
                  </div>

                  <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
                    {selectedPunto.descrizione}
                  </p>

                  <div className="panel-subtle text-xs flex flex-col gap-1.5 p-3 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Sostegni validi:</span>
                      <strong className="text-[var(--text-primary)]">{selectedPunto.totaleSostegniValidi}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Data inserimento:</span>
                      <span>{new Date(selectedPunto.creata_il).toLocaleDateString('it-IT')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Coordinate geografiche:</span>
                      <span className="font-mono text-[var(--forest-primary)]">{selectedPunto.latitudine.toFixed(4)}, {selectedPunto.longitudine.toFixed(4)}</span>
                    </div>
                  </div>

                  <Link
                    href={`/segnalazioni/${selectedPunto.id}`}
                    className="btn btn-primary btn-sm w-full text-center mt-1"
                  >
                    Apri scheda completa &rarr;
                  </Link>
                </div>
              ) : (
                <div className="empty-state py-6">
                  <p className="text-xs text-[var(--text-muted)]">
                    Nessuna segnalazione geolocalizzata disponibile
                  </p>
                </div>
              )}
            </div>

            {/* Sezione “Altri punti disponibili” con intestazione fissa e paginazione fluida */}
            {segnalazioni.length > 1 && (
              <div className="panel border border-[var(--border-light)] flex flex-col shadow-sm" aria-labelledby="altri-punti-title">
                {/* Intestazione e conteggio sempre raggiungibili FUORI dall'area degli elementi */}
                <div className="flex items-center justify-between border-b border-[var(--border-light)] pb-3 mb-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <h3 id="altri-punti-title" className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      Altri punti disponibili
                    </h3>
                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-[0.6875rem] font-bold rounded-full bg-slate-100 text-slate-700">
                      {altriPunti.length}
                    </span>
                  </div>
                  <span className="text-[0.6875rem] text-[var(--text-muted)]">
                    Mostrati {Math.min(visibleCount, altriPunti.length)} di {altriPunti.length}
                  </span>
                </div>

                {/* Lista verticale con spaziatura adeguata (14px) e padding interno */}
                <div className="flex flex-col gap-3.5" role="list" aria-label="Elenco degli altri punti sulla mappa">
                  {displayedPunti.map((p) => {
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="listitem"
                        onClick={() => handleSelectPunto(p)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectPunto(p);
                          }
                        }}
                        className="text-left p-3.5 rounded-xl border border-[var(--border-light)] bg-white hover:border-[var(--forest-border)] hover:bg-[var(--surface-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest-primary)] transition-all flex flex-col gap-2 group cursor-pointer"
                        aria-label={`Seleziona punto: ${p.descrizione}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <StatoBadge stato={p.stato_avanzamento} />
                            {p.categorie.slice(0, 1).map((c, idx) => (
                              <span key={idx} className="badge badge-categoria text-[0.625rem]">
                                {c}
                              </span>
                            ))}
                          </div>
                          <span className="font-mono text-[0.625rem] text-[var(--text-muted)] shrink-0">
                            {p.latitudine.toFixed(4)}, {p.longitudine.toFixed(4)}
                          </span>
                        </div>

                        <p className="text-xs font-medium text-[var(--text-primary)] group-hover:text-[var(--forest-primary)] line-clamp-2 leading-relaxed">
                          {p.descrizione}
                        </p>

                        <div className="flex items-center justify-between text-[0.6875rem] text-[var(--text-muted)] pt-1 border-t border-[var(--border-light)]/60">
                          <span>Sostegni: <strong className="text-[var(--text-primary)]">{p.totaleSostegniValidi}</strong></span>
                          <span className="text-[var(--forest-primary)] group-hover:underline flex items-center gap-1 font-medium">
                            Centra sulla mappa &bull;
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Controlli di paginazione / Mostra altri */}
                {(hasMore || visibleCount > PAGE_SIZE) && (
                  <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-[var(--border-light)] shrink-0">
                    {hasMore ? (
                      <button
                        type="button"
                        onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                        className="btn btn-secondary btn-sm w-full font-medium"
                      >
                        Mostra altri ({remainingCount} rimanenti)
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setVisibleCount(PAGE_SIZE)}
                        className="btn btn-outline btn-sm w-full text-xs text-[var(--text-secondary)]"
                      >
                        Mostra meno
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Vista Elenco Testuale Accessibile */}
      {activeTab === 'list' && (
        <div id="panel-list" role="tabpanel" aria-labelledby="tab-list">
          {segnalazioni.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Nessuna segnalazione geolocalizzata trovata
              </p>
            </div>
          ) : (
            <div className="panel p-0 overflow-hidden">
              <table className="data-table" aria-label="Elenco testuale geolocalizzato">
                <thead>
                  <tr>
                    <th scope="col">Descrizione</th>
                    <th scope="col">Categorie</th>
                    <th scope="col" className="w-28 text-center">Stato</th>
                    <th scope="col" className="w-36 text-center">Coordinate</th>
                    <th scope="col" className="w-24 text-center">Sostegni</th>
                    <th scope="col" className="w-20 text-right">Azione</th>
                  </tr>
                </thead>
                <tbody>
                  {segnalazioni.map((p) => (
                    <tr key={p.id}>
                      <td className="font-semibold text-sm">
                        <Link href={`/segnalazioni/${p.id}`} className="hover:text-[var(--blue-primary)] hover:underline">
                          {p.descrizione}
                        </Link>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {p.categorie.map((c, idx) => (
                            <span key={idx} className="badge badge-categoria">
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-center">
                        <StatoBadge stato={p.stato_avanzamento} />
                      </td>
                      <td className="text-center font-mono text-xs text-[var(--text-muted)]">
                        {p.latitudine.toFixed(4)}, {p.longitudine.toFixed(4)}
                      </td>
                      <td className="text-center font-bold text-sm">
                        {p.totaleSostegniValidi}
                      </td>
                      <td className="text-right">
                        <Link href={`/segnalazioni/${p.id}`} className="btn btn-secondary btn-sm">
                          Scheda
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}