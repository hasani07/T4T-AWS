import { NextResponse } from "next/server";
import { generateWeeklyReport } from "@/lib/weeklyReport";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await generateWeeklyReport("manual");
    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("Gagal generate laporan mingguan manual:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
