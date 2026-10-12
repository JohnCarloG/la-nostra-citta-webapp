import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/actions/auth';
import { caricaUploadTemporaneo } from '@/lib/domain/uploads';
import { MAX_VIDEO_BYTES } from '@/lib/storage/mime-validator';

/**
 * Route Handler dedicato all'upload fisico di file binari:
 * 
 * Ragioni architetturali e di sicurezza:
 * - Le Server Actions di Next.js applicano per default un limite rigido di 1 MiB per richiesta.
 * - Alzare indiscriminatamente `serverActions.bodySizeLimit` a 55 MiB in `next.config.ts`
 *   esporrebbe tutte le mutation dell'applicazione (login, registrazione, commenti, ecc.)
 *   ad attacchi volumetrici di payload injection o flood di memoria.
 * - Questo endpoint dedicato consente di gestire file fino a 10 MiB (foto) e 50 MiB (video),
 *   mantenendo tutte le altre Server Action dell'applicazione protette dal limite predefinito restrittivo.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Accesso non autorizzato. Effettua prima il login.' },
        { status: 401 }
      );
    }

    if (user.stato_account !== 'ATTIVO' || !user.verificato_il) {
      return NextResponse.json(
        { success: false, error: 'Il tuo account deve essere attivo e verificato per allegare media.' },
        { status: 403 }
      );
    }

    // Controllo preliminare dell'header Content-Length se presente
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_VIDEO_BYTES + 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'La richiesta supera il limite massimo consentito di 50 MiB.' },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'Nessun file selezionato o file vuoto' },
        { status: 400 }
      );
    }

    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `File troppo grande (${(file.size / (1024 * 1024)).toFixed(1)} MiB). Limite massimo 50 MiB per video e 10 MiB per fotografie.`
        },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await caricaUploadTemporaneo(user.id, buffer);
    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Errore durante il caricamento del file';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
