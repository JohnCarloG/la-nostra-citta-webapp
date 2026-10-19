import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/actions/auth';
import { getDettaglioSegnalazione } from '@/lib/domain/segnalazioni';
import SostegnoButton from '@/components/sostegno-button';
import RitiraButton from '@/components/ritira-button';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SegnalazioneDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  const seg = await getDettaglioSegnalazione(id, user?.id, user?.ruolo);

  if (!seg) {
    notFound();
  }

  const isAutore = !!user && user.id === seg.autore_id;
  const isComitato = !!user && user.ruolo === 'COMITATO';
  const canRitirare = (isAutore || isComitato) && seg.stato_avanzamento !== 'RITIRATA';

  const badgeColor =
    seg.stato_avanzamento === 'INVIATA_AI_CANDIDATI'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : seg.stato_avanzamento === 'PRESA_IN_CARICO'
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : seg.stato_avanzamento === 'RITIRATA'
      ? 'bg-rose-100 text-rose-800 border-rose-300'
      : 'bg-blue-100 text-blue-800 border-blue-300';

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/" className="hover:text-blue-600">Home</Link>
        <span>&rsaquo;</span>
        <Link href="/segnalazioni" className="hover:text-blue-600">Segnalazioni</Link>
        <span>&rsaquo;</span>
        <span className="text-slate-800 font-mono">{seg.id.slice(0, 8)}...</span>
      </nav>

      {/* Banner di avviso se privata */}
      {!seg.isPubblica && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl flex items-center justify-between text-xs sm:text-sm">
          <div>
            <span className="font-bold">⚠️ Segnalazione Privata:</span> Questa segnalazione non è visibile al pubblico perché in stato di moderazione <span className="font-semibold">{seg.stato_moderazione}</span> o avanzamento <span className="font-semibold">{seg.stato_avanzamento}</span>.
          </div>
          {isComitato && (
            <Link
              href="/comitato"
              className="ml-4 px-3 py-1 bg-amber-600 text-white font-semibold rounded-md hover:bg-amber-700 whitespace-nowrap text-xs"
            >
              Gestisci in Comitato
            </Link>
          )}
        </div>
      )}

      {/* Card Principale Segnalazione */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Intestazione */}
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${badgeColor}`}>
                {seg.stato_avanzamento.replace(/_/g, ' ')}
              </span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                Rev. {seg.revisione}
              </span>
              {seg.categorie.map(c => (
                <span key={c.categoria.id} className="text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded">
                  {c.categoria.nome}
                </span>
              ))}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Segnalazione Territoriale
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Inserita il {new Date(seg.creata_il).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} da {seg.autore.nome} {seg.autore.cognome?.[0]}.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canRitirare && (
              <RitiraButton segnalazioneId={seg.id} revisione={seg.revisione} />
            )}
          </div>
        </div>

        {/* Media Gallery Protetta */}
        {seg.media.length > 0 && (
          <div className="p-6 bg-slate-900 border-b border-slate-200">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Evidenze Fotografiche &bull; Media Protetti
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {seg.media.map((m) => (
                <div key={m.id} className="relative rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-800">
                  {m.tipo === 'FOTO' ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/media/${m.id}`}
                      alt="Allegato segnalazione protetto"
                      className="w-full max-h-96 object-contain"
                    />
                  ) : (
                    <video
                      controls
                      src={`/api/media/${m.id}`}
                      className="w-full max-h-96 rounded"
                    >
                      Il tuo browser non supporta il tag video.
                    </video>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contenuto Testuale e Coordinate */}
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Descrizione della Priorità
            </h2>
            <p className="text-slate-800 whitespace-pre-line leading-relaxed text-base">
              {seg.descrizione}
            </p>
          </div>

          {/* Localizzazione e Coordinate */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
            <div>
              <span className="font-semibold text-slate-800">Coordinate Geografiche:</span>{' '}
              <span className="font-mono text-slate-600">
                Lat: {seg.latitudine.toFixed(6)}, Lon: {seg.longitudine.toFixed(6)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                Origine: {seg.origine_posizione}
              </span>
              <a
                href={`https://www.openstreetmap.org/?mlat=${seg.latitudine}&mlon=${seg.longitudine}#map=16/${seg.latitudine}/${seg.longitudine}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
              >
                Vedi su OpenStreetMap &nearr;
              </a>
            </div>
          </div>

          {/* Barra Sostegno Idempotente */}
          {seg.isPubblica && (
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Sostieni questa priorità civica</h3>
                <p className="text-xs text-slate-500">I sostenitori verificati contribuiscono alla classifica da presentare alle elezioni.</p>
              </div>
              <SostegnoButton
                segnalazioneId={seg.id}
                totaleSostegni={seg.totaleSostegniValidi}
                inizialmenteSostenuto={seg.utenteHaSostenuto}
                isAutore={isAutore}
                isAuthenticated={!!user}
              />
            </div>
          )}
        </div>
      </article>

      {/* Storico Transizioni ed Eventi di Stato (RF05, RF12, T11) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <span>📜</span> Cronologia e Tracciabilità Certificata
        </h2>

        {seg.eventi_stato.length === 0 ? (
          <p className="text-xs text-slate-400">Nessun evento registrato.</p>
        ) : (
          <div className="flow-root">
            <ul className="-mb-8">
              {seg.eventi_stato.map((ev, idx) => (
                <li key={ev.id}>
                  <div className="relative pb-8">
                    {idx !== seg.eventi_stato.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-200"
                      />
                    )}
                    <div className="relative flex space-x-3 items-start">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold ring-8 ring-white">
                          {idx + 1}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                        <div>
                          <p className="text-xs sm:text-sm text-slate-800 font-medium">
                            <span className="font-bold text-slate-900">[{ev.ambito}]</span>{' '}
                            {ev.da_stato ? `${ev.da_stato} &rarr; ` : ''}
                            <span className="font-semibold text-blue-700">{ev.a_stato}</span>
                          </p>
                          <p className="text-xs text-slate-600 mt-1 italic">
                            &quot;{ev.motivazione}&quot;
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Attore: {ev.tipo_attore} {ev.attore ? `(${ev.attore.nome} ${ev.attore.cognome?.[0]}.)` : ''} &bull; Rev: {ev.revisione}
                          </p>
                        </div>
                        <div className="text-right text-xs whitespace-nowrap text-slate-400">
                          <time dateTime={ev.creato_il.toISOString()}>
                            {new Date(ev.creato_il).toLocaleDateString('it-IT', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </time>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
