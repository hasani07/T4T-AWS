import { PeriodStats, computeDeltaPct } from "@/lib/statsEngine";
import { WIND_DIRECTION_LABELS } from "@/lib/config";

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-slate-400">–</span>;
  }
  const up = pct > 0;
  const rounded = Math.abs(pct).toFixed(1);
  return (
    <span
      className={`text-xs font-medium ${up ? "text-sky-600" : "text-orange-600"}`}
    >
      {up ? "▲" : "▼"} {rounded}%
    </span>
  );
}

function StatCard({
  label,
  unit,
  avg,
  min,
  max,
  deltaAvg,
}: {
  label: string;
  unit: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  deltaAvg: number | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
        <DeltaBadge pct={deltaAvg} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">
        {avg !== null ? avg.toFixed(1) : "-"}{" "}
        <span className="text-sm font-normal text-slate-400">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Min {min !== null ? min.toFixed(1) : "-"} · Max{" "}
        {max !== null ? max.toFixed(1) : "-"} {unit}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
        rata-rata vs periode sebelumnya
      </p>
    </div>
  );
}

export default function StatsSummary({
  current,
  previous,
}: {
  current: PeriodStats;
  previous: PeriodStats | null;
}) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Suhu"
          unit="°C"
          avg={current.avgTemperature}
          min={current.minTemperature}
          max={current.maxTemperature}
          deltaAvg={computeDeltaPct(
            current.avgTemperature,
            previous?.avgTemperature ?? null
          )}
        />
        <StatCard
          label="Kelembaban"
          unit="%"
          avg={current.avgHumidity}
          min={current.minHumidity}
          max={current.maxHumidity}
          deltaAvg={computeDeltaPct(
            current.avgHumidity,
            previous?.avgHumidity ?? null
          )}
        />
        <StatCard
          label="Kecepatan Angin"
          unit="m/s"
          avg={current.avgWindSpeed}
          min={current.minWindSpeed}
          max={current.maxWindSpeed}
          deltaAvg={computeDeltaPct(
            current.avgWindSpeed,
            previous?.avgWindSpeed ?? null
          )}
        />

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Curah Hujan (Total)
            </h3>
            <DeltaBadge
              pct={computeDeltaPct(
                current.totalRainfall,
                previous?.totalRainfall ?? null
              )}
            />
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {current.totalRainfall !== null
              ? current.totalRainfall.toFixed(1)
              : "-"}{" "}
            <span className="text-sm font-normal text-slate-400">mm</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            total vs periode sebelumnya
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">
          Arah Angin Dominan
        </h3>
        <p className="mt-1 text-lg font-medium text-slate-900">
          {current.dominantWindDirection
            ? WIND_DIRECTION_LABELS[current.dominantWindDirection] ??
              current.dominantWindDirection
            : "Tidak ada arah angin valid pada periode ini (semua calm/tidak terdeteksi)"}
        </p>
      </div>

      {current.excludedReadings > 0 && (
        <p className="mt-3 text-xs text-amber-600">
          ⚠️ {current.excludedReadings} dari {current.totalReadings} baris data
          pada periode ini dikecualikan dari perhitungan karena nilainya di
          luar rentang wajar (kemungkinan glitch sensor).
        </p>
      )}
    </div>
  );
}
