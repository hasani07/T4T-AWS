"use client";

import { useEffect, useState } from "react";
import { Device } from "@/lib/types";
import { PeriodPreset, getPeriodRange, getPreviousRange } from "@/lib/dateRange";
import { computeStats, fetchReadings, PeriodStats } from "@/lib/statsEngine";
import PeriodSelector from "./PeriodSelector";
import StatsSummary from "./StatsSummary";
import TrendChart from "./TrendChart";

export default function AnalyticsClient({ devices }: { devices: Device[] }) {
  const [deviceId, setDeviceId] = useState<number | null>(devices[0]?.id ?? null);
  const [preset, setPreset] = useState<PeriodPreset>("7d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentStats, setCurrentStats] = useState<PeriodStats | null>(null);
  const [previousStats, setPreviousStats] = useState<PeriodStats | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    if (preset === "custom" && (!customStart || !customEnd)) return;

    let cancelled = false;

    async function run() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const range = getPeriodRange(preset, customStart, customEnd);
        const prevRange = getPreviousRange(range);

        const [currentReadings, previousReadings] = await Promise.all([
          fetchReadings(deviceId as number, range),
          fetchReadings(deviceId as number, prevRange),
        ]);

        if (cancelled) return;
        setCurrentStats(computeStats(currentReadings));
        setPreviousStats(computeStats(previousReadings));
      } catch (err) {
        console.error("Gagal memuat analitik:", err);
        if (!cancelled) {
          setErrorMsg("Gagal mengambil data analitik. Coba lagi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [deviceId, preset, customStart, customEnd]);

  if (devices.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Tidak ada device ditemukan. Pastikan koneksi Supabase sudah benar.
      </p>
    );
  }

  return (
    <div className="space-y-6">
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

      {errorMsg && <p className="text-sm text-rose-600">{errorMsg}</p>}
      {loading && <p className="text-sm text-slate-500">Memuat data...</p>}

      {!loading && currentStats && (
        <>
          <StatsSummary current={currentStats} previous={previousStats} />
          <TrendChart readings={currentStats.series} />
        </>
      )}
    </div>
  );
}
