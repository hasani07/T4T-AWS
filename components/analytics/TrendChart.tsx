"use client";

import { useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { SensorReading } from "@/lib/types";

type MetricKey = "Suhu" | "Kelembaban" | "Kec. Angin" | "Curah Hujan";

const METRICS: { key: MetricKey; color: string; type: "line" | "bar" }[] = [
  { key: "Suhu", color: "#f97316", type: "line" },
  { key: "Kelembaban", color: "#0ea5e9", type: "line" },
  { key: "Kec. Angin", color: "#8b5cf6", type: "line" },
  { key: "Curah Hujan", color: "#38bdf8", type: "bar" },
];

export default function TrendChart({ readings }: { readings: SensorReading[] }) {
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>({
    Suhu: true,
    Kelembaban: true,
    "Kec. Angin": true,
    "Curah Hujan": true,
  });

  function toggle(key: MetricKey) {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (readings.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">
          Tidak ada data untuk ditampilkan pada grafik.
        </p>
      </div>
    );
  }

  const data = readings.map((r) => ({
    time: new Date(r.created_at).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
    Suhu: r.temperature,
    Kelembaban: r.humidity,
    "Kec. Angin": r.wind_speed,
    "Curah Hujan": r.rainfall,
  }));

  const anyVisible = METRICS.some((m) => visible[m.key]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
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
            <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={30} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10 }}
                label={{ value: "mm", angle: 90, position: "insideRight", fontSize: 10 }}
              />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />

              {visible["Curah Hujan"] && (
                <Bar
                  yAxisId="right"
                  dataKey="Curah Hujan"
                  fill="#38bdf8"
                  barSize={8}
                  opacity={0.6}
                />
              )}
              {visible["Suhu"] && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="Suhu"
                  stroke="#f97316"
                  dot={false}
                  strokeWidth={2}
                />
              )}
              {visible["Kelembaban"] && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="Kelembaban"
                  stroke="#0ea5e9"
                  dot={false}
                  strokeWidth={2}
                />
              )}
              {visible["Kec. Angin"] && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="Kec. Angin"
                  stroke="#8b5cf6"
                  dot={false}
                  strokeWidth={2}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        Suhu (°C), Kelembaban (%), dan Kecepatan Angin (m/s) memakai sumbu kiri.
        Curah Hujan (mm, batang) memakai sumbu kanan karena skalanya berbeda.
      </p>
    </div>
  );
}
