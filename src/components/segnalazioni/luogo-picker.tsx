'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  LuogoPickerState,
  STATO_INIZIALE_LUOGO,
  avviaRicerca,
  riceviRisultatiRicerca,
  selezionaRisultatoRicerca,
  correggiPuntoMappa,
  impostaPosizioneGps,
  gestisciErroreGps,
  proponiExif,
  accettaSuggerimentoExif,
  ignoraSuggerimentoExif,
  impostaPosizioneManuale,
  impostaConfermaPosizione,
  rimuoviPosizione,
  validaCoordinate,
  GeocodingResult,
  ExifSuggerimento,
  PosizioneScelta,
} from '@/lib/geo/location-picker';

// Importazione dinamica client-only per evitare esecuzione SSR di Leaflet
const MappaLuogoPicker = dynamic(() => import('./mappa-luogo-picker'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[360px] sm:h-[420px] rounded-[var(--radius-md)] flex flex-col items-center justify-center bg-[var(--bg-subtle)] border border-[var(--border-medium)] text-xs text-[var(--text-secondary)] gap-2">
      <div className="w-5 h-5 border-2 border-[var(--forest-500)] border-t-transparent rounded-full animate-spin" />
      <span>Caricamento mappa territoriale OpenStreetMap…</span>
    </div>
  ),
});

export interface LuogoPickerProps {
  exifProposta?: ExifSuggerimento | null;
  onLocationChange: (
    location: {
      lat: number;
      lon: number;
      origine: 'MANUALE' | 'EXIF_CONFERMATO';
      confermata: boolean;
      indirizzo?: string;
    } | null
  ) => void;
  disabled?: boolean;
}

export default function LuogoPicker({
  exifProposta,
  onLocationChange,
  disabled = false,
}: LuogoPickerProps) {
  const [state, setState] = useState<LuogoPickerState>(STATO_INIZIALE_LUOGO);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'map' | 'manual'>('map');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Campi per l'alternativa testuale accessibile
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Sincronizza le coordinate verso il form genitore ogni volta che la posizione cambia
  useEffect(() => {
    if (!state.posizione) {
      onLocationChange(null);
    } else {
      onLocationChange({
        lat: state.posizione.lat,
        lon: state.posizione.lon,
        origine: state.posizione.origine === 'EXIF' ? 'EXIF_CONFERMATO' : 'MANUALE',
        confermata: state.posizione.confermata,
        indirizzo: state.posizione.indirizzo,
      });
    }
  }, [state.posizione, onLocationChange]);

  // Tracciamento della proposta EXIF precedente secondo pattern ufficiale React per prop change
  const [prevExif, setPrevExif] = useState<ExifSuggerimento | null>(null);
  const currentExif = exifProposta ?? null;
  if (currentExif !== prevExif) {
    setPrevExif(currentExif);
    if (currentExif) {
      setState(prev => proponiExif(prev, currentExif));
    }
  }

  // Passaggio alla visualizzazione manuale con sincronizzazione dei valori
  const handleSwitchTab = (tab: 'map' | 'manual') => {
    setActiveTab(tab);
    if (tab === 'manual' && state.posizione) {
      setManualLat(state.posizione.lat.toFixed(6));
      setManualLon(state.posizione.lon.toFixed(6));
      if (state.posizione.indirizzo) {
        setManualAddress(state.posizione.indirizzo);
      }
    }
  };

  // Esegue la ricerca tramite l'API server protetta (/api/geo/search) su azione esplicita dell'utente
  const eseguiRicerca = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setState(prev => ({ ...prev, ricercaRisultati: [], ricercaErrore: null, ricercaInCorso: false }));
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    searchAbortRef.current = abortCtrl;

    let reqId = 0;
    setState(prev => {
      const res = avviaRicerca(prev);
      reqId = res.requestId;
      return res.nuovoStato;
    });

    try {
      const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`, {
        signal: abortCtrl.signal,
      });
      const data = await res.json();

      if (!res.ok) {
        setState(prev => riceviRisultatiRicerca(prev, reqId, [], data.error || 'Errore durante la ricerca'));
        return;
      }

      setState(prev => riceviRisultatiRicerca(prev, reqId, data.results || [], null));
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      setState(prev =>
        riceviRisultatiRicerca(
          prev,
          reqId,
          [],
          'Impossibile contattare il servizio di geocodifica. Usa la mappa o l’inserimento manuale.'
        )
      );
    }
  }, []);

  // Gestione input ricerca: NON invia richieste durante la digitazione (vietato dalla policy Nominatim OSMF)
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setHighlightedIndex(-1);

    if (!val.trim()) {
      setState(prev => ({ ...prev, ricercaRisultati: [], ricercaErrore: null }));
    }
  };

  // Selezione risultato con mouse o tastiera
  const handleSelectResult = (risultato: GeocodingResult) => {
    setState(prev => selezionaRisultatoRicerca(prev, risultato));
    setSearchQuery(risultato.titolo);
    setHighlightedIndex(-1);
  };

  // Navigazione da tastiera nei risultati di ricerca (o Invio per eseguire la ricerca)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (state.ricercaRisultati.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        eseguiRicerca(searchQuery);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < state.ricercaRisultati.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : state.ricercaRisultati.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < state.ricercaRisultati.length) {
        handleSelectResult(state.ricercaRisultati[highlightedIndex]);
      } else {
        eseguiRicerca(searchQuery);
      }
    } else if (e.key === 'Escape') {
      setState(prev => ({ ...prev, ricercaRisultati: [] }));
    }
  };

  // Geolocalizzazione ("Usa la mia posizione")
  const handleUsaPosizione = () => {
    if (!navigator.geolocation) {
      setState(prev => gestisciErroreGps(prev, 'UNSUPPORTED', 'Geolocalizzazione non supportata dal tuo browser.'));
      return;
    }

    setState(prev => ({ ...prev, geoInCorso: true, geoErrore: null }));

    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lon = parseFloat(pos.coords.longitude.toFixed(6));
        setState(prev => impostaPosizioneGps(prev, { lat, lon }));
      },
      err => {
        setState(prev => gestisciErroreGps(prev, err.code, err.message));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Interazione mappa (click o drag)
  const handleMapSelect = useCallback((coords: { lat: number; lon: number }) => {
    setState(prev => correggiPuntoMappa(prev, coords));
  }, []);

  // Invio manuale coordinate (alternativa testuale)
  const handleApplyManualCoords = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);

    const latNum = parseFloat(manualLat);
    const lonNum = parseFloat(manualLon);

    const validazione = validaCoordinate(latNum, lonNum);
    if (!validazione.valida) {
      setManualError(validazione.errore || 'Coordinate geografiche non valide');
      return;
    }

    setState(prev => {
      const res = impostaPosizioneManuale(prev, latNum, lonNum, manualAddress);
      if (res.errore) {
        setManualError(res.errore);
        return prev;
      }
      return res.nuovoStato;
    });
  };

  // Formatta l'etichetta dell'origine per il riepilogo
  const formatOrigineLabel = (orig: PosizioneScelta['origine']) => {
    switch (orig) {
      case 'RICERCA':
        return 'Ricerca indirizzo';
      case 'MAPPA':
        return 'Mappa interattiva';
      case 'GPS':
        return 'GPS dispositivo';
      case 'EXIF':
        return 'Metadati foto (EXIF)';
      case 'MANUALE':
        return 'Inserimento manuale';
      default:
        return orig;
    }
  };

  return (
    <div className="panel-subtle p-3.5 sm:p-4 rounded-[var(--radius-lg)] border border-[var(--border-medium)] flex flex-col gap-4">
      {/* Intestazione del blocco */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-light)] pb-2.5">
        <div>
          <h3 className="text-sm font-bold text-[var(--forest-900)] flex items-center gap-1.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Luogo della segnalazione <span className="text-[var(--error-text)]">*</span>
          </h3>
          <p className="text-[0.6875rem] text-[var(--text-secondary)] mt-0.5">
            Indica con precisione dove si verifica la situazione a Milano. Puoi cercare per via, cliccare sulla mappa o usare le coordinate.
          </p>
        </div>

        {/* Tab switcher accessibile: Mappa vs Alternativa testuale */}
        <div className="flex items-center gap-1 self-start sm:self-auto bg-white p-0.5 rounded-[var(--radius-md)] border border-[var(--border-light)]" role="tablist" aria-label="Modalità di selezione luogo">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'map'}
            id="tab-luogo-mappa"
            aria-controls="panel-luogo-mappa"
            onClick={() => handleSwitchTab('map')}
            className={`btn btn-xs ${activeTab === 'map' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Mappa e ricerca
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'manual'}
            id="tab-luogo-manuale"
            aria-controls="panel-luogo-manuale"
            onClick={() => handleSwitchTab('manual')}
            className={`btn btn-xs ${activeTab === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Alternativa testuale
          </button>
        </div>
      </div>

      {/* Suggerimento EXIF (se rilevato dai file allegati) */}
      {state.exifSuggerimento && (
        <div
          className="alert alert-info flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
          role="region"
          aria-label="Suggerimento posizione geografica dalla foto"
        >
          <div className="flex items-start gap-2">
            <span className="text-base leading-none">📷</span>
            <div>
              <strong className="block text-[var(--text-primary)]">
                Posizione GPS rilevata nella foto caricata ({state.exifSuggerimento.nomeFile})
              </strong>
              <span className="text-[var(--text-secondary)]">
                Coordinate estratte: {state.exifSuggerimento.lat.toFixed(6)}, {state.exifSuggerimento.lon.toFixed(6)}.
                Vuoi impostarla come luogo di questa segnalazione?
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setState(prev => accettaSuggerimentoExif(prev))}
              className="btn btn-primary btn-xs"
            >
              Usa posizione dalla foto
            </button>
            <button
              type="button"
              onClick={() => setState(prev => ignoraSuggerimentoExif(prev))}
              className="btn btn-secondary btn-xs"
            >
              Ignora
            </button>
          </div>
        </div>
      )}

      {/* Notifica di errore Geolocalizzazione (non bloccante) */}
      {state.geoErrore && (
        <div className="alert alert-warning py-1.5 px-3 text-xs flex items-center justify-between" role="alert">
          <span>{state.geoErrore}</span>
          <button
            type="button"
            onClick={() => setState(prev => ({ ...prev, geoErrore: null }))}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs ml-2"
            aria-label="Chiudi notifica errore geolocalizzazione"
          >
            ✕
          </button>
        </div>
      )}

      {/* VISTA 1: Ricerca e Mappa Interattiva */}
      {activeTab === 'map' && (
        <div id="panel-luogo-mappa" role="tabpanel" aria-labelledby="tab-luogo-mappa" className="flex flex-col gap-3">
          {/* Barra di ricerca con azione esplicita (Invio o Cerca) conforme a policy OSMF Nominatim */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <label htmlFor="ricerca-indirizzo-milano" className="sr-only">
                Cerca via, piazza o luogo a Milano
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 flex items-center">
                  <input
                    ref={searchInputRef}
                    id="ricerca-indirizzo-milano"
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={state.ricercaRisultati.length > 0}
                    aria-controls="lista-risultati-indirizzi"
                    aria-activedescendant={
                      highlightedIndex >= 0 ? `risultato-${highlightedIndex}` : undefined
                    }
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                    disabled={disabled}
                    placeholder="Cerca via, piazza o luogo a Milano (es. Via Dante, Piazza Duomo)…"
                    className="form-input text-xs pr-8"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setState(prev => ({ ...prev, ricercaRisultati: [], ricercaErrore: null }));
                      }}
                      className="absolute right-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 text-xs"
                      aria-label="Cancella testo di ricerca"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  id="btn-cerca-indirizzo"
                  onClick={() => eseguiRicerca(searchQuery)}
                  disabled={disabled || state.ricercaInCorso || searchQuery.trim().length < 2}
                  className="btn btn-primary btn-sm shrink-0 flex items-center justify-center gap-1.5 text-xs"
                  aria-label="Cerca indirizzo"
                >
                  {state.ricercaInCorso ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-label="Ricerca in corso" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  )}
                  <span>Cerca</span>
                </button>
              </div>

              {/* Nota esplicita sui limiti del provider pubblico */}
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Premi <strong>Invio</strong> o clicca <strong>Cerca</strong>. Dati geografici © OpenStreetMap contributors, ODbL 1.0 (limite 1 req/s per app).
              </p>

              {/* Messaggio di stato per Screen Reader */}
              <div className="sr-only" aria-live="polite">
                {state.ricercaInCorso && 'Ricerca indirizzi in corso…'}
                {state.ricercaRisultati.length > 0 &&
                  `${state.ricercaRisultati.length} risultati trovati a Milano. Usa le frecce per navigare e Invio per selezionare.`}
                {state.ricercaErrore && state.ricercaErrore}
              </div>

              {/* Dropdown dei risultati di ricerca */}
              {state.ricercaRisultati.length > 0 && (
                <ul
                  id="lista-risultati-indirizzi"
                  role="listbox"
                  aria-label="Risultati della ricerca geografica a Milano"
                  className="absolute left-0 right-0 top-full mt-1 bg-white border border-[var(--border-medium)] rounded-[var(--radius-md)] shadow-lg z-[500] max-h-60 overflow-y-auto m-0 p-1 list-none"
                >
                  {state.ricercaRisultati.map((item, idx) => (
                    <li
                      key={item.id}
                      id={`risultato-${idx}`}
                      role="option"
                      aria-selected={highlightedIndex === idx}
                      onClick={() => handleSelectResult(item)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`p-2 rounded text-xs cursor-pointer flex flex-col gap-0.5 transition-colors ${
                        highlightedIndex === idx
                          ? 'bg-[var(--forest-light)] text-[var(--forest-900)]'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                      }`}
                    >
                      <span className="font-semibold text-xs text-[var(--text-primary)]">
                        {item.titolo}
                      </span>
                      <span className="text-[0.6875rem] text-[var(--text-secondary)] truncate">
                        {item.sottotitolo}
                      </span>
                    </li>
                  ))}
                  <li className="pt-1.5 pb-0.5 px-2 text-[0.625rem] text-[var(--text-muted)] border-t border-[var(--border-light)] text-right">
                    Dati © OpenStreetMap contributors
                  </li>
                </ul>
              )}

              {/* Errore ricerca */}
              {state.ricercaErrore && (
                <p className="text-[0.6875rem] text-[var(--error-text)] mt-1">
                  {state.ricercaErrore}
                </p>
              )}
            </div>

            {/* Bottone "Usa la mia posizione" */}
            <button
              type="button"
              onClick={handleUsaPosizione}
              disabled={disabled || state.geoInCorso}
              className="btn btn-secondary btn-sm shrink-0 flex items-center justify-center gap-1.5 text-xs"
              title="Rileva la posizione attuale tramite il GPS del browser"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="22" y1="12" x2="18" y2="12" />
                <line x1="6" y1="12" x2="2" y2="12" />
                <line x1="12" y1="6" x2="12" y2="2" />
                <line x1="12" y1="22" x2="12" y2="18" />
              </svg>
              {state.geoInCorso ? 'Rilevamento GPS…' : 'Usa la mia posizione'}
            </button>
          </div>

          {/* Mappa interattiva Leaflet */}
          <MappaLuogoPicker
            coords={state.posizione ? { lat: state.posizione.lat, lon: state.posizione.lon } : null}
            onPositionSelect={handleMapSelect}
            readOnly={disabled}
          />
        </div>
      )}

      {/* VISTA 2: Alternativa Testuale e Inserimento Manuale */}
      {activeTab === 'manual' && (
        <form
          id="panel-luogo-manuale"
          role="tabpanel"
          aria-labelledby="tab-luogo-manuale"
          onSubmit={handleApplyManualCoords}
          className="flex flex-col gap-3 bg-white p-3 rounded-[var(--radius-md)] border border-[var(--border-light)]"
        >
          <p className="text-xs text-[var(--text-secondary)]">
            Questa modalità ti consente di specificare il luogo anche se la mappa o la connessione al servizio esterno sono offline.
          </p>

          {manualError && (
            <div className="alert alert-error text-xs py-1.5" role="alert">
              {manualError}
            </div>
          )}

          <div>
            <label htmlFor="manual-indirizzo" className="form-label text-xs">
              Indirizzo o riferimento testuale a Milano
            </label>
            <input
              id="manual-indirizzo"
              type="text"
              value={manualAddress}
              onChange={e => setManualAddress(e.target.value)}
              placeholder="Es. Via Torino 15, Milano oppure Parco Sempione vicino all'Arco"
              className="form-input text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="manual-lat" className="form-label text-xs">
                Latitudine decimale (-90 .. 90) <span className="text-[var(--error-text)]">*</span>
              </label>
              <input
                id="manual-lat"
                type="number"
                step="any"
                required
                value={manualLat}
                onChange={e => setManualLat(e.target.value)}
                placeholder="Es. 45.4642"
                className="form-input font-mono text-xs"
              />
            </div>
            <div>
              <label htmlFor="manual-lon" className="form-label text-xs">
                Longitudine decimale (-180 .. 180) <span className="text-[var(--error-text)]">*</span>
              </label>
              <input
                id="manual-lon"
                type="number"
                step="any"
                required
                value={manualLon}
                onChange={e => setManualLon(e.target.value)}
                placeholder="Es. 9.1900"
                className="form-input font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button type="submit" className="btn btn-primary btn-sm">
              Applica e conferma coordinate
            </button>
          </div>
        </form>
      )}

      {/* RIEPILOGO DEL LUOGO SELEZIONATO E CONFERMA ESPLICITA */}
      <div className="bg-white p-3 rounded-[var(--radius-md)] border border-[var(--border-medium)] flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--forest-900)]">
            Riepilogo luogo selezionato
          </span>
          {state.posizione && (
            <span className="badge badge-ricevuta text-[0.625rem]">
              Fonte: {formatOrigineLabel(state.posizione.origine)}
            </span>
          )}
        </div>

        {state.posizione ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex flex-col">
                {state.posizione.indirizzo && (
                  <strong className="text-[var(--text-primary)]">
                    {state.posizione.indirizzo}
                  </strong>
                )}
                <span className="font-mono text-[var(--forest-700)] text-[0.6875rem]">
                  Lat: {state.posizione.lat.toFixed(6)} &bull; Lon: {state.posizione.lon.toFixed(6)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setState(prev => rimuoviPosizione(prev))}
                className="btn btn-outline btn-xs text-[var(--error-text)] border-[var(--error-border)] self-start sm:self-auto"
              >
                Rimuovi selezione
              </button>
            </div>

            {/* Checkbox di conferma esplicita */}
            <div className="border-t border-[var(--border-light)] pt-2 mt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-primary)] font-medium">
                <input
                  type="checkbox"
                  id="conferma-luogo-checkbox"
                  checked={state.posizione.confermata}
                  onChange={e => setState(prev => impostaConfermaPosizione(prev, e.target.checked))}
                  className="rounded text-[var(--forest-600)] focus:ring-[var(--forest-500)]"
                />
                Confermo che questo è il luogo esatto della criticità da segnalare
              </label>
            </div>
          </div>
        ) : (
          <div className="panel-subtle p-2 text-center text-xs text-[var(--text-muted)]">
            Nessun luogo ancora selezionato. Cerca un indirizzo a Milano, clicca sulla mappa o inserisci le coordinate.
          </div>
        )}
      </div>
    </div>
  );
}
