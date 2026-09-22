import { supabase } from "@/lib/supabase";
import PageShell from "@/components/PageShell";
import FirmwareUploadForm from "@/components/admin/FirmwareUploadForm";

export const revalidate = 0;
export const dynamic = "force-dynamic";

const DEVICE_LABEL: Record<number, string> = {
  1: "Rainfall Cisangkuy",
  2: "Rainfall Ciminyak",
};

type FirmwareRow = {
  id: number;
  device_id: number;
  version: number;
  version_label: string | null;
  file_url: string;
  md5: string | null;
  notes: string | null;
  created_at: string;
};

type LogRow = {
  id: number;
  device_id: number;
  message: string;
  created_at: string;
};

// Halaman ini HANYA membaca (lewat client anon biasa, sama seperti halaman lain -
// select diizinkan RLS). Menulis (upload firmware) terjadi lewat
// app/api/admin/firmware/upload/route.ts, satu-satunya jalur tulis di seluruh
// proyek ini, dan itu pun dijaga password + service_role key di server.
async function getFirmwareHistory(): Promise<FirmwareRow[]> {
  const { data, error } = await supabase
    .from("device_firmware")
    .select("id, device_id, version, version_label, file_url, md5, notes, created_at")
    .order("device_id", { ascending: true })
    .order("version", { ascending: false });
  if (error || !data) {
    console.error("Gagal mengambil riwayat firmware:", error);
    return [];
  }
  return data;
}

async function getRecentLogs(): Promise<LogRow[]> {
  const { data, error } = await supabase
    .from("device_logs")
    .select("id, device_id, message, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) {
    console.error("Gagal mengambil log device:", error);
    return [];
  }
  return data;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" });
}

export default async function FirmwareAdminPage() {
  const [firmwareHistory, logs] = await Promise.all([getFirmwareHistory(), getRecentLogs()]);

  return (
    <PageShell>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Admin: Firmware OTA</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload firmware baru untuk device rainfall. ESP mengecek versi ini tiap 2 menit dan
          otomatis mengunduh + flash sendiri kalau ada versi lebih baru dari yang terpasang.
        </p>
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Halaman ini tidak ditautkan dari menu navigasi, tapi TIDAK punya login sungguhan -
          hanya kata sandi tunggal yang dicek di server. Jangan sebarkan link-nya, dan anggap
          ini pengaman "jangan sampai ke-upload tidak sengaja", bukan keamanan penuh.
        </p>
      </header>

      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Upload Firmware Baru</h2>
          <FirmwareUploadForm />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Riwayat Firmware</h2>
          {firmwareHistory.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada firmware yang diupload.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">Device</th>
                    <th className="py-2 pr-4">Versi</th>
                    <th className="py-2 pr-4">Label</th>
                    <th className="py-2 pr-4">Catatan</th>
                    <th className="py-2 pr-4">Diupload</th>
                  </tr>
                </thead>
                <tbody>
                  {firmwareHistory.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4">{DEVICE_LABEL[row.device_id] ?? `Device ${row.device_id}`}</td>
                      <td className="py-2 pr-4 font-mono">v{row.version}</td>
                      <td className="py-2 pr-4">{row.version_label ?? "-"}</td>
                      <td className="py-2 pr-4">{row.notes ?? "-"}</td>
                      <td className="py-2 pr-4 text-slate-500">{fmtTime(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Log Terakhir Semua Device (maks 5 baris/device di database, ditampilkan 20 gabungan)
          </h2>
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada log masuk.</p>
          ) : (
            <ul className="space-y-1 font-mono text-xs text-slate-700">
              {logs.map((log) => (
                <li key={log.id}>
                  <span className="text-slate-400">[{fmtTime(log.created_at)}]</span>{" "}
                  <span className="text-slate-500">
                    {DEVICE_LABEL[log.device_id] ?? `Device ${log.device_id}`}:
                  </span>{" "}
                  {log.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageShell>
  );
}
