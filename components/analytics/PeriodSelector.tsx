"use client";

import { PeriodPreset } from "@/lib/dateRange";

export default function PeriodSelector({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
}: {
  preset: PeriodPreset;
  onPresetChange: (p: PeriodPreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
}) {
  const options: { value: PeriodPreset; label: string }[] = [
    { value: "7d", label: "7 Hari Terakhir" },
    { value: "30d", label: "1 Bulan Terakhir" },
    { value: "custom", label: "Custom Range" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onPresetChange(opt.value)}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            preset === opt.value
              ? "bg-slate-900 text-white"
              : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {opt.label}
        </button>
      ))}

      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          />
          <span className="text-sm text-slate-400">s/d</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          />
        </div>
      )}
    </div>
  );
}
