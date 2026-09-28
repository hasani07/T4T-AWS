import { NextRequest, NextResponse } from "next/server";
import { captureBmkgSnapshots } from "@/lib/bmkgSnapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Dipanggil berkala (tiap 5 menit) oleh pg_cron di Supabase — lihat
// supabase/sql/010_bmkg_snapshot_cron.sql. Mencatat prakiraan BMKG terbaru
// (bmkg_snapshots, untuk unduhan riwayat) dan kapan rilis baru BMKG pertama
// kali terlihat (bmkg_releases, untuk jam "terdeteksi" di halaman /bmkg).
//
// Beda dari route cron lain: CRON_SECRET WAJIB diisi (fail-closed). Endpoint
// ini memicu request ke BMKG dan menulis ke database, jadi tidak boleh
// terbuka untuk siapa saja walau env var-nya lupa diatur.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      {
        success: false,
        error: "CRON_SECRET belum diatur di server. Endpoint ini menolak semua permintaan sampai diisi.",
      },
      { status: 500 }
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await captureBmkgSnapshots();
    return NextResponse.json({
      success: results.every((r) => !r.error),
      capturedAt: new Date().toISOString(),
      results,
    });
  } catch (err) {
    console.error("Gagal mencatat snapshot BMKG:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
