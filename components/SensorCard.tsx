import { DeviceWithLatestReading } from "@/lib/types";
import { WIND_DIRECTION_LABELS, CALM_WIND_CODE } from "@/lib/config";
import { isDeviceOnline, formatRelativeTime, formatDateTime } from "@/lib/deviceStatus";
import { calcVPD, classifyVPD, classifyRisk, RiskLevel } from "@/lib/rules/ruleEngine";
import StatusBadge from "./StatusBadge";
import { CARD, iconChipStyle } from "./ui/card";
import {
  Thermometer,
  Droplets,
  Wind,
  Gauge,
  Navigation,
  LucideIcon,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
} from "lucide-react";

// Kartu stasiun cuaca satu lokasi. Curah hujan TIDAK di sini: sensor hujan
// adalah ESP terpisah dengan kartunya sendiri (components/RainfallCard).
// Catatan warna: tanpa dark:text-slate-* (skala slate dibalik otomatis).

const VPD_CLASS_LABEL: Record<string, string> = { rendah: "Rendah", sedang: "Sedang", tinggi: "Tinggi" };
const VPD_CLASS_COLOR: Record<string, string> = { rendah: "#22C55E", sedang: "#F59E0B", tinggi: "#EF4444" };

const RISK_LABEL: Record<RiskLevel, string> = { aman: "Aman", waspada: "Waspada", kritis: "Kritis" };
const RISK_ICON: Record<RiskLevel, LucideIcon> = { aman: CheckCircle2, waspada: AlertTriangle, kritis: AlertOctagon };
const RISK_STYLE: Record<RiskLevel, { box: string; chip: string; bar: string }> = {
  aman: {
    box: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    chip: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  waspada: {
    box: "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200",
    chip: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  kritis: {
    box: "bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-200",
    chip: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
    bar: "bg-rose-500",
  },
};

// Arah angin "dari" -> derajat kompas. Panah digambar menunjuk ke arah angin
// BERTIUP (dari + 180°), seperti panah angin di peta cuaca.
const WIND_DEG: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

function Metric({
  icon: Icon,
  color,
  label,
  children,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/50">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <Icon size={13} style={{ color }} aria-hidden />
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function SensorCard({ device }: { device: DeviceWithLatestReading }) {
  const { latest } = device;
  const online = latest ? isDeviceOnline(latest.created_at) : false;
  const calm = latest?.wind_direction === CALM_WIND_CODE;
  const windLabel = latest ? WIND_DIRECTION_LABELS[latest.wind_direction] ?? latest.wind_direction : "-";
  const windDeg = latest && !calm ? WIND_DEG[latest.wind_direction] : undefined;

  const vpd = latest ? calcVPD(latest.temperature, latest.humidity) : null;
  const vpdClass = vpd !== null ? classifyVPD(vpd) : null;
  const risk = latest ? classifyRisk(latest.temperature, latest.humidity, latest.wind_speed) : null;
  const RiskIcon = risk ? RISK_ICON[risk.level] : null;

  return (
    <div className={`${CARD} flex h-full flex-col p-4 sm:p-5`}>
      {/* Kepala */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={iconChipStyle("#F97316")}>
            <Thermometer size={18} strokeWidth={2.25} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold tracking-tight text-slate-900">{device.type}</h2>
            <p className="truncate text-[11px] text-slate-400">
              Stasiun cuaca{latest ? ` · ${formatRelativeTime(latest.created_at)}` : ""}
            </p>
          </div>
        </div>
        <StatusBadge online={online} />
      </div>

      {latest ? (
        <>
          {/* Angka utama */}
          <div className="mt-4 flex items-end justify-between gap-3">
            <p className="font-extrabold leading-none tracking-tight tabular-nums text-slate-900">
              <span className="text-5xl sm:text-[56px]">{latest.temperature.toFixed(1)}</span>
              <span className="ml-1 align-top text-xl font-bold text-slate-400">°C</span>
            </p>
            {risk && RiskIcon && (
              <span className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${RISK_STYLE[risk.level].chip}`}>
                <RiskIcon size={14} strokeWidth={2.5} aria-hidden />
                {RISK_LABEL[risk.level]}
              </span>
            )}
          </div>

          {/* Metrik pendukung */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric icon={Droplets} color="#0EA5E9" label="Lembab">
              <p className="text-lg font-bold tabular-nums text-slate-900">
                {latest.humidity.toFixed(0)}
                <span className="text-xs font-semibold text-slate-400">%</span>
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200/70">
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, Math.max(0, latest.humidity))}%` }} />
              </div>
            </Metric>
            <Metric icon={Wind} color="#8B5CF6" label="Angin">
              <p className="text-lg font-bold tabular-nums text-slate-900">
                {latest.wind_speed.toFixed(1)}
                <span className="text-xs font-semibold text-slate-400"> m/s</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                {windDeg !== undefined && (
                  <Navigation
                    size={11}
                    className="shrink-0 fill-violet-500 text-violet-500"
                    style={{ transform: `rotate(${windDeg + 180}deg)` }}
                    aria-hidden
                  />
                )}
                <span className="truncate">{calm ? "Tenang" : `dari ${windLabel}`}</span>
              </p>
            </Metric>
            <Metric icon={Gauge} color={vpdClass ? VPD_CLASS_COLOR[vpdClass] : "#94A3B8"} label="VPD">
              <p className="text-lg font-bold tabular-nums text-slate-900">
                {vpd !== null ? vpd.toFixed(2) : "–"}
                <span className="text-xs font-semibold text-slate-400"> kPa</span>
              </p>
              {vpdClass && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: VPD_CLASS_COLOR[vpdClass] }} aria-hidden />
                  {VPD_CLASS_LABEL[vpdClass]}
                </p>
              )}
            </Metric>
          </div>

          {/* Kesimpulan dalam bahasa awam (classifyRisk di ruleEngine.ts) */}
          {risk && (
            <div className={`relative mt-3 overflow-hidden rounded-2xl py-2.5 pl-4 pr-3 ${RISK_STYLE[risk.level].box}`}>
              <span className={`absolute inset-y-0 left-0 w-1 ${RISK_STYLE[risk.level].bar}`} aria-hidden />
              <p className="text-xs leading-relaxed">{risk.explanation}</p>
            </div>
          )}

          <p className="mt-auto pt-3 text-[11px] text-slate-400">Update terakhir {formatDateTime(latest.created_at)}</p>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Belum ada data sensor.</p>
      )}
    </div>
  );
}
