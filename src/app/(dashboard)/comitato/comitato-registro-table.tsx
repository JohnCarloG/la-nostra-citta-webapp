'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import ComitatoActionsForm from './comitato-actions-form';
import type { getTutteSegnalazioniComitato } from '@/lib/domain/segnalazioni';

export type RegistroItem = Awaited<ReturnType<typeof getTutteSegnalazioniComitato>>[number];

export interface ComitatoRegistroTableProps {
  tutte: RegistroItem[];
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

export default function ComitatoRegistroTable({
  tutte,
  categorie,
  activeReportId,
  onToggleReport
}: ComitatoRegistroTableProps) {
  // Supporto sia per stato controllato dall'alto che locale
  const [localOpenId, setLocalOpenId] = useState<string | null>(null);
  const currentOpenId = activeReportId !== undefined ? activeReportId : localOpenId;
  const toggleReport = onToggleReport || ((id: string) => setLocalOpenId(prev => (prev === id ? null : id)));

  if (tutte.length === 0) {
    return (
      <div className="empty-state py-6">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Nessuna segnalazione corrisponde al filtro selezionato
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table" aria-label="Registro generale delle segnalazioni">
        <thead>
          <tr>
            <th scope="col">Segnalazione</th>
            <th scope="col" className="w-28 text-center">Moderazione</th>
            <th scope="col" className="w-32 text-center">Avanzamento</th>
            <th scope="col" className="w-16 text-center">Rev.</th>
            <th scope="col" className="w-24 text-center">Data</th>
            <th scope="col" className="w-56 text-right">Azioni comitato</th>
          </tr>
        </thead>
        <tbody>
          {tutte.map((s) => {
            const isOpen = currentOpenId === s.id;
            const panelId = `registro-panel-${s.id}`;

            return (
              <React.Fragment key={s.id}>
                <tr className={isOpen ? 'bg-[var(--bg-subtle)] font-medium border-l-4 border-l-[var(--blue-primary)]' : ''}>
                  <td>
                    <p className="font-semibold text-sm line-clamp-1 mb-0.5">
                      <Link
                        href={`/segnalazioni/${s.id}`}
                        className="hover:text-[var(--blue-primary)] hover:underline"
                      >
                        {s.descrizione}
                      </Link>
                    </p>
                    <div className="flex gap-1 flex-wrap">
                      {s.categorie?.map((c) => (
                        <span key={c.categoria.id} className="badge badge-categoria text-[0.625rem]">
                          {c.categoria.nome}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-center">
                    <StatoBadge stato={s.stato_moderazione} tipo="mod" />
                  </td>
                  <td className="text-center">
                    <StatoBadge stato={s.stato_avanzamento} tipo="avanz" />
                  </td>
                  <td className="text-center font-mono text-xs text-[var(--text-muted)]">
                    {s.revisione}
                  </td>
                  <td className="text-center text-xs text-[var(--text-muted)]">
                    {new Date(s.creata_il).toLocaleDateString('it-IT')}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => toggleReport(s.id)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        className={`btn btn-xs py-1 px-2.5 font-semibold inline-flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue-primary)] ${
                          isOpen ? 'btn-secondary' : 'btn-primary'
                        }`}
                      >
                        <span>{isOpen ? 'Chiudi pannello' : 'Gestisci segnalazione'}</span>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      <Link
                        href={`/segnalazioni/${s.id}`}
                        className="btn btn-secondary btn-xs py-1 px-2 font-semibold"
                      >
                        Scheda
                      </Link>
                    </div>
                  </td>
                </tr>

                {/* Pannello espandibile direttamente sotto la riga selezionata (uno solo alla volta sull'intera pagina, zero foto caricate prima del clic) */}
                {isOpen && (
                  <tr id={panelId} className="bg-[var(--bg-subtle)]">
                    <td colSpan={6} className="p-3 sm:p-5 border-y-2 border-[var(--blue-primary)]">
                      <div className="bg-white p-4 sm:p-5 rounded-[var(--radius-sm)] border border-[var(--border-medium)] shadow-md">
                        <div className="border-b border-[var(--border-light)] pb-2.5 mb-4 flex items-center justify-between">
                          <span className="font-bold text-sm text-[var(--text-primary)]">
                            Gestione segnalazione: {s.descrizione}
                          </span>
                          <span className="text-[0.6875rem] text-[var(--text-muted)] font-mono">
                            Rev. {s.revisione}
                          </span>
                        </div>

                        {/* Foto e media caricati solo qui, all'espansione della singola segnalazione */}
                        <ComitatoActionsForm
                          segnalazioneId={s.id}
                          statoModerazione={s.stato_moderazione}
                          statoAvanzamento={s.stato_avanzamento}
                          revisione={s.revisione}
                          mode={s.stato_moderazione === 'APPROVATA' ? 'avanzamento-only' : 'all'}
                          categorieDisponibili={categorie}
                          categorieAssegnateIds={s.categorie?.map(c => c.categoria.id) ?? []}
                          media={s.media}
                          segnalazioneDescrizione={s.descrizione}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
