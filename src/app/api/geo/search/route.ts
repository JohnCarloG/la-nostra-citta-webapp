import { NextRequest, NextResponse } from 'next/server';

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  footway?: string;
  square?: string;
  cycleway?: string;
  house_number?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  postcode?: string;
}

interface NominatimItem {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: NominatimAddress;
}

export interface GeocodingResultItem {
  id: string;
  titolo: string;
  sottotitolo: string;
  indirizzoCompleto: string;
  lat: number;
  lon: number;
}

/**
 * Cache in memoria per i risultati di geocodifica (TTL 24 ore)
 * Conforme alla Nominatim Usage Policy ("You must cache results").
 */
interface CacheEntry {
  results: GeocodingResultItem[];
  timestamp: number;
}

const geocodingCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 ore

/**
 * Coda serializzata aggregata per il rate-limiting applicativo.
 * Conforme alla Nominatim Usage Policy di OpenStreetMap:
 * "Absolute maximum of 1 request per second"
 * Questo limite è per l'intera applicazione verso i server pubblici OSMF, NON per singolo utente.
 */
let lastNominatimTimestamp = 0;
const MIN_NOMINATIM_INTERVAL_MS = 1100; // 1.1s garantisce rispetto rigoroso del limite di 1 req/s
let nominatimQueue: Promise<void> = Promise.resolve();

export function scheduleNominatimRequest<T>(fn: () => Promise<T>): Promise<T> {
  const execute = async () => {
    const now = Date.now();
    const elapsed = now - lastNominatimTimestamp;
    if (elapsed < MIN_NOMINATIM_INTERVAL_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_NOMINATIM_INTERVAL_MS - elapsed));
    }
    lastNominatimTimestamp = Date.now();
    return fn();
  };

  const next = nominatimQueue.then(execute, execute);
  nominatimQueue = next.then(() => {}, () => {});
  return next;
}

/** Helper per i test unitari */
export function _clearGeocodingCacheForTests(): void {
  geocodingCache.clear();
  lastNominatimTimestamp = 0;
}

export function _getGeocodingCacheSizeForTests(): number {
  return geocodingCache.size;
}

/**
 * Route handler per la ricerca geografica con contesto Milano (GET /api/geo/search?q=...)
 *
 * Linee guida e vincoli di specifica:
 * 1. Rispetto tassativo della Nominatim Usage Policy di OpenStreetMap:
 *    - NESSUN autocomplete o ricerca durante la digitazione (vietato sui server pubblici OSMF)
 *    - Limite aggregato di applicazione: massimo 1 richiesta al secondo (gestito via scheduleNominatimRequest)
 *    - Header HTTP User-Agent identificativo dell'applicazione civica
 *    - Caching locale delle risposte per evitare richieste duplicate
 *    - Attribuzione visibile "Dati geografici © OpenStreetMap contributors, ODbL 1.0"
 * 2. Parametri orientati al contesto territoriale di Milano:
 *    - viewbox centrata sull'area metropolitana di Milano (9.04, 45.54, 9.28, 45.38)
 *    - countrycodes=it, accept-language=it
 * 3. Gestione timeout (5s), rate limit (429) e provider indisponibile
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({
      results: [],
      attribution: 'Dati geografici © OpenStreetMap contributors, ODbL 1.0',
    });
  }

  // Verifica configurazione provider esterno alternativo opzionale
  const provider = process.env.GEOCODING_PROVIDER || 'nominatim';
  const apiKey = process.env.GEOCODING_API_KEY;

  if ((provider === 'locationiq' || provider === 'opencage') && !apiKey) {
    return NextResponse.json(
      {
        results: [],
        error: `Chiave API non configurata per il provider "${provider}". Configura GEOCODING_API_KEY per attivare questo provider.`,
        prerequisitoMancante: true,
        attribution: 'Dati geografici © OpenStreetMap contributors',
      },
      { status: 503 }
    );
  }

  // Normalizzazione query per cache key (case-insensitive, spazi multipli collassati)
  const cacheKey = q.toLowerCase().replace(/\s+/g, ' ');
  const cached = geocodingCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(
      {
        results: cached.results,
        attribution: 'Dati geografici © OpenStreetMap contributors, ODbL 1.0',
      },
      {
        headers: {
          'X-Cache': 'HIT',
        },
      }
    );
  }

  // Provider predefinito: OpenStreetMap Nominatim
  const endpoint = new URL('https://nominatim.openstreetmap.org/search');
  endpoint.searchParams.set('q', q);
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('addressdetails', '1');
  endpoint.searchParams.set('limit', '5');
  endpoint.searchParams.set('countrycodes', 'it');
  // Bounding box area Milano (ovest, nord, est, sud)
  endpoint.searchParams.set('viewbox', '9.04,45.54,9.28,45.38');
  endpoint.searchParams.set('bounded', '0'); // Favorisce Milano senza scartare risultati limitrofi validi

  try {
    // Esecuzione regolata dal collo di bottiglia applicativo di 1 richiesta al secondo
    const res = await scheduleNominatimRequest(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(endpoint.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': 'LaNostraCitta-Milano/1.0 (info@lanostracitta.it; Piattaforma civica partecipata)',
            'Accept-Language': 'it, en;q=0.8',
          },
          signal: controller.signal,
        });
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    });

    if (res.status === 429) {
      return NextResponse.json(
        {
          results: [],
          error: 'Limite di frequenza del servizio di ricerca temporaneamente raggiunto. Riprova tra qualche istante o seleziona il punto sulla mappa.',
          attribution: 'Dati geografici © OpenStreetMap contributors, ODbL 1.0',
        },
        { status: 429 }
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          results: [],
          error: `Errore dal servizio di geocodifica (${res.status}). Puoi indicare il luogo manualmente sulla mappa.`,
          attribution: 'Dati geografici © OpenStreetMap contributors, ODbL 1.0',
        },
        { status: res.status }
      );
    }

    const items: NominatimItem[] = await res.json();

    if (!Array.isArray(items)) {
      return NextResponse.json({
        results: [],
        attribution: 'Dati geografici © OpenStreetMap contributors, ODbL 1.0',
      });
    }

    const results: GeocodingResultItem[] = items
      .map((item, idx) => {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        if (isNaN(lat) || isNaN(lon)) return null;

        const addr = item.address || {};
        const road =
          addr.road || addr.pedestrian || addr.footway || addr.square || addr.cycleway || '';
        const houseNumber = addr.house_number ? ` ${addr.house_number}` : '';
        const neighbourhood =
          addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district || '';
        const city = addr.city || addr.town || addr.village || addr.municipality || 'Milano';

        const titolo = road ? `${road}${houseNumber}` : (item.name || item.display_name.split(',')[0]);
        const sottotitolo = [neighbourhood, city].filter(Boolean).join(', ') || item.display_name;

        return {
          id: `geo-${item.place_id || idx}-${lat.toFixed(5)}`,
          titolo,
          sottotitolo,
          indirizzoCompleto: item.display_name,
          lat,
          lon,
        };
      })
      .filter((r): r is GeocodingResultItem => r !== null);

    // Memorizza in cache locale
    geocodingCache.set(cacheKey, {
      results,
      timestamp: Date.now(),
    });

    return NextResponse.json(
      {
        results,
        attribution: 'Dati geografici © OpenStreetMap contributors, ODbL 1.0',
      },
      {
        headers: {
          'X-Cache': 'MISS',
        },
      }
    );
  } catch (err: unknown) {
    const isAbort = (err as Error)?.name === 'AbortError';
    return NextResponse.json(
      {
        results: [],
        error: isAbort
          ? 'Tempo di risposta della ricerca indirizzi scaduto. Puoi selezionare il punto sulla mappa o inserire le coordinate manualmente.'
          : 'Servizio di geocodifica non raggiungibile. Puoi selezionare il punto sulla mappa o inserire le coordinate manualmente.',
        attribution: 'Dati geografici © OpenStreetMap contributors, ODbL 1.0',
      },
      { status: 502 }
    );
  }
}
