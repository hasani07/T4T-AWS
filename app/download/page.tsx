import { supabase } from "@/lib/supabase";
import PageShell from "@/components/PageShell";
import { Device } from "@/lib/types";
import DownloadClient from "@/components/download/DownloadClient";
import ExcelReportClient from "@/components/download/ExcelReportClient";

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
            Export data sensor — CSV mentah, atau laporan Excel teragregasi
            dengan grafik.
          </p>
        </header>

        {devices.length === 0 ? (
          <p className="text-sm text-slate-500">
            Tidak ada device ditemukan. Pastikan koneksi Supabase sudah benar.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Laporan Excel (Ringkasan + Grafik)
              </h2>
              <ExcelReportClient devices={devices} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                CSV Mentah (Data Apa Adanya)
              </h2>
              <DownloadClient devices={devices} />
            </div>
          </div>
        )}
    </PageShell>
  );
}
