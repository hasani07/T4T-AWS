import { supabase } from "@/lib/supabase";
import PageShell from "@/components/PageShell";
import { getSetting } from "@/lib/settings";
import QuotaSettings from "@/components/backups/QuotaSettings";
import BackupList from "@/components/backups/BackupList";

export const revalidate = 0;

interface BackupRow {
  id: string;
  created_at: string;
  db_size_at_backup: number | null;
  retention_expires_at: string;
  downloaded: boolean;
  downloaded_at: string | null;
  expired: boolean;
}

async function getDbSizeMb(): Promise<number> {
  const { data, error } = await supabase.rpc("get_database_size_mb");
  if (error || data === null) {
    console.error("Gagal mengambil ukuran database:", error);
    return 0;
  }
  return Number(data);
}

async function getBackups(): Promise<BackupRow[]> {
  const { data, error } = await supabase
    .from("backup_logs")
    .select(
      "id, created_at, db_size_at_backup, retention_expires_at, downloaded, downloaded_at, expired"
    )
    .order("created_at", { ascending: false })
    .limit(30);

  if (error || !data) {
    console.error("Gagal mengambil daftar backup:", error);
    return [];
  }
  return data as BackupRow[];
}

export default async function BackupsPage() {
  const [dbSizeMb, quotaMb, backups] = await Promise.all([
    getDbSizeMb(),
    getSetting<number>("db_quota_mb", 500),
    getBackups(),
  ]);

  return (
    <PageShell>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Backup Database</h1>
          <p className="mt-1 text-sm text-slate-500">
            Backup otomatis dibuat saat kapasitas database mencapai 50%, disimpan
            60 hari, dengan notifikasi Telegram sebelum terhapus.
          </p>
        </header>

        <div className="mb-8">
          <QuotaSettings dbSizeMb={dbSizeMb} initialQuotaMb={quotaMb} />
        </div>

        <h2 className="mb-3 text-sm font-semibold text-slate-900">Daftar Backup</h2>
        <BackupList rows={backups} />
    </PageShell>
  );
}
