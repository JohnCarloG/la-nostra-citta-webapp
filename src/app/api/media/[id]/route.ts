import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/actions/auth';
import { getStorageProvider } from '@/lib/storage';
import { isSegnalazionePubblica } from '@/lib/domain/segnalazioni';

/**
 * Endpoint per l'accesso autorizzato ai media allegati (RF04, VI06, VI10)
 * 
 * Regole di sicurezza:
 * 1. Lo storage fisico sottostante resta SEMPRE privato e inaccessibile direttamente.
 * 2. Nessun percorso fisico del filesystem né credenziale di storage viene esposta.
 * 3. Se la segnalazione è pubblica (APPROVATA e non RITIRATA), il media è accessibile pubblicamente.
 * 4. Se la segnalazione è privata (PENDENTE, IN_REVISIONE, RIFIUTATA, RITIRATA),
 *    l'accesso è consentito ESCLUSIVAMENTE all'autore autenticato o a membri del COMITATO.
 * 5. Se non autorizzato, risponde con 404 senza rivelare l'esistenza del file (T12).
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id) {
    return new Response('Identificativo media mancante', { status: 400 });
  }

  const media = await prisma.media.findUnique({
    where: { id },
    include: {
      segnalazione: {
        select: {
          autore_id: true,
          stato_moderazione: true,
          stato_avanzamento: true
        }
      }
    }
  });

  if (!media || media.stato_file !== 'READY') {
    return new Response('File non trovato', { status: 404 });
  }

  const isPublic = isSegnalazionePubblica(media.segnalazione);

  if (!isPublic) {
    const user = await getCurrentUser();
    const isAutore = user && user.id === media.segnalazione.autore_id;
    const isComitato = user && user.ruolo === 'COMITATO';

    if (!isAutore && !isComitato) {
      // Non rivela dati riservati o esistenza a terzi (VI06, T12)
      return new Response('File non trovato o accesso negato', { status: 404 });
    }
  }

  try {
    const storage = getStorageProvider();
    const fileBuffer = await storage.getObject(media.storage_key);

    return new Response(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': media.mime,
        'Content-Length': fileBuffer.byteLength.toString(),
        'Cache-Control': isPublic
          ? 'public, no-cache, must-revalidate'
          : 'private, no-cache, no-store, must-revalidate',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch {
    return new Response('Errore nel recupero del file dallo storage privato', { status: 500 });
  }
}
