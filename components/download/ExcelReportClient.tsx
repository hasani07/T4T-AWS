"use client";

import { useState } from "react";
import { Device } from "@/lib/types";

type Granularity = "hourly" | "weekly" | "monthly";

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "hourly", label: "Harian (per Jam)" },
  { value: "weekly", label: "Mingguan (per Hari)" },
  { value: "monthly", label: "Bulanan (per Hari)" },
];

export default function ExcelReportClient({ devices }: { devices: Device[] }) {
  const [deviceId, setDeviceId] = useState<number | null>(devices[0]?.id ?? null);
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleExport() {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/reports/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          granularity,
          date: granularity === "hourly" ? date : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Gagal membuat file Excel.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match ? match[1] : "laporan.xlsx";

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess(`File "${filename}" berhasil didownload.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
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

        <div className="flex gap-2">
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGranularity(opt.value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                granularity === opt.value
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {granularity === "hourly" && (
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          />
        )}
      </div>

      <button
        onClick={handleExport}
        disabled={loading || !deviceId}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Menyiapkan Excel..." : "Export ke Excel (dengan Grafik)"}
      </button>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}

      <p className="text-xs text-slate-400">
        Isi file: tabel ringkasan (min/max/rata-rata suhu &amp; kelembaban, rata-rata
        angin, total hujan) per periode, dilengkapi grafik tren suhu yang
        ditempel langsung di dalam file Excel-nya.
      </p>
    </div>
  );
}
