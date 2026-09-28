import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { sendTelegramMessage } from "@/lib/telegram";
import { buildReminderMessage, computeQuotaZone, shouldSendReminder } from "@/lib/quotaCalc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Dipanggil berkala (tiap jam) oleh pg_cron di Supabase — lihat
// supabase/sql/014_quota_cron.sql. Mengecek status kuota tiap device dan
// mengirim pengingat Telegram sesuai zona (lihat lib/quotaCalc.ts untuk
// aturan lengkapnya).
//
// CRON_SECRET WAJIB diisi (fail-closed), sama seperti /api/cron/bmkg-snapshot
// — endpoint ini mengirim pesan Telegram, jadi tidak boleh terpicu sembarangan.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET belum diatur di server." },
      { status: 500 }
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const server = getSupabaseServer();
  const results: { deviceId: number; zone: string; sent: boolean; error?: string }[] = [];

  try {
    const { data: rows, error } = await server
      .from("device_quota")
      .select("device_id, provider_phone, cycle_days, last_refill_date, last_reminder_at, last_reminder_zone");
    if (error) throw new Error(error.message);

    const { data: devices } = await server.from("devices").select("id, type");
    const labelOf = new Map<number, string>((devices ?? []).map((d) => [Number(d.id), String(d.type)]));

    for (const row of rows ?? []) {
      const deviceId = Number(row.device_id);
      const phone = row.provider_phone as string | null;
      const cycleDays = Number(row.cycle_days) || 28;
      const lastRefillDate = row.last_refill_date as string | null;

      if (!phone || !lastRefillDate) {
        results.push({ deviceId, zone: "none", sent: false, error: !phone ? "nomor belum diisi" : "tanggal isi ulang belum diisi" });
        continue;
      }

      const { zone, hoursUntilExpiry, expiryMs } = computeQuotaZone(lastRefillDate, cycleDays);
      if (zone === "none" || hoursUntilExpiry === null || expiryMs === null) {
        results.push({ deviceId, zone, sent: false });
        continue;
      }

      const due = shouldSendReminder(
        zone,
        row.last_reminder_at as string | null,
        row.last_reminder_zone as string | null
      );
      if (!due) {
        results.push({ deviceId, zone, sent: false });
        continue;
      }

      const deviceLabel = labelOf.get(deviceId) ?? `Device ${deviceId}`;
      try {
        await sendTelegramMessage(buildReminderMessage(zone, deviceLabel, phone, hoursUntilExpiry, expiryMs));
        const { error: updateError } = await server
          .from("device_quota")
          .update({ last_reminder_at: new Date().toISOString(), last_reminder_zone: zone })
          .eq("device_id", deviceId);
        if (updateError) throw new Error(updateError.message);
        results.push({ deviceId, zone, sent: true });
      } catch (err) {
        results.push({ deviceId, zone, sent: false, error: err instanceof Error ? err.message : "gagal kirim" });
      }
    }

    return NextResponse.json({ success: results.every((r) => !r.error), checkedAt: new Date().toISOString(), results });
  } catch (err) {
    console.error("Gagal mengecek pengingat kuota:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
