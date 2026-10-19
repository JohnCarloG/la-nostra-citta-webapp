import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesktopNavLinks, MobileNavLinks } from '@/components/nav-links';

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('Navbar NavLinks (Home come prima voce e stato attivo rigoroso)', () => {
  it('DesktopNavLinks: su pathname="/" la prima voce è Home con aria-current="page" e classe attiva', () => {
    mockPathname = '/';
    const html = renderToStaticMarkup(React.createElement(DesktopNavLinks, null));

    // 1. Home è presente come prima voce collegata a /
    expect(html).toContain('href="/"');
    expect(html).toContain('>Home<');

    // 2. aria-current="page" presente esclusivamente su Home
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('nav-link-active');

    // 3. "Come funziona" non deve esistere
    expect(html).not.toContain('Come funziona');
  });

  it('DesktopNavLinks: su pathname="/segnalazioni" Home NON ha aria-current="page" né nav-link-active', () => {
    mockPathname = '/segnalazioni';
    const html = renderToStaticMarkup(React.createElement(DesktopNavLinks, null));

    // Home link non ha aria-current="page"
    const homeLinkMatch = html.match(/<a[^>]*href="\/"[^>]*>([\s\S]*?)<\/a>/);
    expect(homeLinkMatch).not.toBeNull();
    const homeLinkHtml = homeLinkMatch![0];
    expect(homeLinkHtml).not.toContain('aria-current');
    expect(homeLinkHtml).not.toContain('nav-link-active');

    // Esplora ha invece aria-current="page"
    const esploraMatch = html.match(/<a[^>]*href="\/segnalazioni"[^>]*>([\s\S]*?)<\/a>/);
    expect(esploraMatch![0]).toContain('aria-current="page"');
    expect(esploraMatch![0]).toContain('nav-link-active');
  });

  it('MobileNavLinks: su pathname="/" include Home come prima voce con aria-current="page"', () => {
    mockPathname = '/';
    const html = renderToStaticMarkup(React.createElement(MobileNavLinks, null));

    expect(html).toContain('href="/"');
    expect(html).toContain('>Home<');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('Come funziona');
  });

  it('MobileNavLinks: su pathname="/mappa" Home non è attiva', () => {
    mockPathname = '/mappa';
    const html = renderToStaticMarkup(React.createElement(MobileNavLinks, null));

    const homeMatch = html.match(/<a[^>]*href="\/"[^>]*>([\s\S]*?)<\/a>/);
    expect(homeMatch![0]).not.toContain('aria-current="page"');
  });
});
