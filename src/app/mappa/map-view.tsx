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

export default function MapView({ segnalazioni }: MapViewProps) {
  const [selectedPunto, setSelectedPunto] = useState<SegnalazionePunto | null>(
    segnalazioni[0] || null
  );
  const [activeTab, setActiveTab] = useState<'map' | 'list'>('map');

  // Calcolo bounding box o centro per Milano (default: lat ~45.464, lon ~9.190)
  const defaultLat = 45.4642;
  const defaultLon = 9.19;

  return (
    <div className="space-y-6">
      {/* Tab Switcher per Accessibilità (Mappa Grafica vs Alternativa Testuale) */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2" role="tablist" aria-label="Visualizzazione mappa o elenco alternativo">
          <button
            role="tab"
            aria-selected={activeTab === 'map'}
            id="tab-map"
            aria-controls="panel-map"
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'map'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            🗺️ Mappa Interattiva
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'list'}
            id="tab-list"
            aria-controls="panel-list"
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'list'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            📋 Alternativa Testuale Accessibile ({segnalazioni.length})
          </button>
        </div>

        <span className="text-xs text-slate-500 hidden sm:inline">
          {segnalazioni.length} punti georeferenziati approvati
        </span>
      </div>

      {/* PANNELLO 1: MAPPA INTERATTIVA */}
      {activeTab === 'map' && (
        <div id="panel-map" role="tabpanel" aria-labelledby="tab-map" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Visualizzatore Grafico */}
          <div className="lg:col-span-2 bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 relative min-h-[460px] flex flex-col justify-between">
            {/* Mappa con layer OpenStreetMap incorporato */}
            <iframe
              title="Mappa del territorio e delle priorità civiche"
              width="100%"
              height="100%"
              className="w-full h-[460px] border-0"
              loading="lazy"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=9.0400%2C45.3800%2C9.2800%2C45.5400&layer=mapnik&marker=${
                selectedPunto ? selectedPunto.latitudine : defaultLat
              }%2C${selectedPunto ? selectedPunto.longitudine : defaultLon}`}
            />

            {/* Badge Sovrapposto con controlli */}
            <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs p-2.5 rounded-lg shadow-md border border-slate-200 text-xs">
              <span className="font-bold text-slate-900 block">Territorio Urbano di Milano</span>
              <span className="text-slate-500">Punti geolocalizzati confermati</span>
            </div>
          </div>

          {/* Dettaglio Pin Selezionato & Punti Cliccabili */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">
                Dettaglio Punto Selezionato
              </h2>

              {selectedPunto ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {selectedPunto.categorie.map(cat => (
                      <span key={cat} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                        {cat}
                      </span>
                    ))}
                  </div>

                  <p className="text-sm font-medium text-slate-800 line-clamp-4">
                    {selectedPunto.descrizione}
                  </p>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                    <div>
                      <span className="text-slate-500">Coordinate:</span>{' '}
                      <span className="font-mono text-slate-700 font-semibold">
                        {selectedPunto.latitudine.toFixed(5)}, {selectedPunto.longitudine.toFixed(5)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Avanzamento:</span>{' '}
                      <span className="font-semibold text-slate-800">
                        {selectedPunto.stato_avanzamento}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Sostegni validi:</span>{' '}
                      <span className="font-bold text-rose-700">
                        ❤️ {selectedPunto.totaleSostegniValidi}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/segnalazioni/${selectedPunto.id}`}
                    className="block text-center w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors"
                  >
                    Apri Scheda Completa &rarr;
                  </Link>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Nessuna segnalazione selezionata</p>
              )}
            </div>

            {/* Lista rapida dei pin */}
            <div className="pt-3 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase block mb-2">
                Punti territoriali ({segnalazioni.length}):
              </span>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {segnalazioni.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPunto(p)}
                    className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      selectedPunto?.id === p.id
                        ? 'bg-blue-50 border border-blue-200 font-semibold text-blue-900'
                        : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                    }`}
                  >
                    <span className="truncate pr-2">{p.descrizione.slice(0, 40)}...</span>
                    <span className="text-rose-600 font-bold shrink-0">❤️ {p.totaleSostegniValidi}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PANNELLO 2: ALTERNATIVA TESTUALE UTILIZZABILE E ACCESSIBILE (RF09, T16) */}
      {activeTab === 'list' && (
        <section id="panel-list" role="tabpanel" aria-labelledby="tab-list" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Alternativa Testuale Completa dei Punti Geografici
            </h2>
            <p className="text-xs text-slate-500">
              Tutte le segnalazioni approvate sul territorio sono elencate con le relative coordinate geografiche e stato, fruibili mediante tastiera o tecnologie assistive.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                  <th scope="col" className="py-3 px-4">Descrizione</th>
                  <th scope="col" className="py-3 px-4">Categorie</th>
                  <th scope="col" className="py-3 px-4">Latitudine</th>
                  <th scope="col" className="py-3 px-4">Longitudine</th>
                  <th scope="col" className="py-3 px-4">Avanzamento</th>
                  <th scope="col" className="py-3 px-4 text-center">Sostegni</th>
                  <th scope="col" className="py-3 px-4 text-right">Azione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {segnalazioni.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-medium text-slate-900 max-w-xs truncate">
                      {p.descrizione}
                    </td>
                    <td className="py-3 px-4">
                      {p.categorie.join(', ') || 'Nessuna'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {p.latitudine.toFixed(6)}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {p.longitudine.toFixed(6)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {p.stato_avanzamento}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-rose-700">
                      ❤️ {p.totaleSostegniValidi}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/segnalazioni/${p.id}`}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800"
                      >
                        Scheda &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
