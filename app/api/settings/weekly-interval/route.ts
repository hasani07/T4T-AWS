import { NextRequest, NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const days = Number(body?.days);

    if (!Number.isFinite(days) || days < 1 || days > 90) {
      return NextResponse.json(
        { success: false, error: "Interval harus berupa angka 1-90 hari." },
        { status: 400 }
      );
    }

    await setSetting("weekly_report_interval_days", days);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Gagal update interval laporan mingguan:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
