'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import ComitatoActionsForm from './comitato-actions-form';
import ComitatoMediaGallery from '@/components/comitato/comitato-media-gallery';
import type { getCodaRevisioniComitato } from '@/lib/domain/segnalazioni';

export type CodaItem = Awaited<ReturnType<typeof getCodaRevisioniComitato>>[number];

export interface ComitatoCodaListProps {
  coda: CodaItem[];
  categorie: Array<{ id: string; nome: string }>;
  activeReportId?: string | null;
  onToggleReport?: (id: string) => void;
}

function StatoBadge({ stato, tipo }: { stato: string; tipo: 'mod' | 'avanz' }) {
  const modMap: Record<string, { cls: string; label: string }> = {
    PENDENTE:     { cls: 'badge badge-mod-pendente',  label: 'In attesa' },
    IN_REVISIONE: { cls: 'badge badge-mod-revisione', label: 'In revisione' },
    APPROVATA:    { cls: 'badge badge-mod-approvata', label: 'Approvata' },
    RIFIUTATA:    { cls: 'badge badge-mod-rifiutata', label: 'Rifiutata' },
  };
  const avanzMap: Record<string, { cls: string; label: string }> = {
    RICEVUTA:             { cls: 'badge badge-ricevuta',  label: 'Ricevuta' },
    PRESA_IN_CARICO:      { cls: 'badge badge-carico',    label: 'In carico' },
    INVIATA_AI_CANDIDATI: { cls: 'badge badge-candidati', label: 'Ai candidati' },
    RITIRATA:             { cls: 'badge badge-ritirata',  label: 'Ritirata' },
  };
  const map = tipo === 'mod' ? modMap : avanzMap;
  const item = map[stato] ?? { cls: 'badge badge-categoria', label: stato.replace(/_/g, ' ') };
  return <span className={item.cls}>{item.label}</span>;
}

export default function ComitatoCodaList({
  coda,
  categorie,
  activeReportId,
  onToggleReport
}: ComitatoCodaListProps) {
  const [localOpenId, setLocalOpenId] = useState<string | null>(null);
  const currentOpenId = activeReportId !== undefined ? activeReportId : localOpenId;
  const rawToggleReport = onToggleReport || ((id: string) => setLocalOpenId(prev => (prev === id ? null : id)));

  const handleToggleReport = (id: string) => {
    const willOpen = currentOpenId !== id;
    rawToggleReport(id);

    // Se stiamo aprendo l'esame (da clic o da tastiera), porta il focus e lo scroll lasciando spazio per la navbar fissa
    if (willOpen) {
      setTimeout(() => {
        const decisionInput = document.getElementById(`mod-dec-${id}-APPROVATA`);
        const decisionBox = document.getElementById(`decision-box-${id}`);
        const target = decisionInput || decisionBox;
        if (target) {
          target.focus();
          const rect = target.getBoundingClientRect();
          // Navbar fissa (64px) + banner dimostrativo (32px) = 96px. Lasciamo 115px di spazio libero.
          if (rect.top < 115) {
            const yOffset = -120;
            const y = window.pageYOffset + rect.top + yOffset;
            window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
          }
        }
      }, 120);
    }
  };

  if (coda.length === 0) {
    return (
      <div className="empty-state py-6">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Nessuna segnalazione pendente nella coda di verifica
        </p>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Tutte le segnalazioni inserite sono state valutate e deliberate.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {coda.map((seg) => {
        const isOpen = currentOpenId === seg.id;
        const panelId = `coda-panel-${seg.id}`;
        const moderationEvent = seg.eventi_stato.find(event => event.ambito === 'MODERAZIONE' && event.revisione === seg.revisione);

        return (
          <div
            key={seg.id}
            className={`panel-subtle border-l-4 transition-all ${
              isOpen
                ? 'border-l-[var(--blue-primary)] shadow-sm bg-white ring-1 ring-[var(--blue-primary)]/20'
                : 'border-l-[var(--warning-text)] bg-[var(--bg-subtle)]'
            } flex flex-col gap-3.5 p-3.5 sm:p-5`}
          >
            {/* 1. Titolo della segnalazione (in cima alla scheda) */}
            <div className="flex flex-col gap-1.5">
              <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] leading-snug">
                {seg.descrizione}
              </h3>

              {/* 2. Stati e metadati (sotto al titolo, mostrati UNA sola volta) */}
              <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--text-muted)]">
                <StatoBadge stato={seg.stato_moderazione} tipo="mod" />
                <StatoBadge stato={seg.stato_avanzamento} tipo="avanz" />
                <span className="text-[0.6875rem] font-mono">Rev. {seg.revisione}</span>
                <span>
                  Inserita il {new Date(seg.creata_il).toLocaleDateString('it-IT')} da {seg.autore.nome} {seg.autore.cognome?.[0]}.
                </span>
                {seg.categorie?.map(c => (
                  <span key={c.categoria.id} className="badge badge-categoria text-[0.625rem]">
                    {c.categoria.nome}
                  </span>
                ))}
              </div>
            </div>

            {/* CASO A: SCHEDA CHIUSA */}
            {seg.stato_moderazione === 'IN_REVISIONE' && moderationEvent && (
              <p className="text-sm text-[var(--text-secondary)]"><strong>Da verificare: </strong>{moderationEvent.motivazione}</p>
            )}
            {!isOpen && (
              <>
                {/* Su mobile e desktop: foto della segnalazione prima dei pulsanti */}
                {seg.media && seg.media.length > 0 && (
                  <div className="py-1">
                    <ComitatoMediaGallery
                      media={seg.media}
                      segnalazioneDescrizione={seg.descrizione}
                      hideHeader={true}
                    />
                  </div>
                )}

                {/* Pulsanti a scheda chiusa: flex-wrap per andare a capo a 375px senza mai debordare */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-light)]">
                  <button
                    type="button"
                    onClick={() => handleToggleReport(seg.id)}
                    aria-expanded={false}
                    aria-controls={panelId}
                    className="btn btn-primary btn-sm font-semibold inline-flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue-primary)] shrink-0"
                  >
                    <span>Esamina segnalazione</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="transition-transform duration-200"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  <Link
                    href={`/segnalazioni/${seg.id}`}
                    className="btn btn-secondary btn-sm font-semibold shrink-0"
                    target="_blank"
                  >
                    Apri dettaglio
                  </Link>
                </div>
              </>
            )}

            {/* CASO B: SCHEDA APERTA (ESAME SEGNALAZIONE)
                - Su desktop: 2 colonne affiancate (foto a sinistra, decisione a destra)
                - Su mobile: 1 sola colonna (foto sopra, decisione sotto)
                - Titolo, revisione e foto NON vengono duplicati!
            */}
            {isOpen && (
              <div id={panelId} className="pt-3 border-t border-[var(--border-light)] scroll-mt-28 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  {/* Colonna Foto (Desktop: sinistra col-span-5, Mobile: sopra) */}
                  <div className="lg:col-span-5 flex flex-col gap-2">
                    <span className="text-xs font-bold text-[var(--text-secondary)]">
                      Foto allegate ({seg.media?.length || 0})
                    </span>
                    <ComitatoMediaGallery
                      media={seg.media}
                      segnalazioneDescrizione={seg.descrizione}
                      hideHeader={true}
                    />

                    {/* Controlli secondari su desktop sotto le foto */}
                    <div className="hidden lg:flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleToggleReport(seg.id)}
                        className="btn btn-secondary btn-sm"
                      >
                        Chiudi esame
                      </button>
                      <Link
                        href={`/segnalazioni/${seg.id}`}
                        className="btn btn-secondary btn-sm font-semibold"
                        target="_blank"
                      >
                        Apri dettaglio
                      </Link>
                    </div>
                  </div>

                  {/* Colonna Decisione (Desktop: destra col-span-7, Mobile: sotto) */}
                  <div className="lg:col-span-7 flex flex-col gap-3">
                    <ComitatoActionsForm
                      segnalazioneId={seg.id}
                      statoModerazione={seg.stato_moderazione}
                      statoAvanzamento={seg.stato_avanzamento}
                      revisione={seg.revisione}
                      categorieDisponibili={categorie}
                      categorieAssegnateIds={seg.categorie.map(c => c.categoria.id)}
                      media={seg.media}
                      segnalazioneDescrizione={seg.descrizione}
                      mode="moderazione-only"
                      showHeader={false}
                      showMedia={false}
                    />

                    {/* Controlli secondari su mobile in fondo alla scheda */}
                    <div className="flex lg:hidden flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-light)]">
                      <button
                        type="button"
                        onClick={() => handleToggleReport(seg.id)}
                        className="btn btn-secondary btn-sm"
                      >
                        Chiudi esame
                      </button>
                      <Link
                        href={`/segnalazioni/${seg.id}`}
                        className="btn btn-secondary btn-sm font-semibold"
                        target="_blank"
                      >
                        Apri dettaglio
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
