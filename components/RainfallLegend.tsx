import {
  DAILY_LEGEND,
  HOURLY_LEGEND,
  getRainCategory,
  RainCategoryKey,
} from "@/lib/rainfallClass";
import RainCategoryBadge from "./RainCategoryBadge";

function LegendList({
  title,
  items,
}: {
  title: string;
  items: { key: RainCategoryKey; range: string }[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-700">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3">
            <RainCategoryBadge category={getRainCategory(item.key)} />
            <span className="text-xs tabular-nums text-slate-500">{item.range}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Legenda standar kategori hujan (BMKG). Dibuat lipat (<details>) supaya
 * tidak memenuhi layar, tapi tetap mudah dibuka.
 */
export default function RainfallLegend() {
  return (
    <details className="mt-5 rounded-3xl bg-white px-5 py-4 shadow-[0_2px_24px_rgba(15,23,42,0.06)]">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        Standar kategori hujan (BMKG)
      </summary>

      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <LegendList title="Total per hari → “hari ini hujan apa?”" items={DAILY_LEGEND} />
        <LegendList title="Intensitas per jam → “seberapa deras sekarang?”" items={HOURLY_LEGEND} />
      </div>

      <ul className="mt-4 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-400">
        <li>
          Kategori “hari ini” memakai total sejak 00:00 WIB. Batas jam pengamatan
          harian BMKG bisa berbeda, jadi angkanya dapat sedikit berbeda dari data resmi.
        </li>
        <li>
          Kategori intensitas memakai total 1 jam terakhir sebagai perkiraan mm/jam.
        </li>
        <li>
          Di bawah ambang hujan ringan (kurang dari 0,5 mm per hari atau 1 mm per
          jam) ditampilkan sebagai “sangat ringan”. Sensor beresolusi 0,28 mm per
          guling, jadi angka naik berundak.
        </li>
      </ul>
    </details>
  );
}
