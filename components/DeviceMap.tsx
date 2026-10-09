"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";

export interface DeviceMapMarker {
  id: number;
  label: string;
  lat: number;
  lon: number;
  // true kalau SALAH SATU (cuaca atau hujan) online -- dipakai untuk warna
  // titik di peta. Detail per alat ada di `weather`/`rainfall` di bawah,
  // karena di satu lokasi ada 2 alat terpisah (weather station & sensor
  // hujan) yang bisa online/offline sendiri-sendiri.
  online: boolean;
  weather: {
    online: boolean;
    temperature: number | null;
    humidity: number | null;
    windSpeed: number | null;
  };
  rainfall: {
    online: boolean;
    todayMm: number | null;
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPopupHtml(d: DeviceMapMarker): string {
  const weatherLine = d.weather.online
    ? `${d.weather.temperature?.toFixed(1) ?? "-"}&deg;C, ${d.weather.humidity?.toFixed(0) ?? "-"}% RH, angin ${d.weather.windSpeed?.toFixed(1) ?? "-"} m/s`
    : "Offline";
  const rainLine = d.rainfall.online
    ? `${d.rainfall.todayMm !== null ? d.rainfall.todayMm.toFixed(1) : "-"} mm hari ini`
    : "Offline";

  return `
    <div style="min-width:200px;font-size:13px;line-height:1.5">
      <strong>${escapeHtml(d.label)}</strong>
      <div style="margin-top:6px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>&#127777;&#65039; Cuaca: ${weatherLine}</span>
      </div>
      <a href="#weather-card-${d.id}" style="font-size:12px">Lihat kartu cuaca &rarr;</a>
      <div style="margin-top:6px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>&#127783;&#65039; Hujan: ${rainLine}</span>
      </div>
      <a href="#rainfall-card-${d.id}" style="font-size:12px">Lihat kartu hujan &rarr;</a>
    </div>
  `;
}

export default function DeviceMap({ devices }: { devices: DeviceMapMarker[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (devices.length === 0) return;
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      // Perbaikan bawaan: ikon marker default Leaflet sering hilang kalau
      // di-bundle Webpack/Next.js — pakai URL dari CDN sebagai gantinya.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const centerLat = devices.reduce((s, d) => s + d.lat, 0) / devices.length;
      const centerLon = devices.reduce((s, d) => s + d.lon, 0) / devices.length;

      const map = L.map(containerRef.current).setView([centerLat, centerLon], 11);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const greenIcon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:9999px;background:#34D399;border:3px solid white;box-shadow:0 0 0 2px rgba(52,211,153,0.4)"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const roseIcon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:9999px;background:#FB7185;border:3px solid white;box-shadow:0 0 0 2px rgba(251,113,133,0.4)"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      devices.forEach((d) => {
        const marker = L.marker([d.lat, d.lon], { icon: d.online ? greenIcon : roseIcon }).addTo(map);
        // Satu titik mewakili SATU LOKASI yang punya 2 alat (weather station +
        // sensor hujan terpisah, lihat DEVICE_COORDINATES di lib/config.ts) --
        // jadi popup-nya menampilkan ringkasan dua-duanya sekaligus, dengan
        // link yang scroll ke kartu masing-masing di halaman ini.
        marker.bindPopup(buildPopupHtml(d));
      });

      if (devices.length > 1) {
        const bounds = L.latLngBounds(devices.map((d) => [d.lat, d.lon]));
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (devices.length === 0) {
    return (
      <div className="relative z-0 flex h-72 items-center justify-center overflow-hidden rounded-3xl bg-slate-50 text-sm text-slate-400">
        Belum ada koordinat device untuk ditampilkan di peta.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative z-0 h-72 w-full overflow-hidden rounded-3xl md:h-80"
    />
  );
}
