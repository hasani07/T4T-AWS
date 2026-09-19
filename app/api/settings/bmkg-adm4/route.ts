import { NextRequest, NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = Number(body?.deviceId);
    const adm4 = String(body?.adm4 ?? "").trim();

    if (!deviceId) {
      return NextResponse.json({ success: false, error: "deviceId wajib diisi." }, { status: 400 });
    }

    // Validasi format longgar: 4 segmen angka dipisah titik, mis. 32.04.19.2003
    if (adm4 && !/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(adm4)) {
      return NextResponse.json(
        { success: false, error: "Format kode wilayah harus seperti 32.04.19.2003." },
        { status: 400 }
      );
    }

    await setSetting(`bmkg_adm4_${deviceId}`, adm4);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Gagal menyimpan kode wilayah BMKG:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
