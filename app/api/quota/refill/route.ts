import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  buildReminderStoppedMessage,
  buildRefillSuccessMessage,
  computeExpiryMs,
  formatWibDateLabel,
  parseWibDate,
} from "@/lib/quotaCalc";

export const dynamic = "force-dynamic";

// Toleransi jam sistem klien vs server: tanggal boleh "besok" (WIB) tapi
// tidak lebih jauh dari itu ke depan.
const FUTURE_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Catat tanggal isi ulang paket data terbaru. Ini SATU-SATUNYA jalan tanggal
 * berubah (tidak ada policy anon-write di tabel), supaya setiap perubahan
 * tanggal selalu memicu 2 pesan Telegram yang bersangkutan:
 *   1. konfirmasi isi ulang berhasil
 *   2. pengingat dihentikan (siklus & status pengingat direset)
 * Kalau pengiriman Telegram gagal, tanggal TETAP tersimpan (kegagalan
 * notifikasi bukan alasan menganggap pencatatan gagal) — errornya
 * dilaporkan terpisah supaya pengguna tahu harus mengecek Telegram.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = Number(body?.deviceId);
    const refillDate = String(body?.refillDate ?? "").trim();

    if (!deviceId) {
      return NextResponse.json({ success: false, error: "deviceId wajib diisi." }, { status: 400 });
    }
    const refillMs = parseWibDate(refillDate);
    if (refillMs === null) {
      return NextResponse.json(
        { success: false, error: "Tanggal tidak valid. Gunakan format YYYY-MM-DD." },
        { status: 400 }
      );
    }
    if (refillMs > Date.now() + FUTURE_GRACE_MS) {
      return NextResponse.json(
        { success: false, error: "Tanggal tidak boleh jauh di masa depan." },
        { status: 400 }
      );
    }

    const server = getSupabaseServer();

    const { data: existing, error: fetchError } = await server
      .from("device_quota")
      .select("provider_phone, cycle_days")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (fetchError) {
      const notInstalled = fetchError.message.includes("device_quota") || fetchError.code === "42P01";
      return NextResponse.json(
        {
          success: false,
          error: notInstalled
            ? "Tabel kuota belum dibuat. Jalankan supabase/sql/013_device_quota.sql di Supabase SQL Editor."
            : `Gagal membaca data kuota: ${fetchError.message}`,
        },
        { status: 500 }
      );
    }
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Device ini belum terdaftar di tabel kuota." },
        { status: 404 }
      );
    }

    const { data: device } = await server.from("devices").select("type").eq("id", deviceId).maybeSingle();
    const deviceLabel = device?.type ? String(device.type) : `Device ${deviceId}`;
    const phone = existing.provider_phone ?? "-";
    const cycleDays = Number(existing.cycle_days) || 28;
    const expiryMs = computeExpiryMs(refillDate, cycleDays);

    // Reset status pengingat: siklus baru dimulai, jadi pengingat lama tidak
    // relevan lagi (zona akan dihitung ulang dari nol pada pengecekan cron berikutnya).
    const { error: updateError } = await server
      .from("device_quota")
      .update({
        last_refill_date: refillDate,
        last_reminder_at: null,
        last_reminder_zone: null,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", deviceId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: `Gagal menyimpan tanggal: ${updateError.message}` },
        { status: 500 }
      );
    }

    let telegramError: string | null = null;
    try {
      if (expiryMs !== null) {
        await sendTelegramMessage(
          buildRefillSuccessMessage(deviceLabel, phone, refillDate, cycleDays, expiryMs)
        );
      }
      await sendTelegramMessage(buildReminderStoppedMessage(deviceLabel));
    } catch (err) {
      console.error("Gagal mengirim notifikasi Telegram (tanggal tetap tersimpan):", err);
      telegramError = err instanceof Error ? err.message : "Gagal mengirim ke Telegram";
    }

    return NextResponse.json({
      success: true,
      expiryLabel: expiryMs !== null ? formatWibDateLabel(expiryMs) : null,
      telegramError,
    });
  } catch (err) {
    console.error("Gagal mencatat isi ulang kuota:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
