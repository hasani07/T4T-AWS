import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { summarizePayload, trainAndScore } from "@/lib/forecast/train";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const KEEP_MODELS = 30; // simpan riwayat 30 latihan terakhir, sisanya dihapus

// Dipanggil tiap malam oleh pg_cron (supabase/sql/017_forecast_cron.sql):
// ambil seluruh riwayat per jam, uji beberapa pilihan data latih pada 7 hari
// terakhir, latih model akhir, bandingkan dengan BMKG, lalu simpan hasilnya
// ke forecast_models. CRON_SECRET wajib (fail-closed), sama seperti cron lain.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, error: "CRON_SECRET belum diatur di server." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const server = getSupabaseServer();
    const { data: devices, error } = await server.from("devices").select("id").order("id", { ascending: true });
    if (error || !devices?.length) throw new Error(error?.message ?? "Tidak ada device.");

    const payload = await trainAndScore(server, devices.map((d) => ({ id: Number(d.id) })));

    const { error: insertError } = await server.from("forecast_models").insert({ payload });
    if (insertError) {
      const missing = insertError.code === "42P01" || insertError.message.includes("forecast_models");
      throw new Error(
        missing
          ? "Tabel forecast_models belum ada. Jalankan supabase/sql/016_forecast.sql."
          : `Gagal menyimpan model: ${insertError.message}`
      );
    }

    // Bersihkan riwayat lama (payload ~15-30 KB per latihan).
    const { data: old } = await server
      .from("forecast_models")
      .select("id")
      .order("trained_at", { ascending: false })
      .range(KEEP_MODELS, KEEP_MODELS + 500);
    if (old?.length) {
      await server.from("forecast_models").delete().in("id", old.map((r) => r.id));
    }

    return NextResponse.json({ success: true, summary: summarizePayload(payload) });
  } catch (err) {
    console.error("Gagal melatih model prediksi:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
