"use client";

import { useState } from "react";

interface GeneratedResult {
  deviceId: number;
  deviceType: string;
  riskLevel: string;
  vpd: number;
  recommendationText: string;
}

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    aman: "bg-emerald-50 text-emerald-700",
    waspada: "bg-amber-50 text-amber-700",
    kritis: "bg-rose-50 text-rose-700",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[level] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {level.toUpperCase()}
    </span>
  );
}

export default function RecommendationsClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedResult[] | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/recommendations/generate", { method: "POST" });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Gagal generate rekomendasi.");
      }
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Menghasilkan rekomendasi..." : "Generate Rekomendasi Sekarang"}
      </button>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {results && (
        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.deviceId} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{r.deviceType}</h3>
                <RiskBadge level={r.riskLevel} />
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                {r.recommendationText}
              </p>
              <p className="mt-2 text-xs text-slate-400">VPD: {r.vpd.toFixed(2)} kPa</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
