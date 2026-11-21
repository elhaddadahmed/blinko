import { NextResponse } from "next/server";

// Jede Treuekarte bekommt ein eigenes Manifest, damit sie vom Home-Bildschirm wieder
// genau diese Karte öffnet (und auf dem iPhone Benachrichtigungen möglich sind).
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return new NextResponse(null, { status: 404 });
  }
  const manifest = {
    name: "Treuekarte",
    short_name: "Treuekarte",
    start_url: `/karte/${token}`,
    scope: "/",
    display: "standalone",
    background_color: "#FFF8EF",
    theme_color: "#F36B21",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
