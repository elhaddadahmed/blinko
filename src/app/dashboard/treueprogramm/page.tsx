"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type MessageType = "info" | "success" | "error";

function errorText(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const e = error as { code?: string; message?: string };
    if (e.code === "PGRST205" || e.code === "42P01") {
      return "Die Datenbank für das Treueprogramm ist noch nicht eingerichtet. Führe zuerst die Datei 0002_loyalty.sql im Supabase SQL Editor aus.";
    }
    if (typeof e.message === "string") return e.message;
  }
  return "Etwas ist schiefgelaufen.";
}

export default function LoyaltyProgramPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true);
  const [businessId, setBusinessId] = useState("");
  const [programId, setProgramId] = useState("");
  const [profilePublished, setProfilePublished] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  const [name, setName] = useState("Treuekarte");
  const [description, setDescription] = useState("");
  const [stampsRequired, setStampsRequired] = useState("7");
  const [reward, setReward] = useState("");
  const [terms, setTerms] = useState("");
  const [isActive, setIsActive] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("info");

  function show(text: string, type: MessageType = "info") {
    setMessage(text);
    setMessageType(type);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!auth.user) {
          setLoggedIn(false);
          return;
        }

        const { data: businesses, error } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", auth.user.id)
          .limit(1);
        if (error) throw error;
        if (cancelled || !businesses?.length) return;

        const bid = businesses[0].id as string;
        setBusinessId(bid);

        const { data: profile, error: profileError } = await supabase
          .from("business_profiles")
          .select("is_published")
          .eq("business_id", bid)
          .maybeSingle();
        if (profileError) throw profileError;
        setHasProfile(Boolean(profile));
        setProfilePublished(Boolean(profile?.is_published));

        const { data: program, error: programError } = await supabase
          .from("loyalty_programs")
          .select("id, name, description, stamps_required, reward, terms, is_active")
          .eq("business_id", bid)
          .maybeSingle();
        if (programError) throw programError;
        if (cancelled) return;

        if (program) {
          setProgramId(program.id as string);
          setName(program.name ?? "");
          setDescription(program.description ?? "");
          setStampsRequired(String(program.stamps_required ?? 7));
          setReward(program.reward ?? "");
          setTerms(program.terms ?? "");
          setIsActive(Boolean(program.is_active));
        }
      } catch (e) {
        if (!cancelled) show(errorText(e), "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");

    try {
      const trimmedName = name.trim();
      const trimmedReward = reward.trim();
      const count = Number(stampsRequired);

      if (!businessId || !hasProfile) {
        throw new Error("Lege zuerst dein Geschäftsprofil an und speichere es.");
      }
      if (!trimmedName) throw new Error("Bitte gib einen Programmnamen ein.");
      if (!trimmedReward) throw new Error("Bitte beschreibe die Belohnung.");
      if (!Number.isInteger(count) || count < 2 || count > 50) {
        throw new Error("Die Stempelanzahl muss eine ganze Zahl zwischen 2 und 50 sein.");
      }

      const values = {
        name: trimmedName,
        description: description.trim() || null,
        stamps_required: count,
        reward: trimmedReward,
        terms: terms.trim() || null,
        is_active: isActive,
      };

      if (programId) {
        const { error } = await supabase
          .from("loyalty_programs")
          .update(values)
          .eq("id", programId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("loyalty_programs")
          .insert({ business_id: businessId, ...values })
          .select("id")
          .single();
        if (error) throw error;
        setProgramId(data.id as string);
      }

      show(
        isActive
          ? profilePublished
            ? "Gespeichert. Dein Treueprogramm ist aktiv und auf deinem Profil sichtbar."
            : "Gespeichert und aktiv. Sichtbar wird es erst, wenn du dein Profil veröffentlichst."
          : "Gespeichert. Das Programm ist noch nicht aktiv.",
        "success"
      );
    } catch (e) {
      show(errorText(e), "error");
    } finally {
      setSaving(false);
    }
  }

  const styles: Record<MessageType, string> = {
    info: "bg-orange-50",
    success: "bg-green-50 text-green-800",
    error: "bg-red-50 text-red-700",
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF8EF] p-8" aria-busy="true">
        Treueprogramm wird geladen …
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-10 text-[#202A35]">
      <div className="mx-auto max-w-2xl">
        <section className="rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold">Treueprogramm</h1>
          <p className="mt-3 text-gray-600">
            Lege deine digitale Stempelkarte fest. Kunden brauchen dafür weder App noch Konto.
          </p>

          {!loggedIn ? (
            <p className="mt-6">
              Bitte{" "}
              <Link href="/anmelden" className="font-semibold text-[#F36B21]">
                melde dich an
              </Link>
              .
            </p>
          ) : !hasProfile ? (
            <p className="mt-6">
              Lege zuerst dein{" "}
              <Link href="/dashboard/profil" className="font-semibold text-[#F36B21]">
                Geschäftsprofil
              </Link>{" "}
              an. Das Treueprogramm gehört zu deinem Profil.
              {message && (
                <span role="alert" className="mt-4 block rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  {message}
                </span>
              )}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="pname" className="mb-2 block font-semibold">Programmname *</label>
                <input id="pname" required maxLength={80} value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3" />
              </div>

              <div>
                <label htmlFor="pdesc" className="mb-2 block font-semibold">Beschreibung</label>
                <textarea id="pdesc" rows={3} maxLength={500} value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  placeholder="z. B. Sammle bei jedem Besuch einen Stempel." />
              </div>

              <div>
                <label htmlFor="pcount" className="mb-2 block font-semibold">Benötigte Stempel *</label>
                <input id="pcount" type="number" inputMode="numeric" min={2} max={50} required
                  value={stampsRequired} onChange={(e) => setStampsRequired(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3" />
                <p className="mt-1 text-sm text-gray-600">Zwischen 2 und 50.</p>
              </div>

              <div>
                <label htmlFor="preward" className="mb-2 block font-semibold">Belohnung *</label>
                <input id="preward" required maxLength={120} value={reward}
                  onChange={(e) => setReward(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  placeholder="z. B. Ein Gratis-Kaffee" />
              </div>

              <div>
                <label htmlFor="pterms" className="mb-2 block font-semibold">Teilnahmebedingungen</label>
                <textarea id="pterms" rows={3} maxLength={2000} value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  placeholder="z. B. Ein Stempel pro Besuch. Nicht mit anderen Aktionen kombinierbar." />
              </div>

              <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-5 w-5 accent-orange-500" />
                  <span>
                    <span className="block font-semibold">Treueprogramm aktivieren</span>
                    <span className="mt-1 block text-sm text-gray-600">
                      {isActive
                        ? "Das Programm wird auf deinem öffentlichen Profil angezeigt."
                        : "Das Programm bleibt für Kunden unsichtbar."}
                    </span>
                  </span>
                </label>
              </div>

              {!profilePublished && (
                <p className="rounded-xl bg-orange-50 p-4 text-sm">
                  Dein Profil ist noch nicht veröffentlicht. Das Programm ist erst sichtbar, wenn du es{" "}
                  <Link href="/dashboard/profil" className="font-semibold text-[#F36B21]">veröffentlichst</Link>.
                </p>
              )}

              {message && (
                <p role={messageType === "error" ? "alert" : "status"}
                  className={`rounded-xl p-4 text-sm ${styles[messageType]}`}>
                  {message}
                </p>
              )}

              <button type="submit" disabled={saving}
                className="w-full rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white disabled:opacity-60">
                {saving ? "Wird gespeichert …" : "Treueprogramm speichern"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
