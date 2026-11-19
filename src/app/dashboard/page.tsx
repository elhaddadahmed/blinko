"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Stats = {
  cards: number;
  cards7: number;
  active30: number;
  stamps: number;
  stamps7: number;
  redemptions: number;
  open: number;
};
type Activity = { at: string; text: string };
type Setup = { profile: boolean; published: boolean; program: boolean; active: boolean; stamped: boolean };

const DAY = 24 * 60 * 60 * 1000;

function errorText(e: unknown): string {
  const err = (typeof e === "object" && e !== null ? e : {}) as { code?: string; message?: string };
  if (err.code === "PGRST205" || err.code === "42P01") {
    return "Die Datenbank für das Treueprogramm ist noch nicht eingerichtet (Datei 0002_loyalty.sql).";
  }
  return err.message ?? "Die Daten konnten nicht geladen werden.";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `Heute, ${time}`;
  const yesterday = new Date(today.getTime() - DAY);
  if (d.toDateString() === yesterday.toDateString()) return `Gestern, ${time}`;
  return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, ${time}`;
}

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [setup, setSetup] = useState<Setup>({
    profile: false, published: false, program: false, active: false, stamped: false,
  });
  const [programName, setProgramName] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) {
          if (!cancelled) setLoggedIn(false);
          return;
        }

        const { data: businesses, error: bErr } = await supabase
          .from("businesses").select("id").eq("owner_id", auth.user.id).limit(1);
        if (bErr) throw bErr;
        if (!businesses?.length) return;
        const bid = businesses[0].id as string;

        const { data: profile, error: pErr } = await supabase
          .from("business_profiles").select("is_published").eq("business_id", bid).maybeSingle();
        if (pErr) throw pErr;

        const { data: program, error: prErr } = await supabase
          .from("loyalty_programs")
          .select("id, name, stamps_required, is_active")
          .eq("business_id", bid).maybeSingle();
        if (prErr) throw prErr;

        const since7 = new Date(Date.now() - 7 * DAY).toISOString();
        const since30 = new Date(Date.now() - 30 * DAY).toISOString();
        const head = (table: string) => supabase.from(table).select("id", { count: "exact", head: true });

        let loaded: Stats | null = null;
        let events: Activity[] = [];

        if (program) {
          const [cards, cards7, active30, stamps, stamps7, reds, open, lastStamps, lastReds, lastCards] =
            await Promise.all([
              head("loyalty_cards"),
              head("loyalty_cards").gte("created_at", since7),
              head("loyalty_cards").gte("last_stamp_at", since30),
              head("loyalty_stamps"),
              head("loyalty_stamps").gte("created_at", since7),
              head("loyalty_redemptions"),
              head("loyalty_cards").eq("status", "active").gte("stamps", program.stamps_required as number),
              supabase.from("loyalty_stamps").select("created_at").order("created_at", { ascending: false }).limit(10),
              supabase.from("loyalty_redemptions").select("created_at").order("created_at", { ascending: false }).limit(10),
              supabase.from("loyalty_cards").select("created_at").order("created_at", { ascending: false }).limit(10),
            ]);
          const failed = [cards, cards7, active30, stamps, stamps7, reds, open, lastStamps, lastReds, lastCards].find((r) => r.error);
          if (failed?.error) throw failed.error;

          loaded = {
            cards: cards.count ?? 0, cards7: cards7.count ?? 0, active30: active30.count ?? 0,
            stamps: stamps.count ?? 0, stamps7: stamps7.count ?? 0,
            redemptions: reds.count ?? 0, open: open.count ?? 0,
          };
          events = [
            ...(lastStamps.data ?? []).map((r) => ({ at: r.created_at as string, text: "Ein Stempel wurde vergeben" })),
            ...(lastReds.data ?? []).map((r) => ({ at: r.created_at as string, text: "Eine Belohnung wurde eingelöst" })),
            ...(lastCards.data ?? []).map((r) => ({ at: r.created_at as string, text: "Eine neue Treuekarte wurde gestartet" })),
          ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
        }

        if (cancelled) return;
        setStats(loaded);
        setActivity(events);
        setProgramName((program?.name as string) ?? "");
        setSetup({
          profile: Boolean(profile),
          published: Boolean(profile?.is_published),
          program: Boolean(program),
          active: Boolean(program?.is_active),
          stamped: (loaded?.stamps ?? 0) > 0,
        });
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const steps: { done: boolean; label: string; href: string }[] = [
    { done: setup.profile, label: "Geschäftsprofil anlegen", href: "/dashboard/profil" },
    { done: setup.published, label: "Profil veröffentlichen", href: "/dashboard/profil" },
    { done: setup.active, label: "Treueprogramm einrichten und aktivieren", href: "/dashboard/treueprogramm" },
    { done: setup.stamped, label: "Ersten Stempel vergeben", href: "/dashboard/stempeln" },
  ];
  const allDone = steps.every((s) => s.done);

  const kpis: { label: string; value: number | undefined; hint: string }[] = [
    { label: "Treuekarten gestartet", value: stats?.cards, hint: `${stats?.cards7 ?? 0} in den letzten 7 Tagen` },
    { label: "Aktive Karten", value: stats?.active30, hint: "mit Stempel in den letzten 30 Tagen" },
    { label: "Stempel vergeben", value: stats?.stamps, hint: `${stats?.stamps7 ?? 0} in den letzten 7 Tagen` },
    { label: "Belohnungen eingelöst", value: stats?.redemptions, hint: "insgesamt" },
  ];

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-10 text-[#202A35]">
      <div className="mx-auto max-w-3xl space-y-6">
        <section>
          <h1 className="text-3xl font-bold">Übersicht</h1>
          <p className="mt-2 text-gray-600">
            {programName ? `Dein Programm: ${programName}` : "Hier siehst du, wie dein Treueprogramm läuft."}
          </p>
        </section>

        {loading && <p aria-busy="true">Wird geladen …</p>}

        {!loading && !loggedIn && (
          <p>
            Bitte <Link href="/anmelden" className="font-semibold text-[#F36B21]">melde dich an</Link>.
          </p>
        )}

        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        {!loading && loggedIn && !allDone && (
          <section className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">So kommst du zum ersten Stempel</h2>
            <ol className="mt-4 space-y-3">
              {steps.map((s) => (
                <li key={s.label} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                      s.done ? "border-[#F36B21] bg-[#F36B21] text-white" : "border-gray-300 text-gray-300"
                    }`}
                  >
                    {s.done ? "✓" : ""}
                  </span>
                  {s.done ? (
                    <span className="text-gray-500 line-through">{s.label}</span>
                  ) : (
                    <Link href={s.href} className="font-semibold text-[#F36B21] hover:underline">{s.label}</Link>
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-gray-600">
              Danach den QR-Code unter{" "}
              <Link href="/dashboard/qr" className="font-semibold text-[#F36B21]">QR-Code &amp; NFC</Link>{" "}
              ausdrucken und an der Kasse platzieren.
            </p>
          </section>
        )}

        {!loading && loggedIn && stats && (
          <>
            <section aria-label="Kennzahlen">
              <dl className="grid grid-cols-2 gap-4">
                {kpis.map((k) => (
                  <div key={k.label} className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
                    <dt className="text-sm text-gray-600">{k.label}</dt>
                    <dd className="mt-1 text-3xl font-extrabold">{k.value ?? 0}</dd>
                    <p className="mt-1 text-xs text-gray-500">{k.hint}</p>
                  </div>
                ))}
              </dl>
              {stats.open > 0 && (
                <Link href="/dashboard/stempeln"
                  className="mt-4 block rounded-2xl bg-[#F36B21] p-4 font-bold text-white">
                  {stats.open === 1
                    ? "1 Karte hat eine Belohnung bereit. Jetzt einlösen →"
                    : `${stats.open} Karten haben eine Belohnung bereit. Jetzt einlösen →`}
                </Link>
              )}
            </section>

            <section className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Letzte Aktivität</h2>
              {activity.length === 0 ? (
                <p className="mt-3 text-gray-600">
                  Noch keine Aktivität. Sobald ein Kunde eine Karte startet oder du einen Stempel vergibst,
                  erscheint es hier.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-orange-100">
                  {activity.map((a, i) => (
                    <li key={`${a.at}-${i}`} className="flex justify-between gap-4 py-2 text-sm">
                      <span>{a.text}</span>
                      <span className="shrink-0 text-gray-500">{formatWhen(a.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
