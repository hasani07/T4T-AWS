import { DeviceRainfall } from "@/lib/types";
import { RAINFALL_OFFLINE_THRESHOLD_MINUTES } from "@/lib/config";
import {
  isDeviceOnline,
  formatRelativeTime,
  formatDateTime,
} from "@/lib/deviceStatus";
import { classifyDailyRain, classifyHourlyRain } from "@/lib/rainfallClass";
import StatusBadge from "./StatusBadge";
import RainCategoryBadge from "./RainCategoryBadge";
import { CloudRain } from "lucide-react";

function fmtMm(value: number): string {
  return value.toFixed(1);
}

function AccumulationCell({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl px-3 py-2.5 ${
        highlight ? "bg-cyan-50" : "bg-slate-50"
      }`}
    >
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
        {fmtMm(value)}{" "}
        <span className="text-xs font-normal text-slate-400">mm</span>
      </p>
    </div>
  );
}

function CategoryRow({
  title,
  value,
  category,
}: {
  title: string;
  value: string;
  category: ReturnType<typeof classifyDailyRain>;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{title}</p>
        <p className="text-sm font-semibold tabular-nums text-slate-900">{value}</p>
      </div>
      <RainCategoryBadge category={category} />
    </div>
  );
}

/**
 * Kartu curah hujan untuk satu lokasi. Terpisah dari kartu cuaca karena
 * sensor hujan adalah ESP tersendiri (tabel `rainfall_readings`), dengan
 * status online/offline sendiri.
 */
export default function RainfallCard({
  locationName,
  rainfall,
}: {
  locationName: string;
  rainfall: DeviceRainfall | undefined;
}) {
  const summary = rainfall?.summary ?? null;
  const lastReadingAt = rainfall?.lastReadingAt ?? null;
  const online = isDeviceOnline(lastReadingAt, RAINFALL_OFFLINE_THRESHOLD_MINUTES);

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: "#22D3EE" }}
          >
            <CloudRain size={16} strokeWidth={2.25} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {locationName}
            </h2>
            <p className="text-xs text-slate-400">Curah hujan · otomatis</p>
          </div>
        </div>
        <StatusBadge online={online} />
      </div>

      {summary ? (
        <>
          {/* Kategori menurut standar BMKG (lib/rainfallClass.ts). Angka pakai 2 desimal
              supaya konsisten dengan batas kelas (mis. 19,96 tidak tampil "20,0"). */}
          <div className="mt-4 space-y-2">
            <CategoryRow
              title="Hari ini (sejak 00:00 WIB)"
              value={`${summary.acc_today.toFixed(2)} mm`}
              category={classifyDailyRain(summary.acc_today)}
            />
            <CategoryRow
              title="Intensitas 1 jam terakhir"
              value={`${summary.acc_1h.toFixed(2)} mm/jam`}
              category={classifyHourlyRain(summary.acc_1h)}
            />
          </div>

          <div className="mt-2.5 rounded-2xl bg-cyan-50 px-4 py-3">
            <p className="text-xs text-slate-500">Curah Hujan (pembacaan terakhir)</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
              {summary.rain_last_mm.toFixed(2)}{" "}
              <span className="text-sm font-normal text-slate-400">mm</span>
            </p>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2.5">
            <AccumulationCell label="Akumulasi 1 J" value={summary.acc_1h} />
            <AccumulationCell label="Akumulasi 3 J" value={summary.acc_3h} />
            <AccumulationCell label="Akumulasi 6 J" value={summary.acc_6h} />
            <AccumulationCell label="Akumulasi 12 J" value={summary.acc_12h} />
            <AccumulationCell label="Akumulasi 24 J" value={summary.acc_24h} />
            <AccumulationCell
              label="Hari ini (sejak 00:00)"
              value={summary.acc_today}
              highlight
            />
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          {lastReadingAt
            ? "Sensor hujan belum mengirim data dalam 24 jam terakhir."
            : "Belum ada data curah hujan."}
        </p>
      )}

      {lastReadingAt && (
        <p className="mt-4 text-xs text-slate-400">
          Update terakhir: {formatDateTime(lastReadingAt)} ·{" "}
          {formatRelativeTime(lastReadingAt)}
        </p>
      )}
    </div>
  );
}
