import { DeviceWithLatestReading } from "@/lib/types";
import { WIND_DIRECTION_LABELS } from "@/lib/config";
import { isDeviceOnline, formatRelativeTime, formatDateTime } from "@/lib/deviceStatus";
import { calcVPD, classifyVPD } from "@/lib/rules/ruleEngine";
import StatusBadge from "./StatusBadge";
import { Thermometer, Droplets, Wind, CloudRain, Compass, Gauge, LucideIcon } from "lucide-react";

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

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold text-slate-900">{device.type}</h2>
        <StatusBadge online={online} />
      </div>

      {latest ? (
        <>
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

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <MetricPill
              icon={CloudRain}
              color="#22D3EE"
              value={`${latest.rainfall.toFixed(1)} mm`}
              label="Curah Hujan"
            />
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
