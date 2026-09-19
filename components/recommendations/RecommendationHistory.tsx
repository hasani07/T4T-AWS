interface HistoryRow {
  id: string;
  device_type: string;
  generated_at: string;
  trigger_type: string;
  recommendation_text: string;
}

function RiskBadgeFromLevel({ level }: { level?: string }) {
  if (!level) return null;
  const styles: Record<string, string> = {
    aman: "bg-emerald-50 text-emerald-700",
    waspada: "bg-amber-50 text-amber-700",
    kritis: "bg-rose-50 text-rose-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        styles[level] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {level.toUpperCase()}
    </span>
  );
}

export default function RecommendationHistory({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Belum ada riwayat rekomendasi.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{row.device_type}</h3>
            <span className="text-xs text-slate-400">
              {row.trigger_type === "manual" ? "Manual" : "Otomatis"} ·{" "}
              {new Date(row.generated_at).toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              WIB
            </span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
            {row.recommendation_text}
          </p>
        </div>
      ))}
    </div>
  );
}
