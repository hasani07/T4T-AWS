import { NextRequest, NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const quotaMb = Number(body?.quotaMb);

    if (!Number.isFinite(quotaMb) || quotaMb < 10) {
      return NextResponse.json(
        { success: false, error: "Kuota harus berupa angka, minimal 10 MB." },
        { status: 400 }
      );
    }

    await setSetting("db_quota_mb", quotaMb);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Gagal update kuota database:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
