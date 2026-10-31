"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const CONFIRM_WORD = "LÖSCHEN";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setEmail(data.user?.email ?? null);
      setLoggedIn(Boolean(data.user));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function exportData() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Bitte melde dich zuerst an.");

      const { data: businesses, error: bErr } = await supabase
        .from("businesses")
        .select("*")
        .eq("owner_id", auth.user.id);
      if (bErr) throw bErr;

      const ids = (businesses ?? []).map((b) => b.id as string);
      const profiles = ids.length
        ? await supabase.from("business_profiles").select("*").in("business_id", ids)
        : { data: [], error: null };
      const programs = ids.length
        ? await supabase.from("loyalty_programs").select("*").in("business_id", ids)
        : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      // Fehlt die Treueprogramm-Tabelle, wird der Rest trotzdem exportiert
      const programRows = programs.error ? [] : (programs.data ?? []);

      const count = async (table: string) => {
        const r = await supabase.from(table).select("id", { count: "exact", head: true });
        return r.error ? null : (r.count ?? 0);
      };

      const payload = {
        exportiert_am: new Date().toISOString(),
        konto: { id: auth.user.id, email: auth.user.email, erstellt_am: auth.user.created_at },
        unternehmen: businesses,
        profil: profiles.data,
        treueprogramm: programRows,
        statistik: {
          treuekarten: await count("loyalty_cards"),
          stempel: await count("loyalty_stamps"),
          einloesungen: await count("loyalty_redemptions"),
        },
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blinko-datenexport-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage("Der Export wurde heruntergeladen.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Der Export ist fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (confirm !== CONFIRM_WORD || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const { data, error: rpcError } = await supabase.rpc("delete_my_account");
    if (rpcError || !data?.ok) {
      setBusy(false);
      setError(
        rpcError?.code === "PGRST202"
          ? "Die Löschfunktion ist in der Datenbank noch nicht eingerichtet (Datei 0003_delete_account.sql)."
          : "Das Konto konnte nicht gelöscht werden. Bitte versuche es erneut."
      );
      return;
    }
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-10 text-[#202A35]">
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold">Konto</h1>
          {loading ? (
            <p className="mt-4" aria-busy="true">Wird geladen …</p>
          ) : !loggedIn ? (
            <p className="mt-4">
              Bitte <Link href="/anmelden" className="font-semibold text-[#F36B21]">melde dich an</Link>.
            </p>
          ) : (
            <p className="mt-3 text-gray-600">Angemeldet als {email}</p>
          )}
        </section>

        {loggedIn && !loading && (
          <>
            <section className="rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-bold">Daten exportieren</h2>
              <p className="mt-2 text-gray-600">
                Lade deine Daten (Konto, Unternehmensprofil, Treueprogramm und Statistik-Summen) als Datei herunter.
              </p>
              <button type="button" onClick={exportData} disabled={busy}
                className="mt-4 rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white disabled:opacity-60">
                {busy ? "Bitte warten …" : "Daten exportieren"}
              </button>
            </section>

            <section className="rounded-3xl border border-red-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-bold text-red-700">Konto löschen</h2>
              <p className="mt-2 text-gray-700">
                Damit werden dein Konto, dein Unternehmensprofil und dein Treueprogramm{" "}
                <strong>endgültig gelöscht</strong>. Alle Treuekarten deiner Kundinnen und Kunden
                inklusive Stempel und Einlösungen werden ebenfalls entfernt. Das lässt sich nicht
                rückgängig machen. Exportiere vorher deine Daten.
              </p>
              <label htmlFor="confirm" className="mt-4 block font-semibold">
                Tippe zur Bestätigung {CONFIRM_WORD}
              </label>
              <input id="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" />
              <button type="button" onClick={deleteAccount}
                disabled={busy || confirm !== CONFIRM_WORD}
                className="mt-4 rounded-full bg-red-700 px-5 py-3 font-bold text-white disabled:opacity-40">
                {busy ? "Bitte warten …" : "Konto endgültig löschen"}
              </button>
            </section>
          </>
        )}

        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{message}</p>}
      </div>
    </main>
  );
}
