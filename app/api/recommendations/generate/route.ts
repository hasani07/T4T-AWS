import { NextResponse } from "next/server";
import { runGenerateRecommendations } from "@/lib/recommendationEngine";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const results = await runGenerateRecommendations("manual");
    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("Gagal generate rekomendasi manual:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
