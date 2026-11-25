import { PeriodStats } from "@/lib/statsEngine";
import { Device } from "@/lib/types";
import { WIND_DIRECTION_LABELS } from "@/lib/config";
import { ChartCard } from "./sections";

interface Props {
  devices: Device[];
  statsByDevice: Record<number, PeriodStats | null>;
  selectedId: number | null;
}

// Warna tetap per lokasi (urutan device), dipakai konsisten di semua batang.
const LOC_COLORS = ["#14B8A6", "#6366F1", "#F59E0B", "#EC4899"];

const f1 = (v: number | null, d = 1) =>
  v === null ? "–" : v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Perbandingan antar lokasi pada periode yang SAMA (bukan periode
 * sebelumnya): satu baris per parameter, batang per lokasi berdampingan.
 */
export default function LocationComparison({ devices, statsByDevice, selectedId }: Props) {
  if (devices.length < 2) return null;

  const rows: { label: string; unit: string; digits: number; get: (s: PeriodStats | null) => number | null }[] = [
    { label: "Suhu rata-rata", unit: "°C", digits: 1, get: (s) => s?.avgTemperature ?? null },
    { label: "Suhu tertinggi", unit: "°C", digits: 1, get: (s) => s?.maxTemperature ?? null },
    { label: "Kelembaban rata-rata", unit: "%", digits: 0, get: (s) => s?.avgHumidity ?? null },
    { label: "Angin rata-rata", unit: " m/s", digits: 1, get: (s) => s?.avgWindSpeed ?? null },
    { label: "Total hujan", unit: " mm", digits: 1, get: (s) => s?.totalRainfall ?? null },
  ];

  return (
    <ChartCard
      title="Perbandingan antar lokasi"
      subtitle={`${devices.map((d) => d.type).join(" vs ")} pada periode yang sama.`}
      aside={
        <div className="flex flex-wrap gap-3">
          {devices.map((d, i) => (
            <span key={d.id} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LOC_COLORS[i % LOC_COLORS.length] }} />
              {d.type}
            </span>
          ))}
        </div>
      }
    >
      <div className="space-y-4">
        {rows.map((row) => {
          const values = devices.map((d) => row.get(statsByDevice[d.id] ?? null));
          const max = Math.max(...values.map((v) => v ?? 0), 0.0001);
          const known = values.filter((v): v is number => v !== null);
          const spread = known.length >= 2 ? Math.max(...known) - Math.min(...known) : null;
          return (
            <div key={row.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">{row.label}</p>
                {spread !== null && (
                  <p className="text-[11px] text-slate-400">
                    selisih {f1(spread, row.digits)}
                    {row.unit}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                {devices.map((d, i) => {
                  const v = values[i];
                  return (
                    <div key={d.id} className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-[width] duration-700"
                          style={{
                            width: `${v === null ? 0 : Math.max(2, (v / max) * 100)}%`,
                            background: LOC_COLORS[i % LOC_COLORS.length],
                            opacity: selectedId === null || selectedId === d.id ? 1 : 0.55,
                          }}
                        />
                      </div>
                      <span className="w-20 text-right text-[11px] font-semibold tabular-nums text-slate-800">
                        {f1(v, row.digits)}
                        {row.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="flex flex-wrap gap-2 border-t border-slate-200/70 pt-3">
          {devices.map((d, i) => {
            const dir = statsByDevice[d.id]?.dominantWindDirection ?? null;
            return (
              <span key={d.id} className="rounded-full bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600 ring-1 ring-slate-200/60">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: LOC_COLORS[i % LOC_COLORS.length] }} />
                {d.type}: angin dominan dari <b className="text-slate-900">{dir ? WIND_DIRECTION_LABELS[dir] ?? dir : "–"}</b>
              </span>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
}
