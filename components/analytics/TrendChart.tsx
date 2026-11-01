"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { SensorReading } from "@/lib/types";

// Catatan: curah hujan SENGAJA tidak ada di grafik ini. Skalanya (mm) beda
// jauh dari suhu/kelembaban/angin sehingga batangnya nyaris tak terlihat
// kalau digabung -- grafiknya ada terpisah di components/analytics/RainfallCharts.tsx.

// ⚠️ Sama seperti di lib/deviceStatus.ts: timestamp sensor diberi label
// "+00" (UTC) padahal angkanya sudah WIB. Untuk label sumbu waktu di
// grafik, angkanya diambil langsung apa adanya (tanpa toLocaleString yang
// bisa nge-double-convert timezone), bukan lewat parsing otomatis.
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function formatSensorTimeLabel(iso: string): string {
  const naive = iso.slice(0, 19); // "YYYY-MM-DDTHH:mm:ss"
  const [datePart, timePart] = naive.split("T");
  const [, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  const dd = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${dd} ${MONTH_LABELS[month - 1]} ${hh}:${mm}`;
}

type MetricKey = "Suhu" | "Kelembaban" | "Kec. Angin";

const METRICS: { key: MetricKey; color: string }[] = [
  { key: "Suhu", color: "#f97316" },
  { key: "Kelembaban", color: "#0ea5e9" },
  { key: "Kec. Angin", color: "#8b5cf6" },
];

export default function TrendChart({ readings }: { readings: SensorReading[] }) {
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>({
    Suhu: true,
    Kelembaban: true,
    "Kec. Angin": true,
  });

  function toggle(key: MetricKey) {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (readings.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-surface p-4">
        <p className="text-sm text-slate-500">
          Tidak ada data untuk ditampilkan pada grafik.
        </p>
      </div>
    );
  }

  const data = readings.map((r) => ({
    time: formatSensorTimeLabel(r.created_at),
    Suhu: r.temperature,
    Kelembaban: r.humidity,
    "Kec. Angin": r.wind_speed,
  }));

  const anyVisible = METRICS.some((m) => visible[m.key]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Tren Sensor</h3>

      <div className="mb-3 flex flex-wrap gap-3">
        {METRICS.map((m) => (
          <label
            key={m.key}
            className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600"
          >
            <input
              type="checkbox"
              checked={visible[m.key]}
              onChange={() => toggle(m.key)}
              className="h-3.5 w-3.5 rounded border-slate-300"
              style={{ accentColor: m.color }}
            />
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: m.color }}
            />
            {m.key}
          </label>
        ))}
      </div>

      {!anyVisible ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Pilih minimal 1 sensor untuk ditampilkan.
        </p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={30} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />

              {METRICS.filter((m) => visible[m.key]).map((m) => (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  stroke={m.color}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        Suhu (°C), Kelembaban (%), dan Kecepatan Angin (m/s) memakai sumbu yang sama.
        Grafik curah hujan ada di bagian terpisah di bawah.
      </p>
    </div>
  );
}
