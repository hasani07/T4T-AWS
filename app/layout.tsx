import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "AWS T4T — Dashboard Monitoring Mikroklimat",
  description: "Dashboard monitoring sensor cuaca mikroklimat persemaian (Workshop T4T)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
