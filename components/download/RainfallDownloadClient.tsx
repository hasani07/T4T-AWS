"use client";

import { useState } from "react";
import { Device } from "@/lib/types";
import { PeriodPreset, getPeriodRange } from "@/lib/dateRange";
import { buildRainfallCsv, buildRainfallAggregateCsv, triggerCsvDownload } from "@/lib/csv";
import { fetchAllRainfallRowsInRange, fetchRainfallBuckets } from "@/lib/rainfall";
import PeriodSelector from "@/components/analytics/PeriodSelector";

const ALL_DEVICES_VALUE = "all";

type Resolution = "raw" | "hour" | "day";

const RESOLUTIONS: { value: Resolution; label: string; hint: string }[] = [
  {
    value: "day",
    label: "Per Hari",
    hint: "Total mm per hari + akumulasi + rata-rata harian periode. Paling ringkas, cocok untuk laporan.",
  },
  {
    value: "hour",
    label: "Per Jam",
    hint: "Total mm per jam + akumulasi. Cocok untuk melihat kapan hujan turun.",
  },
  {
    value: "raw",
    label: "Mentah (per menit)",
    hint: "Setiap kiriman sensor apa adanya (rain_mm + akumulasi harian sensor). Untuk audit; file besar.",
  },
];

// Download KHUSUS curah hujan: hanya data dari sensor hujan (tabel
// rainfall_readings), tidak bercampur dengan data cuaca. Pilihan "Per Hari"
// dan "Per Jam" memakai angka yang sama persis dengan grafik di halaman
// Analitik (lib/rainfallSeries.ts), jadi file dan grafik pasti cocok.
export default function RainfallDownloadClient({ devices }: { devices: Device[] }) {
  const [deviceSelection, setDeviceSelection] = useState<string>(ALL_DEVICES_VALUE);
  const [preset, setPreset] = useState<PeriodPreset>("7d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [resolution, setResolution] = useState<Resolution>("day");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastDownloadInfo, setLastDownloadInfo] = useState<string | null>(null);

  const deviceTypeById: Record<number, string> = Object.fromEntries(
    devices.map((d) => [d.id, d.type])
  );

  async function handleDownload() {
    if (preset === "custom" && (!customStart || !customEnd)) {
      setErrorMsg("Pilih tanggal awal dan akhir dulu untuk custom range.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setLastDownloadInfo(null);

    try {
      const range = getPeriodRange(preset, customStart, customEnd);
      const deviceIds =
        deviceSelection === ALL_DEVICES_VALUE
          ? devices.map((d) => d.id)
          : [Number(deviceSelection)];

      let csv = "";
      let rowCount = 0;

      if (resolution === "raw") {
        const rows = await fetchAllRainfallRowsInRange(deviceIds, range);
        rowCount = rows.length;
        if (rowCount > 0) csv = buildRainfallCsv(rows, deviceTypeById);
      } else {
        const perDevice = await Promise.all(
          deviceIds.map(async (deviceId) => ({
            deviceId,
            buckets: await fetchRainfallBuckets(deviceId, range, resolution),
          }))
        );
        rowCount = perDevice.reduce((sum, d) => sum + d.buckets.length, 0);
        if (rowCount > 0) csv = buildRainfallAggregateCsv(perDevice, deviceTypeById, resolution);
      }

      if (rowCount === 0) {
        setErrorMsg("Tidak ada data curah hujan pada rentang tanggal yang dipilih.");
        return;
      }

      const deviceLabel =
        deviceSelection === ALL_DEVICES_VALUE
          ? "semua-device"
          : deviceTypeById[Number(deviceSelection)]?.toLowerCase() ?? "device";
      const resLabel = resolution === "raw" ? "mentah" : resolution === "hour" ? "per-jam" : "per-hari";

      const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
      const filename = `curah-hujan-${resLabel}_${deviceLabel}_${fmtDate(range.start)}_sd_${fmtDate(
        new Date(range.end.getTime() - 1)
      )}.csv`;

      triggerCsvDownload(filename, csv);
      setLastDownloadInfo(`${rowCount} baris data berhasil di-export (${filename}).`);
    } catch (err) {
      console.error("Gagal export CSV curah hujan:", err);
      setErrorMsg("Gagal mengambil/menyiapkan data. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  const activeHint = RESOLUTIONS.find((r) => r.value === resolution)?.hint;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={deviceSelection}
          onChange={(e) => setDeviceSelection(e.target.value)}
        >
          <option value={ALL_DEVICES_VALUE}>Semua Lokasi</option>
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

      <div>
        <p className="mb-2 text-xs font-medium text-slate-600">Format data</p>
        <div className="flex flex-wrap gap-2">
          {RESOLUTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setResolution(r.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                resolution === r.value
                  ? "bg-slate-900 text-on-strong"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {activeHint && <p className="mt-2 text-xs text-slate-400">{activeHint}</p>}
      </div>

      <button
        onClick={handleDownload}
        disabled={loading}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-on-strong transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Menyiapkan file..." : "Download CSV Curah Hujan"}
      </button>

      {errorMsg && <p className="text-sm text-rose-600 dark:text-rose-400">{errorMsg}</p>}
      {lastDownloadInfo && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{lastDownloadInfo}</p>
      )}

      <p className="text-xs text-slate-400">
        Hanya berisi data sensor hujan. Hari/jam saat sensor hujan mati tidak punya baris
        (bukan ditulis 0 mm), supaya tidak menyesatkan. Rata-rata harian dihitung hanya dari
        hari yang ada datanya.
      </p>
    </div>
  );
}
