import { KioskBoard as KioskBoardData, KioskDeviceCard, KioskIssue } from "@/lib/kiosk";
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

// ⚠️ CATATAN WARNA: di proyek ini skala warna `slate` SENGAJA DIBALIK untuk
// mode gelap (lihat app/globals.css) -- `text-slate-900` SUDAH otomatis
// jadi terang di mode gelap karena variabel CSS-nya yang berganti, BUKAN
// lewat modifier `dark:`. Menambahkan `dark:text-slate-50` di atasnya
// (seperti yang sempat dilakukan di versi kiosk sebelumnya) justru
// memakai warna GELAP di mode gelap (karena --slate-50 ikut dibalik jadi
// gelap juga) -- itu sebabnya sebelumnya teks jadi nyaris tak kelihatan.
// Jadi di file ini: TIDAK ADA `dark:text-slate-*` / `dark:bg-slate-900`
// dkk, sama seperti pola di SensorCard.tsx / RainfallCard.tsx.

type Tint = "neutral" | "emerald" | "amber" | "rose";

const CARD_TINT: Record<Tint, string> = {
  neutral: "bg-surface",
  emerald: "bg-emerald-50 dark:bg-emerald-500/10",
  amber: "bg-amber-50 dark:bg-amber-500/10",
  rose: "bg-rose-50 dark:bg-rose-500/10",
};

function deviceTint(d: KioskDeviceCard): Tint {
  if (d.issues.some((i) => i.severity === "critical")) return "rose";
  if (d.issues.length > 0) return "amber";
  return "emerald";
}

function OfflinePill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
      <WifiOff size={12} strokeWidth={2.5} />
      Offline
    </span>
  );
}

function StatTile({
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
    <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-[0_2px_20px_rgba(15,23,42,0.06)]">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: color }}
      >
        <Icon size={18} strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold tabular-nums text-slate-900">{value}</p>
        <p className="truncate text-[11px] text-slate-400">{label}</p>
      </div>
    </div>
  );
}

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

function DeviceCard({ device }: { device: KioskDeviceCard }) {
  const RiskIcon = device.riskLevel ? RISK_ICON[device.riskLevel] : null;
  const rssiCategory = device.rssi !== null ? classifyRssi(device.rssi) : null;

  return (
    <div className={`flex flex-col gap-3 rounded-3xl p-4 shadow-[0_2px_24px_rgba(15,23,42,0.06)] sm:p-5 ${CARD_TINT[deviceTint(device)]}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900 sm:text-lg">{device.deviceLabel}</h2>
        {device.issues.length === 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <CheckCircle2 size={12} strokeWidth={2.5} />
            Normal
          </span>
        ) : (
          !device.weatherOnline &&
          !device.rainOnline && <OfflinePill />
        )}
      </div>

      {/* ---- Cuaca ---- */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface/70 px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: "#FB923C" }}>
            <Thermometer size={16} strokeWidth={2.25} />
          </span>
          <div>
            {device.weatherOnline && device.temperature !== null ? (
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                {device.temperature.toFixed(1)}
                <span className="text-sm font-semibold text-slate-400">°C</span>
              </p>
            ) : (
              <OfflinePill />
            )}
            <p className="text-[11px] text-slate-400">Suhu</p>
          </div>
        </div>
        {device.weatherOnline && device.humidity !== null && (
          <div className="flex items-center gap-1.5 text-right">
            <Droplets size={14} strokeWidth={2.25} className="text-sky-500" />
            <span className="text-sm font-semibold tabular-nums text-slate-700">
              {device.humidity.toFixed(0)}%
            </span>
          </div>
        )}
        {device.weatherOnline && device.windSpeed !== null && (
          <div className="flex items-center gap-1.5 text-right">
            <Wind size={14} strokeWidth={2.25} className="text-violet-500" />
            <span className="text-sm font-semibold tabular-nums text-slate-700">
              {device.windSpeed.toFixed(1)} m/s
            </span>
          </div>
        )}
      </div>

      {device.riskLevel && RiskIcon && (
        <div className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-left ${RISK_PILL[device.riskLevel]}`}>
          <RiskIcon size={18} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold">{RISK_LABEL[device.riskLevel]}</p>
            <p className="text-xs leading-snug opacity-90">{device.riskExplanation}</p>
          </div>
        </div>
      )}

      {/* ---- Hujan ---- */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface/70 px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: "#22D3EE" }}>
            <CloudRain size={16} strokeWidth={2.25} />
          </span>
          <div>
            {device.rainOnline && device.todayMm !== null ? (
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                {device.todayMm.toFixed(1)}
                <span className="text-sm font-semibold text-slate-400"> mm</span>
              </p>
            ) : (
              <OfflinePill />
            )}
            <p className="text-[11px] text-slate-400">Hujan hari ini</p>
          </div>
        </div>
        {rssiCategory && device.rssi !== null && (
          <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1">
            <Signal size={14} strokeWidth={2.25} className={rssiCategory.dotClass.replace("bg-", "text-")} />
            <span className="text-xs font-semibold tabular-nums text-slate-700">
              {device.rssi} dBm · {rssiCategory.label}
            </span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        {device.weatherLastReadingAt
          ? `Cuaca update ${formatRelativeTime(device.weatherLastReadingAt)}`
          : "Belum ada data cuaca"}
        {" · "}
        {device.rainLastReadingAt
          ? `Hujan update ${formatRelativeTime(device.rainLastReadingAt)}`
          : "belum ada data hujan"}
      </p>
    </div>
  );
}

function IssueBanner({ issues }: { issues: KioskIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-100 px-4 py-2.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        <CheckCircle2 size={18} strokeWidth={2.25} className="shrink-0" />
        <p className="text-sm font-semibold">Semua lokasi normal -- tidak ada gangguan.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {issues.map((issue, i) => (
        <div
          key={i}
          className={`flex items-center gap-2.5 rounded-2xl px-4 py-2 text-left ${
            issue.severity === "critical"
              ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
          }`}
        >
          {issue.severity === "critical" ? (
            <AlertOctagon size={16} strokeWidth={2.25} className="shrink-0" />
          ) : (
            <AlertTriangle size={16} strokeWidth={2.25} className="shrink-0" />
          )}
          <p className="text-sm font-medium">{issue.message}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Papan kiosk SATU LAYAR PENUH -- semua info (ringkasan, tren, tiap
 * lokasi, dan peringatan) tampil sekaligus, tidak digeser otomatis.
 * Data tetap segar sendiri lewat polling di KioskView.tsx.
 */
export default function KioskBoard({
  board,
  tempTrend,
  rainTrend,
}: {
  board: KioskBoardData;
  tempTrend?: TrendPoint[];
  rainTrend?: TrendPoint[];
}) {
  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
      {/* ---------- Ringkasan ---------- */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Ringkasan Saat Ini</h1>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${
              board.devicesOnline === board.devicesTotal && board.devicesTotal > 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            }`}
          >
            {board.devicesOnline} dari {board.devicesTotal} lokasi online
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <StatTile
            icon={Thermometer}
            color="#FB923C"
            value={board.avgTemp !== null ? `${board.avgTemp.toFixed(1)}°C` : "-"}
            label="Rata-rata Suhu"
          />
          <StatTile
            icon={Droplets}
            color="#38BDF8"
            value={board.avgHumidity !== null ? `${board.avgHumidity.toFixed(0)}%` : "-"}
            label="Rata-rata Kelembaban"
          />
          <StatTile
            icon={Wind}
            color="#A78BFA"
            value={board.avgWind !== null ? `${board.avgWind.toFixed(1)} m/s` : "-"}
            label="Rata-rata Angin"
          />
          <StatTile
            icon={CloudRain}
            color="#22D3EE"
            value={board.totalRain24h !== null ? `${board.totalRain24h.toFixed(1)} mm` : "-"}
            label="Hujan 24 Jam"
          />
        </div>

        {(tempTrend || rainTrend) && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {tempTrend && (
              <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface px-4 py-3 shadow-[0_2px_20px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold text-slate-500">Tren Suhu (6 jam)</p>
                <MiniLineChart points={tempTrend} color="#FB923C" />
              </div>
            )}
            {rainTrend && (
              <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface px-4 py-3 shadow-[0_2px_20px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold text-slate-500">Tren Hujan per Jam (6 jam)</p>
                <MiniBarChart points={rainTrend} color="#22D3EE" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------- Peringatan / gangguan ---------- */}
      <IssueBanner issues={board.issues} />

      {/* ---------- Kartu per lokasi ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {board.devices.map((d) => (
          <DeviceCard key={d.deviceLabel} device={d} />
        ))}
      </div>
    </div>
  );
}
