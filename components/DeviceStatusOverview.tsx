"use client";

import { useEffect, useState } from "react";
import { Thermometer, CloudRain } from "lucide-react";
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
  const summaryColor =
    onlineCount === items.length
      ? "bg-emerald-50 text-emerald-700"
      : onlineCount === 0
      ? "bg-rose-50 text-rose-700"
      : "bg-amber-50 text-amber-700";

  return (
    <div className="mb-6 rounded-3xl bg-white p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Status Perangkat</h2>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${summaryColor}`}
        >
          {onlineCount}/{items.length} online
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.kind === "weather" ? Thermometer : CloudRain;
          const color = item.kind === "weather" ? "#FB923C" : "#22D3EE";
          return (
            <li
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: color }}
                >
                  <Icon size={15} strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {item.label} · {item.location}
                  </p>
                  <p className="text-xs text-slate-400">
                    {item.lastSeen
                      ? `Data terakhir ${formatRelativeTime(item.lastSeen)}`
                      : "Belum ada data"}
                  </p>
                </div>
              </div>
              <StatusBadge online={item.online} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
