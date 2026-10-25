"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DAYS, parseHours, type Hours } from "@/lib/hours";

type MessageType = "info" | "success" | "error";

const CATEGORIES = [
  "Restaurant",
  "Café",
  "Friseur",
  "Beauty & Wellness",
  "Einzelhandel",
  "Sonstiges",
] as const;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

function createSlugBase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : "https://" + trimmed;

  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
      throw new Error();
    }
    return withProtocol;
  } catch {
    throw new Error(
      "Bitte gib eine gültige Website-Adresse ein, z. B. https://example.de."
    );
  }
}

export default function BusinessProfilePage() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("Restaurant");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState<Hours>({});
  const [businessId, setBusinessId] = useState("");
  const [slug, setSlug] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("info");

  function showMessage(text: string, type: MessageType = "info") {
    setMessage(text);
    setMessageType(type);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: auth, error: authError } =
          await supabase.auth.getUser();

        if (cancelled) return;

        if (authError || !auth.user) {
          setIsLoggedIn(false);
          showMessage("Bitte melde dich zuerst an.", "error");
          return;
        }

        const { data: businesses, error } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", auth.user.id)
          .limit(1);

        if (error) throw error;
        if (cancelled) return;

        if (!businesses || businesses.length === 0) {
          showMessage(
            "Es wurde noch kein Unternehmen gefunden. Fülle das Formular aus und speichere es."
          );
          return;
        }

        const id = businesses[0].id as string;
        setBusinessId(id);

        const { data: profile, error: profileError } = await supabase
          .from("business_profiles")
          .select(
            "name, category, description, address_public, website_url, phone_public, opening_hours, slug, is_published"
          )
          .eq("business_id", id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (cancelled) return;

        if (profile) {
          setName(profile.name ?? "");
          setCategory(profile.category ?? "Restaurant");
          setDescription(profile.description ?? "");
          setCity(profile.address_public ?? "");
          setWebsite(profile.website_url ?? "");
          setPhone(profile.phone_public ?? "");
          setHours(parseHours(profile.opening_hours));
          setSlug(profile.slug ?? "");
          setIsPublished(Boolean(profile.is_published));
        }
      } catch (error) {
        if (!cancelled) {
          showMessage(
            "Fehler beim Laden: " +
              getErrorMessage(error, "Das Profil konnte nicht geladen werden."),
            "error"
          );
        }
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
      // 1. Alles validieren, BEVOR etwas in die Datenbank geschrieben wird
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("Bitte gib einen Unternehmensnamen ein.");
      }

      const normalizedWebsite = normalizeWebsite(website);

      const cleanHours = parseHours(hours);
      const openingHours = Object.keys(cleanHours).length ? cleanHours : null;

      const trimmedPhone = phone.trim();
      if (trimmedPhone && !/^[+()\d][\d\s()/.+-]{4,38}$/.test(trimmedPhone)) {
        throw new Error("Bitte gib eine gültige Telefonnummer ein, z. B. +49 421 123456.");
      }

      const baseSlug = createSlugBase(trimmedName);
      if (!baseSlug && !slug) {
        throw new Error("Bitte gib einen gültigen Unternehmensnamen ein.");
      }

      // 2. Authentifizierung prüfen
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError || !auth.user) {
        throw new Error("Bitte melde dich zuerst an.");
      }

      // 3. Unternehmen bei Bedarf anlegen
      let id = businessId;

      if (!id) {
        const { data: business, error } = await supabase
          .from("businesses")
          .insert({ owner_id: auth.user.id })
          .select("id")
          .single();

        if (error) throw error;

        id = business.id as string;
        setBusinessId(id);
      }

      // 4. Slug bleibt nach dem ersten Speichern bewusst stabil,
      //    damit öffentliche Links nicht brechen.
      const publicSlug = slug || `${baseSlug || "unternehmen"}-${Date.now().toString(36)}`;

      // 5. Profil speichern
      const { error: profileError } = await supabase
        .from("business_profiles")
        .upsert(
          {
            business_id: id,
            slug: publicSlug,
            name: trimmedName,
            category,
            description: description.trim() || null,
            address_public: city.trim() || null,
            website_url: normalizedWebsite || null,
            phone_public: trimmedPhone || null,
            opening_hours: openingHours,
            is_published: isPublished,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "business_id" }
        );

      if (profileError) {
        if (isUniqueViolation(profileError)) {
          throw new Error(
            "Diese Profil-Adresse ist bereits vergeben. Bitte versuche es erneut."
          );
        }
        throw profileError;
      }

      setSlug(publicSlug);
      setWebsite(normalizedWebsite);
      setHours(cleanHours);
      showMessage(
        isPublished
          ? "Profil gespeichert und veröffentlicht."
          : "Profil gespeichert! Es ist noch nicht öffentlich.",
        "success"
      );
    } catch (error) {
      showMessage(getErrorMessage(error, "Speichern fehlgeschlagen."), "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF8EF] p-8" aria-busy="true">
        Profil wird geladen …
      </main>
    );
  }

  const messageStyles: Record<MessageType, string> = {
    info: "bg-orange-50 text-[#202A35]",
    success: "bg-green-50 text-green-800",
    error: "bg-red-50 text-red-700",
  };

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-12 text-[#202A35]">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-2xl font-extrabold">
          <span className="text-[#F36B21]">B</span> Blinko
        </Link>

        <section className="mt-8 rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold">Dein Geschäftsprofil</h1>
          <p className="mt-3 text-gray-600">
            Verwalte die Informationen deines Unternehmens.
          </p>

          {!isLoggedIn ? (
            <div className="mt-8 space-y-4">
              <p
                role="alert"
                className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
              >
                {message}
              </p>
              <Link
                href="/anmelden"
                className="inline-block rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white"
              >
                Zur Anmeldung
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
              <div>
                <label htmlFor="name" className="mb-2 block font-semibold">
                  Unternehmensname *
                </label>
                <input
                  id="name"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  placeholder="z. B. Café Muster"
                />
              </div>

              <div>
                <label htmlFor="category" className="mb-2 block font-semibold">
                  Branche *
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="mb-2 block font-semibold"
                >
                  Beschreibung
                </label>
                <textarea
                  id="description"
                  rows={4}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  placeholder="Was macht dein Unternehmen besonders?"
                />
              </div>

              <div>
                <label htmlFor="city" className="mb-2 block font-semibold">
                  Stadt oder Geschäftsadresse
                </label>
                <input
                  id="city"
                  maxLength={200}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  placeholder="z. B. Bremen"
                />
              </div>

              <div>
                <label htmlFor="website" className="mb-2 block font-semibold">
                  Website
                </label>
                <input
                  id="website"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  maxLength={500}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  placeholder="https://dein-unternehmen.de"
                />
              </div>

              <div>
                <label htmlFor="phone" className="mb-2 block font-semibold">
                  Telefonnummer
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={40}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  placeholder="+49 421 123456"
                />
              </div>

              <fieldset>
                <legend className="mb-2 block font-semibold">Öffnungszeiten</legend>
                <p className="mb-3 text-sm text-gray-600">
                  Freitext, z. B. „09:00–18:00“ oder „geschlossen“. Leer lassen, wenn der Tag nicht angezeigt werden soll.
                </p>
                <div className="space-y-2">
                  {DAYS.map(([key, label]) => (
                    <div key={key} className="flex items-center gap-3">
                      <label htmlFor={`hours-${key}`} className="w-28 shrink-0 text-sm font-medium">
                        {label}
                      </label>
                      <input
                        id={`hours-${key}`}
                        type="text"
                        maxLength={40}
                        value={hours[key] ?? ""}
                        onChange={(e) => setHours((h) => ({ ...h, [key]: e.target.value }))}
                        className="w-full rounded-xl border border-gray-300 px-4 py-2"
                        placeholder="09:00–18:00"
                      />
                    </div>
                  ))}
                </div>
              </fieldset>

              <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(event) => setIsPublished(event.target.checked)}
                    className="h-5 w-5 accent-orange-500"
                  />

                  <span>
                    <span className="block font-semibold">
                      Unternehmensprofil veröffentlichen
                    </span>
                    <span className="mt-1 block text-sm text-gray-600">
                      {isPublished
                        ? "Dein Profil soll öffentlich sichtbar sein."
                        : "Dein Profil bleibt privat."}
                    </span>
                  </span>
                </label>
              </div>

              {message && (
                <p
                  role={messageType === "error" ? "alert" : "status"}
                  className={`break-words rounded-xl p-4 text-sm ${messageStyles[messageType]}`}
                >
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white disabled:opacity-60"
              >
                {saving ? "Wird gespeichert …" : "Profil speichern"}
              </button>

              {slug && (
                <p className="text-sm text-gray-600">
                  Profil-Slug: <code>{slug}</code>
                </p>
              )}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
