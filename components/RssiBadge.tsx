import { classifyRssi } from "@/lib/rssiClass";
import { Signal } from "lucide-react";

/**
 * Badge kekuatan sinyal WiFi: angka dBm + label (Kuat/Sedang/Lemah) +
 * warna sesuai lib/rssiClass.ts. Dipakai di kartu curah hujan karena
 * sensor hujan adalah ESP terpisah dengan TX power rendah -- sinyalnya
 * perlu dipantau sendiri, terpisah dari weather station.
 */
export default function RssiBadge({ rssi }: { rssi: number }) {
  const category = classifyRssi(rssi);

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${category.badgeClass}`}
      title={`Sinyal WiFi: ${rssi} dBm (${category.label})`}
    >
      <Signal size={12} strokeWidth={2.5} />
      {rssi} dBm · {category.label}
    </span>
  );
}
