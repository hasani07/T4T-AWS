import { DeviceWithLatestReading } from "@/lib/types";
import { WIND_DIRECTION_LABELS } from "@/lib/config";
import { isDeviceOnline, formatRelativeTime, formatDateTime } from "@/lib/deviceStatus";
import { calcVPD, classifyVPD, classifyRisk, RiskLevel } from "@/lib/rules/ruleEngine";
import StatusBadge from "./StatusBadge";
import {
  Thermometer,
  Droplets,
  Wind,
  Compass,
  Gauge,
  LucideIcon,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
} from "lucide-react";

const VPD_CLASS_LABEL: Record<string, string> = {
  rendah: "Rendah",
  sedang: "Sedang",
  tinggi: "Tinggi",
};

const VPD_CLASS_COLOR: Record<string, string> = {
  rendah: "#22C55E",
  sedang: "#F59E0B",
  tinggi: "#EF4444",
};

// Terjemahan level risiko (dari classifyRisk() di ruleEngine.ts) jadi badge
// yang orang awam langsung paham tanpa perlu ngerti angka VPD/kPa-nya.
const RISK_LABEL: Record<RiskLevel, string> = {
  aman: "Aman",
  waspada: "Waspada",
  kritis: "Kritis",
};

const RISK_ICON: Record<RiskLevel, LucideIcon> = {
  aman: CheckCircle2,
  waspada: AlertTriangle,
  kritis: AlertOctagon,
};

const RISK_STYLE: Record<RiskLevel, string> = {
  aman: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  waspada: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  kritis: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

function MetricPill({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: LucideIcon;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: color }}
      >
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export default function SensorCard({
  device,
}: {
  device: DeviceWithLatestReading;
}) {
  const { latest } = device;
  const online = latest ? isDeviceOnline(latest.created_at) : false;
  const windLabel = latest
    ? WIND_DIRECTION_LABELS[latest.wind_direction] ?? latest.wind_direction
    : "-";

  const vpd = latest ? calcVPD(latest.temperature, latest.humidity) : null;
  const vpdClass = vpd !== null ? classifyVPD(vpd) : null;
  const risk = latest
    ? classifyRisk(latest.temperature, latest.humidity, latest.wind_speed)
    : null;
  const RiskIcon = risk ? RISK_ICON[risk.level] : null;

  return (
    <div className="rounded-3xl bg-surface p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold text-slate-900">{device.type}</h2>
        <StatusBadge online={online} />
      </div>

      {latest ? (
        <>
          {/* Kesimpulan "harus ngapain" dalam bahasa awam, diturunkan dari
              classifyRisk() di ruleEngine.ts -- jadi orang tidak perlu ngerti
              angka VPD/kPa dulu buat tahu situasinya aman/waspada/kritis. */}
          {risk && RiskIcon && (
            <div
              className={`mt-4 flex items-start gap-2.5 rounded-2xl px-3.5 py-3 ${RISK_STYLE[risk.level]}`}
            >
              <RiskIcon size={18} strokeWidth={2.25} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{RISK_LABEL[risk.level]}</p>
                <p className="mt-0.5 text-xs leading-snug opacity-90">
                  {risk.explanation}
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <MetricPill
              icon={Thermometer}
              color="#FB923C"
              value={`${latest.temperature.toFixed(1)}°C`}
              label="Suhu"
            />
            <MetricPill
              icon={Droplets}
              color="#38BDF8"
              value={`${latest.humidity.toFixed(0)}%`}
              label="Kelembaban"
            />
            <MetricPill
              icon={Wind}
              color="#A78BFA"
              value={`${latest.wind_speed.toFixed(1)} m/s`}
              label="Kec. Angin"
            />
            <MetricPill
              icon={Compass}
              color="#F472B6"
              value={windLabel}
              label="Arah Angin"
            />
          </div>

          {/* Curah hujan TIDAK ditampilkan di kartu ini: sensor hujan adalah
              ESP terpisah dengan kartunya sendiri (components/RainfallCard). */}
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            {vpd !== null && vpdClass && (
              <MetricPill
                icon={Gauge}
                color={VPD_CLASS_COLOR[vpdClass]}
                value={`${vpd.toFixed(2)} kPa`}
                label={`VPD (${VPD_CLASS_LABEL[vpdClass]})`}
              />
            )}
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Update terakhir: {formatDateTime(latest.created_at)} ·{" "}
            {formatRelativeTime(latest.created_at)}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Belum ada data sensor.</p>
      )}
    </div>
  );
}
