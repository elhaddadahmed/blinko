import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendNotification, setVapidDetails } from "web-push";
import { createClient } from "@supabase/supabase-js";

type Due = { campaign_id: string; title: string; body: string; slug: string; business_name: string };
type Target = { endpoint: string; p256dh_key: string; auth_key: string; card_id: string };

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

function authorized(req: Request, secret: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const given = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Wird von einem Zeitdienst alle paar Minuten aufgerufen und verschickt fällige, geplante Angebote.
 * Geschützt durch CRON_SECRET (mindestens 24 Zeichen). Die Datenbank prüft das Kennwort zusätzlich.
 */
async function dispatch(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 24) return json({ ok: false, error: "cron_not_configured" }, 503);
  if (!authorized(req, secret)) return json({ ok: false, error: "unauthorized" }, 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!url || !key || !publicKey || !privateKey || !subject) return json({ ok: false, error: "push_not_configured" }, 503);
  try {
    setVapidDetails(subject, publicKey, privateKey);
  } catch {
    return json({ ok: false, error: "push_not_configured" }, 503);
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const claimed = await db.rpc("claim_due_campaigns", { p_secret: secret });
  if (claimed.error) return json({ ok: false, error: "claim_failed" }, 500);

  let dispatched = 0;
  let total = 0;
  for (const c of (claimed.data ?? []) as Due[]) {
    const res = await db.rpc("get_scheduled_targets", { p_secret: secret, p_campaign_id: c.campaign_id });
    const targets = (res.data ?? []) as Target[];
    const payload = JSON.stringify({
      title: `${c.business_name}: ${c.title}`.slice(0, 100),
      body: c.body,
      tag: "blinko-offer",
      url: `/b/${c.slug}`,
      cid: c.campaign_id,
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
              await db.rpc("prune_dead_subscription", { p_secret: secret, p_endpoint: t.endpoint });
            }
          }
        })
      );
    } finally {
      await db.rpc("finish_scheduled_campaign", { p_secret: secret, p_campaign_id: c.campaign_id, p_sent: sent });
    }
    dispatched++;
    total += sent;
  }

  return json({ ok: true, dispatched, sent: total });
}

export const GET = dispatch;
export const POST = dispatch;
