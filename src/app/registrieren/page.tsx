"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function friendlyError(err: unknown): string {
  const e = (typeof err === "object" && err !== null ? err : {}) as { code?: string; message?: string };
  const text = `${e.code ?? ""} ${e.message ?? ""}`.toLowerCase();
  if (text.includes("rate_limit") || text.includes("rate limit")) {
    return "Es wurden gerade zu viele E-Mails verschickt. Bitte warte etwa eine Stunde und versuche es dann erneut.";
  }
  if (text.includes("already") || text.includes("exists")) {
    return "Diese E-Mail-Adresse ist schon registriert. Bitte melde dich an.";
  }
  if (text.includes("weak") || text.includes("password")) {
    return "Das Passwort ist zu schwach. Nimm mindestens 8 Zeichen, am besten mit Zahlen und Sonderzeichen.";
  }
  if (text.includes("invalid") && text.includes("email")) {
    return "Bitte gib eine gültige E-Mail-Adresse ein.";
  }
  return e.message ? `Fehler: ${e.message}` : "Registrierung fehlgeschlagen. Bitte versuche es erneut.";
}

export default function RegistrierenPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

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

      // Supabase meldet bei bereits bestätigten Adressen keinen Fehler, liefert aber keine Identitäten.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError("Diese E-Mail-Adresse ist schon registriert. Bitte melde dich an.");
        return;
      }

      if (data.session) {
        router.push("/dashboard/profil");
        router.refresh();
      } else {
        setSentTo(email.trim());
        setCooldown(60);
        setInfo(
          "Konto angelegt. Wir haben versucht, dir eine Bestätigungs-E-Mail zu schicken. Schau auch im Spam-Ordner nach. Kommt nichts an, kann die Adresse hier nicht beliefert werden (siehe unten)."
        );
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!sentTo || cooldown > 0 || resending) return;
    setResending(true);
    setError("");
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email: sentTo });
    setResending(false);
    if (resendError) {
      setError(friendlyError(resendError));
      return;
    }
    setCooldown(60);
    setInfo("Die E-Mail wurde erneut angefordert. Das kann einige Minuten dauern.");
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

            {sentTo && (
              <div className="rounded-xl bg-orange-50 p-4 text-sm leading-6">
                <button
                  type="button"
                  onClick={resend}
                  disabled={cooldown > 0 || resending}
                  className="font-bold text-[#F36B21] underline disabled:no-underline disabled:opacity-60"
                >
                  {resending
                    ? "Wird gesendet …"
                    : cooldown > 0
                      ? `E-Mail erneut senden (in ${cooldown} s)`
                      : "E-Mail erneut senden"}
                </button>
                <p className="mt-2 text-gray-700">
                  Bei Tests sendet Supabase nur an Adressen aus deinem Supabase-Team. Für alle anderen
                  Adressen muss ein eigener E-Mail-Dienst (SMTP) eingerichtet sein.
                </p>
              </div>
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
