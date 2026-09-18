import { supabase } from "@/lib/supabase";
import { Device } from "@/lib/types";
import DownloadClient from "@/components/download/DownloadClient";

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
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">
            Download Data Sensor
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Export data sensor mentah ke file CSV, pilih device dan rentang
            tanggal.
          </p>
        </header>

        {devices.length === 0 ? (
          <p className="text-sm text-slate-500">
            Tidak ada device ditemukan. Pastikan koneksi Supabase sudah benar.
          </p>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <DownloadClient devices={devices} />
          </div>
        )}
      </div>
    </main>
  );
}
