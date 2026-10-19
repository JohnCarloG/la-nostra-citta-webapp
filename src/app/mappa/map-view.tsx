'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SegnalazionePunto {
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

interface MapViewProps {
  segnalazioni: SegnalazionePunto[];
}

function StatoBadge({ stato }: { stato: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    RICEVUTA:             { cls: 'badge badge-ricevuta',  label: 'Ricevuta' },
    PRESA_IN_CARICO:      { cls: 'badge badge-carico',    label: 'In carico' },
    INVIATA_AI_CANDIDATI: { cls: 'badge badge-candidati', label: 'Ai candidati' },
  };
  const { cls, label } = map[stato] ?? { cls: 'badge badge-categoria', label: stato.replace(/_/g, ' ') };
  return <span className={cls}>{label}</span>;
}

export default function MapView({ segnalazioni }: MapViewProps) {
  const [selectedPunto, setSelectedPunto] = useState<SegnalazionePunto | null>(segnalazioni[0] || null);
  const [activeTab, setActiveTab] = useState<'map' | 'list'>('map');

  const defaultLat = 45.4642;
  const defaultLon = 9.19;

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
        <div id="panel-map" role="tabpanel" aria-labelledby="tab-map" className="flex flex-col lg:flex-row gap-4">
          {/* Riquadro OpenStreetMap con fallback e iframe leggero */}
          <div className="panel p-0 flex-1 overflow-hidden border border-[var(--border-medium)] rounded-[var(--radius-md)] min-h-[460px] relative bg-[var(--bg-subtle)] flex flex-col">
            <div className="bg-white border-b border-[var(--border-light)] p-2.5 flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Mappa territoriale &bull; OpenStreetMap</span>
              {selectedPunto && (
                <span className="font-mono text-[var(--text-primary)]">
                  {selectedPunto.latitudine.toFixed(4)}, {selectedPunto.longitudine.toFixed(4)}
                </span>
              )}
            </div>

            <div className="flex-1 w-full min-h-[400px]">
              <iframe
                title="Mappa territoriale delle segnalazioni"
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: '420px' }}
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${(selectedPunto?.longitudine ?? defaultLon) - 0.03}%2C${(selectedPunto?.latitudine ?? defaultLat) - 0.02}%2C${(selectedPunto?.longitudine ?? defaultLon) + 0.03}%2C${(selectedPunto?.latitudine ?? defaultLat) + 0.02}&layer=mapnik&marker=${selectedPunto?.latitudine ?? defaultLat}%2C${selectedPunto?.longitudine ?? defaultLon}`}
              />
            </div>
          </div>

          {/* Scheda del punto selezionato */}
          <div className="w-full lg:w-80 panel flex flex-col justify-between shrink-0">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
                Dettaglio punto selezionato
              </h2>

              {selectedPunto ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatoBadge stato={selectedPunto.stato_avanzamento} />
                    {selectedPunto.categorie.map((c, idx) => (
                      <span key={idx} className="badge badge-categoria">
                        {c}
                      </span>
                    ))}
                  </div>

                  <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
                    {selectedPunto.descrizione}
                  </p>

                  <div className="panel-subtle text-xs flex flex-col gap-1">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Sostegni validi:</span>
                      <strong className="text-[var(--text-primary)]">{selectedPunto.totaleSostegniValidi}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Data inserimento:</span>
                      <span>{new Date(selectedPunto.creata_il).toLocaleDateString('it-IT')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Coordinate:</span>
                      <span className="font-mono">{selectedPunto.latitudine.toFixed(4)}, {selectedPunto.longitudine.toFixed(4)}</span>
                    </div>
                  </div>

                  <Link
                    href={`/segnalazioni/${selectedPunto.id}`}
                    className="btn btn-primary btn-sm w-full text-center mt-2"
                  >
                    Apri scheda completa &rarr;
                  </Link>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  Nessun punto selezionato sulla mappa.
                </p>
              )}
            </div>

            {/* Elenco compatto di selezione rapida */}
            {segnalazioni.length > 1 && (
              <div className="border-t border-[var(--border-light)] pt-3 mt-4">
                <span className="text-[0.6875rem] font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-2">
                  Altri punti disponibili:
                </span>
                <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1">
                  {segnalazioni.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPunto(p)}
                      className={`text-left text-xs p-1.5 rounded-[var(--radius-xs)] truncate transition-colors ${
                        selectedPunto?.id === p.id
                          ? 'bg-[var(--blue-primary-light)] text-[var(--blue-primary)] font-bold'
                          : 'hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      &bull; {p.descrizione}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
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