"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Stats = { cards: number; stamps: number; stamps30: number; redemptions: number };

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (!cancelled) setLoggedIn(false);
        return;
      }
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const count = (table: string) =>
        supabase.from(table).select("id", { count: "exact", head: true });
      const [cards, stamps, stamps30, reds] = await Promise.all([
        count("loyalty_cards"),
        count("loyalty_stamps"),
        count("loyalty_stamps").gte("created_at", since),
        count("loyalty_redemptions"),
      ]);
      if (cancelled) return;
      const failed = [cards, stamps, stamps30, reds].find((r) => r.error);
      if (failed?.error) {
        setError(
          failed.error.code === "PGRST205" || failed.error.code === "42P01"
            ? "Die Datenbank für das Treueprogramm ist noch nicht eingerichtet."
            : failed.error.message
        );
        return;
      }
      setStats({
        cards: cards.count ?? 0,
        stamps: stamps.count ?? 0,
        stamps30: stamps30.count ?? 0,
        redemptions: reds.count ?? 0,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const items: [string, number | undefined][] = [
    ["Treuekarten gestartet", stats?.cards],
    ["Stempel insgesamt", stats?.stamps],
    ["Stempel (letzte 30 Tage)", stats?.stamps30],
    ["Belohnungen eingelöst", stats?.redemptions],
  ];

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-10 text-[#202A35]">
      <div className="mx-auto max-w-2xl">
        <section className="rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold">Statistiken</h1>
          <p className="mt-3 text-gray-600">Echte Zahlen aus deinem Treueprogramm.</p>

          {!loggedIn && (
            <p className="mt-6">
              Bitte <Link href="/anmelden" className="font-semibold text-[#F36B21]">melde dich an</Link>.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
          )}
          {loggedIn && !error && (
            <dl className="mt-6 grid grid-cols-2 gap-4" aria-busy={!stats}>
              {items.map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-[#FFF8EF] p-5">
                  <dt className="text-sm text-gray-600">{label}</dt>
                  <dd className="mt-1 text-3xl font-extrabold">{value ?? "…"}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-6 text-sm text-gray-500">
            Profilaufrufe sowie QR- und NFC-Aufrufe werden noch nicht gezählt.
          </p>
        </section>
      </div>
    </main>
  );
}
