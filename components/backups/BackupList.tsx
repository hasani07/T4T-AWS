"use client";

import { useState } from "react";

interface BackupRow {
  id: string;
  created_at: string;
  db_size_at_backup: number | null;
  retention_expires_at: string;
  downloaded: boolean;
  downloaded_at: string | null;
  expired: boolean;
}

function daysLeft(retentionExpiresAt: string): number {
  const diffMs = new Date(retentionExpiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export default function BackupList({ rows }: { rows: BackupRow[] }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(id: string) {
    setDownloadingId(id);
    setError(null);
    try {
      const res = await fetch("/api/backups/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Gagal mengambil file backup.");

      // Buka URL signed-nya supaya browser mulai download
      window.open(data.url, "_blank");
      // Refresh halaman supaya status "downloaded" ter-update di tampilan
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Belum ada backup. Backup akan dibuat otomatis begitu kapasitas database
        mencapai 50%.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {rows.map((row) => {
        const left = daysLeft(row.retention_expires_at);
        const isUrgent = !row.downloaded && !row.expired && left <= 1;

        return (
          <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-sm font-semibold text-slate-900">
                  Backup{" "}
                  {new Date(row.created_at).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  WIB
                </span>
                {row.db_size_at_backup !== null && (
                  <span className="ml-2 text-xs text-slate-400">
                    (dibuat saat kapasitas {row.db_size_at_backup.toFixed(1)}%)
                  </span>
                )}
              </div>

              {row.expired ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                  Sudah Kadaluarsa
                </span>
              ) : row.downloaded ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  Sudah Didownload
                </span>
              ) : (
                <button
                  onClick={() => handleDownload(row.id)}
                  disabled={downloadingId === row.id}
                  className={`rounded-lg px-3 py-2 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isUrgent ? "bg-rose-600 hover:bg-rose-500" : "bg-slate-900 hover:bg-slate-800"
                  }`}
                >
                  {downloadingId === row.id
                    ? "Menyiapkan..."
                    : isUrgent
                    ? `Download Sekarang (H-${left})`
                    : "Download"}
                </button>
              )}
            </div>

            {!row.downloaded && !row.expired && (
              <p className="mt-2 text-xs text-slate-400">
                Akan dihapus otomatis dalam {left} hari kalau tidak didownload.
              </p>
            )}
            {row.downloaded && row.downloaded_at && (
              <p className="mt-2 text-xs text-slate-400">
                Didownload pada{" "}
                {new Date(row.downloaded_at).toLocaleString("id-ID", {
                  timeZone: "Asia/Jakarta",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                WIB
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
