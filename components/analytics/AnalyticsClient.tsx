"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, RefreshCw } from "lucide-react";
import { Device } from "@/lib/types";
import { PeriodPreset, getPeriodRange, getPreviousRange } from "@/lib/dateRange";
import { computeStats, fetchReadings, PeriodStats } from "@/lib/statsEngine";
import { fetchRainfallBuckets, fetchRainfallTotal, RainBucket } from "@/lib/rainfall";
import PeriodSelector from "./PeriodSelector";
import RainfallCharts from "./RainfallCharts";
import LocationComparison from "./LocationComparison";
import {
  DailyRanges,
  DiurnalCard,
  InsightsPanel,
  KpiCards,
  MetricTrends,
  VpdCard,
  WindRoseCard,
} from "./sections";
import {
  buildInsights,
  dailySeries,
  diurnalProfile,
  hourlySeries,
  shareWhere,
  vpdShare,
  windRose,
} from "@/lib/analyticsCalc";
import { CARD } from "@/components/ui/card";

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
  const [rainHourly, setRainHourly] = useState<RainBucket[]>([]);
  const [rainDaily, setRainDaily] = useState<RainBucket[]>([]);
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
        const [allCurrentResults, previous, hourly, daily] = await Promise.all([
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
          fetchRainfallBuckets(deviceId as number, range, "day"),
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
        setRainHourly(hourly);
        setRainDaily(daily);
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

  // Turunan untuk grafik & insight (dihitung sekali per data baru).
  const derived = useMemo(() => {
    if (!currentStats) return null;
    const series = currentStats.series;
    const daily = dailySeries(series);
    const diurnal = diurnalProfile(series);
    const vpd = vpdShare(series);
    const humid90Pct = shareWhere(series, (r) => r.humidity >= 90);
    return {
      daily,
      diurnal,
      vpd,
      humid90Pct,
      hot32Pct: shareWhere(series, (r) => r.temperature > 32),
      hourly: hourlySeries(series),
      rose: windRose(series),
      insights: buildInsights({ current: currentStats, previous: previousStats, daily, diurnal, rainDaily, vpd, humid90Pct }),
    };
  }, [currentStats, previousStats, rainDaily]);

  const selectedLabel = devices.find((d) => d.id === deviceId)?.type ?? "";

  if (devices.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Tidak ada device ditemukan. Pastikan koneksi Supabase sudah benar.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <style>{`@keyframes analytics-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>

      {/* Toolbar: lokasi + periode + segarkan */}
      <div className={`${CARD} flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="inline-flex w-full rounded-2xl bg-slate-100 p-1 sm:w-auto" role="group" aria-label="Pilih lokasi">
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() => setDeviceId(d.id)}
                aria-pressed={deviceId === d.id}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:flex-none ${
                  deviceId === d.id ? "bg-surface text-slate-900 shadow-sm ring-1 ring-slate-200/70" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <MapPin size={13} aria-hidden />
                {d.type}
              </button>
            ))}
          </div>
          <PeriodSelector
            preset={preset}
            onPresetChange={setPreset}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
          />
        </div>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          {lastUpdatedAt && (
            <span className="text-[11px] text-slate-400">
              Diperbarui{" "}
              {lastUpdatedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB ·
              otomatis tiap 2 menit
            </span>
          )}
          <button
            onClick={() => loadData(true)}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-2 text-xs font-semibold text-on-strong transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden />
            {loading ? "Memuat" : "Segarkan"}
          </button>
        </div>
      </div>

      {errorMsg && <p className="text-sm text-rose-600 dark:text-rose-400">{errorMsg}</p>}

      {loading && (
        <div className="space-y-4" aria-busy="true" aria-label="Memuat data analitik">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-3xl bg-slate-100" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
        </div>
      )}

      {!loading && currentStats && derived && (
        <>
          {currentStats.validReadings === 0 ? (
            <div className={`${CARD} p-6 text-sm text-slate-500`}>
              Belum ada data cuaca dari {selectedLabel} pada periode ini.
            </div>
          ) : (
            <>
              <InsightsPanel insights={derived.insights} />
              <KpiCards current={currentStats} previous={previousStats} daily={derived.daily} rainDaily={rainDaily} />
              <DailyRanges daily={derived.daily} />
              <MetricTrends hourly={derived.hourly} />
              {/* Dua kolom yang tingginya mandiri (bukan baris grid yang dipaksa
                  sama tinggi) supaya tidak ada kartu dengan ruang kosong. */}
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                  <DiurnalCard diurnal={derived.diurnal} />
                  <LocationComparison devices={devices} statsByDevice={statsByDevice} selectedId={deviceId} />
                </div>
                <div className="space-y-4">
                  <WindRoseCard rose={derived.rose} />
                  <VpdCard vpd={derived.vpd} humid90Pct={derived.humid90Pct} hot32Pct={derived.hot32Pct} />
                </div>
              </div>
            </>
          )}

          <section aria-labelledby="rain-analytics-title">
            <h2 id="rain-analytics-title" className="mb-3 text-sm font-semibold text-slate-900">
              Curah hujan · {selectedLabel}
            </h2>
            <RainfallCharts hourBuckets={rainHourly} dayBuckets={rainDaily} />
          </section>

          <p className="text-[11px] leading-relaxed text-slate-400">
            Dihitung dari {currentStats.validReadings.toLocaleString("id-ID")} pembacaan sensor cuaca
            {currentStats.excludedReadings > 0 &&
              ` (${currentStats.excludedReadings.toLocaleString("id-ID")} pembacaan di luar rentang wajar dikecualikan sebagai glitch sensor)`}
            . Pembanding = periode dengan durasi sama tepat sebelum periode ini.
          </p>
        </>
      )}
    </div>
  );
}
