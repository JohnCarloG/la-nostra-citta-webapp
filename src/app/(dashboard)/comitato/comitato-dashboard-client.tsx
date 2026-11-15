'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import ComitatoCodaList, { CodaItem } from './comitato-coda-list';
import ComitatoRegistroTable, { RegistroItem } from './comitato-registro-table';

interface ComitatoDashboardClientProps {
  coda: CodaItem[];
  tutte: RegistroItem[];
  categorie: Array<{ id: string; nome: string }>;
  filtroAttivo: string;
  filtri: Array<{ value: string; label: string }>;
}

export default function ComitatoDashboardClient({
  coda,
  tutte,
  categorie,
  filtroAttivo,
  filtri
}: ComitatoDashboardClientProps) {
  // UNICO stato per l'intera pagina: garantisce che solo un pannello resti aperto,
  // anche passando dalla coda al registro e viceversa!
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  const handleToggleReport = (id: string) => {
    setActiveReportId(prev => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col gap-8 w-full min-w-0">
      {/* ── SEZIONE 1: CODA DELLE REVISIONI PRIORITARIE ── */}
      <section className="panel min-w-0 max-w-full" aria-labelledby="coda-title">
        <div className="border-b border-[var(--border-light)] pb-2.5 mb-3 flex items-center justify-between">
          <div>
            <h2 id="coda-title" className="section-title text-base">
              Da esaminare ({coda.length})
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Valutazione e delibera delle segnalazioni civiche
            </p>
          </div>
        </div>

        <ComitatoCodaList
          coda={coda}
          categorie={categorie}
          activeReportId={activeReportId}
          onToggleReport={handleToggleReport}
        />
      </section>

      {/* ── SEZIONE 2: REGISTRO COMPLETO DELLE SEGNALAZIONI ── */}
      <section className="panel min-w-0 max-w-full overflow-hidden" aria-labelledby="registro-title">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-light)] pb-3 mb-4">
          <div>
            <h2 id="registro-title" className="section-title text-base">
              Registro generale e archivio decisioni ({tutte.length})
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Consultazione di tutte le segnalazioni gestite e storico delle deliberazioni
            </p>
          </div>

          {/* Filtro per stato */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {filtri.map((f) => (
              <Link
                key={f.value}
                href={f.value ? `/comitato?filtro=${f.value}` : '/comitato'}
                className={`px-2 py-1 rounded-[var(--radius-xs)] border transition-colors ${
                  filtroAttivo === f.value
                    ? 'bg-[var(--blue-primary)] text-white border-[var(--blue-primary)] font-semibold'
                    : 'bg-white text-[var(--text-secondary)] border-[var(--border-medium)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>

        <ComitatoRegistroTable
          tutte={tutte}
          categorie={categorie}
          activeReportId={activeReportId}
          onToggleReport={handleToggleReport}
        />
      </section>
    </div>
  );
}
