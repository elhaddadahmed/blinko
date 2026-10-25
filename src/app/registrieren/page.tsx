
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ProfileForm = {
  name: string;
  category: string;
  description: string;
  city: string;
};

const emptyForm: ProfileForm = {
  name: "",
  category: "Restaurant",
  description: "",
  city: "",
};

function createSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export default function BusinessProfilePage() {
  const router = useRouter();

  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [userEmail, setUserEmail] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [existingSlug, setExistingSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        setError(
          "Bitte melde dich zuerst an. Danach kannst du dein Unternehmensprofil verwalten."
        );
        setLoading(false);
        return;
      }

      setUserEmail(authData.user.email ?? "");

      const { data: businesses, error: businessError } =
        await supabase
          .from("businesses")
          .select("id")
          .limit(1);

      if (businessError) {
        setError(`Unternehmen konnten nicht geladen werden: ${businessError.message}`);
        setLoading(false);
        return;
      }

      const business = businesses?.[0];

      if (!business) {
        setLoading(false);
        return;
      }

      setBusinessId(business.id);

      const { data: profile, error: profileError } =
        await supabase
          .from("business_profiles")
          .select(
            "name, category, description, address_public, slug"
          )
          .eq("business_id", business.id)
          .maybeSingle();

      if (profileError) {
        setError(`Profil konnte nicht geladen werden: ${profileError.message}`);
      } else if (profile) {
        setForm({
          name: profile.name ?? "",
          category: profile.category ?? "Restaurant",
          description: profile.description ?? "",
          city: profile.address_public ?? "",
        });
        setExistingSlug(profile.slug ?? "");
      }

      setLoading(false);
    }

    void loadProfile();
  }, []);

  function updateField(
    field: keyof ProfileForm,
    value: string
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        throw new Error("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
      }

      const name = form.name.trim();

      if (!name) {
        throw new Error("Bitte gib einen Unternehmensnamen ein.");
      }

      let currentBusinessId = businessId;

      // Falls noch kein Unternehmen existiert, eines anlegen.
      if (!currentBusinessId) {
        const { data: newBusiness, error: createBusinessError } =
          await supabase
            .from("businesses")
            .insert({ owner_id: authData.user.id })
            .select("id")
            .single();

        if (createBusinessError) {
          throw new Error(createBusinessError.message);
        }

        currentBusinessId = newBusiness.id;
        setBusinessId(currentBusinessId);
      }

      const baseSlug = createSlug(name);

      if (!baseSlug) {
        throw new Error("Bitte verwende einen gültigen Unternehmensnamen.");
      }

      // Beim Bearbeiten bleibt die bisherige öffentliche Adresse erhalten.
      const slug =
        existingSlug ||
        `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;

      const { error: profileError } = await supabase
        .from("business_profiles")
        .upsert(
          {
            business_id: currentBusinessId,
            slug,
            name,
            category: form.category,
            description: form.description.trim() || null,
            address_public: form.city.trim() || null,
            is_published: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "business_id" }
        );

      if (profileError) {
        throw new Error(profileError.message);
      }

      setExistingSlug(slug);
      setMessage(
        "Profil erfolgreich gespeichert! Es ist noch nicht öffentlich veröffentlicht."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Beim Speichern ist ein Fehler aufgetreten."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF8EF] p-8 text-[#202A35]">
        Profil wird geladen …
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-12 text-[#202A35]">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-2xl font-extrabold">
          <span className="text-[#F36B21]">B</span> Blinko
        </Link>

        <div className="mt-8 rounded-3xl border border-orange-100 bg-white p-6 shadow-sm sm:p-9">
          <p className="text-sm font-semibold text-[#F36B21]">
            UNTERNEHMENS-DASHBOARD
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Dein Geschäftsprofil
          </h1>

          <p className="mt-3 text-gray-600">
            Verwalte die Informationen, die Kunden später auf deiner
            öffentlichen Blinko-Seite sehen können.
          </p>

          {userEmail && (
            <p className="mt-4 text-sm text-gray-500">
              Angemeldet als: {userEmail}
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="name" className="mb-2 block font-semibold">
                Unternehmensname *
              </label>
              <input
                id="name"
                required
                maxLength={100}
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="z. B. Café Muster"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-[#F36B21]"
              />
            </div>

            <div>
              <label htmlFor="category" className="mb-2 block font-semibold">
                Branche *
              </label>
              <select
                id="category"
                required
                value={form.category}
                onChange={(event) => updateField("category", event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-[#F36B21]"
              >
                <option>Restaurant</option>
                <option>Café</option>
                <option>Friseur</option>
                <option>Beauty & Wellness</option>
                <option>Einzelhandel</option>
                <option>Sonstiges</option>
              </select>
            </div>

            <div>
              <label htmlFor="description" className="mb-2 block font-semibold">
                Beschreibung
              </label>
              <textarea
                id="description"
                rows={4}
                maxLength={2000}
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                placeholder="Was macht dein Unternehmen besonders?"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-[#F36B21]"
              />
            </div>

            <div>
              <label htmlFor="city" className="mb-2 block font-semibold">
                Stadt
              </label>
              <input
                id="city"
                maxLength={200}
                value={form.city}
                onChange={(event) => updateField("city", event.target.value)}
                placeholder="z. B. Bremen"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-[#F36B21]"
              />
            </div>

            {message && (
              <p
                role="status"
                className="rounded-xl bg-green-50 p-4 text-sm text-green-800"
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Wird gespeichert …" : "Profil speichern"}
            </button>
          </form>

          <p className="mt-5 text-sm leading-6 text-gray-500">
            Dein Profil bleibt zunächst unveröffentlicht. Dadurch werden
            deine Geschäftsdaten nicht automatisch öffentlich angezeigt.
          </p>
        </div>
      </div>
    </main>
  );
}
