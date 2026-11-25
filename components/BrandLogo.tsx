/* eslint-disable @next/next/no-img-element */

// Logo AtmosX yang ikut tema: bagian biru tua logo asli hampir tak terlihat
// di latar gelap, jadi mode gelap memakai versi *-dark.png (biru tua diganti
// putih keabuan, tosca tetap). Pertukaran murni lewat kelas `dark:` --
// tanpa JavaScript, jadi tidak ada kedipan saat halaman dimuat.
//   variant "full" -> ikon + tulisan AtmosX (public/atmosx-logo*.png)
//   variant "mark" -> ikon X saja          (public/t4t-logo*.png)
export default function BrandLogo({
  variant = "full",
  className = "",
}: {
  variant?: "full" | "mark";
  className?: string;
}) {
  const base = variant === "full" ? "/atmosx-logo" : "/t4t-logo";
  const size = variant === "full" ? { width: 932, height: 722 } : { width: 849, height: 989 };
  return (
    <>
      <img src={`${base}.png`} alt="AtmosX" {...size} className={`block dark:hidden ${className}`} />
      <img src={`${base}-dark.png`} alt="AtmosX" {...size} className={`hidden dark:block ${className}`} />
    </>
  );
}
