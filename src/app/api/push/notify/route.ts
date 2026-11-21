import { NextResponse } from "next/server";
import { sendNotification, setVapidDetails } from "web-push";
import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Target = {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  business_name: string;
  reward: string;
  stamps: number;
  stamps_required: number;
  last_stamp_at: string | null;
};

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

/**
 * Schickt nach einem Stempel eine Push-Nachricht an die Geräte der Karte.
 * Sicherheit: Nur angemeldete Inhaber, nur für Karten ihres eigenen Programms (prüft die Datenbank
 * mit dem mitgeschickten Anmelde-Token). Der Text wird aus dem Kartenstand erzeugt, nicht vom Client.
 */
export async function POST(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const jwt = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!jwt) return json({ ok: false, error: "unauthorized" }, 401);

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* ungültiger Body */
  }
  const cardId = (body as { card_id?: unknown } | null)?.card_id;
  if (typeof cardId !== "string" || !UUID.test(cardId)) return json({ ok: false, error: "invalid_request" }, 400);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!url || !key || !publicKey || !privateKey || !subject) {
    return json({ ok: false, error: "push_not_configured" }, 503);
  }

  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.rpc("get_push_targets", { p_card_id: cardId });
  if (error) {
    const unauthorized = /jwt|token|not authenticated/i.test(error.message);
    return json({ ok: false, error: unauthorized ? "unauthorized" : "lookup_failed" }, unauthorized ? 401 : 500);
  }

  const targets = (data ?? []) as Target[];
  if (targets.length === 0) return json({ ok: true, sent: 0 });

  // Nur direkt nach einem Stempel senden (verhindert beliebige Nachrichten)
  const first = targets[0];
  const last = first.last_stamp_at ? Date.parse(first.last_stamp_at) : 0;
  if (Date.now() - last > 5 * 60 * 1000) return json({ ok: true, sent: 0, reason: "no_recent_stamp" });

  const ready = first.stamps >= first.stamps_required;
  const payload = JSON.stringify({
    title: ready ? "Belohnung bereit!" : "Stempel erhalten",
    body: ready
      ? `Du hast alle ${first.stamps_required} Stempel bei ${first.business_name} gesammelt: ${first.reward}`
      : `${first.stamps} von ${first.stamps_required} Stempeln bei ${first.business_name}`,
    tag: "blinko-card",
  });

  try {
    setVapidDetails(subject, publicKey, privateKey);
  } catch {
    return json({ ok: false, error: "push_not_configured" }, 503);
  }

  let sent = 0;
  await Promise.all(
    targets.map(async (t) => {
      try {
        await sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh_key, auth: t.auth_key } },
          payload,
          { TTL: 3600 }
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.rpc("prune_push_subscription", { p_card_id: cardId, p_endpoint: t.endpoint });
        }
      }
    })
  );

  return json({ ok: true, sent });
}
