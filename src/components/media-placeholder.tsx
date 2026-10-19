import React from 'react';

interface MediaPlaceholderProps {
  tipo?: 'FOTO' | 'VIDEO' | 'image' | 'video';
  className?: string;
  testo?: string;
  badge?: React.ReactNode;
}

export default function MediaPlaceholder({
  tipo = 'FOTO',
  className = 'w-full h-48',
  testo = 'Immagine non disponibile',
  badge,
}: MediaPlaceholderProps) {
  const isVideo = tipo === 'VIDEO' || tipo === 'video';

  return (
    <div
      className={`relative overflow-hidden bg-[#eef8f5] border-b border-[#d1e9e1] flex flex-col items-center justify-center text-center select-none transition-colors ${className}`}
      role="img"
      aria-label={isVideo ? 'Anteprima video non disponibile' : testo}
    >
      {/* Pattern geometrico urbano lineare sottilissimo di sfondo */}
      <div className="flex flex-col items-center justify-center p-4 z-10">
        {isVideo ? (
          /* Icona lineare video / ripresa */
          <svg
            className="w-9 h-9 text-[#236b56]/70 mb-2 stroke-[1.5]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        ) : (
          /* Icona lineare paesaggio urbano / architettura sobria */
          <svg
            className="w-9 h-9 text-[#236b56]/70 mb-2 stroke-[1.5]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            {/* Profilo urbano lineare: edifici, tetti e spazio civico */}
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 21h18M4.5 21V9.75a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m0-7.5h6v7.5m3-13.5h2.25a.75.75 0 0 1 .75.75V21M9 12h.01M9 15h.01M9 18h.01M15 15h.01M15 18h.01M18 10.5h.01M18 13.5h.01M18 16.5h.01"
            />
          </svg>
        )}

        <span className="text-xs font-medium text-[#1c4d3e]/80 tracking-normal">
          {isVideo ? 'Anteprima video non disponibile' : testo}
        </span>
      </div>

      {badge && <div className="absolute top-2.5 right-2.5 z-20">{badge}</div>}
    </div>
  );
}
