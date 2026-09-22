import PageShell from "@/components/PageShell";
import RainfallConsole from "@/components/monitor/RainfallConsole";

export const dynamic = "force-dynamic";

export default function RainfallMonitorPage() {
  return (
    <PageShell>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Serial Monitor Jarak Jauh - Rainfall</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pantau device curah hujan tanpa colok USB. Klik <b>Run</b> untuk mengaktifkan mode
          detail (ESP mulai mengirim baris tiap ~3 detik, maks 50 baris terbaru disimpan), dan{" "}
          <b>Stop</b> untuk mematikannya lagi. Kalau lupa klik Stop, otomatis berhenti sendiri
          setelah 10 menit.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <RainfallConsole />
      </div>
    </PageShell>
  );
}
