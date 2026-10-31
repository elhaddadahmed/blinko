import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Blinko",
    short_name: "Blinko",
    description: "Digitale Kundenbindung für lokale Unternehmen",
    start_url: "/",
    display: "browser",
    background_color: "#FFF8EF",
    theme_color: "#F36B21",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
