"use client";

import { useCallback, useEffect, useState } from "react";
import { Device } from "@/lib/types";
import { PeriodPreset, getPeriodRange, getPreviousRange } from "@/lib/dateRange";
import { computeStats, fetchReadings, PeriodStats } from "@/lib/statsEngine";
import { fetchRainfallBuckets, fetchRainfallTotal, RainBucket } from "@/lib/rainfall";
import PeriodSelector from "./PeriodSelector";
import StatsSummary from "./StatsSummary";
import TrendChart from "./TrendChart";
import LocationComparison from "./LocationComparison";

const AUTO_REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 menit

export default function AnalyticsClient({ devices }: { devices: Device[] }) {
  const [deviceId, setDeviceId] = useState<number | null>(devices[0]?.id ?? null);
  const [preset, setPreset] = useState<PeriodPreset>("7d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentStats, setCurrentStats] = useState<PeriodStats | null>(null);
  const [previousStats, setPreviousStats] = useState<PeriodStats | null>(null);
  const [statsByDevice, setStatsByDevice] = useState<Record<number, PeriodStats | null>>({});
  const [rainBuckets, setRainBuckets] = useState<RainBucket[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadData = useCallback(
    async (showSpinner: boolean) => {
      if (!deviceId) return;
      if (preset === "custom" && (!customStart || !customEnd)) return;

      if (showSpinner) setLoading(true);
      setErrorMsg(null);
      try {
        const range = getPeriodRange(preset, customStart, customEnd);
        const prevRange = getPreviousRange(range);

        // Cuaca (tabel `sensors`) dan curah hujan (tabel `rainfall_readings`,
        // ESP terpisah) diambil terpisah, lalu digabung di sini. Total hujan
        // dijumlahkan di database (RPC), bukan diunduh baris demi baris.
        const [allCurrentResults, previous, rainHourly] = await Promise.all([
          Promise.all(
            devices.map(async (d) => {
              const [readings, rainTotal] = await Promise.all([
                fetchReadings(d.id, range),
                fetchRainfallTotal(d.id, range),
              ]);
              return [
                d.id,
                { ...computeStats(readings), totalRainfall: rainTotal },
              ] as const;
            })
          ),
          Promise.all([
            fetchReadings(deviceId as number, prevRange),
            fetchRainfallTotal(deviceId as number, prevRange),
          ]),
          fetchRainfallBuckets(deviceId as number, range, "hour"),
        ]);

        const [previousReadings, previousRain] = previous;

        const statsMap: Record<number, PeriodStats> = {};
        for (const [id, stats] of allCurrentResults) {
          statsMap[id] = stats;
        }

        setStatsByDevice(statsMap);
        setCurrentStats(statsMap[deviceId as number] ?? null);
        setPreviousStats({
          ...computeStats(previousReadings),
          totalRainfall: previousRain,
        });
        setRainBuckets(rainHourly);
        setLastUpdatedAt(new Date());
      } catch (err) {
        console.error("Gagal memuat analitik:", err);
        setErrorMsg("Gagal mengambil data analitik. Coba lagi.");
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [deviceId, preset, customStart, customEnd, devices]
  );

  // Muat ulang tiap kali filter (device/periode) berubah — pakai spinner
  useEffect(() => {
    loadData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, preset, customStart, customEnd]);

  // Auto-refresh berkala TANPA spinner (biar tidak berkedip tiap 2 menit),
  // supaya grafik & statistik ikut update kalau ada data sensor baru masuk,
  // tanpa perlu ganti filter atau reload halaman manual.
  useEffect(() => {
    const interval = setInterval(() => {
      loadData(false);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  if (devices.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Tidak ada device ditemukan. Pastikan koneksi Supabase sudah benar.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={deviceId ?? ""}
            onChange={(e) => setDeviceId(Number(e.target.value))}
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.type}
              </option>
            ))}
          </select>

          <PeriodSelector
            preset={preset}
            onPresetChange={setPreset}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
          />
        </div>

        <div className="flex items-center gap-2">
          {lastUpdatedAt && (
            <span className="text-xs text-slate-400">
              Update terakhir:{" "}
              {lastUpdatedAt.toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZone: "Asia/Jakarta",
              })}{" "}
              WIB
            </span>
          )}
          <button
            onClick={() => loadData(true)}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Memuat..." : "🔄 Refresh"}
          </button>
        </div>
      </div>

      {errorMsg && <p className="text-sm text-rose-600">{errorMsg}</p>}
      {loading && <p className="text-sm text-slate-500">Memuat data...</p>}

      {!loading && currentStats && (
        <>
          <StatsSummary current={currentStats} previous={previousStats} />
          <TrendChart readings={currentStats.series} rainBuckets={rainBuckets} />
          <LocationComparison devices={devices} statsByDevice={statsByDevice} />
        </>
      )}
    </div>
  );
}
