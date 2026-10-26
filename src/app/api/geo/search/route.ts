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

/**
 * Route handler per la ricerca geografica con contesto Milano (GET /api/geo/search?q=...)
 *
 * Linee guida e vincoli:
 * 1. Rispetta la Nominatim Usage Policy di OpenStreetMap:
 *    - Header HTTP User-Agent valido che identifica l'applicazione civica
 *    - Limite a 5 risultati per non sovraccaricare il servizio pubblico
 *    - Attribuzione OpenStreetMap obbligatoria inclusa nella risposta
 * 2. Parametri orientati al contesto territoriale di Milano:
 *    - viewbox centrata sull'area metropolitana di Milano (9.04, 45.54, 9.28, 45.38)
 *    - countrycodes=it, accept-language=it
 * 3. Gestione timeout (5s), rate limit (429) e provider indisponibile senza esporre credenziali
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

  // Verifica configurazione provider esterno opzionale
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'LaNostraCitta-Milano/1.0 (info@lanostracitta.it; Piattaforma civica partecipata)',
        'Accept-Language': 'it, en;q=0.8',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

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

    const results = items
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
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return NextResponse.json({
      results,
      attribution: 'Dati geografici © OpenStreetMap contributors, ODbL 1.0',
    });
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
