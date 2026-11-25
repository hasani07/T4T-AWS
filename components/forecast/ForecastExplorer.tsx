"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import { Crosshair, MapPin, Sparkles } from "lucide-react";
import type { LocationForecast } from "@/lib/forecast/predict";
import ForecastPanel from "./ForecastPanel";
import { LEVELS, LEVEL_ORDER, pct } from "./levels";

// Halaman /prediksi: peta yang "terbang" (zoom in) ke lokasi saat dipilih,
// lalu kartu prediksi meluncur masuk di samping (desktop) atau dari bawah (HP).
// Peta dimuat dinamis (Leaflet butuh window), pola sama dengan DeviceMap.

export interface ModelInfo {
  source: "malam" | "langsung" | "langsung-basi";
  trainedAt: string;
  dataDays: number;
  rainEvents: number;
  windowDays: number | null;
}

const PANEL_W = 420; // lebar kartu di desktop (px), dipakai juga untuk menggeser titik fokus peta
const EASE = "cubic-bezier(0.22,1,0.36,1)";

function markerHtml(f: LocationForecast, selected: boolean): string {
  const lv = f.rain.level ? LEVELS[f.rain.level] : null;
  const color = lv?.color ?? "#94a3b8";
  const size = selected ? 22 : 16;
  return `
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-${size / 2}px)">
      <span style="position:absolute;top:0;width:${size}px;height:${size}px;border-radius:9999px;background:${color};opacity:.45"
            class="animate-ping"></span>
      <span style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:${color};
                   border:3px solid white;box-shadow:0 4px 14px ${color}66;transition:all .3s"></span>
      <span class="bg-surface text-slate-900"
            style="margin-top:6px;white-space:nowrap;border-radius:9999px;padding:3px 9px;font:700 11px 'Plus Jakarta Sans',sans-serif;
                   box-shadow:0 4px 16px rgba(15,23,42,.18);${selected ? `outline:2px solid ${color};` : ""}">
        ${f.label.replace(/[<>&"]/g, "")}&nbsp;<span style="color:${color}">${pct(f.rain.prob)}</span>
      </span>
    </div>`;
}

export default function ForecastExplorer({
  forecasts,
  modelInfo,
  setupError,
}: {
  forecasts: LocationForecast[];
  modelInfo: ModelInfo | null;
  setupError: string | null;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<number, Marker>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const panelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introDone = useRef(false);

  const selected = forecasts.find((f) => f.deviceId === selectedId) ?? null;
  const reduceMotion = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

  const fitAll = useCallback((animate: boolean) => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || forecasts.length === 0) return;
    const bounds = L.latLngBounds(forecasts.map((f) => [f.lat, f.lon]));
    const pad = isDesktop() ? 120 : 60;
    if (animate && !reduceMotion()) map.flyToBounds(bounds, { padding: [pad, pad], duration: 1.6, maxZoom: 11 });
    else map.fitBounds(bounds, { padding: [pad, pad], maxZoom: 11 });
  }, [forecasts]);

  // Peta
  useEffect(() => {
    if (!mapEl.current || mapRef.current || forecasts.length === 0) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current || mapRef.current) return;
      leafletRef.current = L;
      const center: [number, number] = [
        forecasts.reduce((s, f) => s + f.lat, 0) / forecasts.length,
        forecasts.reduce((s, f) => s + f.lon, 0) / forecasts.length,
      ];
      // Mulai dari jauh (Jawa Barat), lalu "zoom in" ke dua lokasi.
      const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView(center, 8);
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      // Ubin OpenStreetMap, sama dengan peta di Dashboard (DeviceMap). Mode
      // gelap ditangani filter CSS di app/globals.css (.dark .leaflet-tile-pane).
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      forecasts.forEach((f) => {
        const m = L.marker([f.lat, f.lon], {
          icon: L.divIcon({ className: "", html: markerHtml(f, false), iconSize: [0, 0] }),
          keyboard: true,
          title: `${f.label} — peluang hujan ${pct(f.rain.prob)}`,
        }).addTo(map);
        m.on("click", () => setSelectedId(f.deviceId));
        markersRef.current.set(f.deviceId, m);
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ukuran panggung berubah (mis. sidebar/rotasi HP) -> beri tahu Leaflet.
  useEffect(() => {
    if (!stageRef.current) return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  // Pilih / batal pilih lokasi: terbang ke sana, lalu kartu meluncur masuk.
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !ready) return;

    forecasts.forEach((f) => {
      markersRef.current.get(f.deviceId)?.setIcon(
        L.divIcon({ className: "", html: markerHtml(f, f.deviceId === selectedId), iconSize: [0, 0] })
      );
      markersRef.current.get(f.deviceId)?.setZIndexOffset(f.deviceId === selectedId ? 1000 : 0);
    });

    if (panelTimer.current) clearTimeout(panelTimer.current);

    if (!selected) {
      setPanelVisible(false);
      if (introDone.current) fitAll(true);
      else {
        // Pembuka: peta mulai dari jauh lalu "zoom in" ke semua lokasi,
        // diberi jeda sebentar supaya ubin peta awal sempat tampil.
        introDone.current = true;
        panelTimer.current = setTimeout(() => fitAll(true), 450);
      }
      return;
    }
    introDone.current = true;

    const zoom = 14;
    // Geser titik fokus supaya lokasi tidak tertutup kartu:
    // desktop -> kartu di kanan; HP -> kartu dari bawah.
    const size = map.getSize();
    const offset = isDesktop() ? L.point(PANEL_W / 2, 0) : L.point(0, size.y * 0.28);
    const target = map.unproject(map.project([selected.lat, selected.lon], zoom).add(offset), zoom);

    if (reduceMotion()) {
      map.setView(target, zoom);
      setPanelVisible(true);
    } else {
      setPanelVisible(false);
      map.flyTo(target, zoom, { duration: 1.7, easeLinearity: 0.15 });
      panelTimer.current = setTimeout(() => setPanelVisible(true), 900);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ready]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trainedLabel = modelInfo
    ? new Date(modelInfo.trainedAt).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      })
    : null;

  const footer = modelInfo ? (
    <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-400">
      <p>
        <Sparkles size={12} className="mr-1 inline -translate-y-px text-violet-500" />
        Model belajar sendiri dari <b className="text-slate-600">{modelInfo.dataDays} hari</b> data dua stasiun
        ({modelInfo.rainEvents} jam menjelang hujan) dan dilatih ulang tiap malam.
        {modelInfo.source === "malam" ? <> Terakhir dilatih {trainedLabel} WIB.</> : <> Model ini dilatih langsung saat halaman dibuka.</>}
      </p>
      {modelInfo.source !== "malam" && (
        <p className="text-amber-700 dark:text-amber-300">
          {modelInfo.source === "langsung"
            ? "Latihan malam belum aktif — jalankan supabase/sql/017_forecast_cron.sql."
            : "Latihan malam terakhir sudah lebih dari 36 jam lalu — cek cron forecast-train."}
        </p>
      )}
      <p>Ini peluang, bukan kepastian. Akurasi naik seiring data musim hujan bertambah.</p>
    </div>
  ) : null;

  return (
    <div>
      <style>{`
        @keyframes forecast-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .forecast-anim { transition: none !important; } }
      `}</style>

      <header className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Prediksi Cuaca</h1>
            <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
              Preview
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Peluang hujan & suhu 1–3 jam ke depan, dipelajari dari data stasiun sendiri. Klik lokasi di peta.
          </p>
        </div>
      </header>

      {setupError ? (
        <div className="rounded-3xl bg-surface p-6 text-sm text-slate-600 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
          <p className="font-semibold text-slate-900">Prediksi belum bisa disiapkan</p>
          <p className="mt-1">{setupError}</p>
        </div>
      ) : forecasts.length === 0 ? (
        <div className="rounded-3xl bg-surface p-6 text-sm text-slate-500">Belum ada lokasi dengan koordinat.</div>
      ) : (
        <div
          ref={stageRef}
          className="relative h-[calc(100dvh-13rem)] min-h-[560px] overflow-hidden rounded-3xl bg-slate-100 shadow-[0_2px_24px_rgba(15,23,42,0.08)] md:h-[calc(100vh-10rem)]"
        >
          <div ref={mapEl} className="absolute inset-0 z-0" />

          {/* Pemilih lokasi */}
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex flex-wrap items-start gap-2">
            <div className="pointer-events-auto flex flex-wrap gap-1.5 rounded-2xl bg-surface/90 p-1.5 shadow-[0_8px_30px_rgba(15,23,42,0.12)] backdrop-blur">
              {forecasts.map((f) => {
                const lv = f.rain.level ? LEVELS[f.rain.level] : null;
                const active = f.deviceId === selectedId;
                return (
                  <button
                    key={f.deviceId}
                    onClick={() => setSelectedId(active ? null : f.deviceId)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      active ? "bg-slate-900 text-on-strong" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <MapPin size={13} style={{ color: lv?.color }} aria-hidden />
                    {f.label}
                    <span className={active ? "opacity-80" : "text-slate-400"}>{pct(f.rain.prob)}</span>
                  </button>
                );
              })}
              {selectedId !== null && (
                <button
                  onClick={() => setSelectedId(null)}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
                >
                  <Crosshair size={13} aria-hidden /> Semua lokasi
                </button>
              )}
            </div>
          </div>

          {/* Petunjuk awal + legenda (saat belum memilih lokasi) */}
          <div
            className={`forecast-anim pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[calc(100%-5rem)] transition-all duration-500 ${
              selectedId === null ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            }`}
            style={{ transitionTimingFunction: EASE }}
          >
            <div className="rounded-2xl bg-surface/90 px-3.5 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.12)] backdrop-blur">
              <p className="text-[11px] font-semibold text-slate-700">Peluang hujan 3 jam ke depan</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {LEVEL_ORDER.map((k) => (
                  <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVELS[k].color }} />
                    {LEVELS[k].short}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Kartu prediksi: kanan (desktop) / bawah (HP) */}
          <aside
            aria-hidden={!panelVisible}
            className={`forecast-anim absolute z-[600] overflow-hidden bg-surface/95 shadow-[0_20px_60px_rgba(15,23,42,0.25)] backdrop-blur-md transition-all duration-700
              inset-x-2 bottom-2 h-[64%] rounded-3xl
              md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:h-auto md:w-[420px]
              ${panelVisible && selected ? "pointer-events-auto translate-y-0 opacity-100 md:translate-x-0" : "pointer-events-none translate-y-8 opacity-0 md:translate-x-10 md:translate-y-0"}`}
            style={{ transitionTimingFunction: EASE }}
          >
            {selected && (
              <ForecastPanel key={selected.deviceId} forecast={selected} onClose={() => setSelectedId(null)} footer={footer} />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
