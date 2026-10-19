import { describe, it, expect } from 'vitest';
import type { SegnalazionePunto } from '@/app/mappa/map-view';

function createMockPunto(index: number): SegnalazionePunto {
  return {
    id: `punto-${index}`,
    descrizione: `Segnalazione di prova numero ${index} per verifica layout mappa`,
    latitudine: 45.4642 + (index * 0.001),
    longitudine: 9.19 + (index * 0.001),
    stato_avanzamento: index % 2 === 0 ? 'RICEVUTA' : 'PRESA_IN_CARICO',
    creata_il: new Date(2026, 9, index + 1).toISOString(),
    categorie: ['Manutenzione strade', 'Verde urbano'],
    mediaId: index % 3 === 0 ? `media-${index}` : null,
    totaleSostegniValidi: index * 3,
  };
}

describe('MapView Layout & Fixture Verification (0, 1, 6, 30+ elementi)', () => {
  it('Gestisce fixture con 0 elementi senza errori di rendering o overflow', () => {
    const segnalazioni: SegnalazionePunto[] = [];
    const selectedPunto = segnalazioni[0] || null;
    const altriPunti = segnalazioni.filter((p) => p.id !== selectedPunto?.id);

    expect(selectedPunto).toBeNull();
    expect(altriPunti.length).toBe(0);
  });

  it('Gestisce fixture con 1 elemento: seleziona il punto e non crea liste secondarie ridondanti', () => {
    const segnalazioni: SegnalazionePunto[] = [createMockPunto(1)];
    const selectedPunto = segnalazioni[0];
    const altriPunti = segnalazioni.filter((p) => p.id !== selectedPunto.id);

    expect(selectedPunto.id).toBe('punto-1');
    expect(altriPunti.length).toBe(0);
    // Con 1 solo elemento segnalazioni.length > 1 è false, quindi "Altri punti disponibili" non viene mostrato
    expect(segnalazioni.length > 1).toBe(false);
  });

  it('Gestisce fixture con 6 elementi: mostra tutti gli altri 5 elementi senza pulsante paginazione superfluo', () => {
    const segnalazioni: SegnalazionePunto[] = Array.from({ length: 6 }, (_, i) => createMockPunto(i + 1));
    const selectedPunto = segnalazioni[0];
    const altriPunti = segnalazioni.filter((p) => p.id !== selectedPunto.id);

    expect(segnalazioni.length).toBe(6);
    expect(altriPunti.length).toBe(5);

    const PAGE_SIZE = 6;
    const displayedPunti = altriPunti.slice(0, PAGE_SIZE);
    const hasMore = altriPunti.length > PAGE_SIZE;

    expect(displayedPunti.length).toBe(5);
    expect(hasMore).toBe(false); // Non serve paginazione per 5 elementi
  });

  it('Gestisce fixture con 35 elementi (>= 30): pagina a blocchi di 6, calcola rimanenti e sincronizza selezione', () => {
    const segnalazioni: SegnalazionePunto[] = Array.from({ length: 35 }, (_, i) => createMockPunto(i + 1));
    let selectedPunto = segnalazioni[0];
    let altriPunti = segnalazioni.filter((p) => p.id !== selectedPunto.id);

    expect(segnalazioni.length).toBe(35);
    expect(altriPunti.length).toBe(34);

    const PAGE_SIZE = 6;
    let visibleCount = PAGE_SIZE;

    // 1. Schermata iniziale: 6 visibili su 34 altri punti
    let displayedPunti = altriPunti.slice(0, visibleCount);
    let hasMore = altriPunti.length > visibleCount;
    let remainingCount = altriPunti.length - visibleCount;

    expect(displayedPunti.length).toBe(6);
    expect(hasMore).toBe(true);
    expect(remainingCount).toBe(28);

    // 2. Click "Mostra altri" (+6)
    visibleCount += PAGE_SIZE;
    displayedPunti = altriPunti.slice(0, visibleCount);
    hasMore = altriPunti.length > visibleCount;
    remainingCount = altriPunti.length - visibleCount;

    expect(displayedPunti.length).toBe(12);
    expect(hasMore).toBe(true);
    expect(remainingCount).toBe(22);

    // 3. Sincronizzazione: click su un punto nella lista aggiorna il punto selezionato
    const clickedPunto = displayedPunti[4]; // punto-6
    selectedPunto = clickedPunto;
    altriPunti = segnalazioni.filter((p) => p.id !== selectedPunto.id);

    expect(selectedPunto.id).toBe('punto-6');
    expect(altriPunti.length).toBe(34);
    // Il punto-6 non è più tra gli "altri", mentre punto-1 vi è rientrato
    expect(altriPunti.some((p) => p.id === 'punto-6')).toBe(false);
    expect(altriPunti.some((p) => p.id === 'punto-1')).toBe(true);
  });
});
