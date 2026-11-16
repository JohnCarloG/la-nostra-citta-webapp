'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface ComitatoMediaItem {
  id: string;
  tipo: 'FOTO' | 'VIDEO';
  byte_size: number;
  mime: string;
  durata_secondi?: number | null;
  numeroAllegato?: number;
}

export interface ComitatoMediaGalleryProps {
  media: ComitatoMediaItem[];
  segnalazioneDescrizione?: string;
  hideHeader?: boolean;
}

export default function ComitatoMediaGallery({
  media,
  segnalazioneDescrizione = 'segnalazione',
  hideHeader = false
}: ComitatoMediaGalleryProps) {
  const [selectedMedia, setSelectedMedia] = useState<ComitatoMediaItem | null>(null);
  const [failedMedia, setFailedMedia] = useState<Record<string, boolean>>({});
  const triggerButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Chiusura modale e ripristino focus sul trigger
  const handleCloseModal = useCallback(() => {
    const closedId = selectedMedia?.id;
    setSelectedMedia(null);
    if (closedId && triggerButtonRefs.current[closedId]) {
      // Focus restoration
      setTimeout(() => {
        triggerButtonRefs.current[closedId]?.focus();
      }, 0);
    }
  }, [selectedMedia]);

  // Listener per tasto Escape
  useEffect(() => {
    if (!selectedMedia) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMedia, handleCloseModal]);

  // Focus automatico sul pulsante Chiudi all'apertura del modale
  useEffect(() => {
    if (selectedMedia && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [selectedMedia]);

  if (!media || media.length === 0) {
    return (
      <div className="p-3 bg-[var(--bg-subtle)] rounded-[var(--radius-xs)] border border-[var(--border-light)] text-xs text-[var(--text-muted)]">
        Nessun allegato multimediale associato a questa segnalazione.
      </div>
    );
  }

  const isTwoPhotos = media.length === 2;
  const gridClass = isTwoPhotos
    ? 'grid grid-cols-2 gap-3 w-full'
    : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 w-full';

  return (
    <div className="flex flex-col gap-2 w-full">
      {!hideHeader && (
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span className="font-semibold">
            Foto allegate ({media.length}):
          </span>
          <span className="text-[0.6875rem] text-[var(--text-muted)]">
            Fai clic per ingrandire
          </span>
        </div>
      )}

      {/* Griglia foto: 2 colonne dedicate quando le foto sono due */}
      <div className={gridClass}>
        {media.map((m, idx) => {
          const number = m.numeroAllegato ?? idx + 1;
          const isFailed = !!failedMedia[m.id];
          const sizeKb = (m.byte_size / 1024).toFixed(0);

          if (m.tipo === 'VIDEO') {
            return (
              <div
                key={m.id}
                className="flex flex-col justify-between bg-black/95 text-white rounded-[var(--radius-xs)] border border-[var(--border-medium)] p-2 text-xs"
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="badge badge-categoria bg-red-700 text-white font-bold text-[0.625rem] uppercase tracking-wider">
                    Video MP4
                  </span>
                  {m.durata_secondi !== null && m.durata_secondi !== undefined && (
                    <span className="text-[0.625rem] text-gray-300 font-mono">
                      {m.durata_secondi}s
                    </span>
                  )}
                </div>

                <div className="relative w-full aspect-video bg-black flex items-center justify-center rounded overflow-hidden my-1">
                  <video
                    src={`/api/media/${m.id}`}
                    controls
                    preload="metadata"
                    className="w-full h-full object-contain"
                    aria-label={`Video prova allegato #${number}`}
                  >
                    Il tuo browser non supporta la riproduzione video HTML5.
                  </video>
                </div>

                <div className="text-[0.625rem] text-gray-400 mt-1 truncate">
                  Dimensione: {sizeKb} KB
                </div>
              </div>
            );
          }

          // Se è una foto
          return (
            <div
              key={m.id}
              className="flex flex-col justify-between bg-[var(--bg-subtle)] rounded-[var(--radius-xs)] border border-[var(--border-medium)] p-2 text-xs hover:border-[var(--blue-primary)] transition-colors"
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="badge badge-categoria font-semibold text-[0.625rem]">
                  Foto #{number}
                </span>
                <span className="text-[0.625rem] text-[var(--text-muted)] font-mono">
                  {sizeKb} KB
                </span>
              </div>

              {isFailed ? (
                <div
                  role="alert"
                  className="w-full h-32 flex flex-col items-center justify-center gap-1 bg-white border border-[var(--error-border)] rounded text-[var(--error-text)] p-2 text-center"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span className="font-semibold text-[0.6875rem]">Foto non disponibile</span>
                  <span className="text-[0.625rem] text-[var(--text-muted)]">Caricamento fallito</span>
                </div>
              ) : (
                <button
                  type="button"
                  ref={el => {
                    triggerButtonRefs.current[m.id] = el;
                  }}
                  onClick={() => setSelectedMedia(m)}
                  className="group relative w-full h-32 bg-white rounded border border-[var(--border-light)] overflow-hidden flex items-center justify-center p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue-primary)] cursor-pointer"
                  aria-haspopup="dialog"
                  aria-label={`Ingrandisci foto documentale #${number} (${sizeKb} KB)`}
                >
                  {/* Visualizzazione integrale con proporzioni preservate (object-contain, nessuna foto tagliata) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/media/${m.id}`}
                    alt={`Foto di prova documentale per ${segnalazioneDescrizione}`}
                    className="max-h-full max-w-full object-contain mx-auto transition-transform group-hover:scale-105"
                    loading="lazy"
                    onError={() => {
                      setFailedMedia(prev => ({ ...prev, [m.id]: true }));
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 text-[var(--text-primary)] text-[0.625rem] font-bold px-1.5 py-0.5 rounded shadow-sm">
                      Ingrandisci
                    </span>
                  </div>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox / Modale di ingrandimento nella stessa pagina (chiusura tasto Chiudi o tasto Esc) */}
      {selectedMedia && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-media-title"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-6"
          onClick={handleCloseModal}
        >
          <div
            className="relative max-w-4xl max-h-[92vh] w-full bg-white rounded-[var(--radius-md)] p-4 shadow-2xl flex flex-col items-center gap-3 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Intestazione del modale */}
            <div className="w-full flex items-center justify-between border-b border-[var(--border-light)] pb-2">
              <div>
                <h3 id="modal-media-title" className="text-sm font-bold text-[var(--text-primary)]">
                  Visualizzazione ingrandita prova documentale
                </h3>
                <p className="text-[0.6875rem] text-[var(--text-muted)] mt-0.5">
                  {(selectedMedia.byte_size / 1024).toFixed(0)} KB &bull; Proporzioni originali senza ritaglio
                </p>
              </div>

              <button
                type="button"
                ref={closeButtonRef}
                onClick={handleCloseModal}
                className="btn btn-secondary btn-sm flex items-center gap-1 font-semibold"
                aria-label="Chiudi visualizzazione ingrandita (Esc)"
              >
                <span>Chiudi</span>
              </button>
            </div>

            {/* Immagine ingrandita a proporzioni integrali */}
            <div className="w-full flex items-center justify-center bg-[var(--bg-subtle)] rounded p-2 min-h-[240px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/${selectedMedia.id}`}
                alt="Dettaglio ingrandito della foto di prova"
                className="max-h-[72vh] max-w-full object-contain rounded"
              />
            </div>

            <div className="w-full flex items-center justify-between text-[0.6875rem] text-[var(--text-muted)] pt-1 border-t border-[var(--border-light)]">
              <span>Premi Esc o fai clic su Chiudi per tornare alla scheda</span>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-[var(--blue-primary)] underline hover:text-[var(--blue-hover)]"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
