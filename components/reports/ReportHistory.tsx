interface HistoryRow {
  id: string;
  generated_at: string;
  trigger_type: string;
  period_start: string;
  period_end: string;
  status: string;
  error_message: string | null;
}

export default function ReportHistory({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Belum ada riwayat laporan mingguan.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-sm font-semibold text-slate-900">
                {row.period_start} s/d {row.period_end}
              </span>
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  row.status === "sent"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {row.status === "sent" ? "Terkirim" : "Gagal"}
              </span>
            </div>
            <span className="text-xs text-slate-400">
              {row.trigger_type === "manual"
                ? "Manual"
                : row.trigger_type === "chat"
                ? "Via Chat Telegram"
                : "Otomatis"}{" "}
              ·{" "}
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
          {row.status === "failed" && row.error_message && (
            <p className="mt-2 text-xs text-rose-500">{row.error_message}</p>
          )}
        </div>
      ))}
    </div>
  );
}
