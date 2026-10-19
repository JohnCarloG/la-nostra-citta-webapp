import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MediaPlaceholder from '@/components/media-placeholder';
import ReportThumbnail from '@/components/report-thumbnail';

describe('MediaPlaceholder & ReportThumbnail (Universal Photo/Video Placeholder)', () => {
  it('MediaPlaceholder renderizza lo sfondo verde chiaro #eef8f5 e il testo discreto', () => {
    const html = renderToStaticMarkup(
      React.createElement(MediaPlaceholder, {
        tipo: 'FOTO',
      })
    );

    expect(html).toContain('bg-[#eef8f5]');
    expect(html).toContain('Immagine non disponibile');
    expect(html).toContain('role="img"');
    // Verifica icona lineare svg
    expect(html).toContain('<svg');
  });

  it('MediaPlaceholder variante VIDEO mostra icona video e testo appropriato', () => {
    const html = renderToStaticMarkup(
      React.createElement(MediaPlaceholder, {
        tipo: 'VIDEO',
      })
    );

    expect(html).toContain('bg-[#eef8f5]');
    expect(html).toContain('Anteprima video non disponibile');
  });

  it('ReportThumbnail: quando mediaId è assente/null, effettua il fallback immediato su MediaPlaceholder', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReportThumbnail, {
        mediaId: null,
        alt: 'Segnalazione senza foto',
      })
    );

    expect(html).toContain('bg-[#eef8f5]');
    expect(html).toContain('Immagine non disponibile');
    expect(html).not.toContain('<img');
  });

  it('ReportThumbnail: quando mediaId è presente, renderizza il tag img con onError handler senza loop', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReportThumbnail, {
        mediaId: 'med-12345',
        alt: 'Buca in strada',
      })
    );

    expect(html).toContain('<img');
    expect(html).toContain('src="/api/media/med-12345"');
    expect(html).toContain('alt="Buca in strada"');
    expect(html).toContain('loading="lazy"');
  });
});
