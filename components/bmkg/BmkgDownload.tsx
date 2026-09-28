"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { triggerCsvDownload } from "@/lib/csv";
import {
  BMKG_EXPORT_RANGES,
  BmkgCompareRow,
  BmkgExportRange,
  buildBmkgCompareCsv,
  buildBmkgExportFilename,
  getWibWallClockRange,
  summarizeCoverage,
} from "@/lib/bmkgExport";

type Notice = { kind: "ok" | "warn" | "error"; text: string };

export default function BmkgDownload({
  deviceId,
  deviceType,
}: {
  deviceId: number;
  deviceType: string;
}) {
  const [range, setRange] = useState<BmkgExportRange>("24h");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function handleDownload() {
    setBusy(true);
    setNotice(null);
    try {
      const { start, end } = getWibWallClockRange(range);
      const { data, error } = await supabase.rpc("bmkg_compare_export", {
        p_device_id: deviceId,
        p_start: start,
        p_end: end,
      });

      if (error) {
        const notInstalled =
          error.code === "PGRST202" || error.message.includes("bmkg_compare_export");
        setNotice({
          kind: "error",
          text: notInstalled
            ? "Fungsi database belum dibuat. Jalankan supabase/sql/009_bmkg_snapshots.sql di Supabase SQL Editor dulu."
            : `Gagal menyiapkan data: ${error.message}`,
        });
        return;
      }

      const rows = (data ?? []) as BmkgCompareRow[];
      if (rows.length === 0) {
        setNotice({ kind: "warn", text: "Tidak ada data untuk rentang ini." });
        return;
      }

      triggerCsvDownload(
        buildBmkgExportFilename(deviceType, range),
        buildBmkgCompareCsv(rows, deviceId, deviceType)
      );

      const c = summarizeCoverage(rows);
      if (c.withBmkg === 0) {
        setNotice({
          kind: "warn",
          text:
            `Terunduh ${c.total} baris, tapi kolom BMKG masih kosong: riwayat BMKG belum tercatat untuk rentang ini ` +
            `(API BMKG hanya memberi prakiraan ke depan, jadi riwayat baru terkumpul sejak pencatatan otomatis aktif). ` +
            `Data sensor tetap lengkap.`,
        });
      } else if (c.withBmkg < c.total) {
        setNotice({
          kind: "ok",
          text:
            `Terunduh ${c.total} baris. Data BMKG ada di ${c.withBmkg} slot (tercatat sejak ${c.firstBmkgSlot} WIB); ` +
            `slot sebelum itu kolom BMKG-nya kosong karena belum dicatat.`,
        });
      } else {
        setNotice({ kind: "ok", text: `Terunduh ${c.total} baris, semua slot punya data BMKG.` });
      }
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Gagal mengunduh, coba lagi.",
      });
    } finally {
      setBusy(false);
    }
  }

  const noticeStyle: Record<Notice["kind"], string> = {
    ok: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warn: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
    error: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  };

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as BmkgExportRange)}
          disabled={busy}
          aria-label="Rentang data yang diunduh"
          className="rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
        >
          {BMKG_EXPORT_RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-on-strong disabled:opacity-50"
        >
          <Download size={14} />
          {busy ? "Menyiapkan..." : "Unduh data (CSV)"}
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        Satu baris per slot 3 jam (jam yang sama dengan prakiraan BMKG). Kolom sensor = rata-rata
        ±30 menit dari jam slot; selisih = sensor − BMKG. Sumber prakiraan: BMKG.
      </p>

      {notice && (
        <p className={`mt-2 rounded-xl p-3 text-xs ${noticeStyle[notice.kind]}`}>{notice.text}</p>
      )}
    </div>
  );
}
