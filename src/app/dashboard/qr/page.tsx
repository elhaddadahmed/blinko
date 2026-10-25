"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";

type State =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "no-profile" }
  | { status: "error"; message: string }
  | { status: "ready"; slug: string; name: string; published: boolean };

export default function QrPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return !cancelled && setState({ status: "anonymous" });

        const { data: businesses, error } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", auth.user.id)
          .limit(1);
        if (error) throw error;
        if (!businesses?.length) return !cancelled && setState({ status: "no-profile" });

        const { data: profile, error: profileError } = await supabase
          .from("business_profiles")
          .select("slug, name, is_published")
          .eq("business_id", businesses[0].id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!profile?.slug) return !cancelled && setState({ status: "no-profile" });

        const link = `${window.location.origin}/b/${profile.slug}`;
        const image = await QRCode.toDataURL(link, {
          width: 640,
          margin: 2,
          color: { dark: "#202A35", light: "#FFFFFF" },
        });
        if (cancelled) return;
        setUrl(link);
        setQr(image);
        setState({
          status: "ready",
          slug: profile.slug,
          name: profile.name ?? "Unternehmen",
          published: Boolean(profile.is_published),
        });
      } catch (e) {
        if (!cancelled)
          setState({
            status: "error",
            message: e instanceof Error ? e.message : "Laden fehlgeschlagen.",
          });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Link kopieren:", url);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-10 text-[#202A35]">
      <div className="mx-auto max-w-2xl">
        <section className="rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold">QR-Code &amp; NFC</h1>
          <p className="mt-3 text-gray-600">
            Kunden öffnen dein Profil per Scan oder Antippen. Eine App brauchen sie nicht.
          </p>

          {state.status === "loading" && (
            <p className="mt-6" aria-busy="true">Wird geladen …</p>
          )}

          {state.status === "anonymous" && (
            <p className="mt-6">
              Bitte{" "}
              <Link href="/anmelden" className="font-semibold text-[#F36B21]">
                melde dich an
              </Link>
              .
            </p>
          )}

          {state.status === "no-profile" && (
            <p className="mt-6">
              Lege zuerst dein{" "}
              <Link href="/dashboard/profil" className="font-semibold text-[#F36B21]">
                Geschäftsprofil
              </Link>{" "}
              an und speichere es. Danach erhältst du hier deinen QR-Code.
            </p>
          )}

          {state.status === "error" && (
            <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">
              {state.message}
            </p>
          )}

          {state.status === "ready" && (
            <>
              {!state.published && (
                <p role="status" className="mt-6 rounded-xl bg-orange-50 p-4 text-sm">
                  Dein Profil ist noch nicht veröffentlicht. Der Link zeigt erst
                  nach der Veröffentlichung dein Profil.{" "}
                  <Link href="/dashboard/profil" className="font-semibold text-[#F36B21]">
                    Jetzt veröffentlichen
                  </Link>
                </p>
              )}

              <div className="mt-8 flex flex-col items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr}
                  alt={`QR-Code für das Profil von ${state.name}`}
                  width={256}
                  height={256}
                  className="rounded-2xl border border-orange-100"
                />
                <p className="break-all text-center text-sm text-gray-600">{url}</p>

                <div className="flex flex-wrap justify-center gap-3 print:hidden">
                  <a
                    href={qr}
                    download={`blinko-qr-${state.slug}.png`}
                    className="rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white"
                  >
                    PNG herunterladen
                  </a>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-full border border-[#F36B21] px-5 py-3 font-bold text-[#F36B21]"
                  >
                    Drucken
                  </button>
                  <button
                    type="button"
                    onClick={copy}
                    className="rounded-full border border-gray-300 px-5 py-3 font-bold"
                  >
                    {copied ? "Kopiert ✓" : "Link kopieren"}
                  </button>
                </div>
              </div>

              <div className="mt-10 print:hidden">
                <h2 className="text-xl font-bold">NFC-Tag beschreiben</h2>
                <ol className="mt-3 list-decimal space-y-2 pl-5 leading-7 text-gray-700">
                  <li>Kaufe einen beschreibbaren NFC-Tag (z. B. NTAG213 oder NTAG215).</li>
                  <li>
                    Installiere die kostenlose App „NFC Tools“ (iPhone oder Android) auf
                    deinem eigenen Smartphone.
                  </li>
                  <li>Wähle „Schreiben“ → „Hinzufügen“ → „Link/URL“ und füge den Link oben ein.</li>
                  <li>Halte das Smartphone an den Tag und bestätige das Schreiben.</li>
                  <li>
                    Teste den Tag mit einem anderen Smartphone. Es öffnet sich dein
                    Profil im Browser.
                  </li>
                </ol>
                <p className="mt-4 rounded-xl bg-[#FFF8EF] p-4 text-sm leading-6 text-gray-600">
                  Dieser Link öffnet nur dein öffentliches Profil. Er vergibt keine
                  Stempel oder Belohnungen. Dafür kommt später ein eigener, gesicherter Ablauf.
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
