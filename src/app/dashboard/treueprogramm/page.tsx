"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type MessageType = "info" | "success" | "error";

function errorText(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const e = error as { code?: string; message?: string };
    if (e.code === "42703") {
      return "Die Datenbank ist noch nicht auf dem neuesten Stand. Führe die Datei setup_all.sql im Supabase SQL Editor aus.";
    }
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
  const [nearbyOn, setNearbyOn] = useState(false);
  const [nearbyLat, setNearbyLat] = useState("");
  const [nearbyLng, setNearbyLng] = useState("");
  const [nearbyRadius, setNearbyRadius] = useState("200");
  const [nearbyText, setNearbyText] = useState("");
  const [locating, setLocating] = useState(false);

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
          .select("id, name, description, stamps_required, reward, terms, is_active, nearby_enabled, nearby_lat, nearby_lng, nearby_radius_m, nearby_text")
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
          setNearbyOn(Boolean(program.nearby_enabled));
          setNearbyLat(program.nearby_lat == null ? "" : String(program.nearby_lat));
          setNearbyLng(program.nearby_lng == null ? "" : String(program.nearby_lng));
          setNearbyRadius(String(program.nearby_radius_m ?? 200));
          setNearbyText((program.nearby_text as string | null) ?? "");
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

      const lat = nearbyLat.trim() === "" ? null : Number(nearbyLat.replace(",", "."));
      const lng = nearbyLng.trim() === "" ? null : Number(nearbyLng.replace(",", "."));
      const radius = Number(nearbyRadius);
      if (nearbyOn) {
        if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          throw new Error("Für den Nähe-Hinweis brauchst du den Standort deines Geschäfts.");
        }
        if (!Number.isInteger(radius) || radius < 50 || radius > 1000) {
          throw new Error("Der Radius muss zwischen 50 und 1000 Metern liegen.");
        }
      }

      const values = {
        name: trimmedName,
        description: description.trim() || null,
        stamps_required: count,
        reward: trimmedReward,
        terms: terms.trim() || null,
        is_active: isActive,
        nearby_enabled: nearbyOn,
        nearby_lat: lat !== null && !Number.isNaN(lat) ? lat : null,
        nearby_lng: lng !== null && !Number.isNaN(lng) ? lng : null,
        nearby_radius_m: Number.isInteger(radius) && radius >= 50 && radius <= 1000 ? radius : 200,
        nearby_text: nearbyText.trim() || null,
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

              <fieldset className="rounded-xl border border-gray-200 p-4">
                <legend className="px-2 font-semibold">Nähe-Hinweis (Beta)</legend>
                <p className="text-sm text-gray-600">
                  Kunden, die es auf ihrer Karte erlauben, sehen einen Hinweis, wenn sie in der Nähe sind. Das klappt nur,
                  solange die Karte auf ihrem Handy geöffnet ist, nicht im Hintergrund. Der Standort der Kunden wird nie gespeichert.
                </p>
                <label className="mt-3 flex cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={nearbyOn} onChange={(e) => setNearbyOn(e.target.checked)} className="h-5 w-5 accent-orange-500" />
                  <span className="font-semibold">Nähe-Hinweis anbieten</span>
                </label>
                {nearbyOn && (
                  <div className="mt-4 space-y-3">
                    <button type="button" disabled={locating}
                      onClick={() => {
                        if (!("geolocation" in navigator)) return;
                        setLocating(true);
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            setNearbyLat(pos.coords.latitude.toFixed(5));
                            setNearbyLng(pos.coords.longitude.toFixed(5));
                            setLocating(false);
                          },
                          () => {
                            setMessage("Der Standort konnte nicht ermittelt werden. Du kannst die Werte auch von Hand eintragen.");
                            setMessageType("error");
                            setLocating(false);
                          },
                          { enableHighAccuracy: true, timeout: 20000 }
                        );
                      }}
                      className="rounded-full border border-[#F36B21] px-4 py-2 font-bold text-[#F36B21] disabled:opacity-60">
                      {locating ? "Standort wird ermittelt …" : "Aktuellen Standort als Geschäftsstandort übernehmen"}
                    </button>
                    <p className="text-xs text-gray-500">Am besten tippst du das, während du im Geschäft stehst.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="nlat" className="mb-1 block text-sm font-semibold">Breitengrad</label>
                        <input id="nlat" inputMode="decimal" value={nearbyLat} onChange={(e) => setNearbyLat(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2" placeholder="53.07930" />
                      </div>
                      <div>
                        <label htmlFor="nlng" className="mb-1 block text-sm font-semibold">Längengrad</label>
                        <input id="nlng" inputMode="decimal" value={nearbyLng} onChange={(e) => setNearbyLng(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2" placeholder="8.80170" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="nrad" className="mb-1 block text-sm font-semibold">Radius</label>
                      <select id="nrad" value={nearbyRadius} onChange={(e) => setNearbyRadius(e.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2">
                        <option value="100">100 Meter</option>
                        <option value="200">200 Meter</option>
                        <option value="300">300 Meter</option>
                        <option value="500">500 Meter</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="ntext" className="mb-1 block text-sm font-semibold">Text des Hinweises</label>
                      <input id="ntext" maxLength={120} value={nearbyText} onChange={(e) => setNearbyText(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2" placeholder="z. B. Heute doppelter Stempel auf Cappuccino" />
                    </div>
                  </div>
                )}
              </fieldset>

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
