"use client";

import { useState } from "react";

export default function ReportsClient({ initialIntervalDays }: { initialIntervalDays: number }) {
  const [intervalDays, setIntervalDays] = useState(initialIntervalDays);
  const [savingInterval, setSavingInterval] = useState(false);
  const [intervalSaved, setIntervalSaved] = useState(false);
  const [intervalError, setIntervalError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null);

  async function handleSaveInterval() {
    setSavingInterval(true);
    setIntervalError(null);
    setIntervalSaved(false);
    try {
      const res = await fetch("/api/settings/weekly-interval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: intervalDays }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Gagal menyimpan interval.");
      setIntervalSaved(true);
    } catch (err) {
      setIntervalError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSavingInterval(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    setGenerateSuccess(null);
    try {
      const res = await fetch("/api/reports/weekly/generate", { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Gagal generate laporan.");
      setGenerateSuccess(
        `Laporan periode ${data.result.periodStart} s/d ${data.result.periodEnd} berhasil dikirim ke Telegram.`
      );
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Interval Otomatis</h3>
        <p className="mt-1 text-xs text-slate-500">
          Laporan otomatis dicek setiap pagi, tapi baru benar-benar dikirim
          kalau sudah lewat jumlah hari ini sejak laporan terakhir.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={90}
            value={intervalDays}
            onChange={(e) => setIntervalDays(Number(e.target.value))}
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-sm text-slate-600">hari</span>
          <button
            onClick={handleSaveInterval}
            disabled={savingInterval}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingInterval ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
        {intervalSaved && (
          <p className="mt-2 text-sm text-emerald-600">Interval berhasil disimpan.</p>
        )}
        {intervalError && <p className="mt-2 text-sm text-rose-600">{intervalError}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Generate Manual</h3>
        <p className="mt-1 text-xs text-slate-500">
          Kirim laporan sekarang juga ke Telegram, di luar jadwal otomatis.
        </p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? "Mengirim ke Telegram..." : "Generate & Kirim Sekarang"}
        </button>
        {generateSuccess && (
          <p className="mt-2 text-sm text-emerald-600">{generateSuccess}</p>
        )}
        {generateError && <p className="mt-2 text-sm text-rose-600">{generateError}</p>}
      </div>
    </div>
  );
}
