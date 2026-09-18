import Link from "next/link";

export default function Nav() {
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
        <span className="text-sm font-semibold text-slate-900">AWS T4T</span>
        <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
          Dashboard
        </Link>
        <Link
          href="/analytics"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Analitik
        </Link>
        <Link
          href="/download"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Download
        </Link>
        <Link
          href="/recommendations"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Rekomendasi AI
        </Link>
      </div>
    </nav>
  );
}
