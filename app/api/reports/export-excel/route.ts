import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildExcelReport, ExcelGranularity } from "@/lib/excelReport";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // proses fetch data + render chart bisa agak lama

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = Number(body?.deviceId);
    const granularity = body?.granularity as ExcelGranularity;
    const dateForHourly = body?.date as string | undefined;

    if (!deviceId || !["hourly", "weekly", "monthly"].includes(granularity)) {
      return NextResponse.json(
        { success: false, error: "Parameter deviceId/granularity tidak valid." },
        { status: 400 }
      );
    }

    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id, type")
      .eq("id", deviceId)
      .maybeSingle();

    if (deviceError || !device) {
      return NextResponse.json({ success: false, error: "Device tidak ditemukan." }, { status: 404 });
    }

    const buffer = await buildExcelReport({
      deviceId,
      deviceLabel: device.type,
      granularity,
      dateForHourly,
    });

    const filename = `laporan_${granularity}_${device.type.toLowerCase()}_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Gagal generate laporan Excel:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
