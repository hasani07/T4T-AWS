// =====================================================================
// Supabase Edge Function: backup-monitor
// =====================================================================
// Dijalankan berkala (disarankan tiap 15 menit) lewat pg_cron. Tugasnya:
//   1. Cek ukuran database vs kuota -> kalau >=50% dan belum ada backup
//      yang masih "pending" (belum didownload), buat backup baru (export
//      data tabel ke JSON, upload ke Storage bucket "backups").
//   2. Untuk tiap backup yang belum didownload: kirim notifikasi Telegram
//      — normal 1x/24 jam, naik jadi tiap 30 menit kalau sudah H-1
//      menjelang batas retensi 60 hari.
//   3. Backup yang sudah lewat 60 hari & belum didownload: file dihapus
//      dari Storage, ditandai expired, notifikasi berhenti.
//
// Cara deploy: Supabase Dashboard -> Edge Functions -> Deploy a new
// function -> Via Editor -> nama: backup-monitor -> paste file ini.
//
// Secrets yang dibutuhkan: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (sudah
// ada dari Fase 5, tidak perlu diisi ulang). SUPABASE_URL &
// SUPABASE_SERVICE_ROLE_KEY otomatis tersedia.
//
// PENTING soal sifat "backup" ini: karena Edge Function tidak bisa
// menjalankan pg_dump (perlu koneksi database langsung), backup di sini
// berbentuk EXPORT DATA seluruh tabel ke satu file JSON — bukan backup
// fisik database lengkap dengan schema/index. Cukup untuk memastikan
// data sensor & histori tidak hilang dan bisa dibaca ulang.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BUCKET_NAME = "backups";
const RETENTION_DAYS = 60;
const H1_WINDOW_HOURS = 24; // dianggap "H-1" kalau sisa waktu <= ini
const H1_NOTIFY_INTERVAL_MINUTES = 30;
const NORMAL_NOTIFY_INTERVAL_HOURS = 24;

const TELEGRAM_API = "https://api.telegram.org";

async function sendTelegramMessage(text: string): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")!;
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram sendMessage error: ${JSON.stringify(data)}`);
  }
}

// deno-lint-ignore no-explicit-any
async function fetchAllRows(supabase: any, table: string, pageSize = 1000) {
  const all: unknown[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (error) {
      console.error(`Gagal fetch tabel ${table} untuk backup:`, error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

Deno.serve(async (_req: Request) => {
  const logs: string[] = [];

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ===== 1. Cek ukuran database vs kuota =====
    const { data: sizeData, error: sizeError } = await supabase.rpc("get_database_size_mb");
    if (sizeError) throw new Error(`Gagal cek ukuran database: ${sizeError.message}`);
    const dbSizeMb = Number(sizeData);

    const { data: quotaRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "db_quota_mb")
      .maybeSingle();
    const quotaMb = Number(quotaRow?.value ?? 500);
    const usagePct = (dbSizeMb / quotaMb) * 100;

    logs.push(`DB size: ${dbSizeMb} MB / ${quotaMb} MB (${usagePct.toFixed(1)}%)`);

    const { data: pendingBackups } = await supabase
      .from("backup_logs")
      .select("id")
      .eq("downloaded", false)
      .eq("expired", false)
      .limit(1);

    const hasPendingBackup = (pendingBackups?.length ?? 0) > 0;

    if (usagePct >= 50 && !hasPendingBackup) {
      logs.push("Kapasitas >= 50% dan tidak ada backup pending -> membuat backup baru.");

      const tables = [
        "devices",
        "sensors",
        "system_logs",
        "ai_recommendations",
        "weekly_reports",
        "settings",
      ];
      const exportData: Record<string, unknown[]> = {};
      for (const t of tables) {
        exportData[t] = await fetchAllRows(supabase, t);
      }

      const payload = {
        generated_at: new Date().toISOString(),
        db_size_mb: dbSizeMb,
        db_quota_mb: quotaMb,
        usage_pct: Number(usagePct.toFixed(2)),
        tables: exportData,
      };

      const path = `backup_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, new Blob([JSON.stringify(payload)], { type: "application/json" }), {
          contentType: "application/json",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Gagal upload backup ke Storage: ${uploadError.message}`);
      }

      const retentionExpiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

      const { error: insertError } = await supabase.from("backup_logs").insert({
        storage_path: path,
        db_size_at_backup: Number(usagePct.toFixed(2)),
        retention_expires_at: retentionExpiresAt.toISOString(),
        downloaded: false,
        expired: false,
      });

      if (insertError) {
        throw new Error(`Gagal simpan backup_logs: ${insertError.message}`);
      }

      logs.push(`Backup baru dibuat: ${path}`);

      await sendTelegramMessage(
        `<b>📦 Backup Database Baru</b>\n` +
          `Kapasitas database sudah mencapai ${usagePct.toFixed(1)}% (${dbSizeMb} MB / ${quotaMb} MB).\n` +
          `Backup data otomatis sudah dibuat dan tersimpan selama 60 hari.\n` +
          `Silakan download lewat dashboard: menu Backup.`
      );
    }

    // ===== 2. Cek notifikasi & kadaluarsa untuk backup yang belum didownload =====
    const { data: activeBackups } = await supabase
      .from("backup_logs")
      .select("*")
      .eq("downloaded", false)
      .eq("expired", false);

    for (const backup of activeBackups ?? []) {
      const expiresAtMs = new Date(backup.retention_expires_at).getTime();
      const now = Date.now();

      if (expiresAtMs <= now) {
        await supabase.storage.from(BUCKET_NAME).remove([backup.storage_path]);
        await supabase.from("backup_logs").update({ expired: true }).eq("id", backup.id);
        await sendTelegramMessage(
          `<b>⚠️ Backup Kadaluarsa</b>\n` +
            `Backup tanggal ${new Date(backup.created_at).toLocaleDateString("id-ID")} sudah ` +
            `melewati batas 60 hari dan telah dihapus dari storage karena tidak pernah didownload.`
        );
        logs.push(`Backup ${backup.id} expired & dihapus dari storage.`);
        continue;
      }

      const hoursUntilExpiry = (expiresAtMs - now) / (1000 * 60 * 60);
      const isH1 = hoursUntilExpiry <= H1_WINDOW_HOURS;

      const lastNotifiedMs = backup.last_notified_at
        ? new Date(backup.last_notified_at).getTime()
        : 0;
      const minutesSinceLastNotify = (now - lastNotifiedMs) / (1000 * 60);

      const shouldNotify = isH1
        ? minutesSinceLastNotify >= H1_NOTIFY_INTERVAL_MINUTES
        : minutesSinceLastNotify >= NORMAL_NOTIFY_INTERVAL_HOURS * 60;

      if (shouldNotify) {
        const daysLeft = Math.max(0, Math.ceil(hoursUntilExpiry / 24));
        const urgency = isH1 ? "‼️ SEGERA" : "🔔 Reminder";
        await sendTelegramMessage(
          `<b>${urgency}: Download Backup Database</b>\n` +
            `Backup tanggal ${new Date(backup.created_at).toLocaleDateString("id-ID")} akan ` +
            `dihapus dalam ~${daysLeft} hari (sisa ${hoursUntilExpiry.toFixed(1)} jam).\n` +
            `Silakan download lewat dashboard: menu Backup, sebelum terhapus otomatis.`
        );
        await supabase
          .from("backup_logs")
          .update({ last_notified_at: new Date().toISOString() })
          .eq("id", backup.id);
        logs.push(`Notifikasi terkirim untuk backup ${backup.id} (${isH1 ? "H-1" : "normal"}).`);
      }
    }

    return new Response(JSON.stringify({ success: true, logs }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Gagal jalankan backup-monitor:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err), logs }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
