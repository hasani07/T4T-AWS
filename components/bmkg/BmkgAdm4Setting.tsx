"use client";

import { useState } from "react";

export default function BmkgAdm4Setting({
  deviceId,
  initialAdm4,
}: {
  deviceId: number;
  initialAdm4: string;
}) {
  const [adm4, setAdm4] = useState(initialAdm4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/bmkg-adm4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, adm4 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Gagal menyimpan.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={adm4}
        onChange={(e) => setAdm4(e.target.value)}
        placeholder="mis. 32.04.19.2003"
        className="w-44 rounded-xl border border-slate-300 px-3 py-2 text-xs"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Menyimpan..." : "Simpan"}
      </button>
      {error && <p className="w-full text-xs text-rose-600">{error}</p>}
    </div>
  );
}
