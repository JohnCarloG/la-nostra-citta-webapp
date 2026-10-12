'use client';

import React, { useState } from 'react';
import { submitSegnalazioneAction } from '@/actions/uploads';

interface UploadItem {
  id: string;
  storageKey: string;
  fileName: string;
  mime: string;
  byteSize: number;
  tipo: 'FOTO' | 'VIDEO';
  exifCoords?: { lat: number; lon: number };
}

export default function NuovaSegnalazioneForm() {
  const [descrizione, setDescrizione] = useState('');
  const [lat, setLat] = useState('45.4642'); // Default Milano Centro
  const [lon, setLon] = useState('9.1900');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (uploads.length + files.length > 5) {
      setError('Massimo 5 allegati totali consentiti per segnalazione.');
      return;
    }

    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Caricamento e verifica di "${file.name}"...`);

      const formData = new FormData();
      formData.append('file', file);

      let res: { success: boolean; data?: { uploadId: string; storageKey: string; mime: string; byteSize: number; tipo: 'FOTO' | 'VIDEO'; exifCoords?: { lat: number; lon: number } }; error?: string };
      try {
        const response = await fetch('/api/uploads', {
          method: 'POST',
          body: formData
        });
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
        exifCoords: res.data.exifCoords
      };

      setUploads(prev => [...prev, item]);

      // Se il file contiene coordinate EXIF e l'utente non ha impostato coordinate personalizzate
      if (res.data.exifCoords) {
        setLat(res.data.exifCoords.lat.toString());
        setLon(res.data.exifCoords.lon.toString());
      }
    }

    setUploading(false);
    setUploadProgress(null);
    e.target.value = ''; // Reset input
  };

  const removeUpload = (key: string) => {
    setUploads(prev => prev.filter(u => u.storageKey !== key));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (uploads.length === 0) {
      setError('Devi allegare almeno un\'immagine o un video valido.');
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.append('descrizione', descrizione);
    formData.append('latitudine', lat);
    formData.append('longitudine', lon);
    formData.append('storageKeys', JSON.stringify(uploads.map(u => u.storageKey)));

    const res = await submitSegnalazioneAction(formData);
    setSubmitting(false);

    if (res.success && res.segnalazioneId) {
      setSuccessId(res.segnalazioneId);
    } else {
      setError(res.error || 'Errore durante la creazione della segnalazione.');
    }
  };

  if (successId) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center space-y-4">
        <h3 className="text-xl font-bold text-emerald-800">Segnalazione Inviata con Successo!</h3>
        <p className="text-sm text-emerald-700">
          La segnalazione è stata registrata con stato <strong>RICEVUTA</strong> e inoltrata alla coda di moderazione.
        </p>
        <div className="text-xs font-mono bg-white p-2 rounded border border-emerald-200 inline-block text-slate-700">
          ID Segnalazione: {successId}
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              setSuccessId(null);
              setDescrizione('');
              setUploads([]);
            }}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700"
          >
            Invia un&apos;altra segnalazione
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-lg font-semibold text-slate-900">Nuova Segnalazione Territoriale</h2>
        <p className="text-sm text-slate-500">
          Allega fino a 5 fotografie (JPEG/PNG/WebP max 10 MiB) o brevi video (MP4 max 50 MiB).
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Descrizione del problema <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            rows={3}
            value={descrizione}
            onChange={e => setDescrizione(e.target.value)}
            className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            placeholder="Descrivi la situazione o il problema rilevato nel quartiere..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Latitudine <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="any"
              required
              value={lat}
              onChange={e => setLat(e.target.value)}
              className="w-full rounded-md border border-slate-300 p-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Longitudine <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="any"
              required
              value={lon}
              onChange={e => setLon(e.target.value)}
              className="w-full rounded-md border border-slate-300 p-2 text-sm font-mono"
            />
          </div>
        </div>

        <p className="text-xs text-slate-500 italic">
          Nota: le coordinate geografiche eventualmente estratte dai metadati EXIF del file fotografico sono indicative e non costituiscono prova attendibile del reale luogo dello scatto. Verifica e modifica la posizione se necessario.
        </p>

        {/* Sezione Allegati */}
        <div className="border border-dashed border-slate-300 rounded-lg p-4 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              Allegati Multimediali ({uploads.length}/5)
            </span>
            <label className={`cursor-pointer inline-flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 ${uploads.length >= 5 || uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              Sfoglia File...
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4"
                onChange={handleFileChange}
                disabled={uploads.length >= 5 || uploading}
                className="hidden"
              />
            </label>
          </div>

          {uploadProgress && (
            <div className="text-xs text-blue-600 font-medium animate-pulse">
              {uploadProgress}
            </div>
          )}

          {uploads.length === 0 ? (
            <p className="text-xs text-slate-400">
              Nessun file allegato. È obbligatorio includere almeno una fotografia o un video valido.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {uploads.map(item => (
                <li key={item.storageKey} className="py-2 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <span className="font-medium text-slate-800">{item.fileName}</span>
                    <div className="text-slate-500 flex gap-2">
                      <span className="uppercase font-semibold text-blue-700">{item.tipo}</span>
                      <span>({(item.byteSize / 1024).toFixed(1)} KB)</span>
                      {item.exifCoords && (
                        <span className="text-emerald-600 font-mono">
                          EXIF GPS: {item.exifCoords.lat}, {item.exifCoords.lon}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeUpload(item.storageKey)}
                    className="text-red-600 hover:text-red-800 font-medium px-2 py-1"
                  >
                    Rimuovi
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || uploading || uploads.length === 0}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
        >
          {submitting ? 'Invio in corso...' : 'Invia Segnalazione Atomica'}
        </button>
      </form>
    </div>
  );
}
