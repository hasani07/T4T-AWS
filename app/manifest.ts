import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AWS T4T - Dashboard Monitoring Mikroklimat",
    short_name: "AWS T4T",
    description: "Dashboard monitoring sensor cuaca mikroklimat persemaian",
    start_url: "/",
    display: "standalone",
    background_color: "#F1F0F7",
    theme_color: "#0F172A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
