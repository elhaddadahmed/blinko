import type { NextConfig } from "next";

// Öffentliche Adresse der App für QR-Codes: zuerst die selbst gesetzte Variable,
// sonst automatisch die Produktions-Domain von Vercel (stabil und öffentlich),
// niemals die Adresse eines einzelnen Deployments.
const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || (productionHost ? `https://${productionHost}` : "");

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_SITE_URL: siteUrl },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
