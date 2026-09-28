export default function StatusBadge({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        online ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          online ? "bg-emerald-500" : "bg-rose-500"
        }`}
      />
      {online ? "Online" : "Offline"}
    </span>
  );
}
