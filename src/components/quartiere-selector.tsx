'use client';

import React, { useState, useMemo, useRef, useEffect, useId } from 'react';

export interface QuartiereItem {
  id: string;
  nome: string;
  codice?: string | null;
  is_ufficiale?: boolean;
}

interface QuartiereSelectorProps {
  quartieri: QuartiereItem[];
  name?: string;
  id?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (quartiereId: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  ariaDescribedBy?: string;
  error?: string;
}

export default function QuartiereSelector({
  quartieri,
  name = 'quartiere_id',
  id = 'register-quartiere',
  defaultValue = '',
  value: controlledValue,
  onChange,
  required = false,
  disabled = false,
  placeholder = 'Cerca o seleziona il tuo quartiere (NIL)…',
  label,
  ariaDescribedBy,
  error,
}: QuartiereSelectorProps) {
  const generatedId = useId();
  const listboxId = `${id || generatedId}-listbox`;
  const infoId = `${id || generatedId}-info`;

  // Ordina i quartieri ufficiali alfabeticamente secondo la lingua italiana
  const sortedQuartieri = useMemo(() => {
    return [...quartieri].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' })
    );
  }, [quartieri]);

  const [internalSelectedId, setInternalSelectedId] = useState<string>(defaultValue);
  const selectedId = controlledValue !== undefined ? controlledValue : internalSelectedId;
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Trova l'oggetto quartiere selezionato
  const selectedQuartiere = useMemo(() => {
    return quartieri.find((q) => q.id === selectedId) || null;
  }, [quartieri, selectedId]);

  // Filtra i quartieri in base alla ricerca (nome o codice)
  const filteredQuartieri = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return sortedQuartieri;
    return sortedQuartieri.filter((q) => {
      const matchNome = q.nome.toLowerCase().includes(term);
      const matchCodice = q.codice ? q.codice.toLowerCase().includes(term) : false;
      return matchNome || matchCodice;
    });
  }, [sortedQuartieri, searchTerm]);

  // Chiudi cliccando fuori
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scorri automaticamente l'elemento evidenziato
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (quartiere: QuartiereItem) => {
    setInternalSelectedId(quartiere.id);
    setSearchTerm('');
    setIsOpen(false);
    setHighlightedIndex(-1);
    if (onChange) {
      onChange(quartiere.id);
    }
    inputRef.current?.focus();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInternalSelectedId('');
    setSearchTerm('');
    setHighlightedIndex(-1);
    if (onChange) {
      onChange('');
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((prev) =>
          prev < filteredQuartieri.length - 1 ? prev + 1 : 0
        );
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(filteredQuartieri.length - 1);
      } else {
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredQuartieri.length - 1
        );
      }
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredQuartieri.length) {
        e.preventDefault();
        handleSelect(filteredQuartieri[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm('');
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  // Se l'utente ha associato un quartiere legacy non ufficiale
  const isLegacySelected = selectedQuartiere && selectedQuartiere.is_ufficiale === false;

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <label htmlFor={id} className="form-label text-xs block mb-1">
          {label} {required && <span className="text-[var(--error-text)]">*</span>}
        </label>
      )}

      {/* Input hidden per invio trasparente con Form standard e Server Actions */}
      <input
        type="hidden"
        name={name}
        value={selectedId}
        required={required}
      />

      {/* Visual Input / Combobox */}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-describedby={ariaDescribedBy ? `${ariaDescribedBy} ${infoId}` : infoId}
          aria-invalid={error ? 'true' : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={selectedQuartiere ? selectedQuartiere.nome : placeholder}
          value={isOpen ? searchTerm : selectedQuartiere ? selectedQuartiere.nome : ''}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchTerm('');
          }}
          onKeyDown={handleKeyDown}
          className={`form-input text-xs pr-16 w-full ${
            error ? 'border-[var(--error-border)]' : ''
          } ${isLegacySelected ? 'border-amber-400 bg-amber-50/30' : ''}`}
        />

        {/* Pulsanti laterali: pulisci e freccia tendina */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1 pointer-events-auto">
          {selectedId && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Rimuovi selezione quartiere"
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => {
              if (isOpen) {
                setIsOpen(false);
              } else {
                setIsOpen(true);
                inputRef.current?.focus();
              }
            }}
            aria-label={isOpen ? 'Chiudi elenco quartieri' : 'Apri elenco quartieri'}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown Menu Listbox */}
      {isOpen && !disabled && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          aria-label="Elenco Nuclei d'Identità Locale"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-[var(--border-light)] bg-white py-1 shadow-lg focus:outline-none text-xs"
        >
          {filteredQuartieri.length === 0 ? (
            <li className="px-3 py-2.5 text-[var(--text-muted)] text-center">
              Nessun quartiere trovato per &ldquo;{searchTerm}&rdquo;
            </li>
          ) : (
            filteredQuartieri.map((q, index) => {
              const isSelected = q.id === selectedId;
              const isHighlighted = index === highlightedIndex;

              return (
                <li
                  key={q.id}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => handleSelect(q)}
                  className={`min-h-[40px] px-3 py-2 cursor-pointer flex items-center justify-between transition-colors select-none ${
                    isHighlighted ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-primary)]'
                  } ${isSelected ? 'font-bold text-[var(--blue-primary)] bg-blue-50/50' : ''}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {q.codice && (
                      <span className="font-mono text-[0.6875rem] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                        {q.codice}
                      </span>
                    )}
                    <span className="truncate">{q.nome}</span>
                  </div>

                  {isSelected && (
                    <svg className="w-4 h-4 text-[var(--blue-primary)] shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}

      {/* Indicazione ufficiale obbligatoria */}
      <p id={infoId} className="form-helper text-[0.6875rem] text-[var(--text-secondary)] mt-1.5 leading-snug">
        Quartieri secondo il catalogo ufficiale dei Nuclei di Identità Locale del Comune di Milano
      </p>

      {/* Segnalazione in caso di quartiere legacy non ufficiale */}
      {isLegacySelected && (
        <div className="mt-1.5 p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[0.6875rem] flex items-start gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-700" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <strong>Associazione da aggiornare:</strong> La voce precedente (<em>{selectedQuartiere.nome}</em>) appartiene a una classificazione preliminare non ufficiale. Seleziona il tuo NIL ufficiale per confermare la residenza.
          </div>
        </div>
      )}

      {error && (
        <p className="text-[var(--error-text)] text-[0.6875rem] mt-1 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
