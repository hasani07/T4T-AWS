"use client";

import { useRef, useState } from "react";

const DEVICE_OPTIONS = [
  { id: 1, label: "1 - Rainfall Cisangkuy" },
  { id: 2, label: "2 - Rainfall Ciminyak" },
];

type UploadResult =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; fileUrl: string; md5: string }
  | { kind: "error"; message: string };

export default function FirmwareUploadForm() {
  const [result, setResult] = useState<UploadResult>({ kind: "idle" });
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult({ kind: "loading" });

    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/firmware/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setResult({ kind: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setResult({ kind: "success", fileUrl: data.file_url, md5: data.md5 });
      formRef.current?.reset();
    } catch (err) {
      setResult({
        kind: "error",
        message: err instanceof Error ? err.message : "Gagal mengirim, cek koneksi.",
      });
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Password admin</label>
        <input
          type="password"
          name="password"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoComplete="current-password"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Device</label>
          <select name="device_id" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {DEVICE_OPTIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Nomor versi (harus SAMA dengan FW_VERSION di kode)
          </label>
          <input
            type="number"
            name="version"
            min={1}
            step={1}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="mis. 2"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Label versi (opsional, bebas)</label>
        <input
          type="text"
          name="version_label"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="mis. 1.2.0 - perbaikan OTA"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Catatan (opsional)</label>
        <textarea
          name="notes"
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Apa yang berubah di versi ini?"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          File firmware (.bin - hasil Sketch &gt; Export Compiled Binary)
        </label>
        <input
          type="file"
          name="file"
          accept=".bin"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={result.kind === "loading"}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {result.kind === "loading" ? "Mengunggah..." : "Upload firmware"}
      </button>

      {result.kind === "success" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Berhasil diupload. MD5: <code className="break-all">{result.md5}</code>
          <br />
          ESP akan mendeteksinya dalam maksimal 2 menit dan otomatis mengunduh + restart.
        </div>
      )}
      {result.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{result.message}</div>
      )}
    </form>
  );
}
