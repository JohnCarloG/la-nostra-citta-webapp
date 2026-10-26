'use client';

import React, { useState, useCallback } from 'react';
import { submitSegnalazioneAction } from '@/actions/uploads';
import LuogoPicker from '@/components/segnalazioni/luogo-picker';
import { ExifSuggerimento } from '@/lib/geo/location-picker';

interface UploadItem {
  id: string;
  storageKey: string;
  fileName: string;
  mime: string;
  byteSize: number;
  tipo: 'FOTO' | 'VIDEO';
  exifCoords?: { lat: number; lon: number };
}

interface SelectedLocation {
  lat: number;
  lon: number;
  origine: 'MANUALE' | 'EXIF_CONFERMATO';
  confermata: boolean;
  indirizzo?: string;
}

export default function NuovaSegnalazioneForm() {
  const [descrizione, setDescrizione] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [exifProposta, setExifProposta] = useState<ExifSuggerimento | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleLocationChange = useCallback((loc: SelectedLocation | null) => {
    setSelectedLocation(loc);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (uploads.length + files.length > 5) {
      setError('È possibile allegare un massimo di 5 file multimediali.');
      return;
    }

    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Caricamento del file "${file.name}" in corso…`);

      const formData = new FormData();
      formData.append('file', file);

      let res: {
        success: boolean;
        data?: {
          uploadId: string;
          storageKey: string;
          mime: string;
          byteSize: number;
          tipo: 'FOTO' | 'VIDEO';
          exifCoords?: { lat: number; lon: number };
        };
        error?: string;
      };

      try {
        const response = await fetch('/api/uploads', { method: 'POST', body: formData });
        res = await response.json();
      } catch {
        res = { success: false, error: 'Errore di connessione durante il caricamento del file' };
      }

      if (!res.success || !res.data) {
        setError(`Errore durante il caricamento di "${file.name}": ${res.error}`);
        setUploading(false);
        setUploadProgress(null);
        return;
      }

      const item: UploadItem = {
        id: res.data.uploadId,
        storageKey: res.data.storageKey,
        fileName: file.name,
        mime: res.data.mime,
        byteSize: res.data.byteSize,
        tipo: res.data.tipo,
        exifCoords: res.data.exifCoords,
      };

      setUploads(prev => [...prev, item]);

      // Se il file contiene metadati EXIF GPS, presentalo come suggerimento da confermare (senza sovrascrivere automaticamente)
      if (res.data.exifCoords) {
        setExifProposta({
          lat: res.data.exifCoords.lat,
          lon: res.data.exifCoords.lon,
          nomeFile: file.name,
        });
      }
    }

    setUploading(false);
    setUploadProgress(null);
  };

  const removeUpload = (storageKey: string) => {
    setUploads(prev => prev.filter(u => u.storageKey !== storageKey));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Validazione selezione e conferma del luogo
    if (!selectedLocation) {
      setError('È obbligatorio indicare il luogo della segnalazione tramite la ricerca indirizzi, la mappa interattiva o l’alternativa testuale.');
      return;
    }

    if (!selectedLocation.confermata) {
      setError('Conferma la selezione del luogo selezionando la casella di controllo nel riepilogo.');
      return;
    }

    const latNum = selectedLocation.lat;
    const lonNum = selectedLocation.lon;

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setError('La latitudine selezionata non è valida (deve essere tra -90 e 90).');
      return;
    }

    if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
      setError('La longitudine selezionata non è valida (deve essere tra -180 e 180).');
      return;
    }

    // 2. Validazione descrizione
    if (!descrizione.trim() || descrizione.trim().length < 10) {
      setError('La descrizione della segnalazione deve contenere almeno 10 caratteri.');
      return;
    }

    // 3. Validazione cardinalità minima allegati
    if (uploads.length === 0) {
      setError('È obbligatorio allegare almeno una fotografia o un video a documentazione del problema.');
      return;
    }

    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.set('descrizione', descrizione.trim());
      fd.set('latitudine', String(latNum));
      fd.set('longitudine', String(lonNum));
      fd.set('originePosizione', selectedLocation.origine);
      fd.set('storageKeys', JSON.stringify(uploads.map(u => u.storageKey)));

      const res = await submitSegnalazioneAction(fd);

      if (!res.success || !res.segnalazioneId) {
        setError(res.error || 'Impossibile inviare la segnalazione. Riprova più tardi.');
        setSubmitting(false);
        return;
      }

      setSuccessId(res.segnalazioneId);
      setDescrizione('');
      setSelectedLocation(null);
      setExifProposta(null);
      setUploads([]);
    } catch {
      setError('Si è verificato un errore imprevisto durante l&rsquo;invio. Riprova.');
    } finally {
      setSubmitting(false);
    }
  };

  if (successId) {
    return (
      <div className="panel alert-success flex flex-col gap-3">
        <h2 className="text-base font-bold text-[var(--success-text)]">
          Segnalazione inviata con successo
        </h2>
        <p className="text-xs text-[var(--success-text)]">
          La tua segnalazione è stata registrata con codice identificativo: <strong className="font-mono">{successId}</strong>.
          È ora nella coda di verifica del comitato di garanzia. Una volta verificata, sarà pubblicata e aperta al sostegno dei residenti.
        </p>
        <div className="flex items-center gap-3 mt-2">
          <a href={`/segnalazioni/${successId}`} className="btn btn-primary btn-sm">
            Visualizza la scheda &rarr;
          </a>
          <button
            type="button"
            onClick={() => setSuccessId(null)}
            className="btn btn-secondary btn-sm"
          >
            Invia un&rsquo;altra segnalazione
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="border-b border-[var(--border-light)] pb-3 mb-4">
        <h2 className="section-title text-base">
          Invia una nuova segnalazione
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Compila tutti i campi richiesti per documentare la situazione in modo chiaro e verificabile.
        </p>
      </div>

      {error && (
        <div className="alert alert-error mb-4" role="alert">
          <p className="text-xs">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Descrizione */}
        <div>
          <label htmlFor="segnalazione-descrizione" className="form-label">
            Descrizione dettagliata della criticità <span className="text-[var(--error-text)]">*</span>
          </label>
          <p className="form-helper">
            Spiega chiaramente qual è il problema, la via o piazza interessata e l&rsquo;eventuale situazione di disagio o pericolo (minimo 10 caratteri).
          </p>
          <textarea
            id="segnalazione-descrizione"
            required
            rows={4}
            value={descrizione}
            onChange={e => setDescrizione(e.target.value)}
            placeholder="Es. In via Roma all&rsquo;altezza del civico 12 il marciapiede presenta un dislivello pronunciato che impedisce il passaggio di carrozzine..."
            className="form-input text-xs"
          />
        </div>

        {/* Scelta del Luogo: Ricerca, Mappa con singolo segnaposto, GPS, EXIF e Alternativa Testuale */}
        <LuogoPicker
          exifProposta={exifProposta}
          onLocationChange={handleLocationChange}
          disabled={submitting || uploading}
        />

        {/* Allegati */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="segnalazione-files" className="form-label mb-0">
              Allegati fotografici o video ({uploads.length}/5) <span className="text-[var(--error-text)]">*</span>
            </label>
            <label
              htmlFor="segnalazione-files"
              className={`btn btn-secondary btn-sm ${uploads.length >= 5 || uploading ? 'opacity-50 pointer-events-none' : ''}`}
              style={{ cursor: 'pointer' }}
            >
              Sfoglia file da allegare…
              <input
                id="segnalazione-files"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4"
                onChange={handleFileChange}
                disabled={uploads.length >= 5 || uploading}
                className="sr-only"
              />
            </label>
          </div>
          <p className="form-helper">
            Formati accettati: JPEG, PNG, WebP o MP4. Massimo 5 allegati. È richiesta almeno 1 immagine di riscontro.
          </p>

          <div className="panel-subtle p-3 min-h-[70px] flex flex-col justify-center">
            {uploadProgress && (
              <p className="text-xs text-[var(--blue-primary)] font-semibold">
                {uploadProgress}
              </p>
            )}

            {uploads.length === 0 && !uploadProgress ? (
              <p className="text-xs text-center text-[var(--text-muted)] py-2">
                Nessun file ancora allegato. Clicca su &ldquo;Sfoglia file&rdquo; per aggiungere la documentazione fotografica.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 m-0 p-0 list-none">
                {uploads.map(item => (
                  <li
                    key={item.storageKey}
                    className="flex items-center justify-between py-1.5 border-b border-[var(--border-light)] text-xs gap-3 last:border-b-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-[var(--text-primary)] truncate max-w-[200px] sm:max-w-xs">
                        {item.fileName}
                      </span>
                      <span className="badge badge-categoria text-[0.625rem]">
                        {item.tipo} &bull; {(item.byteSize / 1024).toFixed(0)} KB
                      </span>
                      {item.exifCoords && (
                        <span className="text-[0.625rem] text-[var(--success-text)] font-mono hidden sm:inline">
                          GPS rilevato ({item.exifCoords.lat.toFixed(4)}, {item.exifCoords.lon.toFixed(4)})
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeUpload(item.storageKey)}
                      className="btn btn-danger btn-sm text-[0.6875rem] py-0.5 px-2 shrink-0"
                    >
                      Rimuovi
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Pulsante di invio conforme ai requisiti */}
        <div className="border-t border-[var(--border-light)] pt-4 flex items-center justify-end">
          <button
            type="submit"
            id="submit-segnalazione"
            disabled={submitting || uploading || uploads.length === 0 || !selectedLocation || !selectedLocation.confermata}
            className="btn btn-primary"
          >
            {submitting ? 'Invio in corso…' : 'Invia segnalazione'}
          </button>
        </div>
      </form>
    </div>
  );
}