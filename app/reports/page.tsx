import { supabase } from "@/lib/supabase";
import PageShell from "@/components/PageShell";
import { getSetting } from "@/lib/settings";
import ReportsClient from "@/components/reports/ReportsClient";
import ReportHistory from "@/components/reports/ReportHistory";

export const revalidate = 0;

interface HistoryRow {
  id: string;
  generated_at: string;
  trigger_type: string;
  period_start: string;
  period_end: string;
  status: string;
  error_message: string | null;
}

async function getHistory(): Promise<HistoryRow[]> {
  const { data, error } = await supabase
    .from("weekly_reports")
    .select("id, generated_at, trigger_type, period_start, period_end, status, error_message")
    .order("generated_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    console.error("Gagal mengambil riwayat laporan mingguan:", error);
    return [];
  }

  return data as HistoryRow[];
}

export default async function ReportsPage() {
  const [intervalDays, history] = await Promise.all([
    getSetting<number>("weekly_report_interval_days", 7),
    getHistory(),
  ]);

  return (
    <PageShell>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Laporan Mingguan</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ringkasan teks + grafik + rekomendasi AI, dikirim otomatis ke
            Telegram sesuai interval yang diatur, atau generate manual
            kapan saja.
          </p>
        </header>

        <div className="mb-8">
          <ReportsClient initialIntervalDays={intervalDays} />
        </div>

        <h2 className="mb-3 text-sm font-semibold text-slate-900">Riwayat Laporan</h2>
        <ReportHistory rows={history} />
    </PageShell>
  );
}
