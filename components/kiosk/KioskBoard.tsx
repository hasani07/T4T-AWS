import { KioskBoard as KioskBoardData, KioskDeviceCard, KioskIssue } from "@/lib/kiosk";
import { TrendPoint } from "@/lib/kioskTrend";
import { formatRelativeTime } from "@/lib/deviceStatus";
import { classifyRssi } from "@/lib/rssiClass";
import type { LocationForecast } from "@/lib/forecast/predict";
import { LEVELS } from "@/components/forecast/levels";
import { MiniLineChart, MiniBarChart } from "./MiniTrendChart";
import {
  Thermometer,
  Droplets,
  Wind,
  CloudRain,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Signal,
  WifiOff,
  Sparkles,
} from "lucide-react";

// =====================================================================
// Papan kiosk -- RESPONSIF:
//   * Laptop/TV (lebar >= lg): SATU LAYAR PENUH tanpa scroll. Ukuran huruf,
//     ikon, dan jarak memakai clamp(...vh...) sehingga ikut TINGGI layar:
//     muat di laptop 1366x768 dan tetap besar terbaca di TV 1080p/4K.
//   * HP/tablet (di bawah lg): halaman bisa digulir biasa, ukuran tetap.
// Tata letak lg: [angka ringkasan] di atas, lalu [kartu per lokasi ...] +
// [kolom samping: peringatan, tren suhu, tren hujan].
//
// ⚠️ WARNA: skala `slate` dibalik otomatis di mode gelap (app/globals.css),
// jadi di sini TIDAK ADA dark:text-slate-* / dark:bg-slate-*.
// =====================================================================

const CARD =
  "rounded-3xl bg-surface ring-1 ring-slate-200/60 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_28px_rgba(15,23,42,0.06)]";

// Ukuran yang ikut tinggi layar di lg ke atas (lihat catatan di atas).
const T = {
  hero: "text-5xl lg:text-[clamp(2.4rem,7.2vh,6rem)]",
  big: "text-2xl lg:text-[clamp(1.25rem,3.4vh,2.75rem)]",
  mid: "text-base lg:text-[clamp(0.9rem,2.1vh,1.6rem)]",
  small: "text-xs lg:text-[clamp(0.7rem,1.45vh,1.05rem)]",
  pad: "p-4 lg:p-[clamp(0.85rem,2.1vh,1.75rem)]",
  gap: "gap-3 lg:gap-[clamp(0.6rem,1.6vh,1.25rem)]",
  icon: "h-10 w-10 lg:h-[clamp(2.2rem,5vh,3.75rem)] lg:w-[clamp(2.2rem,5vh,3.75rem)]",
};

function chip(color: string): React.CSSProperties {
  return { background: `linear-gradient(135deg, ${color}, ${color}cc)`, boxShadow: `0 6px 16px ${color}40` };
}

const RISK = {
  aman: { label: "Aman", Icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200", bar: "bg-emerald-500" },
  waspada: { label: "Waspada", Icon: AlertTriangle, cls: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200", bar: "bg-amber-500" },
  kritis: { label: "Kritis", Icon: AlertOctagon, cls: "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200", bar: "bg-rose-500" },
} as const;

function StatTile({ icon: Icon, color, value, unit, label, shortLabel }: { icon: typeof Thermometer; color: string; value: string; unit: string; label: string; shortLabel: string }) {
  return (
    <div className={`${CARD} flex items-center ${T.gap} ${T.pad}`}>
      <span className={`flex shrink-0 items-center justify-center rounded-2xl text-white ${T.icon}`} style={chip(color)}>
        <Icon className="h-1/2 w-1/2" strokeWidth={2.25} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className={`truncate font-extrabold leading-tight tracking-tight tabular-nums text-slate-900 ${T.big}`}>
          {value}
          <span className="ml-1 text-[0.55em] font-bold text-slate-400">{unit}</span>
        </p>
        <p className={`truncate text-slate-500 ${T.small}`}>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
      </div>
    </div>
  );
}

function Offline() {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 ${T.small}`}>
      <WifiOff className="h-[1.1em] w-[1.1em]" aria-hidden /> Offline
    </span>
  );
}

function DeviceCard({ d, forecast }: { d: KioskDeviceCard; forecast: LocationForecast | null }) {
  const risk = d.riskLevel ? RISK[d.riskLevel] : null;
  const rssi = d.rssi !== null ? classifyRssi(d.rssi) : null;
  const lv = forecast?.rain.level ? LEVELS[forecast.rain.level] : null;
  const hasCritical = d.issues.some((i) => i.severity === "critical");

  return (
    <div className={`${CARD} relative flex min-h-0 flex-col overflow-hidden ${T.pad} ${T.gap}`}>
      <span
        className={`absolute inset-x-0 top-0 h-1 ${hasCritical ? "bg-rose-500" : d.issues.length ? "bg-amber-500" : "bg-emerald-500"}`}
        aria-hidden
      />
      {/* Kepala */}
      <div className="flex items-center justify-between gap-2">
        <h2 className={`truncate font-extrabold tracking-tight text-slate-900 ${T.big}`}>{d.deviceLabel}</h2>
        {d.issues.length === 0 ? (
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 ${T.small}`}>
            <CheckCircle2 className="h-[1.1em] w-[1.1em]" aria-hidden /> Normal
          </span>
        ) : (
          !d.weatherOnline && !d.rainOnline && <Offline />
        )}
      </div>

      {/* Cuaca -- flex-1: kotak suhu & hujan ikut memanjang mengisi sisa tinggi kartu */}
      <div className={`flex flex-1 items-center justify-between ${T.gap} rounded-2xl bg-slate-50 ring-1 ring-slate-200/50 ${T.pad}`}>
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 font-medium text-slate-500 ${T.small}`}>
            <Thermometer className="h-[1.1em] w-[1.1em] text-orange-500" aria-hidden /> Suhu
          </p>
          {d.weatherOnline && d.temperature !== null ? (
            <p className={`font-extrabold leading-none tracking-tight tabular-nums text-slate-900 ${T.hero}`}>
              {d.temperature.toFixed(1)}
              <span className="ml-1 align-top text-[0.4em] font-bold text-slate-400">°C</span>
            </p>
          ) : (
            <Offline />
          )}
        </div>
        {d.weatherOnline && (
          <div className={`flex shrink-0 flex-col items-end ${T.gap} ${T.mid}`}>
            {d.humidity !== null && (
              <span className="flex items-center gap-1.5 font-bold tabular-nums text-slate-700">
                <Droplets className="h-[1em] w-[1em] text-sky-500" aria-hidden /> {d.humidity.toFixed(0)}%
              </span>
            )}
            {d.windSpeed !== null && (
              <span className="flex items-center gap-1.5 font-bold tabular-nums text-slate-700">
                <Wind className="h-[1em] w-[1em] text-violet-500" aria-hidden /> {d.windSpeed.toFixed(1)} m/s
              </span>
            )}
          </div>
        )}
      </div>

      {/* Prediksi hujan 3 jam (dari model, kalau ada) */}
      {forecast && forecast.rain.prob !== null && lv && (
        <div
          className={`flex items-center justify-between ${T.gap} rounded-2xl ring-1 ring-slate-200/50 ${T.pad}`}
          style={{ background: `linear-gradient(120deg, ${lv.color}22, ${lv.color}08)` }}
        >
          <div className="min-w-0">
            <p className={`flex items-center gap-1.5 font-medium text-slate-500 ${T.small}`}>
              <Sparkles className="h-[1.1em] w-[1.1em] text-violet-500" aria-hidden /> Peluang hujan {forecast.rain.windowLabel}
            </p>
            <p className={`truncate font-bold text-slate-900 ${T.mid}`}>{lv.label}</p>
          </div>
          <p className={`shrink-0 font-extrabold tabular-nums ${T.big}`} style={{ color: lv.color }}>
            {Math.round(forecast.rain.prob * 100)}%
          </p>
        </div>
      )}

      {/* Hujan */}
      <div className={`flex flex-1 items-center justify-between ${T.gap} rounded-2xl bg-slate-50 ring-1 ring-slate-200/50 ${T.pad}`}>
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 font-medium text-slate-500 ${T.small}`}>
            <CloudRain className="h-[1.1em] w-[1.1em] text-cyan-500" aria-hidden /> Hujan hari ini
          </p>
          {d.rainOnline && d.todayMm !== null ? (
            <p className={`font-extrabold leading-none tracking-tight tabular-nums text-slate-900 ${T.hero}`}>
              {d.todayMm.toFixed(1)}
              <span className="ml-1 text-[0.4em] font-bold text-slate-400">mm</span>
            </p>
          ) : (
            <Offline />
          )}
        </div>
        {rssi && d.rssi !== null && (
          <span className={`flex shrink-0 items-center gap-1.5 font-semibold tabular-nums text-slate-600 ${T.small}`}>
            <Signal className={`h-[1.2em] w-[1.2em] ${rssi.dotClass.replace("bg-", "text-")}`} aria-hidden />
            {d.rssi} dBm · {rssi.label}
          </span>
        )}
      </div>

      {/* Kesimpulan risiko */}
      {risk && (
        <div className={`relative flex items-start gap-2.5 overflow-hidden rounded-2xl pl-4 ${T.pad} ${risk.cls}`}>
          <span className={`absolute inset-y-0 left-0 w-1 ${risk.bar}`} aria-hidden />
          <risk.Icon className="mt-[0.15em] h-[1.3em] w-[1.3em] shrink-0" aria-hidden />
          <p className={`min-w-0 leading-snug ${T.small}`}>
            <b className="font-bold">{risk.label}</b> — {d.riskExplanation}
          </p>
        </div>
      )}

      <p className={`text-slate-400 ${T.small}`}>
        {d.weatherLastReadingAt ? `Cuaca ${formatRelativeTime(d.weatherLastReadingAt)}` : "Belum ada data cuaca"}
        {" · "}
        {d.rainLastReadingAt ? `hujan ${formatRelativeTime(d.rainLastReadingAt)}` : "belum ada data hujan"}
      </p>
    </div>
  );
}

function Issues({ issues }: { issues: KioskIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className={`flex items-center gap-2.5 rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20 ${T.pad}`}>
        <CheckCircle2 className="h-[1.3em] w-[1.3em] shrink-0" aria-hidden />
        <p className={`font-semibold ${T.mid}`}>Semua lokasi normal</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {issues.slice(0, 4).map((issue, i) => {
        const critical = issue.severity === "critical";
        const Icon = critical ? AlertOctagon : AlertTriangle;
        return (
          <div
            key={i}
            className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 ${
              critical
                ? "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"
                : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
            }`}
          >
            <Icon className="mt-[0.15em] h-[1.2em] w-[1.2em] shrink-0" aria-hidden />
            <p className={`font-medium leading-snug ${T.small}`}>{issue.message}</p>
          </div>
        );
      })}
      {issues.length > 4 && <p className={`text-slate-400 ${T.small}`}>+{issues.length - 4} peringatan lain</p>}
    </div>
  );
}

export default function KioskBoard({
  board,
  tempTrend,
  rainTrend,
  forecasts,
}: {
  board: KioskBoardData;
  tempTrend?: TrendPoint[];
  rainTrend?: TrendPoint[];
  forecasts: LocationForecast[];
}) {
  const n = Math.max(1, board.devices.length);
  return (
    <div className={`flex h-full min-h-0 flex-col ${T.gap}`}>
      {/* Angka ringkasan */}
      <div className={`grid shrink-0 grid-cols-2 ${T.gap} lg:grid-cols-4`}>
        <StatTile icon={Thermometer} color="#F97316" value={board.avgTemp !== null ? board.avgTemp.toFixed(1) : "–"} unit="°C" label="Rata-rata suhu" shortLabel="Suhu" />
        <StatTile icon={Droplets} color="#0EA5E9" value={board.avgHumidity !== null ? board.avgHumidity.toFixed(0) : "–"} unit="%" label="Rata-rata kelembaban" shortLabel="Kelembaban" />
        <StatTile icon={Wind} color="#8B5CF6" value={board.avgWind !== null ? board.avgWind.toFixed(1) : "–"} unit="m/s" label="Rata-rata angin" shortLabel="Angin" />
        <StatTile icon={CloudRain} color="#06B6D4" value={board.totalRain24h !== null ? board.totalRain24h.toFixed(1) : "–"} unit="mm" label="Hujan 24 jam" shortLabel="Hujan 24 jam" />
      </div>

      {/* Lokasi + kolom samping. Di lg: kolom lokasi berbagi rata, kolom
          samping ~0.8 lebar satu lokasi; semuanya mengisi sisa tinggi layar. */}
      {/* Kolom grid lg ditulis sebagai CSS biasa (jumlah lokasi dinamis),
          bukan kelas arbitrer Tailwind -- supaya pasti terbentuk. */}
      <style>{`@media (min-width:1024px){.kiosk-grid{grid-template-columns:repeat(${n},minmax(0,1fr)) minmax(0,0.85fr)}.kiosk-side{grid-column:auto}}`}</style>
      <div className={`kiosk-grid grid min-h-0 flex-1 grid-cols-1 ${T.gap} md:grid-cols-2`}>
        {board.devices.map((d) => (
          <DeviceCard key={d.deviceLabel} d={d} forecast={forecasts.find((f) => f.label === d.deviceLabel) ?? null} />
        ))}

        <div className={`kiosk-side flex min-h-0 flex-col ${T.gap} md:col-span-2`}>
          <Issues issues={board.issues} />
          {tempTrend && (
            <div className={`${CARD} flex min-h-0 flex-1 flex-col ${T.pad}`}>
              <p className={`font-semibold text-slate-700 ${T.small}`}>Tren suhu · 6 jam</p>
              <MiniLineChart points={tempTrend} color="#F97316" fill />
            </div>
          )}
          {rainTrend && (
            <div className={`${CARD} flex min-h-0 flex-1 flex-col ${T.pad}`}>
              <p className={`font-semibold text-slate-700 ${T.small}`}>Hujan per jam · 6 jam</p>
              <MiniBarChart points={rainTrend} color="#06B6D4" fill />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
