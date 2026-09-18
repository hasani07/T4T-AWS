"use client";

import { useState } from "react";
import { Device } from "@/lib/types";
import { PeriodPreset, getPeriodRange } from "@/lib/dateRange";
import { fetchAllReadingsInRange, buildCsv, triggerCsvDownload } from "@/lib/csv";
import PeriodSelector from "@/components/analytics/PeriodSelector";

const ALL_DEVICES_VALUE = "all";

export default function DownloadClient({ devices }: { devices: Device[] }) {
  const [deviceSelection, setDeviceSelection] = useState<string>(ALL_DEVICES_VALUE);
  const [preset, setPreset] = useState<PeriodPreset>("7d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

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

      const readings = await fetchAllReadingsInRange(deviceIds, range);

      if (readings.length === 0) {
        setErrorMsg("Tidak ada data pada rentang tanggal yang dipilih.");
        return;
      }

      const csv = buildCsv(readings, deviceTypeById);

      const deviceLabel =
        deviceSelection === ALL_DEVICES_VALUE
          ? "semua-device"
          : deviceTypeById[Number(deviceSelection)]?.toLowerCase() ?? "device";

      const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
      const filename = `sensor-data_${deviceLabel}_${fmtDate(range.start)}_sd_${fmtDate(
        new Date(range.end.getTime() - 1)
      )}.csv`;

      triggerCsvDownload(filename, csv);
      setLastDownloadInfo(`${readings.length} baris data berhasil di-export (${filename}).`);
    } catch (err) {
      console.error("Gagal export CSV:", err);
      setErrorMsg("Gagal mengambil/menyiapkan data. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={deviceSelection}
          onChange={(e) => setDeviceSelection(e.target.value)}
        >
          <option value={ALL_DEVICES_VALUE}>Semua Device (gabungan)</option>
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

      <button
        onClick={handleDownload}
        disabled={loading}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Menyiapkan file..." : "Download CSV"}
      </button>

      {errorMsg && <p className="text-sm text-rose-600">{errorMsg}</p>}
      {lastDownloadInfo && (
        <p className="text-sm text-emerald-600">{lastDownloadInfo}</p>
      )}

      <p className="text-xs text-slate-400">
        Catatan: file CSV berisi data mentah apa adanya (termasuk baris yang
        mungkin dianggap anomali/glitch sensor di halaman Analitik) — cocok
        untuk keperluan audit atau analisis lebih lanjut di luar dashboard.
      </p>
    </div>
  );
}
