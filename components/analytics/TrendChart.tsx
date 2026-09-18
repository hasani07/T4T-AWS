"use client";

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

export default function TrendChart({ readings }: { readings: SensorReading[] }) {
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
  }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Tren Sensor</h3>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={30} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="Suhu" stroke="#f97316" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Kelembaban" stroke="#0ea5e9" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Kec. Angin" stroke="#8b5cf6" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Curah hujan tidak ditampilkan di grafik ini (skala berbeda) — lihat
        nilai totalnya di kartu ringkasan di atas.
      </p>
    </div>
  );
}
