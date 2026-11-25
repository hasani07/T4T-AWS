"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CloudRain, Droplets, Thermometer, Wind, X, Info } from "lucide-react";
import type { LocationForecast, ScoreView } from "@/lib/forecast/predict";
import { LEVELS, fmt, pct } from "./levels";

// Isi kartu prediksi satu lokasi. Urutan isi mengikuti pertanyaan pengguna:
//   1. Akan hujan? (peluang 3 jam ke depan)  2. Sekarang bagaimana?
//   3. Jam-jam berikutnya  4. Biasanya hujan jam berapa di sini?
//   5. Kata BMKG?  6. Seberapa bisa dipercaya?
// Catatan warna: JANGAN pakai dark:text-slate-* / dark:bg-slate-* -- skala
// slate sudah dibalik otomatis di mode gelap (app/globals.css).

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200/70 px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Busur setengah lingkaran untuk peluang hujan. */
function RainGauge({ prob, color }: { prob: number; color: string }) {
  const r = 52;
  const len = Math.PI * r;
  const target = Math.max(0, Math.min(1, prob));
  // Mulai dari 0 lalu naik ke nilai sebenarnya, supaya busurnya "mengisi"
  // saat kartu muncul (transisi CSS di stroke-dashoffset).
  const [p, setP] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setP(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return (
    <svg viewBox="0 0 132 74" className="h-[92px] w-[164px]" role="img" aria-label={`Peluang hujan ${Math.round(target * 100)} persen`}>
      <path d="M 14 66 A 52 52 0 0 1 118 66" fill="none" className="stroke-slate-100" strokeWidth="11" strokeLinecap="round" />
      <path
        d="M 14 66 A 52 52 0 0 1 118 66"
        fill="none"
        stroke={color}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${len} ${len}`}
        strokeDashoffset={len * (1 - p)}
        style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1) 250ms" }}
      />
      <text x="66" y="60" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 26, fontWeight: 800 }}>
        {Math.round(target * 100)}
        <tspan style={{ fontSize: 14, fontWeight: 700 }}>%</tspan>
      </text>
    </svg>
  );
}

/** 24 batang: peluang hujan 3 jam bila dimulai jam itu. */
function DayPattern({ pattern, active, color }: { pattern: number[]; active: number | null; color: string }) {
  const W = 288;
  const H = 76;
  const bw = W / 24;
  const max = Math.max(0.3, ...pattern);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" role="img" aria-label="Peluang hujan menurut jam di lokasi ini">
        {pattern.map((v, h) => {
          const bh = Math.max(2, (v / max) * H);
          const isActive = h === active;
          return (
            <g key={h}>
              <rect
                x={h * bw + 1.5}
                y={H - bh}
                width={bw - 3}
                height={bh}
                rx={2.5}
                fill={isActive ? color : undefined}
                className={isActive ? undefined : v >= 0.2 ? "fill-sky-400/70" : "fill-slate-200"}
              >
                <title>{`Mulai ${String(h).padStart(2, "0")}:00 — peluang hujan 3 jam ${Math.round(v * 100)}%`}</title>
              </rect>
              {isActive && (
                <text x={h * bw + bw / 2} y={H - bh - 4} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 9, fontWeight: 700 }}>
                  {Math.round(v * 100)}%
                </text>
              )}
            </g>
          );
        })}
        {[0, 6, 12, 18].map((h) => (
          <text key={h} x={h * bw + 1.5} y={H + 13} className="fill-slate-400" style={{ fontSize: 9 }}>
            {String(h).padStart(2, "0")}:00
          </text>
        ))}
      </svg>
    </div>
  );
}

function TrendIcon({ from, to }: { from: number | null; to: number | null }) {
  if (from === null || to === null) return null;
  const d = to - from;
  const Icon = d > 0.4 ? ArrowUpRight : d < -0.4 ? ArrowDownRight : ArrowRight;
  return <Icon size={13} className="text-slate-400" aria-hidden />;
}

function ScoreRow({ name, s, emphasis }: { name: string; s: ScoreView | { events: number; hits: number; misses: number; falseAlarms: number } | null; emphasis?: boolean }) {
  if (!s) return null;
  const warned = s.hits + s.falseAlarms;
  const hitPct = s.events ? s.hits / s.events : 0;
  return (
    <div className={`rounded-2xl px-3.5 py-3 ${emphasis ? "bg-slate-50 ring-1 ring-slate-200" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-slate-800">{name}</p>
        <p className="text-[11px] text-slate-400">
          alarm palsu {warned ? Math.round((s.falseAlarms / warned) * 100) : 0}%
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.round(hitPct * 100)}%`, transition: "width 800ms ease 300ms" }} />
        </div>
        <p className="w-[92px] shrink-0 text-right text-[11px] text-slate-500">
          <b className="text-slate-900">{s.hits}</b> dari {s.events} hujan
        </p>
      </div>
    </div>
  );
}

export interface DeviceOnline {
  weather: boolean;
  rain: boolean;
}

function OnlineChip({ label, online }: { label: string; online: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
      <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-rose-500"}`} aria-hidden />
      {label} {online ? "online" : "offline"}
    </span>
  );
}

export default function ForecastPanel({
  forecast,
  onClose,
  footer,
  online,
}: {
  forecast: LocationForecast;
  onClose: () => void;
  footer: React.ReactNode;
  /** Status alat di lokasi ini (opsional, dikirim dari Dashboard). */
  online?: DeviceOnline;
}) {
  const f = forecast;
  const level = f.rain.level ? LEVELS[f.rain.level] : null;
  const color = level?.color ?? "#94a3b8";
  const basedOn = f.basedOnHour ? `${f.basedOnHour.slice(11, 13)}:00` : null;

  return (
    <div className="flex h-full flex-col">
      {/* Kepala */}
      <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Prediksi lokasi</p>
          <h2 className="mt-0.5 truncate text-xl font-bold tracking-tight text-slate-900">{f.label}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${f.status === "ok" ? "bg-emerald-500" : "bg-amber-500"}`}
              aria-hidden
            />
            {f.status === "ok" && basedOn && <>Dari data sensor s/d {basedOn} WIB</>}
            {f.status === "stale" && basedOn && <>Data sensor tertunda — terakhir {basedOn} WIB</>}
            {f.status === "nodata" && <>Belum ada data sensor terbaru</>}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
          aria-label="Tutup dan kembali ke semua lokasi"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* 1. Peluang hujan */}
        <div className="px-5 pb-5">
          <div
            className="relative overflow-hidden rounded-3xl p-4"
            style={{ background: `linear-gradient(140deg, ${color}1f 0%, ${color}08 60%, transparent 100%)` }}
          >
            <div className="flex items-center gap-3">
              {f.rain.prob !== null ? (
                <RainGauge prob={f.rain.prob} color={color} />
              ) : (
                <div className="flex h-[92px] w-[164px] items-center justify-center text-sm text-slate-400">Tidak tersedia</div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500">Peluang hujan</p>
                <p className="text-sm font-semibold text-slate-900">{f.rain.windowLabel ?? "3 jam ke depan"}</p>
                {level && (
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${level.chip}`}>
                    {level.label}
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {level?.hint}{" "}
              <span className="text-slate-400">
                {f.rain.source === "model"
                  ? "Dihitung model yang membaca perubahan suhu, kelembaban, angin & hujan terakhir."
                  : "Dihitung dari pola jam hujan di lokasi ini."}
              </span>
            </p>
            {f.rain.note && (
              <p className="mt-2 flex gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                <Info size={13} className="mt-px shrink-0" /> {f.rain.note}
              </p>
            )}
          </div>
        </div>

        {/* 2. Sekarang */}
        <Section
          title="Kondisi sekarang"
          aside={
            online ? (
              <span className="flex gap-2.5">
                <OnlineChip label="Cuaca" online={online.weather} />
                <OnlineChip label="Hujan" online={online.rain} />
              </span>
            ) : undefined
          }
        >
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Thermometer, v: `${fmt(f.current.temp)}°`, l: "Suhu", c: "#fb923c" },
              { icon: Droplets, v: `${fmt(f.current.rh, 0)}%`, l: "Lembab", c: "#38bdf8" },
              { icon: Wind, v: fmt(f.current.wind), l: "m/s", c: "#a78bfa" },
              { icon: CloudRain, v: fmt(f.current.rainToday), l: "mm hari ini", c: "#22d3ee" },
            ].map((t) => (
              <div key={t.l} className="rounded-2xl bg-slate-50 px-2 py-2.5 text-center">
                <t.icon size={15} className="mx-auto" style={{ color: t.c }} aria-hidden />
                <p className="mt-1 text-sm font-bold text-slate-900">{t.v}</p>
                <p className="truncate text-[10px] text-slate-400">{t.l}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 3. Jam berikutnya */}
        {f.hours.length > 0 && (
          <Section title="3 jam ke depan">
            <div className="grid grid-cols-3 gap-2">
              {f.hours.map((h, i) => (
                <div
                  key={h.hourKey}
                  className="rounded-2xl border border-slate-200/80 px-3 py-3 opacity-0 [animation:forecast-rise_600ms_cubic-bezier(0.22,1,0.36,1)_forwards]"
                  style={{ animationDelay: `${350 + i * 90}ms` }}
                >
                  <p className="text-[11px] font-semibold text-slate-500">{h.label}</p>
                  <p className="mt-1 flex items-center gap-1 text-lg font-bold text-slate-900">
                    {fmt(h.temp)}°
                    <TrendIcon from={i === 0 ? f.current.temp : f.hours[i - 1].temp} to={h.temp} />
                  </p>
                  <p className="text-[11px] text-slate-500">RH {fmt(h.rh, 0)}%</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Rata-rata meleset ±{fmt(f.score.tempMae[0])}°C (1 jam) sampai ±{fmt(f.score.tempMae[2])}°C (3 jam).
            </p>
          </Section>
        )}

        {/* 4. Pola jam */}
        <Section title="Biasanya hujan jam berapa di sini">
          <DayPattern pattern={f.dayPattern} active={f.activePatternHour} color={color} />
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            Tinggi batang = seberapa sering turun hujan dalam 3 jam bila dimulai jam itu. Batang berwarna = jendela prediksi sekarang.
          </p>
        </Section>

        {/* 5. BMKG */}
        <Section title="Prakiraan BMKG" aside={<span className="text-[10px] text-slate-400">slot 3 jam</span>}>
          {f.bmkgNext.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada prakiraan BMKG tersimpan untuk lokasi ini.</p>
          ) : (
            <ul className="space-y-1.5">
              {f.bmkgNext.map((s) => (
                <li key={s.slotLocal} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-700">{s.slotLocal.slice(11, 13)}:00</span>
                  <span className="flex-1 truncate text-xs text-slate-600">{s.desc}</span>
                  <span className="text-xs text-slate-500">{fmt(s.temperature, 0)}°</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 6. Akurasi */}
        <Section
          title="Seberapa tepat?"
          aside={
            f.score.from && f.score.to ? (
              <span className="text-[10px] text-slate-400">
                uji {f.score.days} hari terakhir
              </span>
            ) : null
          }
        >
          <div className="space-y-1.5">
            <ScoreRow name="Model lokasi ini" s={f.score.rain.model} emphasis={f.rain.source === "model"} />
            <ScoreRow name="Pola jam saja" s={f.score.rain.pattern} emphasis={f.rain.source === "pola"} />
            {f.score.bmkg && <ScoreRow name={`BMKG (${f.score.bmkg.slots} slot)`} s={f.score.bmkg.bmkg} />}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Diuji seolah dipakai sungguhan: tiap hari model dilatih dari data sebelumnya saja lalu menebak hari itu.
            &ldquo;Hujan&rdquo; = ≥0,5 mm dalam 3 jam; peringatan bila peluang ≥{Math.round(f.score.threshold * 100)}%.
            {f.score.bmkg && f.score.bmkg.model && (
              <> Pada {f.score.bmkg.slots} slot yang sama dengan BMKG, model menangkap {f.score.bmkg.model.hits} dari {f.score.bmkg.events} hujan, BMKG {f.score.bmkg.bmkg.hits}.</>
            )}
          </p>
        </Section>

        <div className="border-t border-slate-200/70 px-5 py-4">{footer}</div>
      </div>
    </div>
  );
}
