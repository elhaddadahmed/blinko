"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AnmeldenPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        throw loginError;
      }

      router.push("/dashboard/profil");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Anmeldung fehlgeschlagen."
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
          <h1 className="text-3xl font-bold">Willkommen zurück!</h1>
          <p className="mt-3 text-gray-600">
            Melde dich an, um dein Unternehmen zu verwalten.
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
                onChange={(event) => setEmail(event.target.value)}
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
                placeholder="Dein Passwort"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white disabled:opacity-60"
            >
              {loading ? "Anmeldung läuft …" : "Anmelden"}
            </button>
          </form>

          <p className="mt-6 text-sm text-gray-600">
            Noch kein Konto?{" "}
            <Link href="/registrieren" className="font-semibold text-[#F36B21]">
              Jetzt registrieren
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}