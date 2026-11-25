import { DeviceRainfall } from "@/lib/types";
import { RAINFALL_OFFLINE_THRESHOLD_MINUTES } from "@/lib/config";
import { isDeviceOnline, formatRelativeTime, formatDateTime } from "@/lib/deviceStatus";
import { classifyDailyRain, classifyHourlyRain } from "@/lib/rainfallClass";
import StatusBadge from "./StatusBadge";
import RainCategoryBadge from "./RainCategoryBadge";
import RssiBadge from "./RssiBadge";
import { CARD, iconChipStyle } from "./ui/card";
import { CloudRain, Timer } from "lucide-react";

/**
 * Kartu curah hujan untuk satu lokasi. Terpisah dari kartu cuaca karena
 * sensor hujan adalah ESP tersendiri (tabel `rainfall_readings`), dengan
 * status online/offline sendiri.
 * Catatan warna: tanpa dark:text-slate-* (skala slate dibalik otomatis).
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

  // Akumulasi berjalan: nilainya selalu naik (1 j <= 3 j <= ... <= 24 j), jadi
  // batang digambar relatif terhadap yang terbesar -> langsung kelihatan kapan
  // hujannya turun (mis. 1 j kecil tapi 6 j besar = hujan sudah reda).
  const acc = summary
    ? [
        { label: "1 jam", v: summary.acc_1h },
        { label: "3 jam", v: summary.acc_3h },
        { label: "6 jam", v: summary.acc_6h },
        { label: "12 jam", v: summary.acc_12h },
        { label: "24 jam", v: summary.acc_24h },
      ]
    : [];
  const accMax = Math.max(1, ...acc.map((a) => a.v));

  return (
    <div className={`${CARD} flex h-full flex-col p-4 sm:p-5`}>
      {/* Kepala -- flex-wrap: di HP sempit badge turun ke baris bawah */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={iconChipStyle("#06B6D4")}>
            <CloudRain size={18} strokeWidth={2.25} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold tracking-tight text-slate-900">{locationName}</h2>
            <p className="truncate text-[11px] text-slate-400">
              Sensor hujan{lastReadingAt ? ` · ${formatRelativeTime(lastReadingAt)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <StatusBadge online={online} />
          {/* RSSI dari pengiriman terakhir (satu baris di rainfall_readings). */}
          {summary?.rssi_last !== null && summary?.rssi_last !== undefined && <RssiBadge rssi={summary.rssi_last} />}
        </div>
      </div>

      {summary ? (
        <>
          {/* Angka utama: hujan hari ini + kategori BMKG (lib/rainfallClass.ts) */}
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Hari ini (sejak 00:00 WIB)</p>
              <p className="mt-0.5 font-extrabold leading-none tracking-tight tabular-nums text-slate-900">
                <span className="text-5xl sm:text-[56px]">{summary.acc_today.toFixed(1)}</span>
                <span className="ml-1 text-xl font-bold text-slate-400">mm</span>
              </p>
            </div>
            <div className="mb-1">
              <RainCategoryBadge category={classifyDailyRain(summary.acc_today)} />
            </div>
          </div>

          {/* Intensitas sekarang */}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-cyan-50 px-3.5 py-2.5 ring-1 ring-cyan-100 dark:bg-cyan-500/10 dark:ring-cyan-500/20">
            <div className="flex min-w-0 items-center gap-2">
              <Timer size={15} className="shrink-0 text-cyan-600 dark:text-cyan-400" aria-hidden />
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500">Intensitas 1 jam terakhir</p>
                <p className="text-sm font-bold tabular-nums text-slate-900">{summary.acc_1h.toFixed(2)} mm/jam</p>
              </div>
            </div>
            <RainCategoryBadge category={classifyHourlyRain(summary.acc_1h)} />
          </div>

          {/* Akumulasi berjalan */}
          <div className="mt-3 space-y-1.5" aria-label="Akumulasi curah hujan">
            {acc.map((a) => (
              <div key={a.label} className="grid grid-cols-[52px_1fr_60px] items-center gap-2">
                <span className="text-[11px] text-slate-500">{a.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500"
                    style={{ width: `${a.v > 0 ? Math.max(3, (a.v / accMax) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-right text-[11px] font-semibold tabular-nums text-slate-700">{a.v.toFixed(1)} mm</span>
              </div>
            ))}
          </div>

          <p className="mt-auto pt-3 text-[11px] text-slate-400">
            Pembacaan terakhir {summary.rain_last_mm.toFixed(2)} mm
            {lastReadingAt ? ` · ${formatDateTime(lastReadingAt)}` : ""}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          {lastReadingAt ? "Sensor hujan belum mengirim data dalam 24 jam terakhir." : "Belum ada data curah hujan."}
        </p>
      )}
    </div>
  );
}
