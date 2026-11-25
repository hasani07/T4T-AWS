import PageShell from "@/components/PageShell";
import ForecastExplorer from "@/components/forecast/ForecastExplorer";
import { getSupabaseFresh } from "@/lib/supabaseFresh";
import { loadForecasts } from "@/lib/forecast/load";

// Versi layar penuh dari peta prediksi (versi ringkasnya ada di Dashboard).
// Prediksi selalu dihitung dari data terbaru, tidak pernah dari cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 60; // cadangan: latih langsung kalau cron malam belum jalan

export default async function PrediksiPage() {
  const client = getSupabaseFresh();
  const { data: devices, error } = await client.from("devices").select("id, type").order("id", { ascending: true });

  if (error || !devices) {
    return (
      <PageShell>
        <p className="text-sm text-rose-600">Gagal mengambil data device.</p>
      </PageShell>
    );
  }

  const { forecasts, modelInfo, setupError } = await loadForecasts(
    client,
    devices.map((d) => ({ id: Number(d.id), type: String(d.type) })),
    { trainIfMissing: true }
  );

  return (
    <PageShell>
      <ForecastExplorer variant="page" forecasts={forecasts} modelInfo={modelInfo} setupError={setupError} />
    </PageShell>
  );
}
