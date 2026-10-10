import { TrendPoint } from "@/lib/kioskTrend";

// SVG tangan (tanpa library chart) -- grafik ini cuma untuk "rasa arah
// tren" di papan kiosk, bukan pengganti grafik lengkap di /analytics,
// jadi tidak perlu axis/tooltip/dsb. viewBox tetap pakai koordinat tetap
// (gampang dihitung), tapi elemen <svg>-nya sendiri width="100%" height="100%"
// + preserveAspectRatio="none" supaya garis/batangnya IKUT MEMBESAR mengisi
// kotak pembungkusnya (kotak itu yang diberi tinggi lewat className di
// KioskBoard.tsx) -- bukan selalu kecil 320x72 px seperti versi sebelumnya.
const WIDTH = 320;
const HEIGHT = 110;
const PAD_X = 4;
const PAD_Y = 10;

function EmptyChart() {
  return (
    <p className="text-sm text-slate-400">Belum cukup data untuk grafik tren.</p>
  );
}

/** Grafik garis (dipakai untuk tren suhu). Titik yang null (tidak ada
 * pembacaan di jendela itu) memutus garis -- tidak disambung lurus --
 * supaya jeda waktu tanpa data tidak terlihat seolah ada trennya. */
export function MiniLineChart({ points, color }: { points: TrendPoint[]; color: string }) {
  const known = points.filter((p): p is TrendPoint & { value: number } => p.value !== null);
  if (known.length < 2) return <EmptyChart />;

  const values = known.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1; // hindari bagi nol kalau datar sempurna

  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_Y * 2;
  const n = points.length;

  const segments: string[] = [];
  let current = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    const x = PAD_X + (i / (n - 1)) * innerW;
    const y = PAD_Y + innerH - ((p.value - min) / span) * innerH;
    current += current ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : `M ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  if (current) segments.push(current);

  const last = known[known.length - 1];

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-1.5">
      <div className="h-28 w-full sm:h-36 lg:h-48">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
        >
          {segments.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <p className="text-sm text-slate-400 sm:text-base">
        {points[0]?.label}–{points[n - 1]?.label} WIB · terakhir {last.value.toFixed(1)}
      </p>
    </div>
  );
}

/** Grafik batang (dipakai untuk tren hujan per jam). Batang 0mm tetap
 * digambar tipis/transparan supaya jam itu kelihatan "memang tidak hujan",
 * bukan hilang dari grafik. */
export function MiniBarChart({ points, color }: { points: TrendPoint[]; color: string }) {
  if (points.length === 0) return <EmptyChart />;

  const values = points.map((p) => p.value ?? 0);
  const max = Math.max(...values, 0.1); // minimal 0.1 supaya tidak bagi 0 kalau semua jam 0mm
  const n = points.length;
  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_Y * 2;
  const barGap = 3;
  const barWidth = Math.max(2, innerW / n - barGap);

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-1.5">
      <div className="h-28 w-full sm:h-36 lg:h-48">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
        >
          {points.map((p, i) => {
            const v = p.value ?? 0;
            const barH = v > 0 ? Math.max((v / max) * innerH, 2) : 1;
            const x = PAD_X + i * (innerW / n);
            const y = PAD_Y + innerH - barH;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={1.5}
                fill={color}
                opacity={v > 0 ? 1 : 0.2}
              />
            );
          })}
        </svg>
      </div>
      <p className="text-sm text-slate-400 sm:text-base">
        {points[0]?.label}–{points[n - 1]?.label} WIB
      </p>
    </div>
  );
}
