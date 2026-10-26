'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MappaLuogoPickerProps {
  coords: { lat: number; lon: number } | null;
  onPositionSelect: (coords: { lat: number; lon: number }) => void;
  readOnly?: boolean;
}

// Icona SVG personalizzata per evitare problemi di path asset dei bundler
const markerIcon = L.divIcon({
  className: 'custom-pin-container',
  html: `
    <div style="transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; cursor: grab;" aria-label="Segnaposto segnalazione">
      <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 5px rgba(0,0,0,0.35));">
        <path d="M17 0C7.61 0 0 7.61 0 17C0 29.75 17 42 17 42C17 42 34 29.75 34 17C34 7.61 26.39 0 17 0Z" fill="#1A512E" stroke="#FFFFFF" stroke-width="2"/>
        <circle cx="17" cy="17" r="6" fill="#FFFFFF"/>
        <circle cx="17" cy="17" r="3.5" fill="#10B981"/>
      </svg>
    </div>
  `,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

export default function MappaLuogoPicker({
  coords,
  onPositionSelect,
  readOnly = false,
}: MappaLuogoPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Centro iniziale predefinito: Piazza del Duomo, Milano
  const DEFAULT_MILANO_LAT = 45.4642;
  const DEFAULT_MILANO_LON = 9.19;

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [DEFAULT_MILANO_LAT, DEFAULT_MILANO_LON],
      zoom: 13,
      scrollWheelZoom: 'center',
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Gestione click su mappa: posiziona o sposta il singolo segnaposto
    if (!readOnly) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        const lat = parseFloat(e.latlng.lat.toFixed(6));
        const lon = parseFloat(e.latlng.lng.toFixed(6));
        onPositionSelect({ lat, lon });
      });
    }

    mapInstanceRef.current = map;

    // Fix per rendering iniziale dei riquadri
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, [readOnly, onPositionSelect]);

  // Sincronizzazione marker e centratura mappa in base a coords
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!coords) {
      // Nessuna posizione scelta: rimuovi il marker se presente
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const { lat, lon } = coords;

    if (!markerRef.current) {
      // Crea il singolo marker trascinabile
      const marker = L.marker([lat, lon], {
        icon: markerIcon,
        draggable: !readOnly,
        title: 'Trascina per correggere con precisione la posizione',
      }).addTo(map);

      if (!readOnly) {
        marker.on('dragend', () => {
          const latLng = marker.getLatLng();
          const newLat = parseFloat(latLng.lat.toFixed(6));
          const newLon = parseFloat(latLng.lng.toFixed(6));
          onPositionSelect({ lat: newLat, lon: newLon });
        });
      }

      markerRef.current = marker;
      map.setView([lat, lon], Math.max(map.getZoom(), 15));
    } else {
      // Sposta il marker esistente
      markerRef.current.setLatLng([lat, lon]);
      // Ri-centra se la mappa è molto distante
      const currentCenter = map.getCenter();
      const dist = map.distance(currentCenter, [lat, lon]);
      if (dist > 100) {
        map.panTo([lat, lon]);
      }
    }
  }, [coords, readOnly, onPositionSelect]);

  return (
    <div className="relative w-full h-[360px] sm:h-[420px] rounded-[var(--radius-md)] overflow-hidden border border-[var(--border-medium)] bg-[var(--bg-subtle)] focus-within:ring-2 focus-within:ring-[var(--forest-500)]">
      <div
        ref={mapContainerRef}
        className="w-full h-full z-0"
        role="region"
        aria-label="Mappa interattiva per la scelta del luogo della segnalazione"
      />
      {!coords && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-white/95 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-[var(--forest-border)] shadow-md pointer-events-none text-xs font-semibold text-[var(--forest-900)] flex items-center gap-1.5 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-[var(--emerald-accent)]" />
          Clicca sulla mappa per collocare il segnaposto
        </div>
      )}
      {coords && !readOnly && (
        <div className="absolute bottom-3 left-3 z-[400] bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded text-[0.6875rem] text-[var(--text-secondary)] border border-[var(--border-light)] shadow-sm pointer-events-none">
          Trascina il segnaposto o clicca altrove per correggere il punto
        </div>
      )}
    </div>
  );
}
