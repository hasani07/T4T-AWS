import { PeriodStats } from "@/lib/statsEngine";
import { Device } from "@/lib/types";
import { WIND_DIRECTION_LABELS } from "@/lib/config";

interface Props {
  devices: Device[];
  statsByDevice: Record<number, PeriodStats | null>;
}

function formatNum(v: number | null, digits = 1): string {
  return v !== null ? v.toFixed(digits) : "-";
}

export default function LocationComparison({ devices, statsByDevice }: Props) {
  if (devices.length < 2) return null;

  const rows: {
    label: string;
    unit: string;
    getValue: (s: PeriodStats | null) => number | null;
  }[] = [
    { label: "Suhu (rata-rata)", unit: "°C", getValue: (s) => s?.avgTemperature ?? null },
    { label: "Kelembaban (rata-rata)", unit: "%", getValue: (s) => s?.avgHumidity ?? null },
    {
      label: "Kecepatan Angin (rata-rata)",
      unit: "m/s",
      getValue: (s) => s?.avgWindSpeed ?? null,
    },
    { label: "Curah Hujan (total)", unit: "mm", getValue: (s) => s?.totalRainfall ?? null },
  ];

  const isTwoDevices = devices.length === 2;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-1 text-sm font-semibold text-slate-900">
        Perbandingan Antar Lokasi
      </h3>
      <p className="mb-3 text-xs text-slate-400">
        Membandingkan {devices.map((d) => d.type).join(" vs ")} pada periode
        yang sama (bukan periode sebelumnya).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4 font-medium">Parameter</th>
              {devices.map((d) => (
                <th key={d.id} className="py-2 pr-4 font-medium">
                  {d.type}
                </th>
              ))}
              {isTwoDevices && <th className="py-2 font-medium">Selisih</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = devices.map((d) => row.getValue(statsByDevice[d.id] ?? null));
              const diff =
                isTwoDevices && values[0] !== null && values[1] !== null
                  ? (values[0] as number) - (values[1] as number)
                  : null;

              return (
                <tr key={row.label} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-600">{row.label}</td>
                  {devices.map((d, i) => (
                    <td key={d.id} className="py-2 pr-4 font-medium text-slate-900">
                      {formatNum(values[i])} {row.unit}
                    </td>
                  ))}
                  {isTwoDevices && (
                    <td className="py-2 text-slate-500">
                      {diff !== null
                        ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)} ${row.unit}`
                        : "-"}
                    </td>
                  )}
                </tr>
              );
            })}

            <tr>
              <td className="py-2 pr-4 text-slate-600">Arah Angin Dominan</td>
              {devices.map((d) => {
                const dir = statsByDevice[d.id]?.dominantWindDirection ?? null;
                return (
                  <td key={d.id} className="py-2 pr-4 font-medium text-slate-900">
                    {dir ? WIND_DIRECTION_LABELS[dir] ?? dir : "-"}
                  </td>
                );
              })}
              {isTwoDevices && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
