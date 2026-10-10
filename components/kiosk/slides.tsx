import {
  KioskOverviewSlide,
  KioskWeatherSlide,
  KioskRainSlide,
  KioskAlertSlide,
} from "@/lib/kiosk";
import { TrendPoint } from "@/lib/kioskTrend";
import { formatRelativeTime } from "@/lib/deviceStatus";
import { classifyRssi } from "@/lib/rssiClass";
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
} from "lucide-react";

// Tint latar per slide: netral (default), atau mengikuti tingkat
// keparahan (aman/waspada/kritis) supaya orang yang cuma sekilas lihat
// layar langsung kebaca "aman" vs "ada yang perlu diperhatikan" dari
// warnanya saja, tanpa harus baca teks.
type Tint = "neutral" | "emerald" | "amber" | "rose";

const TINT_BG: Record<Tint, string> = {
  neutral: "from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-950",
  emerald: "from-emerald-50 to-emerald-100 dark:from-emerald-500/10 dark:to-slate-950",
  amber: "from-amber-50 to-amber-100 dark:from-amber-500/10 dark:to-slate-950",
  rose: "from-rose-50 to-rose-100 dark:from-rose-500/10 dark:to-slate-950",
};

export function slideTintClass(tint: Tint): string {
  return `bg-gradient-to-br ${TINT_BG[tint]}`;
}

function OfflinePill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-4 py-1.5 text-sm font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
      <WifiOff size={16} strokeWidth={2.5} />
      Offline
    </span>
  );
}

// ---------------------------------------------------------------------
// 1) Ringkasan
// ---------------------------------------------------------------------
export function OverviewSlide({
  slide,
  tempTrend,
  rainTrend,
}: {
  slide: KioskOverviewSlide;
  // Opsional: grafik tren hanya dirender kalau datanya sudah ada (KioskView
  // mengambilnya terpisah, lebih jarang dari data utama -- lihat
  // lib/kioskTrend.ts). undefined selagi masih dimuat pertama kali.
  tempTrend?: TrendPoint[];
  rainTrend?: TrendPoint[];
}) {
  return (
    // overflow-y-auto: jaga-jaga di layar HP pendek -- dengan 2 grafik tren
    // ditambahkan, kontennya bisa lebih tinggi dari layar. Lebih baik bisa
    // discroll daripada bagian bawah kepotong tak terlihat.
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-6 text-center sm:gap-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
          AWS T4T · Monitoring Mikroklimat
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-50 sm:text-5xl">
          Ringkasan Saat Ini
        </h1>
        <p
          className={`mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold sm:text-base ${
            slide.devicesOnline === slide.devicesTotal && slide.devicesTotal > 0
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
          }`}
        >
          {slide.devicesOnline} dari {slide.devicesTotal} lokasi online
        </p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
        <OverviewTile
          icon={Thermometer}
          color="#FB923C"
          value={slide.avgTemp !== null ? `${slide.avgTemp.toFixed(1)}°C` : "-"}
          label="Rata-rata Suhu"
        />
        <OverviewTile
          icon={Droplets}
          color="#38BDF8"
          value={slide.avgHumidity !== null ? `${slide.avgHumidity.toFixed(0)}%` : "-"}
          label="Rata-rata Kelembaban"
        />
        <OverviewTile
          icon={Wind}
          color="#A78BFA"
          value={slide.avgWind !== null ? `${slide.avgWind.toFixed(1)} m/s` : "-"}
          label="Rata-rata Angin"
        />
        <OverviewTile
          icon={CloudRain}
          color="#22D3EE"
          value={slide.totalRain24h !== null ? `${slide.totalRain24h.toFixed(1)} mm` : "-"}
          label="Hujan 24 Jam"
        />
      </div>

      {/* Tren singkat beberapa jam terakhir -- sekadar rasa arah, bukan
          pengganti grafik lengkap di /dashboard -> Analitik. */}
      {(tempTrend || rainTrend) && (
        <div className="flex w-full max-w-3xl flex-col gap-4 sm:flex-row sm:justify-center sm:gap-10">
          {tempTrend && (
            <div className="flex flex-col items-center gap-1.5 rounded-3xl bg-surface/80 px-5 py-4 shadow-[0_4px_30px_rgba(15,23,42,0.08)] backdrop-blur">
              <p className="text-xs font-semibold text-slate-500">Tren Suhu (6 jam)</p>
              <MiniLineChart points={tempTrend} color="#FB923C" />
            </div>
          )}
          {rainTrend && (
            <div className="flex flex-col items-center gap-1.5 rounded-3xl bg-surface/80 px-5 py-4 shadow-[0_4px_30px_rgba(15,23,42,0.08)] backdrop-blur">
              <p className="text-xs font-semibold text-slate-500">Tren Hujan per Jam (6 jam)</p>
              <MiniBarChart points={rainTrend} color="#22D3EE" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OverviewTile({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: typeof Thermometer;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-surface/80 px-4 py-6 shadow-[0_4px_30px_rgba(15,23,42,0.08)] backdrop-blur">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: color }}
      >
        <Icon size={22} strokeWidth={2.25} />
      </span>
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50 sm:text-3xl">
        {value}
      </p>
      <p className="text-xs font-medium text-slate-400 sm:text-sm">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------
// 2) Cuaca per device
// ---------------------------------------------------------------------
const RISK_LABEL: Record<string, string> = {
  aman: "Aman",
  waspada: "Waspada",
  kritis: "Kritis",
};
const RISK_ICON: Record<string, typeof CheckCircle2> = {
  aman: CheckCircle2,
  waspada: AlertTriangle,
  kritis: AlertOctagon,
};
const RISK_PILL: Record<string, string> = {
  aman: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  waspada: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  kritis: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

export function weatherSlideTint(slide: KioskWeatherSlide): Tint {
  if (!slide.online || !slide.riskLevel) return "neutral";
  if (slide.riskLevel === "kritis") return "rose";
  if (slide.riskLevel === "waspada") return "amber";
  return "emerald";
}

export function WeatherSlide({ slide }: { slide: KioskWeatherSlide }) {
  const RiskIcon = slide.riskLevel ? RISK_ICON[slide.riskLevel] : null;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
          Cuaca · {slide.deviceLabel}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-4xl">
          {slide.deviceLabel}
        </h1>
        <div className="mt-3">{slide.online ? null : <OfflinePill />}</div>
      </div>

      {slide.online && slide.temperature !== null ? (
        <>
          <div>
            <p className="text-7xl font-bold tabular-nums text-slate-900 dark:text-slate-50 sm:text-8xl">
              {slide.temperature.toFixed(1)}
              <span className="text-3xl font-semibold text-slate-400 sm:text-4xl">°C</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
            <MiniStat icon={Droplets} color="#38BDF8" value={`${slide.humidity?.toFixed(0)}%`} label="Kelembaban" />
            <MiniStat
              icon={Wind}
              color="#A78BFA"
              value={`${slide.windSpeed?.toFixed(1)} m/s`}
              label={`Angin (${slide.windLabel})`}
            />
          </div>

          {slide.riskLevel && RiskIcon && (
            <div
              className={`mt-2 flex max-w-xl items-start gap-3 rounded-3xl px-5 py-4 text-left ${RISK_PILL[slide.riskLevel]}`}
            >
              <RiskIcon size={26} strokeWidth={2.25} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-base font-bold sm:text-lg">{RISK_LABEL[slide.riskLevel]}</p>
                <p className="mt-0.5 text-sm leading-snug opacity-90 sm:text-base">
                  {slide.riskExplanation}
                </p>
              </div>
            </div>
          )}

          {slide.lastReadingAt && (
            <p className="text-xs text-slate-400 sm:text-sm">
              Update {formatRelativeTime(slide.lastReadingAt)}
            </p>
          )}
        </>
      ) : (
        <p className="text-base text-slate-500 sm:text-lg">
          Belum ada data cuaca dari lokasi ini.
        </p>
      )}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: typeof Droplets;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-surface/80 px-4 py-2.5 shadow-[0_2px_20px_rgba(15,23,42,0.06)] backdrop-blur">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: color }}
      >
        <Icon size={15} strokeWidth={2.25} />
      </span>
      <div className="text-left">
        <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
        <p className="text-[11px] text-slate-400">{label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 3) Hujan per device
// ---------------------------------------------------------------------
export function rainSlideTint(slide: KioskRainSlide): Tint {
  if (!slide.online) return "neutral";
  if (slide.todayMm !== null && slide.todayMm >= 50) return "amber"; // hujan lebat+, lihat lib/rainfallClass.ts
  return "neutral";
}

export function RainSlide({ slide }: { slide: KioskRainSlide }) {
  const rssiCategory = slide.rssi !== null ? classifyRssi(slide.rssi) : null;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
          Curah Hujan · {slide.deviceLabel}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-4xl">
          {slide.deviceLabel}
        </h1>
        <div className="mt-3">{slide.online ? null : <OfflinePill />}</div>
      </div>

      {slide.online && slide.todayMm !== null ? (
        <>
          <div>
            <p className="text-7xl font-bold tabular-nums text-slate-900 dark:text-slate-50 sm:text-8xl">
              {slide.todayMm.toFixed(1)}
              <span className="text-3xl font-semibold text-slate-400 sm:text-4xl"> mm</span>
            </p>
            <p className="mt-1 text-sm text-slate-400 sm:text-base">Hari ini (sejak 00:00 WIB)</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
            <MiniStat
              icon={CloudRain}
              color="#22D3EE"
              value={`${(slide.hour1Mm ?? 0).toFixed(1)} mm`}
              label="1 Jam Terakhir"
            />
            {rssiCategory && slide.rssi !== null && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-surface/80 px-4 py-2.5 shadow-[0_2px_20px_rgba(15,23,42,0.06)] backdrop-blur">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${rssiCategory.dotClass} text-white`}
                >
                  <Signal size={15} strokeWidth={2.25} />
                </span>
                <div className="text-left">
                  <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-50">
                    {slide.rssi} dBm
                  </p>
                  <p className="text-[11px] text-slate-400">Sinyal {rssiCategory.label}</p>
                </div>
              </div>
            )}
          </div>

          {slide.lastReadingAt && (
            <p className="text-xs text-slate-400 sm:text-sm">
              Update {formatRelativeTime(slide.lastReadingAt)}
            </p>
          )}
        </>
      ) : (
        <p className="text-base text-slate-500 sm:text-lg">
          Belum ada data curah hujan dari lokasi ini.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// 4) Peringatan / gangguan
// ---------------------------------------------------------------------
export function alertSlideTint(slide: KioskAlertSlide): Tint {
  if (slide.issues.length === 0) return "emerald";
  if (slide.issues.some((i) => i.severity === "critical")) return "rose";
  return "amber";
}

export function AlertSlide({ slide }: { slide: KioskAlertSlide }) {
  if (slide.issues.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
        <CheckCircle2 size={72} strokeWidth={1.75} className="text-emerald-500" />
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 sm:text-5xl">
          Semua Normal
        </h1>
        <p className="max-w-md text-sm text-slate-500 sm:text-base">
          Semua lokasi online, kondisi aman, dan sinyal WiFi sensor hujan baik.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-6">
      <div className="text-center">
        <AlertTriangle size={56} strokeWidth={1.75} className="mx-auto text-amber-500" />
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-4xl">
          Perlu Perhatian
        </h1>
      </div>

      <div className="flex w-full max-w-xl flex-col gap-2.5">
        {slide.issues.map((issue, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left ${
              issue.severity === "critical"
                ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            }`}
          >
            {issue.severity === "critical" ? (
              <AlertOctagon size={20} strokeWidth={2.25} className="shrink-0" />
            ) : (
              <AlertTriangle size={20} strokeWidth={2.25} className="shrink-0" />
            )}
            <p className="text-sm font-medium sm:text-base">{issue.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
