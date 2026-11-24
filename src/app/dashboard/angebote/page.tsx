"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const SEGMENTS: Record<string, string> = {
  all: "Alle, die Angebote erlaubt haben",
  recent_30: "Besuchten in den letzten 30 Tagen",
  inactive_30: "Nicht mehr da seit 30 Tagen",
  inactive_60: "Nicht mehr da seit 60 Tagen",
  almost_full: "Karte fast voll (noch ein Stempel)",
  reward_ready: "Belohnung wartet auf Einlösung",
};

const ERRORS: Record<string, string> = {
  quiet_hours: "Zwischen 21 und 8 Uhr werden keine Angebote verschickt. Wähle eine Zeit zwischen 8 und 21 Uhr.",
  too_frequent: "Pro Tag ist ein Angebot erlaubt, auch bei geplanten. Wähle einen anderen Zeitpunkt.",
  invalid_input: "Bitte prüfe die Eingaben. Geplant werden kann 5 Minuten bis 30 Tage im Voraus, das Ablaufdatum muss danach liegen.",
  program_inactive: "Dein Treueprogramm ist nicht aktiv. Aktiviere es zuerst.",
  no_program: "Lege zuerst ein Treueprogramm an.",
  unauthorized: "Bitte melde dich neu an.",
  push_not_configured: "Push ist noch nicht eingerichtet (Schlüssel bei Vercel fehlen).",
};

type Campaign = {
  id: string; name: string; title: string; body: string; segment: string;
  valid_until: string | null; sent_count: number; click_count: number; status: string;
  scheduled_at: string | null; created_at: string;
};

export default function OffersPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(true);
  const [programActive, setProgramActive] = useState<boolean | null>(null);
  const [businessName, setBusinessName] = useState("Dein Geschäft");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [audience, setAudience] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [segment, setSegment] = useState("all");
  const [validUntil, setValidUntil] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadCampaigns = useCallback(async () => {
    const { data } = await supabase.rpc("list_my_campaigns");
    setCampaigns((data ?? []) as Campaign[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) {
          if (!cancelled) setLoggedIn(false);
          return;
        }
        const { data: biz } = await supabase.from("businesses").select("id").eq("owner_id", auth.user.id).limit(1);
        if (biz?.length) {
          const [{ data: profile }, { data: program }] = await Promise.all([
            supabase.from("business_profiles").select("name").eq("business_id", biz[0].id).maybeSingle(),
            supabase.from("loyalty_programs").select("is_active").eq("business_id", biz[0].id).maybeSingle(),
          ]);
          if (!cancelled) {
            if (profile?.name) setBusinessName(profile.name as string);
            setProgramActive(program ? Boolean(program.is_active) : false);
          }
        } else if (!cancelled) setProgramActive(false);
        await loadCampaigns();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCampaigns]);

  useEffect(() => {
    if (!loggedIn || !programActive) return;
    let cancelled = false;
    supabase.rpc("campaign_audience", { p_segment: segment }).then(({ data }) => {
      if (!cancelled) setAudience(typeof data === "number" ? data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [segment, loggedIn, programActive, campaigns.length]);

  async function send() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await supabase.auth.getSession();
      const jwt = data.session?.access_token;
      if (!jwt) throw new Error("unauthorized");
      const res = await fetch("/api/push/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          name: name.trim() || title.trim(),
          title,
          body,
          segment,
          valid_until: validUntil ? new Date(`${validUntil}T23:59:00`).toISOString() : null,
          scheduled_at: when === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; sent?: number; audience?: number; scheduled?: boolean };
      if (!result.ok) {
        setError(ERRORS[result.error ?? ""] ?? "Das Angebot konnte nicht gesendet werden. Bitte versuche es später erneut.");
        return;
      }
      if (result.scheduled) {
        setSuccess(`Geplant für ${new Date(scheduledAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}. Der Versand erfolgt automatisch, sobald der Zeitdienst läuft.`);
        setName(""); setTitle(""); setBody(""); setValidUntil(""); setScheduledAt(""); setWhen("now");
        await loadCampaigns();
        return;
      }
      setSuccess(
        result.audience === 0
          ? "Das Angebot wurde gespeichert, aber es gab keine Empfänger. Kunden müssen Angebote auf ihrer Karte erlauben."
          : `Gesendet an ${result.sent} von ${result.audience} Geräten.`
      );
      setName(""); setTitle(""); setBody(""); setValidUntil("");
      await loadCampaigns();
    } catch {
      setError("Das Angebot konnte nicht gesendet werden. Bitte versuche es später erneut.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function cancel(id: string) {
    setError("");
    const { data } = await supabase.rpc("cancel_campaign", { p_campaign_id: id });
    if (!data?.ok) setError("Dieses Angebot lässt sich nicht mehr abbrechen.");
    await loadCampaigns();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("Bitte gib Titel und Nachricht ein.");
      return;
    }
    if (when === "later" && !scheduledAt) {
      setError("Bitte wähle Datum und Uhrzeit für den Versand.");
      return;
    }
    setError("");
    setConfirming(true);
  }

  const field = "w-full rounded-xl border border-gray-300 px-4 py-3";

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-10 text-[#202A35]">
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold">Angebote senden</h1>
          <p className="mt-3 text-gray-600">
            Verschicke ein Angebot als Push-Nachricht, zum Beispiel „Heute 20 % auf Cappuccino“. Es geht nur an Kunden,
            die Angebote auf ihrer Karte ausdrücklich erlaubt haben.
          </p>

          {loading && <p className="mt-6" aria-busy="true">Wird geladen …</p>}
          {!loading && !loggedIn && (
            <p className="mt-6">Bitte <Link href="/anmelden" className="font-semibold text-[#F36B21]">melde dich an</Link>.</p>
          )}
          {!loading && loggedIn && programActive === false && (
            <p className="mt-6 rounded-xl bg-orange-50 p-4 text-sm">
              Aktiviere zuerst dein <Link href="/dashboard/treueprogramm" className="font-semibold text-[#F36B21]">Treueprogramm</Link>.
            </p>
          )}

          {!loading && loggedIn && programActive && (
            <form onSubmit={submit} className="mt-6 space-y-5">
              <div>
                <label htmlFor="cname" className="mb-2 block font-semibold">Name der Aktion (nur für dich)</label>
                <input id="cname" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="z. B. Herbstaktion" />
              </div>
              <div>
                <label htmlFor="ctitle" className="mb-2 block font-semibold">Titel *</label>
                <input id="ctitle" required maxLength={50} value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="z. B. Heute 20 % auf Cappuccino" />
                <p className="mt-1 text-xs text-gray-500">{title.length} von 50 Zeichen</p>
              </div>
              <div>
                <label htmlFor="cbody" className="mb-2 block font-semibold">Nachricht *</label>
                <textarea id="cbody" required rows={3} maxLength={160} value={body} onChange={(e) => setBody(e.target.value)} className={field} placeholder="z. B. Nur bis 17 Uhr. Zeig einfach deine Karte." />
                <p className="mt-1 text-xs text-gray-500">{body.length} von 160 Zeichen</p>
              </div>
              <div>
                <label htmlFor="cseg" className="mb-2 block font-semibold">Empfänger</label>
                <select id="cseg" value={segment} onChange={(e) => setSegment(e.target.value)} className={`${field} bg-white`}>
                  {Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <p className="mt-1 text-sm text-gray-600" aria-live="polite">
                  {audience === null ? "" : audience === 0 ? "Aktuell kein erreichbares Gerät in dieser Gruppe." : `Erreichbar: ${audience} ${audience === 1 ? "Gerät" : "Geräte"}`}
                </p>
              </div>
              <div>
                <label htmlFor="cvalid" className="mb-2 block font-semibold">Gültig bis (optional)</label>
                <input id="cvalid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={field} />
                <p className="mt-1 text-xs text-gray-500">Bis dahin steht das Angebot auch auf deiner Profilseite und der Kundenkarte.</p>
              </div>

              <fieldset>
                <legend className="mb-2 block font-semibold">Wann senden?</legend>
                <div className="flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="when" checked={when === "now"} onChange={() => setWhen("now")} className="accent-orange-500" />
                    Jetzt
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="when" checked={when === "later"} onChange={() => setWhen("later")} className="accent-orange-500" />
                    Später planen
                  </label>
                </div>
                {when === "later" && (
                  <div className="mt-3">
                    <label htmlFor="cwhen" className="mb-1 block text-sm font-semibold">Datum und Uhrzeit (8 bis 21 Uhr)</label>
                    <input id="cwhen" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={field} />
                  </div>
                )}
              </fieldset>

              <div aria-label="Vorschau" className="rounded-2xl bg-gray-100 p-4">
                <p className="mb-2 text-xs font-bold uppercase text-gray-500">Vorschau auf dem Handy</p>
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-sm font-bold">{businessName}: {title || "Titel"}</p>
                  <p className="mt-1 text-sm text-gray-700">{body || "Deine Nachricht erscheint hier."}</p>
                </div>
              </div>

              {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
              {success && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{success}</p>}

              {!confirming ? (
                <button type="submit" className="w-full rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white">Weiter zur Bestätigung</button>
              ) : (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <p className="font-semibold">
                    {when === "later"
                      ? `Angebot für ${new Date(scheduledAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })} einplanen? Bis dahin kannst du es abbrechen.`
                      : `Jetzt an ${audience ?? 0} ${audience === 1 ? "Gerät" : "Geräte"} senden? Das lässt sich nicht zurückholen.`}
                  </p>
                  <div className="mt-3 flex gap-3">
                    <button type="button" onClick={send} disabled={busy} className="rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white disabled:opacity-60">
                      {busy ? "Bitte warten …" : when === "later" ? "Ja, einplanen" : "Ja, jetzt senden"}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-full border border-gray-300 px-5 py-3 font-bold">Abbrechen</button>
                  </div>
                </div>
              )}
            </form>
          )}
        </section>

        {!loading && loggedIn && (
          <section className="rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-bold">Regeln zum Schutz deiner Kunden</h2>
            <ul className="mt-3 list-disc space-y-1 pl-6 text-sm leading-6 text-gray-700">
              <li>Nur Kunden mit ausdrücklicher Einwilligung bekommen Angebote.</li>
              <li>Höchstens ein Angebot pro Tag von dir, und pro Gerät höchstens eines alle 3 Tage.</li>
              <li>Keine Nachrichten zwischen 21 und 8 Uhr.</li>
              <li>Kunden können Angebote jederzeit auf ihrer Karte abbestellen.</li>
              <li>Geplante Angebote verschickt ein Zeitdienst, der alle paar Minuten prüft (siehe Einrichtung).</li>
            </ul>
          </section>
        )}

        {!loading && loggedIn && (
          <section className="rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-bold">Bisherige Angebote</h2>
            {campaigns.length === 0 ? (
              <p className="mt-3 text-gray-600">Noch keine Angebote gesendet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-orange-100">
                {campaigns.map((c) => (
                  <li key={c.id} className="py-3 text-sm">
                    <p className="font-semibold">{c.title}</p>
                    <p className="text-gray-600">
                      {c.status === "scheduled" && c.scheduled_at
                        ? `Geplant für ${new Date(c.scheduled_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`
                        : new Date(c.created_at).toLocaleDateString("de-DE")}{" "}
                      · {SEGMENTS[c.segment] ?? c.segment} ·{" "}
                      {c.status === "sent"
                        ? `gesendet an ${c.sent_count}${c.click_count > 0 ? `, ${c.click_count} Klicks` : ""}`
                        : c.status === "scheduled" ? "geplant"
                        : c.status === "cancelled" ? "abgebrochen"
                        : c.status === "failed" ? "nicht gesendet"
                        : "wird gesendet"}
                    </p>
                    {c.status === "scheduled" && (
                      <button type="button" onClick={() => void cancel(c.id)} className="mt-1 text-sm font-semibold text-red-700 underline">
                        Abbrechen
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
