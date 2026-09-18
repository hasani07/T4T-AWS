import { DeviceWithLatestReading } from "@/lib/types";
import { WIND_DIRECTION_LABELS } from "@/lib/config";
import { isDeviceOnline, formatRelativeTime } from "@/lib/deviceStatus";
import StatusBadge from "./StatusBadge";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold text-slate-900">{device.type}</h2>
        <StatusBadge online={online} />
      </div>

      {latest ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Metric label="Suhu" value={`${latest.temperature.toFixed(1)} °C`} />
            <Metric label="Kelembaban" value={`${latest.humidity.toFixed(0)} %`} />
            <Metric
              label="Kecepatan Angin"
              value={`${latest.wind_speed.toFixed(1)} m/s`}
            />
            <Metric label="Arah Angin" value={windLabel} />
            <Metric label="Curah Hujan" value={`${latest.rainfall.toFixed(1)} mm`} />
          </dl>
          <p className="mt-4 text-xs text-slate-400">
            Update terakhir: {formatRelativeTime(latest.created_at)}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Belum ada data sensor.</p>
      )}
    </div>
  );
}
