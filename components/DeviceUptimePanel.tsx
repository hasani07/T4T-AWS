"use client";

import { useEffect, useState } from "react";
import { Thermometer, CloudRain, Activity } from "lucide-react";
import { Device } from "@/lib/types";
import {
  OFFLINE_THRESHOLD_MINUTES,
  RAINFALL_OFFLINE_THRESHOLD_MINUTES,
} from "@/lib/config";
import { fetchDeviceUptime, UptimeError } from "@/lib/uptime";
import {
  DeviceUptime,
  formatSpan,
  formatWallClock,
  getUptimeWindow,
  UPTIME_PERIODS,
  UptimeKind,
  UptimePeriod,
  uptimeTone,
  UptimeTone,
} from "@/lib/uptimeCalc";

type Item = {
  key: string;
  kind: UptimeKind;
  label: string;
  location: string;
  deviceId: number;
  thresholdMinutes: number;
};

type ItemState =
  | { status: "ok"; data: DeviceUptime | null }
  | { status: "error"; message: string; missingFunction: boolean };

const TONE_TEXT: Record<UptimeTone, string> = {
  good: "text-emerald-700 dark:text-emerald-300",
  warn: "text-amber-700 dark:text-amber-300",
  bad: "text-rose-700 dark:text-rose-300",
  none: "text-slate-400",
};
const TONE_LABEL: Record<UptimeTone, string> = {
  good: "Sangat baik",
  warn: "Cukup",
  bad: "Perlu perhatian",
  none: "Belum ada data",
};

// Periode pendek diperbarui lebih sering; 30 hari berubah lambat dan query-nya
// paling berat, jadi cukup tiap 5 menit.
const REFRESH_MS: Record<UptimePeriod, number> = {
  "24h": 2 * 60 * 1000,
  "7d": 5 * 60 * 1000,
  "30d": 5 * 60 * 1000,
};

function fmtPct(v: number | null): string {
  return v === null ? "-" : `${v.toFixed(1)}%`;
}

const TONE_HEX: Record<UptimeTone, string> = { good: "#10B981", warn: "#F59E0B", bad: "#F43F5E", none: "#94A3B8" };

/** Cincin persentase uptime. */
function Ring({ pct, tone }: { pct: number | null; tone: UptimeTone }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = pct === null ? 0 : Math.max(0, Math.min(100, pct)) / 100;
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" className="stroke-slate-200" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={TONE_HEX[tone]}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-[13px] font-extrabold tabular-nums ${TONE_TEXT[tone]}`}>
        {pct === null ? "–" : pct >= 99.95 ? "100%" : `${pct.toFixed(1)}%`}
      </span>
    </div>
  );
}

/** Garis waktu jendela uptime: merah = saat perangkat offline. */
function OutageTimeline({ data }: { data: DeviceUptime }) {
  const t0 = Date.parse(data.windowStart + "Z");
  const t1 = Date.parse(data.windowEnd + "Z");
  const span = t1 - t0;
  if (!(span > 0)) return null;
  const segs = data.recentOutages
    .map((o) => {
      const a = Math.max(t0, Date.parse(o.start + "Z"));
      const b = Math.min(t1, Date.parse(o.end + "Z"));
      return { left: ((a - t0) / span) * 100, width: Math.max(0.6, ((b - a) / span) * 100), o };
    })
    .filter((x) => x.width > 0 && Number.isFinite(x.left));
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-emerald-500/80" role="img" aria-label="Garis waktu gangguan">
        {segs.map((sg, i) => (
          <span
            key={i}
            className={`absolute inset-y-0 ${sg.o.ongoing ? "animate-pulse bg-rose-500" : "bg-rose-500"}`}
            style={{ left: `${sg.left}%`, width: `${sg.width}%` }}
            title={`${formatWallClock(sg.o.start)} – ${sg.o.ongoing ? "sekarang" : formatWallClock(sg.o.end)} (${formatSpan(sg.o.seconds)})`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-400">
        <span>{formatWallClock(data.windowStart)}</span>
        <span>sekarang</span>
      </div>
    </div>
  );
}

function UptimeItem({ item, state, period }: { item: Item; state: ItemState | undefined; period: UptimePeriod }) {
  const Icon = item.kind === "weather" ? Thermometer : CloudRain;
  const color = item.kind === "weather" ? "#F97316" : "#06B6D4";

  const data = state?.status === "ok" ? state.data : null;
  // Belum ada data yang bisa dihitung (mis. perangkat belum pernah kirim):
  // jangan tampilkan angka "0 dari 0" yang membingungkan.
  const hasStats = data !== null && data.uptimePct !== null;
  const tone = uptimeTone(data?.uptimePct ?? null);
  const requestedStart = getUptimeWindow(period).start;
  // Perangkat yang baru ada di tengah jendela: dihitung sejak data pertamanya.
  const startedLater =
    data !== null && Date.parse(data.windowStart + "Z") - Date.parse(requestedStart + "Z") > 5 * 60 * 1000;

  return (
    <li className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/50">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
            <Icon size={16} strokeWidth={2.25} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{item.label}</p>
            <p className="truncate text-[11px] text-slate-400">{item.location}</p>
          </div>
        </div>
        {data && hasStats ? (
          <div className="flex items-center gap-2">
            <span className={`hidden text-right text-[11px] font-semibold sm:block ${TONE_TEXT[tone]}`}>{TONE_LABEL[tone]}</span>
            <Ring pct={data.uptimePct} tone={tone} />
          </div>
        ) : null}
      </div>

      {!state && <div className="mt-3 h-16 animate-pulse rounded-xl bg-slate-100" />}

      {state?.status === "error" && (
        <p className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-300">
          {state.missingFunction
            ? "Fungsi database belum dibuat. Jalankan supabase/sql/012_device_uptime.sql di Supabase SQL Editor."
            : `Gagal memuat uptime: ${state.message}`}
        </p>
      )}

      {state?.status === "ok" && !hasStats && (
        <p className="mt-3 text-xs text-slate-400">Belum ada data untuk dihitung.</p>
      )}

      {data && hasStats && (
        <>
          <div className="mt-3">
            <OutageTimeline data={data} />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-surface px-2.5 py-2 ring-1 ring-slate-200/50">
              <p className="text-[10px] text-slate-400">Gangguan</p>
              <p className="text-sm font-bold tabular-nums text-slate-900">{data.outageCount === 0 ? "Tidak ada" : `${data.outageCount}x`}</p>
            </div>
            <div className="rounded-xl bg-surface px-2.5 py-2 ring-1 ring-slate-200/50">
              <p className="text-[10px] text-slate-400">Total mati</p>
              <p className="text-sm font-bold tabular-nums text-slate-900">{data.outageCount === 0 ? "–" : formatSpan(data.downSeconds)}</p>
            </div>
            <div className="rounded-xl bg-surface px-2.5 py-2 ring-1 ring-slate-200/50">
              <p className="text-[10px] text-slate-400">Terlama</p>
              <p className="text-sm font-bold tabular-nums text-slate-900">{data.outageCount === 0 ? "–" : formatSpan(data.longestOutageSeconds)}</p>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[11px] text-slate-500">
              <span>Kelengkapan data</span>
              <span className="tabular-nums">
                <b className="text-slate-800">{fmtPct(data.completenessPct)}</b> · {data.readings.toLocaleString("id-ID")}/
                {data.expectedReadings.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${data.completenessPct ?? 0}%` }} />
            </div>
          </div>

          {startedLater && (
            <p className="mt-2 text-[11px] text-slate-400">Dihitung sejak data pertama: {formatWallClock(data.windowStart)} WIB</p>
          )}

          {data.recentOutages.length > 0 && (
            <details className="mt-2 text-xs text-slate-500">
              <summary className="cursor-pointer select-none font-medium text-slate-600">
                Rincian gangguan ({data.recentOutages.length}
                {data.outageCount > data.recentOutages.length ? ` dari ${data.outageCount}` : ""})
              </summary>
              {/* Tinggi dibatasi dan bisa di-scroll, supaya panel tidak memanjang. */}
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                {data.recentOutages.map((o) => (
                  <li key={o.start} className="flex flex-wrap justify-between gap-x-3 rounded-lg bg-surface px-2.5 py-1.5 tabular-nums ring-1 ring-slate-200/40">
                    <span>
                      {formatWallClock(o.start)} –{" "}
                      {o.ongoing ? <b className="text-rose-600 dark:text-rose-400">sedang berlangsung</b> : formatWallClock(o.end)}
                    </span>
                    <span className="font-semibold text-slate-700">{formatSpan(o.seconds)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </li>
  );
}

/**
 * Uptime tiap perangkat fisik (weather station + sensor hujan per lokasi),
 * dihitung di database (fungsi device_uptime) dari data yang sudah masuk.
 * Semua read-only.
 */
export default function DeviceUptimePanel({ devices }: { devices: Device[] }) {
  const [period, setPeriod] = useState<UptimePeriod>("24h");
  const [results, setResults] = useState<Record<string, ItemState>>({});
  const devicesKey = devices.map((d) => `${d.id}:${d.type}`).join(",");

  const items: Item[] = devices.flatMap((d) => [
    {
      key: `weather-${d.id}`,
      kind: "weather" as const,
      label: "Weather Station",
      location: d.type,
      deviceId: d.id,
      thresholdMinutes: OFFLINE_THRESHOLD_MINUTES,
    },
    {
      key: `rain-${d.id}`,
      kind: "rain" as const,
      label: "Sensor Hujan",
      location: d.type,
      deviceId: d.id,
      thresholdMinutes: RAINFALL_OFFLINE_THRESHOLD_MINUTES,
    },
  ]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const settled = await Promise.all(
        items.map(async (item): Promise<[string, ItemState]> => {
          try {
            const data = await fetchDeviceUptime(item.kind, item.deviceId, period, item.thresholdMinutes);
            return [`${period}:${item.key}`, { status: "ok", data }];
          } catch (err) {
            const message = err instanceof Error ? err.message : "Gagal memuat";
            const missingFunction =
              err instanceof UptimeError && (err.code === "PGRST202" || message.includes("device_uptime"));
            return [`${period}:${item.key}`, { status: "error", message, missingFunction }];
          }
        })
      );
      if (cancelled) return;
      // Kalau pembaruan berkala gagal tapi data lama ada, pertahankan data lama.
      setResults((prev) => {
        const next = { ...prev };
        for (const [key, state] of settled) {
          if (state.status === "error" && prev[key]?.status === "ok") continue;
          next[key] = state;
        }
        return next;
      });
    }

    load();
    const interval = setInterval(load, REFRESH_MS[period]);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, devicesKey]);

  if (devices.length === 0) return null;

  return (
    <div className="mb-6 rounded-3xl bg-surface p-4 ring-1 ring-slate-200/60 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_28px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#6366F1,#6366F1cc)", boxShadow: "0 6px 16px #6366F140" }}>
            <Activity size={18} strokeWidth={2.25} aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-900">Uptime Perangkat</h2>
            <p className="text-[11px] text-slate-400">Seberapa sering tiap alat aktif & mengirim data</p>
          </div>
        </div>
        <div className="inline-flex rounded-full bg-slate-100 p-0.5" role="group" aria-label="Periode uptime">
          {UPTIME_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              aria-pressed={period === p.value}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                period === p.value ? "bg-surface text-slate-900 shadow-sm ring-1 ring-slate-200/70" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <UptimeItem key={item.key} item={item} state={results[`${period}:${item.key}`]} period={period} />
        ))}
      </ul>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-500/80" /> aktif</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-rose-500" /> offline</span>
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        Uptime = persentase waktu perangkat tidak berstatus Offline (Offline = tidak ada data baru lebih dari{" "}
        {OFFLINE_THRESHOLD_MINUTES} menit, sama dengan badge di atas). Data masuk = jumlah baris dibanding
        1 baris per menit; angka ini menangkap perangkat yang sering telat kirim sebentar-sebentar walau tidak
        sampai Offline.
      </p>
    </div>
  );
}
