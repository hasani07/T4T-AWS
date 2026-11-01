"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RainBucket } from "@/lib/rainfall";
import {
  buildCumulative,
  computeDailyRainStats,
  fillDailyGaps,
  formatRainBucketLabel,
} from "@/lib/rainfallSeries";

// Grafik curah hujan sengaja DIPISAH dari grafik sensor (TrendChart): skalanya
// beda jauh (mm vs °C/%), dan kalau digabung batang hujan hampir tak terlihat.
// Tiga grafik di sini masing-masing menjawab satu pertanyaan:
//   1. Hujan per jam / per hari  -> kapan hujan turun & seberapa deras
//   2. Akumulasi                 -> total hujan sudah berapa sejak awal periode
//   3. Harian + rata-rata        -> hari mana di atas/bawah rata-rata
//
// Semua angka dihitung di lib/rainfallSeries.ts (sama dengan yang dipakai CSV
// agregat di halaman Download), jadi grafik dan file unduhan pasti cocok.

const COLOR_RAIN = "#38bdf8";
const COLOR_ACC = "#0ea5e9";
const COLOR_AVG = "#f59e0b";
const GRID = "#e2e8f0";

type Resolution = "hour" | "day";

function fmtMm(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)} mm` : "-";
}

function ChartCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export default function RainfallCharts({
  hourBuckets,
  dayBuckets,
}: {
  hourBuckets: RainBucket[];
  dayBuckets: RainBucket[];
}) {
  // Pilihan user (null = belum memilih). Default otomatis: periode pendek
  // (<= 7 hari) pakai per jam, periode panjang pakai per hari supaya batang
  // tidak berdesakan.
  const [choice, setChoice] = useState<Resolution | null>(null);
  const resolution: Resolution = choice ?? (hourBuckets.length <= 24 * 7 ? "hour" : "day");

  const stats = useMemo(() => computeDailyRainStats(dayBuckets), [dayBuckets]);
  const cumulative = useMemo(() => buildCumulative(hourBuckets), [hourBuckets]);
  const dailySeries = useMemo(() => fillDailyGaps(dayBuckets), [dayBuckets]);

  const barData = useMemo(() => {
    if (resolution === "hour") {
      return cumulative.map((p) => ({ label: p.label, mm: p.perBucket }));
    }
    return dailySeries.map((p) => ({ label: p.label, mm: p.rain_mm }));
  }, [resolution, cumulative, dailySeries]);

  if (hourBuckets.length === 0 && dayBuckets.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-surface p-4">
        <h3 className="text-sm font-semibold text-slate-900">Curah Hujan</h3>
        <p className="mt-2 text-sm text-slate-500">
          Belum ada data curah hujan dari sensor hujan pada periode ini.
        </p>
      </div>
    );
  }

  const avg = stats.avgPerDay;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Ringkasan Curah Hujan</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Total periode" value={fmtMm(stats.total)} />
          <StatTile
            label="Rata-rata harian"
            value={avg === null ? "-" : `${avg.toFixed(2)} mm/hari`}
            hint={`dari ${stats.daysWithData} hari berdata`}
          />
          <StatTile
            label="Hari berhujan"
            value={`${stats.rainyDays} hari`}
            hint={`dari ${stats.daysWithData} hari berdata`}
          />
          <StatTile
            label="Hari terbasah"
            value={stats.maxDay ? fmtMm(stats.maxDay.rain_mm) : "-"}
            hint={stats.maxDay ? formatRainBucketLabel(stats.maxDay.bucket) : undefined}
          />
        </div>
      </div>

      <ChartCard
        title={resolution === "hour" ? "Curah Hujan per Jam" : "Curah Hujan per Hari"}
        subtitle="Total hujan (mm) pada tiap jam / hari."
        action={
          <div className="flex gap-1.5">
            {(["hour", "day"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setChoice(r)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  resolution === r
                    ? "bg-slate-900 text-on-strong"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {r === "hour" ? "Per Jam" : "Per Hari"}
              </button>
            ))}
          </div>
        }
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={30} />
              <YAxis
                tick={{ fontSize: 10 }}
                label={{ value: "mm", angle: -90, position: "insideLeft", fontSize: 10 }}
              />
              <Tooltip formatter={(value) => [fmtMm(value), "Curah hujan"]} />
              <Bar dataKey="mm" fill={COLOR_RAIN} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Akumulasi Curah Hujan"
        subtitle="Total hujan yang sudah turun sejak awal periode (naik terus, tidak pernah turun)."
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cumulative} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="rainAccFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLOR_ACC} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={COLOR_ACC} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={30} />
              <YAxis
                tick={{ fontSize: 10 }}
                label={{ value: "mm", angle: -90, position: "insideLeft", fontSize: 10 }}
              />
              <Tooltip formatter={(value, name) => [fmtMm(value), String(name)]} />
              <Area
                type="monotone"
                dataKey="cumulative"
                name="Akumulasi"
                stroke={COLOR_ACC}
                strokeWidth={2}
                fill="url(#rainAccFill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Curah Hujan Harian & Rata-rata"
        subtitle={
          avg === null
            ? "Total hujan tiap hari."
            : `Total hujan tiap hari. Garis putus-putus = rata-rata harian (${avg.toFixed(2)} mm/hari). Hari tanpa data tidak digambar.`
        }
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dailySeries} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={20} />
              <YAxis
                tick={{ fontSize: 10 }}
                label={{ value: "mm", angle: -90, position: "insideLeft", fontSize: 10 }}
              />
              <Tooltip formatter={(value) => [fmtMm(value), "Total hari itu"]} />
              <Bar dataKey="rain_mm" fill={COLOR_RAIN} radius={[3, 3, 0, 0]} />
              {avg !== null && (
                <ReferenceLine
                  y={avg}
                  stroke={COLOR_AVG}
                  strokeDasharray="6 4"
                  strokeWidth={2}
                  label={{
                    value: `rata-rata ${avg.toFixed(2)}`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: COLOR_AVG,
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
