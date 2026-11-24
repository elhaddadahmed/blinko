import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Zählt anonym einen Klick auf eine Angebots-Nachricht. Gespeichert wird nur eine Zahl. */
export async function POST(req: Request) {
  let cid: unknown = null;
  try {
    cid = ((await req.json()) as { cid?: unknown }).cid;
  } catch {
    /* ungültiger Body */
  }
  if (typeof cid !== "string" || !UUID.test(cid)) return new NextResponse(null, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return new NextResponse(null, { status: 503 });

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await db.rpc("record_campaign_click", { p_campaign_id: cid });
  return new NextResponse(null, { status: 204 });
}
