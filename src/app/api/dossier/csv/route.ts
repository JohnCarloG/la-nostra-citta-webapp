import { NextRequest, NextResponse } from 'next/server';
import { getDossierSegnalazioni, generateDossierCsv, DossierFiltri } from '@/lib/domain/dossier';

/**
 * Route handler per il download del dossier delle priorità civiche in formato CSV (RF13, T18).
 * Endpoint: GET /api/dossier/csv?categoria=...&stato=...&ordinamento=...
 *
 * Garanzie:
 * 1. Applica gli stessi filtri e regole di dominio della visualizzazione stampabile.
 * 2. In caso di errore del database restituisce errore HTTP 503/500 sanitizzato:
 *    NON genera mai un CSV vuoto che sembri riuscito.
 * 3. Protezione da formula injection (CSV Injection) applicata a tutte le celle utente.
 * 4. Header RFC 4180 con Content-Disposition attachment e disattivazione cache.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const categoria = searchParams.get('categoria')?.trim() || undefined;
  const statoParam = searchParams.get('stato')?.trim();
  const ordinamentoParam = searchParams.get('ordinamento')?.trim();

  let statoAvanzamento: DossierFiltri['statoAvanzamento'];
  if (
    statoParam === 'RICEVUTA' ||
    statoParam === 'PRESA_IN_CARICO' ||
    statoParam === 'INVIATA_AI_CANDIDATI'
  ) {
    statoAvanzamento = statoParam;
  }

  let ordinamento: DossierFiltri['ordinamento'] = 'piu_sostenute';
  if (ordinamentoParam === 'piu_recenti' || ordinamentoParam === 'meno_recenti') {
    ordinamento = ordinamentoParam;
  }

  try {
    const items = await getDossierSegnalazioni({
      categoriaId: categoria,
      statoAvanzamento,
      ordinamento,
      limite: 1000,
    });

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const csvContent = generateDossierCsv(items);

    const filename = `dossier-priorita-milano-${dateStr}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: unknown) {
    console.error('[ERRORE EXPORT DOSSIER CSV]:', err);
    // Non restituisce mai un CSV vuoto apparentemente riuscito in caso di errore DB!
    return NextResponse.json(
      {
        error: 'Impossibile estrarre il dossier in questo momento a causa di un errore del database. Riprova tra qualche istante.',
      },
      { status: 503 }
    );
  }
}
