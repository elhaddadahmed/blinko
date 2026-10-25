"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RegistrierenPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setInfo("");

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) throw signUpError;

      if (data.session) {
        router.push("/dashboard/profil");
        router.refresh();
      } else {
        setInfo(
          "Fast geschafft! Wir haben dir eine E-Mail geschickt. Bestätige deine Adresse und melde dich danach an."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Registrierung fehlgeschlagen."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-12 text-[#202A35]">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="text-2xl font-extrabold">
          <span className="text-[#F36B21]">B</span> Blinko
        </Link>

        <section className="mt-8 rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold">Konto erstellen</h1>
          <p className="mt-3 text-gray-600">
            Lege dein Blinko-Konto an und gestalte danach dein Geschäftsprofil.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block font-semibold">
                E-Mail-Adresse
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
                placeholder="du@unternehmen.de"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block font-semibold">
                Passwort
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
                placeholder="Mindestens 8 Zeichen"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
                {error}
              </p>
            )}
            {info && (
              <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white disabled:opacity-60"
            >
              {loading ? "Konto wird erstellt …" : "Konto erstellen"}
            </button>
          </form>

          <p className="mt-6 text-sm text-gray-600">
            Schon ein Konto?{" "}
            <Link href="/anmelden" className="font-semibold text-[#F36B21]">
              Jetzt anmelden
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
