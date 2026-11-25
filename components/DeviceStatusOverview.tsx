"use client";

import { useEffect, useState } from "react";
import { Thermometer, CloudRain, Radio } from "lucide-react";
import { Device } from "@/lib/types";
import {
  OFFLINE_THRESHOLD_MINUTES,
  RAINFALL_OFFLINE_THRESHOLD_MINUTES,
} from "@/lib/config";
import { isDeviceOnline, formatRelativeTime } from "@/lib/deviceStatus";
import { fetchLastSeen, LastSeen } from "@/lib/deviceLastSeen";
import StatusBadge from "./StatusBadge";

const POLL_INTERVAL_MS = 30_000;

type StatusItem = {
  key: string;
  kind: "weather" | "rain";
  label: string;
  location: string;
  lastSeen: string | null;
  online: boolean;
};

/**
 * Panel status SEMUA perangkat fisik, dihitung sendiri-sendiri:
 * tiap lokasi = 1 weather station + 1 sensor hujan (2 lokasi -> 4 perangkat).
 * Dengan begitu kelihatan persis mana yang mati.
 *
 * Diperbarui sendiri tiap 30 detik. Status dihitung dari Date.now() saat
 * render, jadi ada re-render berkala supaya badge tidak nyangkut "Online"
 * kalau perangkat mati atau polling sedang gagal.
 */
export default function DeviceStatusOverview({
  devices,
  initial,
}: {
  devices: Device[];
  initial: LastSeen;
}) {
  const [lastSeen, setLastSeen] = useState<LastSeen>(initial);
  const [, forceRerender] = useState(0);
  const deviceIdsKey = devices.map((d) => d.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = devices.map((d) => d.id);

    async function refresh() {
      try {
        const fresh = await fetchLastSeen(ids);
        if (!cancelled) setLastSeen(fresh);
      } catch (err) {
        // Gangguan sesaat: pertahankan data terakhir yang valid.
        console.error("Gagal memperbarui status perangkat:", err);
      }
      if (!cancelled) forceRerender((n) => n + 1);
    }

    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIdsKey]);

  if (devices.length === 0) return null;

  // Urut per lokasi: weather station lalu sensor hujan.
  const items: StatusItem[] = devices.flatMap((d) => {
    const weatherSeen = lastSeen.weather[d.id] ?? null;
    const rainSeen = lastSeen.rain[d.id] ?? null;
    return [
      {
        key: `weather-${d.id}`,
        kind: "weather" as const,
        label: "Weather Station",
        location: d.type,
        lastSeen: weatherSeen,
        online: isDeviceOnline(weatherSeen, OFFLINE_THRESHOLD_MINUTES),
      },
      {
        key: `rain-${d.id}`,
        kind: "rain" as const,
        label: "Sensor Hujan",
        location: d.type,
        lastSeen: rainSeen,
        online: isDeviceOnline(rainSeen, RAINFALL_OFFLINE_THRESHOLD_MINUTES),
      },
    ];
  });

  const onlineCount = items.filter((i) => i.online).length;
  const allOk = onlineCount === items.length;
  const noneOk = onlineCount === 0;
  const summaryColor = allOk
    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : noneOk
      ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300"
      : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300";

  // Dikelompokkan per lokasi: tiap lokasi = 1 weather station + 1 sensor hujan.
  const byLocation = devices.map((d) => ({
    id: d.id,
    name: d.type,
    items: items.filter((i) => i.location === d.type),
  }));

  return (
    <div className="mb-6 rounded-3xl bg-surface p-4 ring-1 ring-slate-200/60 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_28px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#10B981,#10B981cc)", boxShadow: "0 6px 16px #10B98140" }}>
            <Radio size={18} strokeWidth={2.25} aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-900">Status Perangkat</h2>
            <p className="text-[11px] text-slate-400">Dipantau tiap 30 detik · offline bila tidak ada data &gt;{OFFLINE_THRESHOLD_MINUTES} menit</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Meter ringkas: satu segmen per alat */}
          <div className="hidden gap-1 sm:flex" aria-hidden>
            {items.map((i) => (
              <span key={i.key} className={`h-2 w-6 rounded-full ${i.online ? "bg-emerald-500" : "bg-rose-500"}`} />
            ))}
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${summaryColor}`}>
            {onlineCount}/{items.length} online
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {byLocation.map((loc) => (
          <div key={loc.id} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/50">
            <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{loc.name}</p>
            <ul className="space-y-2">
              {loc.items.map((item) => {
                const Icon = item.kind === "weather" ? Thermometer : CloudRain;
                const color = item.kind === "weather" ? "#F97316" : "#06B6D4";
                return (
                  <li key={item.key} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-slate-200/50">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
                        <Icon size={16} strokeWidth={2.25} aria-hidden />
                        <span className="absolute -right-1 -top-1 flex h-3 w-3">
                          {item.online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
                          <span className={`relative inline-flex h-3 w-3 rounded-full ring-2 ring-surface ${item.online ? "bg-emerald-500" : "bg-rose-500"}`} />
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.label}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {item.lastSeen ? `Data terakhir ${formatRelativeTime(item.lastSeen)}` : "Belum ada data"}
                        </p>
                      </div>
                    </div>
                    <StatusBadge online={item.online} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
