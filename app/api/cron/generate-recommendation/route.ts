import { NextRequest, NextResponse } from "next/server";
import { runGenerateRecommendations } from "@/lib/recommendationEngine";

export const dynamic = "force-dynamic";

// Dilindungi CRON_SECRET supaya endpoint ini tidak bisa dipicu sembarangan
// dari publik. Vercel Cron otomatis mengirim header
// `Authorization: Bearer <CRON_SECRET>` kalau env var CRON_SECRET diisi
// di project settings.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runGenerateRecommendations("scheduled");
    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("Gagal generate rekomendasi terjadwal:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
