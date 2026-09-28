import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// Longgar sengaja: nomor Indonesia bisa ditulis "0821...", "+62 821...", atau
// dengan spasi/strip. Cukup pastikan isinya angka (+spasi/strip) dan wajar
// panjangnya, bukan format kaku.
const PHONE_RE = /^\+?[\d\s-]{8,20}$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = Number(body?.deviceId);
    const phone = String(body?.phone ?? "").trim();

    if (!deviceId) {
      return NextResponse.json({ success: false, error: "deviceId wajib diisi." }, { status: 400 });
    }
    if (!phone || !PHONE_RE.test(phone)) {
      return NextResponse.json(
        { success: false, error: "Nomor tidak valid. Contoh: 08217367751" },
        { status: 400 }
      );
    }

    const server = getSupabaseServer();
    const { error } = await server
      .from("device_quota")
      .update({ provider_phone: phone, updated_at: new Date().toISOString() })
      .eq("device_id", deviceId);

    if (error) {
      const notInstalled = error.message.includes("device_quota") || error.code === "42P01";
      return NextResponse.json(
        {
          success: false,
          error: notInstalled
            ? "Tabel kuota belum dibuat. Jalankan supabase/sql/013_device_quota.sql di Supabase SQL Editor."
            : `Gagal menyimpan: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Gagal menyimpan nomor provider:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
