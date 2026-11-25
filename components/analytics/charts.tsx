"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// =====================================================================
// Grafik garis SVG ringan untuk halaman Analitik (tanpa library):
//  - lebar mengikuti wadah (ResizeObserver) -> responsif di HP s/d monitor
//  - banyak seri + "pita" min-maks opsional (mis. rentang suhu harian)
//  - nilai null memutus garis (jeda data tidak digambar seolah ada tren)
//  - tooltip saat disorot/disentuh; hoverIndex bisa dikendalikan dari luar
//    supaya beberapa grafik bergerak serempak (lihat MetricTrends)
// Warna netral memakai skala slate (dibalik otomatis di mode gelap).
// =====================================================================

export interface Series {
  key: string;
  name: string;
  color: string;
  values: (number | null)[];
  unit?: string;
  width?: number;
  dashed?: boolean;
  /** Isi area di bawah garis (gradasi tipis). */
  fill?: boolean;
  digits?: number;
}

export interface Band {
  lo: (number | null)[];
  hi: (number | null)[];
  color: string;
  name: string;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const fmtNum = (v: number, d = 1) => v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

export function LineChart({
  labels,
  series,
  band,
  height = 220,
  yUnit,
  yMin,
  yMax,
  maxXTicks = 7,
  hoverIndex,
  onHover,
  showLegend = true,
  ariaLabel,
}: {
  labels: string[];
  series: Series[];
  band?: Band;
  height?: number;
  yUnit?: string;
  yMin?: number;
  yMax?: number;
  maxXTicks?: number;
  hoverIndex?: number | null;
  onHover?: (i: number | null) => void;
  showLegend?: boolean;
  ariaLabel: string;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [localHover, setLocalHover] = useState<number | null>(null);
  const hover = hoverIndex !== undefined ? hoverIndex : localHover;
  const setHover = (i: number | null) => (onHover ? onHover(i) : setLocalHover(i));

  const n = labels.length;
  const ML = 38;
  const MR = 10;
  const MT = 10;
  const MB = 24;
  const innerW = Math.max(10, width - ML - MR);
  const innerH = height - MT - MB;

  const { lo, hi, ticks } = useMemo(() => {
    const all: number[] = [];
    for (const s of series) for (const v of s.values) if (v !== null && Number.isFinite(v)) all.push(v);
    if (band) for (const v of [...band.lo, ...band.hi]) if (v !== null && Number.isFinite(v)) all.push(v);
    let a = yMin ?? (all.length ? Math.min(...all) : 0);
    let b = yMax ?? (all.length ? Math.max(...all) : 1);
    if (b - a < 1e-6) {
      a -= 1;
      b += 1;
    }
    const pad = (b - a) * 0.08;
    if (yMin === undefined) a -= pad;
    if (yMax === undefined) b += pad;
    const t = niceTicks(a, b, 4);
    return { lo: a, hi: b, ticks: t };
  }, [series, band, yMin, yMax]);

  const x = (i: number) => ML + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => MT + innerH - ((v - lo) / (hi - lo)) * innerH;

  const pathFor = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };

  // Pita min-maks: satu poligon per potongan data yang bersambung.
  const bandPaths = useMemo(() => {
    if (!band) return [];
    const segs: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < n; i++) {
      if (band.lo[i] !== null && band.hi[i] !== null) cur.push(i);
      else if (cur.length) {
        segs.push(cur);
        cur = [];
      }
    }
    if (cur.length) segs.push(cur);
    return segs.map((idx) => {
      const top = idx.map((i) => `${x(i).toFixed(1)} ${y(band.hi[i]!).toFixed(1)}`);
      const bot = [...idx].reverse().map((i) => `${x(i).toFixed(1)} ${y(band.lo[i]!).toFixed(1)}`);
      return `M${top.join(" L")} L${bot.join(" L")} Z`;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band, n, width, lo, hi, height]);

  // Label sumbu X: dibatasi maxXTicks DAN lebar layar, lalu label yang
  // terlalu rapat dibuang supaya tidak bertumpuk di HP.
  const fit = Math.max(2, Math.floor(innerW / 64));
  const step = Math.max(1, Math.ceil(n / Math.min(maxXTicks, fit)));
  const xTicks: { l: string; i: number }[] = [];
  {
    let lastX = -Infinity;
    labels.forEach((l, i) => {
      if (!l || i % step !== 0) return;
      const px = x(i);
      if (px - lastX < 58) return;
      xTicks.push({ l, i });
      lastX = px;
    });
  }

  function onMove(clientX: number, rect: DOMRect) {
    if (n === 0) return;
    const px = clientX - rect.left - ML;
    const i = Math.round((px / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const tipLeft = hover !== null ? x(hover) : 0;
  const tipOnRight = tipLeft < width * 0.6;

  return (
    <div className="w-full">
      {showLegend && (series.length > 1 || band) && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
          {band && (
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="h-2.5 w-4 rounded-sm" style={{ background: band.color, opacity: 0.25 }} />
              {band.name}
            </span>
          )}
        </div>
      )}
      <div ref={wrapRef} className="relative w-full select-none" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            className="touch-pan-y"
            onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setHover(null)}
            onTouchStart={(e) => onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
            onTouchMove={(e) => onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          >
            <defs>
              {series
                .filter((s) => s.fill)
                .map((s) => (
                  <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
            </defs>

            {/* Grid & sumbu Y */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={ML} x2={width - MR} y1={y(t)} y2={y(t)} className="stroke-slate-200" strokeDasharray="3 4" />
                <text x={ML - 6} y={y(t) + 3.5} textAnchor="end" className="fill-slate-400" style={{ fontSize: 10 }}>
                  {Number.isInteger(t) ? t : fmtNum(t, 1)}
                </text>
              </g>
            ))}
            {yUnit && (
              <text x={4} y={MT + 2} className="fill-slate-400" style={{ fontSize: 9 }}>
                {yUnit}
              </text>
            )}

            {/* Sumbu X */}
            {xTicks.map(({ l, i }) => (
              <text
                key={i}
                x={x(i)}
                y={height - 6}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                className="fill-slate-400"
                style={{ fontSize: 10 }}
              >
                {l}
              </text>
            ))}

            {bandPaths.map((d, k) => (
              <path key={k} d={d} fill={band!.color} opacity={0.16} />
            ))}

            {series.map((s) => {
              const d = pathFor(s.values);
              if (!d) return null;
              return (
                <g key={s.key}>
                  {s.fill && (
                    <path
                      d={`${d} L${x(s.values.length - 1 - [...s.values].reverse().findIndex((v) => v !== null)).toFixed(1)} ${MT + innerH} L${x(
                        s.values.findIndex((v) => v !== null)
                      ).toFixed(1)} ${MT + innerH} Z`}
                      fill={`url(#fill-${s.key})`}
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.width ?? 2}
                    strokeDasharray={s.dashed ? "5 4" : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}

            {/* Penanda hover */}
            {hover !== null && n > 0 && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={MT} y2={MT + innerH} className="stroke-slate-300" />
                {series.map((s) => {
                  const v = s.values[hover];
                  return v === null || v === undefined ? null : (
                    <circle key={s.key} cx={x(hover)} cy={y(v)} r={3.5} fill={s.color} className="stroke-surface" strokeWidth={2} />
                  );
                })}
              </g>
            )}
          </svg>
        )}

        {hover !== null && n > 0 && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[128px] rounded-xl bg-surface/95 px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.16)] ring-1 ring-slate-200 backdrop-blur"
            style={tipOnRight ? { left: tipLeft + 10 } : { right: width - tipLeft + 10 }}
          >
            <p className="text-[11px] font-semibold text-slate-700">{labels[hover]}</p>
            {band && band.lo[hover] !== null && band.hi[hover] !== null && (
              <p className="text-[11px] text-slate-500">
                {band.name}: {fmtNum(band.lo[hover]!)}–{fmtNum(band.hi[hover]!)}
                {series[0]?.unit ?? ""}
              </p>
            )}
            {series.map((s) => {
              const v = s.values[hover];
              return (
                <p key={s.key} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                  {s.name}:{" "}
                  <b className="text-slate-900">{v === null || v === undefined ? "–" : `${fmtNum(v, s.digits ?? 1)}${s.unit ?? ""}`}</b>
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Grafik garis mini tanpa sumbu (untuk kartu angka). */
export function Sparkline({ values, color, height = 34 }: { values: (number | null)[]; color: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const vals = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length < 2) return <div ref={ref} style={{ height }} />;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const n = values.length;
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    const px = (i / (n - 1)) * (width - 4) + 2;
    const py = height - 3 - ((v - lo) / span) * (height - 6);
    d += `${pen ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)} `;
    pen = true;
  });
  return (
    <div ref={ref} style={{ height }} className="w-full">
      {width > 0 && (
        <svg width={width} height={height} aria-hidden>
          <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}
