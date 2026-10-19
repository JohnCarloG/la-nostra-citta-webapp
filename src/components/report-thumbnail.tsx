'use client';

import React, { useState } from 'react';
import MediaPlaceholder from './media-placeholder';

interface ReportThumbnailProps {
  mediaId?: string | null;
  tipo?: 'FOTO' | 'VIDEO';
  alt: string;
  className?: string;
  imgClassName?: string;
  badge?: React.ReactNode;
}

export default function ReportThumbnail({
  mediaId,
  tipo = 'FOTO',
  alt,
  className = 'relative w-full h-48 bg-[var(--bg-subtle)] overflow-hidden border-b border-[var(--border-light)]',
  imgClassName = 'w-full h-full object-cover group-hover:scale-105 transition-transform duration-300',
  badge,
}: ReportThumbnailProps) {
  const [loadError, setLoadError] = useState(false);

  // Se manca l'allegato o se l'immagine ha generato errore al caricamento
  if (!mediaId || loadError) {
    return (
      <MediaPlaceholder
        tipo={tipo}
        className={className}
        badge={badge}
      />
    );
  }

  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/media/${mediaId}`}
        alt={alt}
        className={imgClassName}
        loading="lazy"
        onError={() => {
          // Previene categoricamente loop di richieste: al primo fallimento passa a placeholder
          setLoadError(true);
        }}
      />
      {badge && <div className="absolute top-2.5 right-2.5 z-10">{badge}</div>}
    </div>
  );
}
