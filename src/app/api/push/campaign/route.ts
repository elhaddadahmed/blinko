import { NextResponse } from "next/server";
import { sendNotification, setVapidDetails } from "web-push";
import { createClient } from "@supabase/supabase-js";

type Target = { endpoint: string; p256dh_key: string; auth_key: string; card_id: string };

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });
const STATUS: Record<string, number> = {
  invalid_input: 422, too_frequent: 429, quiet_hours: 409, program_inactive: 409, no_program: 409, not_authenticated: 401,
};

/**
 * Versendet ein Angebot an alle Geräte, die Angebote ausdrücklich erlaubt haben.
 * Die Datenbank prüft Inhaber, Ruhezeiten (21 bis 8 Uhr), das Tageslimit und die Häufigkeit pro Gerät.
 * Der Versandtext stammt aus der Datenbank (geprüft und gekürzt), das Ziel ist immer das eigene Profil.
 */
export async function POST(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const jwt = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!jwt) return json({ ok: false, error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid_request" }, 400);
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  let validUntil: string | null = null;
  if (body.valid_until) {
    const d = new Date(str(body.valid_until));
    if (Number.isNaN(d.getTime())) return json({ ok: false, error: "invalid_request" }, 400);
    validUntil = d.toISOString();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!url || !key || !publicKey || !privateKey || !subject) {
    return json({ ok: false, error: "push_not_configured" }, 503);
  }
  try {
    setVapidDetails(subject, publicKey, privateKey);
  } catch {
    return json({ ok: false, error: "push_not_configured" }, 503);
  }

  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const started = await db.rpc("start_campaign", {
    p_name: str(body.name),
    p_title: str(body.title),
    p_body: str(body.body),
    p_segment: str(body.segment),
    p_valid_until: validUntil,
  });
  if (started.error) {
    const unauthorized = /jwt|token|not authenticated/i.test(started.error.message);
    return json({ ok: false, error: unauthorized ? "unauthorized" : "start_failed" }, unauthorized ? 401 : 500);
  }
  const info = started.data as {
    ok: boolean; error?: string; campaign_id?: string; business_name?: string; slug?: string; title?: string; body?: string;
  };
  if (!info?.ok || !info.campaign_id) {
    const code = info?.error ?? "start_failed";
    return json({ ok: false, error: code }, STATUS[code] ?? 400);
  }

  const targetsRes = await db.rpc("get_campaign_targets", { p_campaign_id: info.campaign_id });
  const targets = (targetsRes.data ?? []) as Target[];

  const payload = JSON.stringify({
    title: `${info.business_name}: ${info.title}`.slice(0, 100),
    body: info.body,
    tag: "blinko-offer",
    url: `/b/${info.slug}`,
  });

  let sent = 0;
  try {
    await Promise.all(
      targets.map(async (t) => {
        try {
          await sendNotification(
            { endpoint: t.endpoint, keys: { p256dh: t.p256dh_key, auth: t.auth_key } },
            payload,
            { TTL: 6 * 3600 }
          );
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.rpc("prune_push_subscription", { p_card_id: t.card_id, p_endpoint: t.endpoint });
          }
        }
      })
    );
  } finally {
    await db.rpc("finish_campaign", { p_campaign_id: info.campaign_id, p_sent: sent });
  }

  return json({ ok: true, sent, audience: targets.length });
}
