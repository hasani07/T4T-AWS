"use client";

import { useEffect, useState } from "react";
import { Thermometer, CloudRain } from "lucide-react";
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
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-rose-700",
  none: "text-slate-400",
};
const TONE_BAR: Record<UptimeTone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
  none: "bg-slate-300",
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

function UptimeItem({ item, state, period }: { item: Item; state: ItemState | undefined; period: UptimePeriod }) {
  const Icon = item.kind === "weather" ? Thermometer : CloudRain;
  const color = item.kind === "weather" ? "#FB923C" : "#22D3EE";

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
    <li className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: color }}
          >
            <Icon size={15} strokeWidth={2.25} />
          </span>
          <p className="truncate text-sm font-medium text-slate-900">
            {item.label} · {item.location}
          </p>
        </div>
        {data && (
          <div className="shrink-0 text-right">
            <p className={`text-xl font-semibold tabular-nums ${TONE_TEXT[tone]}`}>{fmtPct(data.uptimePct)}</p>
            <p className={`text-[11px] ${TONE_TEXT[tone]}`}>{TONE_LABEL[tone]}</p>
          </div>
        )}
      </div>

      {!state && <p className="mt-3 text-xs text-slate-400">Memuat...</p>}

      {state?.status === "error" && (
        <p className="mt-3 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700">
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
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${TONE_BAR[tone]}`}
              style={{ width: `${data.uptimePct ?? 0}%` }}
            />
          </div>

          <div className="mt-3 space-y-1 text-xs text-slate-500">
            <p>
              Data masuk:{" "}
              <b className="tabular-nums text-slate-700">
                {data.readings.toLocaleString("id-ID")} dari {data.expectedReadings.toLocaleString("id-ID")}
              </b>{" "}
              ({fmtPct(data.completenessPct)})
            </p>
            {data.outageCount === 0 ? (
              <p>
                Gangguan: <b className="text-slate-700">tidak ada</b>
              </p>
            ) : (
              <p>
                Gangguan: <b className="text-slate-700">{data.outageCount}x</b> · total{" "}
                <b className="text-slate-700">{formatSpan(data.downSeconds)}</b> · terlama{" "}
                <b className="text-slate-700">{formatSpan(data.longestOutageSeconds)}</b>
              </p>
            )}
            {startedLater && (
              <p className="text-slate-400">
                Dihitung sejak data pertama: {formatWallClock(data.windowStart)} WIB
              </p>
            )}
          </div>

          {data.recentOutages.length > 0 && (
            <details className="mt-2 text-xs text-slate-500">
              <summary className="cursor-pointer select-none text-slate-500">
                Gangguan terbaru ({data.recentOutages.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {data.recentOutages.map((o) => (
                  <li key={o.start} className="flex flex-wrap justify-between gap-x-3 tabular-nums">
                    <span>
                      {formatWallClock(o.start)} –{" "}
                      {o.ongoing ? (
                        <b className="text-rose-600">sedang berlangsung</b>
                      ) : (
                        formatWallClock(o.end)
                      )}
                    </span>
                    <span className="text-slate-700">{formatSpan(o.seconds)}</span>
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
    <div className="mb-6 rounded-3xl bg-white p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Uptime Perangkat</h2>
        <div className="inline-flex rounded-full bg-slate-100 p-0.5" role="group" aria-label="Periode uptime">
          {UPTIME_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              aria-pressed={period === p.value}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                period === p.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <UptimeItem key={item.key} item={item} state={results[`${period}:${item.key}`]} period={period} />
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Uptime = persentase waktu perangkat tidak berstatus Offline (Offline = tidak ada data baru lebih dari{" "}
        {OFFLINE_THRESHOLD_MINUTES} menit, sama dengan badge di atas). Data masuk = jumlah baris dibanding
        1 baris per menit; angka ini menangkap perangkat yang sering telat kirim sebentar-sebentar walau tidak
        sampai Offline.
      </p>
    </div>
  );
}
