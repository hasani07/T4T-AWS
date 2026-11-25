import { supabase } from "@/lib/supabase";
import PageShell from "@/components/PageShell";
import { Device } from "@/lib/types";
import AnalyticsClient from "@/components/analytics/AnalyticsClient";

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

export default async function AnalyticsPage() {
  const devices = await getDevices();

  return (
    <PageShell>
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Analitik</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ringkasan, tren, pola harian, arah angin, dan curah hujan per lokasi — dibandingkan dengan periode
            sebelumnya yang durasinya sama.
          </p>
        </header>

        <AnalyticsClient devices={devices} />
    </PageShell>
  );
}
