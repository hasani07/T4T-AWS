import { supabase } from "@/lib/supabase";
import PageShell from "@/components/PageShell";
import RecommendationsClient from "@/components/recommendations/RecommendationsClient";
import RecommendationHistory from "@/components/recommendations/RecommendationHistory";

export const revalidate = 0;

interface HistoryRow {
  id: string;
  device_type: string;
  generated_at: string;
  trigger_type: string;
  recommendation_text: string;
}

async function getHistory(): Promise<HistoryRow[]> {
  const { data, error } = await supabase
    .from("ai_recommendations")
    .select("id, generated_at, trigger_type, recommendation_text, devices(type)")
    .order("generated_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    console.error("Gagal mengambil riwayat rekomendasi:", error);
    return [];
  }

  return data.map((row) => {
    const deviceRelation = row.devices as unknown as { type: string } | { type: string }[] | null;
    const deviceType = Array.isArray(deviceRelation)
      ? deviceRelation[0]?.type
      : deviceRelation?.type;

    return {
      id: row.id as string,
      device_type: deviceType ?? "-",
      generated_at: row.generated_at as string,
      trigger_type: row.trigger_type as string,
      recommendation_text: row.recommendation_text as string,
    };
  });
}

export default async function RecommendationsPage() {
  const history = await getHistory();

  return (
    <PageShell>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Rekomendasi AI</h1>
          <p className="mt-1 text-sm text-slate-500">
            Rekomendasi tindakan berbasis data sensor terbaru + knowledge base
            Workshop T4T, disusun oleh Groq. Otomatis tiap pagi ±06:00 WIB,
            atau generate manual kapan saja.
          </p>
        </header>

        <div className="mb-8">
          <RecommendationsClient />
        </div>

        <h2 className="mb-3 text-sm font-semibold text-slate-900">Riwayat Rekomendasi</h2>
        <RecommendationHistory rows={history} />
    </PageShell>
  );
}
