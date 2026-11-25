"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CloudSun, Maximize2, Sparkles } from "lucide-react";
import type { LocationForecast } from "@/lib/forecast/predict";
import type { ModelInfo } from "@/lib/forecast/load";
import { FORECAST_SELECT_EVENT, LEVELS, fmt } from "./levels";

// Ringkasan prediksi per lokasi di bagian atas Dashboard. Klik kartu ->
// halaman digulir ke peta prediksi dan peta terbang ke lokasi itu
// (lewat event FORECAST_SELECT_EVENT, ditangani ForecastExplorer).
// Catatan warna: tanpa dark:text-slate-* (skala slate sudah dibalik otomatis).

function Ring({ prob, color }: { prob: number; color: string }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const [p, setP] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setP(Math.max(0, Math.min(1, prob))));
    return () => cancelAnimationFrame(id);
  }, [prob]);
  return (
    <div className="relative h-[64px] w-[64px] shrink-0">
      <svg viewBox="0 0 60 60" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="30" cy="30" r={r} fill="none" className="stroke-slate-100" strokeWidth="6" />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset 1000ms cubic-bezier(0.22,1,0.36,1) 200ms" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-slate-900">
        {Math.round(prob * 100)}%
      </span>
    </div>
  );
}

function StripCard({ f, index }: { f: LocationForecast; index: number }) {
  const level = f.rain.level ? LEVELS[f.rain.level] : null;
  const color = level?.color ?? "#94a3b8";
  const nextBmkg = f.bmkgNext[0] ?? null;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(FORECAST_SELECT_EVENT, { detail: f.deviceId }))}
      className="group relative w-full overflow-hidden rounded-3xl bg-surface p-4 text-left shadow-[0_2px_20px_rgba(15,23,42,0.06)] outline-none ring-slate-300 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_34px_rgba(15,23,42,0.12)] focus-visible:ring-2 opacity-0 [animation:forecast-rise_650ms_cubic-bezier(0.22,1,0.36,1)_forwards] sm:p-5"
      style={{ animationDelay: `${index * 110}ms` }}
      aria-label={`${f.label}: peluang hujan ${f.rain.prob !== null ? Math.round(f.rain.prob * 100) : "-"} persen. Buka di peta.`}
    >
      {/* Rona warna tingkat peluang */}
      <span
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{ background: `radial-gradient(120% 90% at 0% 0%, ${color}22 0%, transparent 60%)` }}
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-slate-900">{f.label}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {f.status === "ok" && f.basedOnHour && <>Data s/d {f.basedOnHour.slice(11, 13)}:00 WIB</>}
            {f.status === "stale" && <span className="text-amber-600 dark:text-amber-400">Data sensor tertunda</span>}
            {f.status === "nodata" && <>Belum ada data</>}
          </p>
        </div>
        {level && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${level.chip}`}>{level.short}</span>}
      </div>

      <div className="relative mt-3 flex items-center gap-3.5">
        {f.rain.prob !== null ? <Ring prob={f.rain.prob} color={color} /> : <div className="h-16 w-16 rounded-full bg-slate-100" />}
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">Peluang hujan</p>
          <p className="text-base font-bold text-slate-900">{f.rain.windowLabel ?? "3 jam ke depan"}</p>
          <p className="truncate text-[11px] text-slate-400">{level?.label}</p>
        </div>
      </div>

      {f.hours.length > 0 && (
        <div className="relative mt-4 grid grid-cols-3 gap-1.5">
          {f.hours.map((h) => (
            <div key={h.hourKey} className="rounded-xl bg-slate-50 px-2 py-1.5 text-center">
              <p className="text-[10px] font-medium text-slate-400">{h.label}</p>
              <p className="text-sm font-bold text-slate-900">{fmt(h.temp)}°</p>
              <p className="text-[10px] text-slate-500">{fmt(h.rh, 0)}%</p>
            </div>
          ))}
        </div>
      )}

      <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-3">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
          <CloudSun size={13} className="shrink-0 text-slate-400" aria-hidden />
          <span className="truncate">
            {nextBmkg ? (
              <>
                BMKG {nextBmkg.slotLocal.slice(11, 13)}:00 · <b className="font-semibold text-slate-700">{nextBmkg.desc}</b>
              </>
            ) : (
              "BMKG belum tersedia"
            )}
          </span>
        </p>
        <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-slate-700 transition group-hover:text-slate-900">
          Lihat di peta
          <ArrowUpRight size={13} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </button>
  );
}

export default function ForecastStrip({
  forecasts,
  modelInfo,
}: {
  forecasts: LocationForecast[];
  modelInfo: ModelInfo | null;
}) {
  if (forecasts.length === 0) return null;
  return (
    <section aria-labelledby="forecast-strip-title">
      <style>{`@keyframes forecast-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="forecast-strip-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            Prediksi 3 Jam ke Depan
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
              <Sparkles size={11} aria-hidden /> Model lokal
            </span>
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Belajar sendiri dari {modelInfo?.dataDays ?? "–"} hari data stasiun, dilatih ulang tiap malam. Peluang, bukan kepastian.
            {modelInfo?.source === "malam-basi" && (
              <span className="text-amber-600 dark:text-amber-400"> Model belum diperbarui lebih dari 36 jam.</span>
            )}
          </p>
        </div>
        <Link
          href="/prediksi"
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200"
        >
          <Maximize2 size={12} aria-hidden /> Layar penuh
        </Link>
      </div>
      <div className={`grid grid-cols-1 gap-3 ${forecasts.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {forecasts.map((f, i) => (
          <StripCard key={f.deviceId} f={f} index={i} />
        ))}
      </div>
    </section>
  );
}
