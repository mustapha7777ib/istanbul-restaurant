import type { MetadataRoute } from "next";

// Lets waiters "Add to Home Screen" so the app opens full-screen and (on iPhone)
// can receive lock-screen alerts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Istanbul Cafe & Restaurant — Staff",
    short_name: "Istanbul Staff",
    description: "Orders, tables and requests for waiters, kitchen and managers.",
    start_url: "/staff",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0c162c",
    theme_color: "#0c162c",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
