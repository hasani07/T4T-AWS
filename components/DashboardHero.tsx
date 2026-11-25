"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudRain, Droplets, Thermometer, Tv, Wind, Sparkles, CheckCircle2 } from "lucide-react";
import BrandLogo from "./BrandLogo";
import { CARD, iconChipStyle } from "./ui/card";

// Bagian paling atas Dashboard: identitas (logo), sapaan + jam besar, status
// alat, satu kalimat "apa yang perlu diketahui sekarang" (dari prediksi), dan
// empat angka ringkasan. Menggantikan logo polos + jam + 4 pil terpisah.
// Catatan warna: tanpa dark:text-slate-* (skala slate dibalik otomatis).

export interface HeroHeadline {
  tone: "ok" | "info" | "warn" | "alert";
  text: string;
}

const HEADLINE_STYLE: Record<HeroHeadline["tone"], string> = {
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  info: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  warn: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  alert: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

function greetingFor(hourWib: number): string {
  if (hourWib < 4) return "Selamat malam";
  if (hourWib < 11) return "Selamat pagi";
  if (hourWib < 15) return "Selamat siang";
  if (hourWib < 18) return "Selamat sore";
  return "Selamat malam";
}

function useWibNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function StatTile({
  icon: Icon,
  color,
  value,
  unit,
  label,
  shortLabel,
}: {
  icon: typeof Thermometer;
  color: string;
  value: string;
  unit?: string;
  label: string;
  shortLabel: string; // dipakai di layar HP supaya tidak terpotong
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-50/80 p-3.5 ring-1 ring-slate-200/50 sm:p-4">
      <span
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.14] blur-xl"
        style={{ background: color }}
        aria-hidden
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white sm:h-11 sm:w-11" style={iconChipStyle(color)}>
          <Icon size={18} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold tracking-tight tabular-nums text-slate-900 sm:text-2xl">
            {value}
            {unit && <span className="ml-0.5 text-sm font-semibold text-slate-400">{unit}</span>}
          </p>
          <p className="truncate text-[11px] font-medium text-slate-500 sm:text-xs">
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardHero({
  devicesOnline,
  devicesTotal,
  avgTemp,
  avgHumidity,
  avgWind,
  rain24h,
  headline,
  locations,
}: {
  devicesOnline: number; // jumlah ALAT online (cuaca + hujan dihitung terpisah)
  devicesTotal: number;
  avgTemp: number | null;
  avgHumidity: number | null;
  avgWind: number | null;
  rain24h: number | null;
  headline: HeroHeadline | null;
  locations: string[];
}) {
  const now = useWibNow();
  const hourWib = now ? Number(now.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" })) : null;
  const timeStr = now?.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) ?? "--.--";
  const secStr = now ? String(now.getSeconds()).padStart(2, "0") : "--";
  const dateStr =
    now?.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }) ?? "";
  const allOnline = devicesOnline === devicesTotal && devicesTotal > 0;
  const locText =
    locations.length > 1 ? `${locations.slice(0, -1).join(", ")} & ${locations[locations.length - 1]}` : locations[0] ?? "";

  return (
    <section className={`relative overflow-hidden ${CARD} p-4 sm:p-6 lg:p-7`}>
      {/* Hiasan latar: rona warna merek (tosca) + biru langit, sangat halus */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="absolute -left-20 bottom-[-7rem] h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.12]"
          style={{
            backgroundImage: "radial-gradient(rgb(var(--slate-300)) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
            maskImage: "linear-gradient(to bottom left, black, transparent 55%)",
            WebkitMaskImage: "linear-gradient(to bottom left, black, transparent 55%)",
          }}
        />
      </div>

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        {/* Kiri: logo, sapaan, status */}
        <div className="flex min-w-0 items-start gap-4">
          <BrandLogo className="h-14 w-auto shrink-0 sm:h-16" />
          <div className="min-w-0 pt-0.5">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl lg:text-[28px]">
              {hourWib !== null ? greetingFor(hourWib) : "Halo"}
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Pantauan mikroklimat {locText} secara langsung.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  allOnline ? HEADLINE_STYLE.ok : HEADLINE_STYLE.warn
                }`}
              >
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${allOnline ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${allOnline ? "bg-emerald-500" : "bg-amber-500"}`} />
                </span>
                {devicesOnline} dari {devicesTotal} alat online
              </span>
              {headline && (
                <span className={`inline-flex max-w-full items-start gap-1.5 rounded-2xl px-2.5 py-1 text-[11px] font-semibold leading-snug ${HEADLINE_STYLE[headline.tone]}`}>
                  {headline.tone === "ok" ? (
                    <CheckCircle2 size={12} className="mt-[2px] shrink-0" aria-hidden />
                  ) : (
                    <Sparkles size={12} className="mt-[2px] shrink-0" aria-hidden />
                  )}
                  <span>{headline.text}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Kanan: jam besar + mode kiosk */}
        <div className="flex items-end justify-between gap-3 lg:flex-col lg:items-end">
          <div className="lg:text-right" aria-live="off">
            <p className="font-extrabold leading-none tracking-tight tabular-nums text-slate-900">
              <span className="text-3xl sm:text-4xl lg:text-5xl">{timeStr}</span>
              <span className="ml-1 text-base text-slate-400 sm:text-lg">:{secStr}</span>
              <span className="ml-1.5 text-xs font-bold text-teal-600 dark:text-teal-400 sm:text-sm">WIB</span>
            </p>
            <p className="mt-1.5 text-xs capitalize text-slate-500 sm:text-sm">{dateStr}</p>
          </div>
          <Link
            href="/kiosk"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-2 text-xs font-semibold text-on-strong shadow-sm transition hover:bg-slate-800"
          >
            <Tv size={14} strokeWidth={2.25} aria-hidden />
            Mode Kiosk
          </Link>
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatTile icon={Thermometer} color="#F97316" value={avgTemp !== null ? avgTemp.toFixed(1) : "–"} unit="°C" label="Rata-rata suhu" shortLabel="Suhu" />
        <StatTile icon={Droplets} color="#0EA5E9" value={avgHumidity !== null ? avgHumidity.toFixed(0) : "–"} unit="%" label="Rata-rata kelembaban" shortLabel="Kelembaban" />
        <StatTile icon={Wind} color="#8B5CF6" value={avgWind !== null ? avgWind.toFixed(1) : "–"} unit="m/s" label="Rata-rata angin" shortLabel="Angin" />
        <StatTile icon={CloudRain} color="#06B6D4" value={rain24h !== null ? rain24h.toFixed(1) : "–"} unit="mm" label="Total hujan 24 jam" shortLabel="Hujan 24 jam" />
      </div>
    </section>
  );
}
