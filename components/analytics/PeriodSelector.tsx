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
    { value: "7d", label: "7 hari" },
    { value: "30d", label: "30 hari" },
    { value: "custom", label: "Pilih tanggal" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex w-full rounded-2xl bg-slate-100 p-1 sm:w-auto" role="group" aria-label="Pilih periode">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onPresetChange(opt.value)}
            aria-pressed={preset === opt.value}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition sm:flex-none ${
              preset === opt.value ? "bg-surface text-slate-900 shadow-sm ring-1 ring-slate-200/70" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input
            type="date"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-surface px-2.5 py-2 text-xs text-slate-900 sm:flex-none"
          />
          <span className="text-sm text-slate-400">s/d</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-surface px-2.5 py-2 text-xs text-slate-900 sm:flex-none"
          />
        </div>
      )}
    </div>
  );
}
