export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F1F0F7] px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-6 md:pb-10 md:pl-28 md:pr-8 md:pt-8">
      <div className="w-full">{children}</div>
    </div>
  );
}
