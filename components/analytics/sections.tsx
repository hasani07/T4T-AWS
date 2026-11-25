"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CloudRain,
  Droplets,
  Flame,
  Info,
  Snowflake,
  Sun,
  Thermometer,
  AlertTriangle,
  Wind,
  Minus,
} from "lucide-react";
import type { PeriodStats } from "@/lib/statsEngine";
import { WIND_DIRECTION_LABELS } from "@/lib/config";
import type { DayPoint, DiurnalPoint, HourPoint, Insight, VpdShare, WindRose } from "@/lib/analyticsCalc";
import { CARD, iconChipStyle } from "@/components/ui/card";
import { LineChart, Sparkline } from "./charts";

// Bagian-bagian halaman Analitik. Catatan warna: tanpa dark:text-slate-*
// (skala slate dibalik otomatis di mode gelap, lihat app/globals.css).

const f1 = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "–"
    : v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

export function ChartCard({
  title,
  subtitle,
  aside,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${CARD} p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------
// Insight
// ---------------------------------------------------------------------

const INSIGHT_STYLE: Record<Insight["tone"], { icon: typeof Info; cls: string }> = {
  neutral: { icon: Info, cls: "bg-slate-50 text-slate-700 ring-slate-200/60" },
  warm: { icon: Sun, cls: "bg-orange-50 text-orange-800 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-200 dark:ring-orange-500/20" },
  cool: { icon: Snowflake, cls: "bg-sky-50 text-sky-800 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20" },
  wet: { icon: CloudRain, cls: "bg-cyan-50 text-cyan-800 ring-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-200 dark:ring-cyan-500/20" },
  dry: { icon: Flame, cls: "bg-amber-50 text-amber-800 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20" },
  warn: { icon: AlertTriangle, cls: "bg-rose-50 text-rose-800 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20" },
};

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <section aria-labelledby="insight-title">
      <h2 id="insight-title" className="mb-3 text-sm font-semibold text-slate-900">
        Yang perlu diketahui dari periode ini
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {insights.map((it, i) => {
          const st = INSIGHT_STYLE[it.tone];
          return (
            <div
              key={i}
              className={`flex gap-3 rounded-2xl p-3.5 ring-1 ${st.cls}`}
              style={{ animation: `analytics-rise 550ms cubic-bezier(0.22,1,0.36,1) ${i * 70}ms both` }}
            >
              <st.icon size={18} className="mt-0.5 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-bold leading-snug">{it.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed opacity-80">{it.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Kartu angka
// ---------------------------------------------------------------------

function Delta({ diff, unit, pct, goodWhenUp }: { diff: number | null; unit: string; pct?: boolean; goodWhenUp?: boolean }) {
  if (diff === null || !Number.isFinite(diff)) return <span className="text-[11px] text-slate-400">tidak ada pembanding</span>;
  const flat = Math.abs(diff) < (pct ? 2 : 0.05);
  const up = diff > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const cls = flat
    ? "bg-slate-100 text-slate-500"
    : goodWhenUp === undefined
      ? up
        ? "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
        : "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
      : up === goodWhenUp
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
        : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon size={12} aria-hidden />
      {flat ? "stabil" : `${up ? "+" : "−"}${f1(Math.abs(diff))}${pct ? "%" : unit}`}
    </span>
  );
}

function RangeBar({ min, avg, max, lo, hi, color }: { min: number | null; avg: number | null; max: number | null; lo: number; hi: number; color: string }) {
  if (min === null || max === null || avg === null) return null;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="relative mt-3 h-1.5 rounded-full bg-slate-100">
      <div
        className="absolute inset-y-0 rounded-full"
        style={{ left: pos(min), right: `calc(100% - ${pos(max)})`, background: `linear-gradient(90deg, ${color}66, ${color})` }}
      />
      <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface ring-2" style={{ left: pos(avg), ["--tw-ring-color" as string]: color }} />
    </div>
  );
}

function Kpi({
  icon: Icon,
  color,
  title,
  value,
  unit,
  min,
  max,
  avg,
  rangeLo,
  rangeHi,
  delta,
  spark,
  note,
}: {
  icon: typeof Thermometer;
  color: string;
  title: string;
  value: string;
  unit: string;
  min?: number | null;
  max?: number | null;
  avg?: number | null;
  rangeLo?: number;
  rangeHi?: number;
  delta: React.ReactNode;
  spark: (number | null)[];
  note: string;
}) {
  return (
    <div className={`${CARD} flex flex-col p-4`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={iconChipStyle(color)}>
            <Icon size={14} strokeWidth={2.25} aria-hidden />
          </span>
          {title}
        </span>
        {delta}
      </div>
      <p className="mt-3 font-extrabold leading-none tracking-tight tabular-nums text-slate-900">
        <span className="text-3xl">{value}</span>
        <span className="ml-1 text-sm font-bold text-slate-400">{unit}</span>
      </p>
      {min !== undefined && rangeLo !== undefined && rangeHi !== undefined && (
        <>
          <RangeBar min={min ?? null} max={max ?? null} avg={avg ?? null} lo={rangeLo} hi={rangeHi} color={color} />
          <p className="mt-1.5 flex justify-between text-[11px] tabular-nums text-slate-500">
            <span>min {f1(min)}</span>
            <span>maks {f1(max)}</span>
          </p>
        </>
      )}
      <div className="mt-auto pt-2">
        <Sparkline values={spark} color={color} />
        <p className="text-[10px] text-slate-400">{note}</p>
      </div>
    </div>
  );
}

export function KpiCards({
  current,
  previous,
  daily,
  rainDaily,
}: {
  current: PeriodStats;
  previous: PeriodStats | null;
  daily: DayPoint[];
  rainDaily: { bucket: string; rain_mm: number }[];
}) {
  const diff = (a: number | null, b: number | null | undefined) => (a !== null && b !== null && b !== undefined ? a - b : null);
  const rainPct =
    current.totalRainfall !== null && previous?.totalRainfall != null && previous.totalRainfall > 0.5
      ? ((current.totalRainfall - previous.totalRainfall) / previous.totalRainfall) * 100
      : null;
  const wind = current.dominantWindDirection ? WIND_DIRECTION_LABELS[current.dominantWindDirection] ?? current.dominantWindDirection : null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        icon={Thermometer}
        color="#F97316"
        title="Suhu rata-rata"
        value={f1(current.avgTemperature)}
        unit="°C"
        min={current.minTemperature}
        max={current.maxTemperature}
        avg={current.avgTemperature}
        rangeLo={10}
        rangeHi={45}
        delta={<Delta diff={diff(current.avgTemperature, previous?.avgTemperature)} unit="°C" />}
        spark={daily.map((d) => d.tAvg)}
        note="Rata-rata harian · vs periode sebelumnya"
      />
      <Kpi
        icon={Droplets}
        color="#0EA5E9"
        title="Kelembaban rata-rata"
        value={f1(current.avgHumidity, 0)}
        unit="%"
        min={current.minHumidity}
        max={current.maxHumidity}
        avg={current.avgHumidity}
        rangeLo={0}
        rangeHi={100}
        delta={<Delta diff={diff(current.avgHumidity, previous?.avgHumidity)} unit="%" />}
        spark={daily.map((d) => d.rhAvg)}
        note="Rata-rata harian · vs periode sebelumnya"
      />
      <Kpi
        icon={Wind}
        color="#8B5CF6"
        title="Angin rata-rata"
        value={f1(current.avgWindSpeed)}
        unit="m/s"
        min={current.minWindSpeed}
        max={current.maxWindSpeed}
        avg={current.avgWindSpeed}
        rangeLo={0}
        rangeHi={Math.max(8, current.maxWindSpeed ?? 0)}
        delta={<Delta diff={diff(current.avgWindSpeed, previous?.avgWindSpeed)} unit=" m/s" />}
        spark={daily.map((d) => d.windAvg)}
        note={wind ? `Dominan dari ${wind}` : "Arah dominan: tenang"}
      />
      <Kpi
        icon={CloudRain}
        color="#06B6D4"
        title="Total hujan"
        value={f1(current.totalRainfall)}
        unit="mm"
        delta={<Delta diff={rainPct} unit="" pct />}
        spark={rainDaily.map((d) => d.rain_mm)}
        note={`${rainDaily.filter((d) => d.rain_mm >= 0.5).length} hari hujan dari ${rainDaily.length} hari berdata`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Tren harian (pita min-maks + rata-rata)
// ---------------------------------------------------------------------

export function DailyRanges({ daily }: { daily: DayPoint[] }) {
  const labels = daily.map((d) => d.label);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="Suhu harian" subtitle="Pita = rentang terendah–tertinggi tiap hari, garis = rata-rata.">
        <LineChart
          ariaLabel="Suhu harian: rentang dan rata-rata"
          labels={labels}
          band={{ lo: daily.map((d) => d.tMin), hi: daily.map((d) => d.tMax), color: "#F97316", name: "Rentang" }}
          series={[{ key: "tavg", name: "Rata-rata", color: "#F97316", values: daily.map((d) => d.tAvg), unit: "°C", width: 2.5 }]}
          yUnit="°C"
        />
      </ChartCard>
      <ChartCard title="Kelembaban harian" subtitle="Pita = rentang terendah–tertinggi tiap hari, garis = rata-rata.">
        <LineChart
          ariaLabel="Kelembaban harian: rentang dan rata-rata"
          labels={labels}
          band={{ lo: daily.map((d) => d.rhMin), hi: daily.map((d) => d.rhMax), color: "#0EA5E9", name: "Rentang" }}
          series={[{ key: "rhavg", name: "Rata-rata", color: "#0EA5E9", values: daily.map((d) => d.rhAvg), unit: "%", width: 2.5, digits: 0 }]}
          yUnit="%"
          yMax={100}
        />
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------
// Detail per jam: 3 grafik dengan penunjuk serempak
// ---------------------------------------------------------------------

export function MetricTrends({ hourly }: { hourly: HourPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const labels = useMemo(() => hourly.map((h) => h.label), [hourly]);
  const shortLabels = useMemo(() => hourly.map((h) => h.label.split(" ").slice(0, 2).join(" ")), [hourly]);
  const charts = [
    { key: "temp", name: "Suhu", unit: "°C", color: "#F97316", values: hourly.map((h) => h.temp), digits: 1 },
    { key: "rh", name: "Kelembaban", unit: "%", color: "#0EA5E9", values: hourly.map((h) => h.rh), digits: 0 },
    { key: "wind", name: "Angin", unit: " m/s", color: "#8B5CF6", values: hourly.map((h) => h.wind), digits: 1 },
  ];
  return (
    <ChartCard
      title="Detail per jam"
      subtitle="Rata-rata tiap jam. Sorot salah satu grafik — penunjuk di ketiga grafik bergerak bersamaan, jadi mudah melihat hubungan suhu, kelembaban & angin."
    >
      <div className="space-y-1">
        {charts.map((c, i) => (
          <div key={c.key}>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
              {c.name}
            </p>
            <LineChart
              ariaLabel={`${c.name} per jam`}
              labels={i === charts.length - 1 ? shortLabels : labels.map(() => "")}
              series={[{ key: c.key, name: c.name, color: c.color, values: c.values, unit: c.unit, fill: true, digits: c.digits }]}
              height={i === charts.length - 1 ? 132 : 110}
              hoverIndex={hover}
              onHover={setHover}
              showLegend={false}
              maxXTicks={6}
            />
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------
// Pola harian (rata-rata per jam dalam sehari)
// ---------------------------------------------------------------------

export function DiurnalCard({ diurnal }: { diurnal: DiurnalPoint[] }) {
  const labels = diurnal.map((d) => `${String(d.hour).padStart(2, "0")}:00`);
  return (
    <ChartCard
      title="Pola harian"
      subtitle="Rata-rata menurut jam dalam sehari selama periode ini — kapan paling panas & paling kering untuk mengatur penyiraman/naungan."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
          <span className="h-2 w-2 rounded-full bg-orange-500" /> Suhu
        </p>
        <LineChart
          ariaLabel="Pola harian suhu"
          labels={labels}
          series={[{ key: "dt", name: "Suhu", color: "#F97316", values: diurnal.map((d) => d.temp), unit: "°C", fill: true }]}
          yUnit="°C"
          height={180}
          maxXTicks={6}
          showLegend={false}
        />
        </div>
        <div>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
          <span className="h-2 w-2 rounded-full bg-sky-500" /> Kelembaban
        </p>
        <LineChart
          ariaLabel="Pola harian kelembaban"
          labels={labels}
          series={[{ key: "dh", name: "Kelembaban", color: "#0EA5E9", values: diurnal.map((d) => d.rh), unit: "%", fill: true, digits: 0 }]}
          yUnit="%"
          height={180}
          maxXTicks={6}
          showLegend={false}
        />
        </div>
      </div>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------
// Mawar angin
// ---------------------------------------------------------------------

const SHORT_DIR: Record<string, string> = { N: "U", NE: "TL", E: "T", SE: "TG", S: "S", SW: "BD", W: "B", NW: "BL" };

export function WindRoseCard({ rose }: { rose: WindRose }) {
  const max = Math.max(5, ...rose.dirs.map((d) => d.pct));
  const R = 78;
  const C = 100;
  const petals = rose.dirs.map((d, i) => {
    const ang = (i * 45 - 90) * (Math.PI / 180);
    const half = 18 * (Math.PI / 180);
    const len = (d.pct / max) * R;
    const p1 = [C + Math.cos(ang - half) * len, C + Math.sin(ang - half) * len];
    const p2 = [C + Math.cos(ang + half) * len, C + Math.sin(ang + half) * len];
    return { ...d, path: `M${C} ${C} L${p1[0].toFixed(1)} ${p1[1].toFixed(1)} A${len} ${len} 0 0 1 ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} Z`, ang };
  });
  const top = [...rose.dirs].sort((a, b) => b.pct - a.pct)[0];
  return (
    <ChartCard title="Arah angin" subtitle="Panjang kelopak = seberapa sering angin datang dari arah itu.">
      <div className="flex flex-col items-center gap-3 sm:flex-row lg:flex-col">
        <svg viewBox="0 0 200 200" className="h-48 w-48 shrink-0" role="img" aria-label="Mawar angin">
          {[0.33, 0.66, 1].map((k) => (
            <circle key={k} cx={C} cy={C} r={R * k} fill="none" className="stroke-slate-200" strokeDasharray="2 3" />
          ))}
          {petals.map((p) => (
            <path key={p.dir} d={p.path} fill="#8B5CF6" opacity={p.dir === top?.dir ? 0.9 : 0.45}>
              <title>{`${p.label}: ${f1(p.pct)}% waktu${p.avgSpeed !== null ? `, rata-rata ${f1(p.avgSpeed)} m/s` : ""}`}</title>
            </path>
          ))}
          {petals.map((p) => (
            <text
              key={`t-${p.dir}`}
              x={C + Math.cos(p.ang) * (R + 13)}
              y={C + Math.sin(p.ang) * (R + 13) + 3.5}
              textAnchor="middle"
              className="fill-slate-500"
              style={{ fontSize: 10, fontWeight: 600 }}
            >
              {SHORT_DIR[p.dir]}
            </text>
          ))}
          <circle cx={C} cy={C} r={3} className="fill-slate-400" />
        </svg>
        <div className="w-full min-w-0 space-y-1.5">
          {[...rose.dirs]
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 4)
            .map((d) => (
              <div key={d.dir} className="grid grid-cols-[82px_1fr_42px] items-center gap-2 text-[11px]">
                <span className="truncate text-slate-600">{d.label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-violet-500" style={{ width: `${(d.pct / max) * 100}%` }} />
                </span>
                <span className="text-right font-semibold tabular-nums text-slate-700">{f1(d.pct, 0)}%</span>
              </div>
            ))}
          <p className="pt-1 text-[11px] text-slate-400">Tenang (tanpa arah): {f1(rose.calmPct, 0)}% waktu</p>
        </div>
      </div>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------
// Sebaran VPD & kelembaban ekstrem
// ---------------------------------------------------------------------

export function VpdCard({ vpd, humid90Pct, hot32Pct }: { vpd: VpdShare; humid90Pct: number; hot32Pct: number }) {
  const parts = [
    { k: "rendah", label: "Rendah (<0,8 kPa)", hint: "udara lembab", v: vpd.rendah, color: "#0EA5E9" },
    { k: "sedang", label: "Ideal (0,8–1,5)", hint: "transpirasi sehat", v: vpd.sedang, color: "#22C55E" },
    { k: "tinggi", label: "Tinggi (>1,5)", hint: "risiko stres air", v: vpd.tinggi, color: "#EF4444" },
  ];
  return (
    <ChartCard title="Kenyamanan tanaman (VPD)" subtitle="Persentase waktu di tiap kelas VPD selama periode ini.">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
        {parts.map((p) => (
          <div key={p.k} style={{ width: `${p.v}%`, background: p.color }} title={`${p.label}: ${f1(p.v, 0)}%`} />
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {parts.map((p) => (
          <li key={p.k} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/50">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">{p.label}</p>
                <p className="text-[10px] text-slate-400">{p.hint}</p>
              </div>
            </div>
            <p className="text-lg font-extrabold tabular-nums text-slate-900">{f1(p.v, 0)}%</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/50">
          <p className="text-[10px] text-slate-500">Kelembaban ≥90%</p>
          <p className="text-sm font-bold tabular-nums text-slate-900">{f1(humid90Pct, 0)}% waktu</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/50">
          <p className="text-[10px] text-slate-500">Suhu &gt;32°C</p>
          <p className="text-sm font-bold tabular-nums text-slate-900">{f1(hot32Pct, 0)}% waktu</p>
        </div>
      </div>
    </ChartCard>
  );
}
