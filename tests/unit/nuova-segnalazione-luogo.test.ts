import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  STATO_INIZIALE_LUOGO,
  validaCoordinate,
  avviaRicerca,
  riceviRisultatiRicerca,
  selezionaRisultatoRicerca,
  correggiPuntoMappa,
  impostaPosizioneGps,
  gestisciErroreGps,
  proponiExif,
  accettaSuggerimentoExif,
  ignoraSuggerimentoExif,
  impostaPosizioneManuale,
  impostaConfermaPosizione,
  rimuoviPosizione,
  GeocodingResult,
} from '@/lib/geo/location-picker';
import {
  GET as geocodingSearchHandler,
  _clearGeocodingCacheForTests
} from '@/app/api/geo/search/route';
import { NextRequest } from 'next/server';

// Fixture di risultati geocodifica (Milano)
const FIXTURE_RISULTATI_MILANO: GeocodingResult[] = [
  {
    id: 'geo-1-45.46650',
    titolo: 'Via Dante 1',
    sottotitolo: 'Centro Storico, Milano',
    indirizzoCompleto: 'Via Dante, 1, 20121 Milano, Lombardia, Italia',
    lat: 45.4665,
    lon: 9.186,
  },
  {
    id: 'geo-2-45.48500',
    titolo: 'Corso Buenos Aires 20',
    sottotitolo: 'Loreto, Milano',
    indirizzoCompleto: 'Corso Buenos Aires, 20, 20124 Milano, Lombardia, Italia',
    lat: 45.485,
    lon: 9.21,
  },
];

describe('Nuova Segnalazione: Scelta del Luogo - Stato e Regole di Dominio', () => {
  it('1. Il centro iniziale della mappa NON deve essere considerato una posizione già scelta', () => {
    // Regola di traccia: all'inizio la posizione deve essere null, richiedendo scelta esplicita
    expect(STATO_INIZIALE_LUOGO.posizione).toBeNull();
    expect(STATO_INIZIALE_LUOGO.posizioneCorrettaManualmente).toBe(false);
  });

  it('2. Selezione risultato di ricerca: aggiorna le coordinate, l’indirizzo e marca la conferma', () => {
    let stato = { ...STATO_INIZIALE_LUOGO };
    const risultato = FIXTURE_RISULTATI_MILANO[0];

    stato = selezionaRisultatoRicerca(stato, risultato);

    expect(stato.posizione).not.toBeNull();
    expect(stato.posizione?.lat).toBe(45.4665);
    expect(stato.posizione?.lon).toBe(9.186);
    expect(stato.posizione?.indirizzo).toContain('Via Dante');
    expect(stato.posizione?.origine).toBe('RICERCA');
    expect(stato.posizione?.confermata).toBe(true);
    // I risultati di ricerca nel dropdown vengono azzerati dopo la selezione
    expect(stato.ricercaRisultati.length).toBe(0);
  });

  it('3. Correzione manuale tramite click o trascinamento mappa: traccia la modifica manuale', () => {
    let stato = { ...STATO_INIZIALE_LUOGO };

    // L'utente clicca sulla mappa su un punto specifico
    stato = correggiPuntoMappa(stato, { lat: 45.4705, lon: 9.1895 });

    expect(stato.posizione).not.toBeNull();
    expect(stato.posizione?.lat).toBe(45.4705);
    expect(stato.posizione?.lon).toBe(9.1895);
    expect(stato.posizione?.origine).toBe('MAPPA');
    expect(stato.posizioneCorrettaManualmente).toBe(true);
    expect(stato.posizione?.confermata).toBe(true);
  });

  it('4. Correzione manuale preservata rispetto a risposte di ricerca tardive (race-condition)', () => {
    let stato = { ...STATO_INIZIALE_LUOGO };

    // 1. L'utente digita una ricerca ("corso b...") -> requestId 1
    const { nuovoStato: statoConRicerca1, requestId: reqId1 } = avviaRicerca(stato);
    stato = statoConRicerca1;
    expect(reqId1).toBe(1);

    // 2. L'utente nel frattempo corregge manualmente la posizione sulla mappa
    stato = correggiPuntoMappa(stato, { lat: 45.472, lon: 9.195 });
    expect(stato.posizione?.lat).toBe(45.472);

    // 3. L'utente avvia una seconda ricerca o cambia input -> requestId 2
    const { nuovoStato: statoConRicerca2, requestId: reqId2 } = avviaRicerca(stato);
    stato = statoConRicerca2;
    expect(reqId2).toBe(2);

    // 4. Arriva in ritardo la risposta della richiesta 1
    stato = riceviRisultatiRicerca(stato, reqId1, FIXTURE_RISULTATI_MILANO);

    // La risposta della richiesta 1 DEVE essere ignorata perché obsoleta
    expect(stato.ricercaRisultati.length).toBe(0);
    // E la posizione corretta manualmente dall'utente non deve essere toccata
    expect(stato.posizione?.lat).toBe(45.472);
    expect(stato.posizione?.lon).toBe(9.195);
    expect(stato.posizioneCorrettaManualmente).toBe(true);
  });

  it('5. Suggerimento da EXIF: presentato come proposta separata senza sovrascrittura automatica', () => {
    let stato = { ...STATO_INIZIALE_LUOGO };

    // L'utente ha già impostato una posizione manuale
    stato = correggiPuntoMappa(stato, { lat: 45.4642, lon: 9.19 });
    expect(stato.posizione?.lat).toBe(45.4642);

    // Viene caricata una foto con GPS EXIF: 45.4750, 9.2050
    stato = proponiExif(stato, {
      lat: 45.475,
      lon: 9.205,
      nomeFile: 'buco_strada.jpg',
    });

    // La posizione dell'utente NON deve essere sovrascritta automaticamente!
    expect(stato.posizione?.lat).toBe(45.4642);
    expect(stato.posizione?.lon).toBe(9.19);
    // Il suggerimento EXIF è presente e visibile per essere confermato
    expect(stato.exifSuggerimento).not.toBeNull();
    expect(stato.exifSuggerimento?.lat).toBe(45.475);
    expect(stato.exifSuggerimento?.nomeFile).toBe('buco_strada.jpg');

    // Se l'utente sceglie "Ignora", il suggerimento sparisce e la posizione resta invariata
    const statoRifiutato = ignoraSuggerimentoExif(stato);
    expect(statoRifiutato.exifSuggerimento).toBeNull();
    expect(statoRifiutato.posizione?.lat).toBe(45.4642);

    // Se l'utente sceglie esplicitamente "Usa posizione dalla foto", viene aggiornata con origine EXIF
    const statoAccettato = accettaSuggerimentoExif(stato);
    expect(statoAccettato.exifSuggerimento).toBeNull();
    expect(statoAccettato.posizione?.lat).toBe(45.475);
    expect(statoAccettato.posizione?.lon).toBe(9.205);
    expect(statoAccettato.posizione?.origine).toBe('EXIF');
    expect(statoAccettato.posizione?.confermata).toBe(true);
  });

  it('6. Geolocalizzazione negata: genera errore informativo e non blocca il form', () => {
    let stato = { ...STATO_INIZIALE_LUOGO };

    // Simulazione errore PERMISSION_DENIED (codice 1)
    stato = gestisciErroreGps(stato, 1);

    expect(stato.geoInCorso).toBe(false);
    expect(stato.geoErrore).toContain('Permesso di geolocalizzazione negato');
    // La posizione rimane null o quella precedente, senza crash
    expect(stato.posizione).toBeNull();

    // Simulazione errore TIMEOUT (codice 3)
    stato = gestisciErroreGps(stato, 3);
    expect(stato.geoErrore).toContain('Tempo per il rilevamento GPS scaduto');

    // Se l'utente aveva già una posizione, l'errore GPS non cancella i dati inseriti
    stato = correggiPuntoMappa(stato, { lat: 45.46, lon: 9.18 });
    // Test per impostaPosizioneGps (esito positivo)
    const statoConGps = impostaPosizioneGps(stato, { lat: 45.4642, lon: 9.19 });
    expect(statoConGps.posizione?.origine).toBe('GPS');
    expect(statoConGps.posizione?.lat).toBe(45.4642);
    expect(statoConGps.posizioneCorrettaManualmente).toBe(true);
  });

  it('7. Alternativa testuale: inserimento manuale di coordinate e indirizzo', () => {
    const stato = { ...STATO_INIZIALE_LUOGO };

    // Inserimento valido
    const { nuovoStato, errore } = impostaPosizioneManuale(
      stato,
      45.4628,
      9.1885,
      'Piazza Missori, Milano'
    );
    expect(errore).toBeUndefined();
    expect(nuovoStato.posizione?.lat).toBe(45.4628);
    expect(nuovoStato.posizione?.lon).toBe(9.1885);
    expect(nuovoStato.posizione?.indirizzo).toBe('Piazza Missori, Milano');
    expect(nuovoStato.posizione?.origine).toBe('MANUALE');
    expect(nuovoStato.posizione?.confermata).toBe(true);

    // Inserimento con coordinate fuori range (-95 di latitudine)
    const { errore: errInvalido } = impostaPosizioneManuale(stato, -95, 9.1885);
    expect(errInvalido).toContain('latitudine');
  });

  it('8. Validazione rigorosa delle coordinate geografiche (-90..90, -180..180)', () => {
    expect(validaCoordinate(45.4642, 9.19).valida).toBe(true);
    expect(validaCoordinate(-90, -180).valida).toBe(true);
    expect(validaCoordinate(90, 180).valida).toBe(true);

    // Invalide
    expect(validaCoordinate(91, 10).valida).toBe(false);
    expect(validaCoordinate(-90.1, 10).valida).toBe(false);
    expect(validaCoordinate(45, 180.5).valida).toBe(false);
    expect(validaCoordinate(45, -181).valida).toBe(false);
    expect(validaCoordinate(NaN, 10).valida).toBe(false);
    expect(validaCoordinate(45, NaN).valida).toBe(false);
  });

  it('9. Riepilogo e conferma esplicita della posizione', () => {
    let stato = { ...STATO_INIZIALE_LUOGO };
    stato = correggiPuntoMappa(stato, { lat: 45.4642, lon: 9.19 });

    // Modifica conferma
    stato = impostaConfermaPosizione(stato, false);
    expect(stato.posizione?.confermata).toBe(false);

    stato = impostaConfermaPosizione(stato, true);
    expect(stato.posizione?.confermata).toBe(true);

    // Rimozione posizione
    stato = rimuoviPosizione(stato);
    expect(stato.posizione).toBeNull();
    expect(stato.posizioneCorrettaManualmente).toBe(false);
  });
});

describe('Route Handler Geocodifica (/api/geo/search) con Fixture e Mock', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Ritorna lista vuota se la query è inferiore a 2 caratteri', async () => {
    const req = new NextRequest('http://localhost:3000/api/geo/search?q=a');
    const res = await geocodingSearchHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toEqual([]);
    expect(data.attribution).toContain('OpenStreetMap');
  });

  it('Estrae e formatta correttamente i risultati da una risposta conforme di Nominatim', async () => {
    const mockNominatimResponse = [
      {
        place_id: 12345,
        lat: '45.466523',
        lon: '9.186123',
        display_name: 'Via Dante, 1, Municipio 1, Milano, Lombardia, 20121, Italia',
        address: {
          road: 'Via Dante',
          house_number: '1',
          neighbourhood: 'Centro Storico',
          city: 'Milano',
          postcode: '20121',
        },
      },
      {
        place_id: 67890,
        lat: '45.485123',
        lon: '9.210456',
        display_name: 'Corso Buenos Aires, 20, Municipio 3, Milano, Lombardia, 20124, Italia',
        address: {
          road: 'Corso Buenos Aires',
          house_number: '20',
          suburb: 'Loreto',
          city: 'Milano',
          postcode: '20124',
        },
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockNominatimResponse,
    });

    const req = new NextRequest('http://localhost:3000/api/geo/search?q=via%20dante');
    const res = await geocodingSearchHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results.length).toBe(2);
    expect(data.results[0].titolo).toBe('Via Dante 1');
    expect(data.results[0].sottotitolo).toContain('Centro Storico');
    expect(data.results[0].lat).toBeCloseTo(45.466523);
    expect(data.results[0].lon).toBeCloseTo(9.186123);
    expect(data.attribution).toContain('OpenStreetMap');
  });

  it('Gestisce errore di rate limiting (HTTP 429) restituendo messaggio chiaro senza crash', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });

    const req = new NextRequest('http://localhost:3000/api/geo/search?q=duomo');
    const res = await geocodingSearchHandler(req);
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toContain('Limite di frequenza');
    expect(data.results).toEqual([]);
  });

  it('Gestisce timeout e provider offline restituendo status 502 e messaggio di fallback accessibile', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const req = new NextRequest('http://localhost:3000/api/geo/search?q=stazione%20centrale');
    const res = await geocodingSearchHandler(req);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toContain('Servizio di geocodifica non raggiungibile');
    expect(data.results).toEqual([]);
  });

  it('Verifica funzionamento cache in memoria (X-Cache: HIT senza ulteriori chiamate a fetch)', async () => {
    _clearGeocodingCacheForTests();

    const mockResponse = [
      {
        place_id: 999,
        lat: '45.4700',
        lon: '9.1800',
        display_name: 'Piazza Castello, Milano',
        address: { road: 'Piazza Castello', city: 'Milano' }
      }
    ];

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse
    });
    global.fetch = fetchSpy;

    // Prima chiamata: Cache MISS
    const req1 = new NextRequest('http://localhost:3000/api/geo/search?q=piazza%20castello');
    const res1 = await geocodingSearchHandler(req1);
    expect(res1.headers.get('X-Cache')).toBe('MISS');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Seconda chiamata con la stessa query: Cache HIT (nessuna nuova chiamata fetch)
    const req2 = new NextRequest('http://localhost:3000/api/geo/search?q=Piazza%20Castello');
    const res2 = await geocodingSearchHandler(req2);
    expect(res2.headers.get('X-Cache')).toBe('HIT');
    expect(fetchSpy).toHaveBeenCalledTimes(1); // Fetch non è stato chiamato di nuovo!
    const data2 = await res2.json();
    expect(data2.results).toHaveLength(1);
    expect(data2.results[0].titolo).toBe('Piazza Castello');
  });
});
