"use client";

import { useState } from "react";

export default function QuotaSettings({
  dbSizeMb,
  initialQuotaMb,
}: {
  dbSizeMb: number;
  initialQuotaMb: number;
}) {
  const [quotaMb, setQuotaMb] = useState(initialQuotaMb);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usagePct = (dbSizeMb / quotaMb) * 100;
  const isWarning = usagePct >= 50;

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/db-quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotaMb }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Gagal menyimpan kuota.");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Kapasitas Database</h3>

      <div className="mt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">
            {dbSizeMb.toFixed(1)} MB / {quotaMb} MB
          </span>
          <span className={isWarning ? "font-medium text-amber-600" : "font-medium text-emerald-600"}>
            {usagePct.toFixed(1)}%
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full ${isWarning ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, usagePct)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Backup otomatis dibuat saat kapasitas mencapai 50%.
        </p>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <label className="text-xs text-slate-500">
          Kuota database (MB) — sesuaikan manual dengan plan Supabase Anda
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="number"
            min={10}
            value={quotaMb}
            onChange={(e) => setQuotaMb(Number(e.target.value))}
            className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-sm text-slate-600">MB</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
        {saved && <p className="mt-2 text-sm text-emerald-600">Kuota berhasil disimpan.</p>}
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
