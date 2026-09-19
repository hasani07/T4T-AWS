export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F1F0F7] md:pl-28">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        <p className="text-sm text-slate-400">Memuat data...</p>
      </div>
    </div>
  );
}
