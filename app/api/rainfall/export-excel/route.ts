import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildRainfallExcel, RainExcelResolution } from "@/lib/rainfallExcel";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // ambil data + render grafik per lokasi

const MAX_RANGE_DAYS = 120;

/**
 * Laporan Excel khusus curah hujan (tabel + grafik). Rentang waktu dihitung
 * di browser (sama persis dengan tombol CSV) lalu dikirim sebagai ISO string,
 * supaya "7 hari terakhir"/custom range tidak bergeser karena zona waktu
 * server (UTC) berbeda dengan browser (WIB).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const resolution = body?.resolution as RainExcelResolution;
    const start = new Date(String(body?.start ?? ""));
    const end = new Date(String(body?.end ?? ""));
    const deviceIds: number[] = Array.isArray(body?.deviceIds)
      ? body.deviceIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];

    if (!["hour", "day"].includes(resolution)) {
      return NextResponse.json({ success: false, error: "Resolusi harus per jam atau per hari." }, { status: 400 });
    }
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return NextResponse.json({ success: false, error: "Rentang tanggal tidak valid." }, { status: 400 });
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 24 * 3600_000) {
      return NextResponse.json(
        { success: false, error: `Rentang maksimal ${MAX_RANGE_DAYS} hari untuk laporan Excel.` },
        { status: 400 }
      );
    }
    if (deviceIds.length === 0) {
      return NextResponse.json({ success: false, error: "Pilih minimal satu lokasi." }, { status: 400 });
    }

    const { data: devices, error } = await supabase
      .from("devices")
      .select("id, type")
      .in("id", deviceIds)
      .order("id", { ascending: true });
    if (error || !devices || devices.length === 0) {
      return NextResponse.json({ success: false, error: "Device tidak ditemukan." }, { status: 404 });
    }

    const { buffer, rowCount } = await buildRainfallExcel({
      devices: devices.map((d) => ({ id: Number(d.id), label: String(d.type) })),
      range: { start, end },
      resolution,
    });

    if (rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Tidak ada data curah hujan pada rentang tanggal yang dipilih." },
        { status: 404 }
      );
    }

    const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
    const who = devices.length === 1 ? String(devices[0].type).toLowerCase() : "semua-lokasi";
    const filename = `curah-hujan-${resolution === "day" ? "per-hari" : "per-jam"}_${who}_${fmtDate(start)}_sd_${fmtDate(
      new Date(end.getTime() - 1)
    )}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Gagal membuat Excel curah hujan:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
