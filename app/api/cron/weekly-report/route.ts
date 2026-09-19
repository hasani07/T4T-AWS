import { NextRequest, NextResponse } from "next/server";
import { maybeRunScheduledWeeklyReport } from "@/lib/weeklyReport";

export const dynamic = "force-dynamic";

// Dijalankan HARIAN oleh Vercel Cron, tapi baru benar-benar mengirim
// laporan kalau sudah lewat `interval_days_config` hari sejak laporan
// terakhir — jadi interval bisa diatur dinamis dari dashboard tanpa
// perlu ubah jadwal cron ini.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const outcome = await maybeRunScheduledWeeklyReport();
    return NextResponse.json({ success: true, ...outcome });
  } catch (err) {
    console.error("Gagal cek/generate laporan mingguan terjadwal:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
