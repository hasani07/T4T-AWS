import PageShell from "@/components/PageShell";
import ForecastExplorer, { ModelInfo } from "@/components/forecast/ForecastExplorer";
import { getSupabaseFresh } from "@/lib/supabaseFresh";
import { DEVICE_COORDINATES } from "@/lib/config";
import { loadLatestPayload } from "@/lib/forecast/store";
import { trainAndScore, ForecastPayload } from "@/lib/forecast/train";
import { fetchBmkgSlots, fetchRecentHourly, nowWibHourKey } from "@/lib/forecast/data";
import { addHours } from "@/lib/forecast/model";
import { buildLocationForecast, LocationForecast } from "@/lib/forecast/predict";

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

  const located = devices
    .map((d) => ({ id: Number(d.id), label: String(d.type), coord: DEVICE_COORDINATES[String(d.type)] }))
    .filter((d) => d.coord);

  // Model dari latihan malam (tabel forecast_models). Kalau belum ada atau
  // sudah basi (cron belum dipasang / gagal), latih langsung dari data
  // sekarang -- tidak disimpan, hanya untuk tampilan ini.
  let payload: ForecastPayload | null = null;
  let modelSource: ModelInfo["source"] = "malam";
  let setupError: string | null = null;
  try {
    const stored = await loadLatestPayload(client);
    if (stored?.fresh) payload = stored.payload;
    else {
      payload = await trainAndScore(client, devices.map((d) => ({ id: Number(d.id) })));
      modelSource = stored ? "langsung-basi" : "langsung";
    }
  } catch (err) {
    console.error("Gagal menyiapkan model prediksi:", err);
    setupError = err instanceof Error ? err.message : "Gagal menyiapkan model prediksi.";
  }

  const nowKey = nowWibHourKey();
  let forecasts: LocationForecast[] = [];
  if (payload) {
    forecasts = await Promise.all(
      located.map(async (d) => {
        const [recent, bmkg] = await Promise.all([
          fetchRecentHourly(client, d.id).catch(() => []),
          fetchBmkgSlots(client, d.id, addHours(nowKey, -3), addHours(nowKey, 24)),
        ]);
        // Slot BMKG berlaku 3 jam: tampilkan yang belum selesai.
        const upcoming = bmkg.filter((s) => addHours(s.slotLocal, 3) > nowKey);
        return buildLocationForecast({
          payload: payload!,
          device: { id: d.id, label: d.label, lat: d.coord.lat, lon: d.coord.lon },
          recent,
          bmkgUpcoming: upcoming,
          nowHourKey: nowKey,
        });
      })
    );
  }

  const modelInfo: ModelInfo | null = payload
    ? {
        source: modelSource,
        trainedAt: payload.trainedAt,
        dataDays: payload.dataDays,
        rainEvents: payload.model.rainEvents,
        windowDays: payload.choice.windowDays,
      }
    : null;

  return (
    <PageShell>
      <ForecastExplorer forecasts={forecasts} modelInfo={modelInfo} setupError={setupError} />
    </PageShell>
  );
}
