import { supabase } from "@/lib/supabase";
import { fetchDeviceQuotas } from "@/lib/quota";
import PageShell from "@/components/PageShell";
import QuotaCard, { QuotaCardData } from "@/components/kuota/QuotaCard";

export const dynamic = "force-dynamic";

export default async function KuotaPage() {
  const { data: devices, error } = await supabase.from("devices").select("id, type").order("id", { ascending: true });

  if (error || !devices) {
    return (
      <PageShell>
        <p className="text-sm text-rose-600">Gagal mengambil data device.</p>
      </PageShell>
    );
  }

  const quotas = await fetchDeviceQuotas(devices.map((d) => d.id));

  const cards: QuotaCardData[] = devices.map((d) => {
    const q = quotas[d.id];
    return {
      deviceId: d.id,
      deviceLabel: d.type,
      provider: q?.provider_phone ?? null,
      cycleDays: q?.cycle_days ?? 28,
      lastRefillDate: q?.last_refill_date ?? null,
    };
  });

  return (
    <PageShell>
      <h1 className="text-xl font-bold text-slate-900">Kuota Data Provider</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pengingat otomatis lewat Telegram sebelum dan sesudah perkiraan kuota habis, supaya device tidak
        berhenti mengirim data karena kehabisan pulsa data.
      </p>

      {cards.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">Belum ada device ditemukan.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {cards.map((c) => (
            <QuotaCard key={c.deviceId} data={c} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
