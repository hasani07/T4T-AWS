import { supabase } from "@/lib/supabase";
import PageShell from "@/components/PageShell";
import { Device } from "@/lib/types";
import DownloadClient from "@/components/download/DownloadClient";
import ExcelReportClient from "@/components/download/ExcelReportClient";
import RainfallDownloadClient from "@/components/download/RainfallDownloadClient";

export const revalidate = 0;

async function getDevices(): Promise<Device[]> {
  const { data, error } = await supabase
    .from("devices")
    .select("id, type")
    .order("id", { ascending: true });

  if (error || !data) {
    console.error("Gagal mengambil data devices:", error);
    return [];
  }

  return data;
}

export default async function DownloadPage() {
  const devices = await getDevices();

  return (
    <PageShell>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">
            Download Data Sensor
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Export data sensor — laporan Excel teragregasi dengan grafik, CSV
            khusus curah hujan, atau CSV cuaca mentah.
          </p>
        </header>

        {devices.length === 0 ? (
          <p className="text-sm text-slate-500">
            Tidak ada device ditemukan. Pastikan koneksi Supabase sudah benar.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Laporan Excel (Ringkasan + Grafik)
              </h2>
              <ExcelReportClient devices={devices} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Download Curah Hujan (Khusus Sensor Hujan)
              </h2>
              <RainfallDownloadClient devices={devices} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                CSV Cuaca Mentah (Suhu, Kelembaban, Angin)
              </h2>
              <DownloadClient devices={devices} />
            </div>
          </div>
        )}
    </PageShell>
  );
}
