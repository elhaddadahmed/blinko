"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { safeLogoUrl } from "@/lib/logo";

type Data = {
  name: string;
  slug: string;
  logo: string | null;
  published: boolean;
  program: { reward: string; stamps: number; active: boolean } | null;
};

const SIZES = {
  A6: { w: 105, h: 148 },
  A5: { w: 148, h: 210 },
} as const;
type SizeKey = keyof typeof SIZES;

export default function StandPage() {
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<"loading" | "anonymous" | "no-profile" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  const [size, setSize] = useState<SizeKey>("A6");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return !cancelled && setStatus("anonymous");

        const { data: biz, error: bErr } = await supabase
          .from("businesses").select("id").eq("owner_id", auth.user.id).limit(1);
        if (bErr) throw bErr;
        if (!biz?.length) return !cancelled && setStatus("no-profile");

        const { data: profile, error: pErr } = await supabase
          .from("business_profiles")
          .select("name, slug, logo_url, is_published")
          .eq("business_id", biz[0].id).maybeSingle();
        if (pErr) throw pErr;
        if (!profile?.slug) return !cancelled && setStatus("no-profile");

        // Treueprogramm ist optional (Tabelle kann fehlen): Fehler hier nicht abbrechen
        const { data: program } = await supabase
          .from("loyalty_programs").select("reward, stamps_required, is_active")
          .eq("business_id", biz[0].id).maybeSingle();

        const base = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/+$/, "");
        const link = `${base}/b/${profile.slug}`;
        const image = await QRCode.toDataURL(link, { width: 900, margin: 1, color: { dark: "#202A35", light: "#FFFFFF" } });
        if (cancelled) return;
        setUrl(link);
        setQr(image);
        setData({
          name: profile.name ?? "Unser Geschäft",
          slug: profile.slug,
          logo: safeLogoUrl(profile.logo_url),
          published: Boolean(profile.is_published),
          program: program
            ? { reward: program.reward as string, stamps: program.stamps_required as number, active: Boolean(program.is_active) }
            : null,
        });
        setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
          setStatus("error");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const { w, h } = SIZES[size];
  const local = /localhost|127\.0\.0\.1|192\.168\./.test(url);

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-10 text-[#202A35] print:min-h-0 print:bg-white print:p-0">
      <style>{`@media print { @page { size: ${size} portrait; margin: 0; } }`}</style>

      <div className="mx-auto max-w-3xl print:max-w-none">
        <section className="rounded-3xl border border-orange-100 bg-white p-8 shadow-sm print:hidden">
          <h1 className="text-3xl font-bold">Aufsteller drucken</h1>
          <p className="mt-3 text-gray-600">
            Ein fertiges Schild für Tisch oder Kasse mit deinem QR-Code. Kunden scannen es und starten ihre Treuekarte.
          </p>

          {status === "loading" && <p className="mt-6" aria-busy="true">Wird geladen …</p>}
          {status === "anonymous" && (
            <p className="mt-6">Bitte <Link href="/anmelden" className="font-semibold text-[#F36B21]">melde dich an</Link>.</p>
          )}
          {status === "no-profile" && (
            <p className="mt-6">
              Lege zuerst dein <Link href="/dashboard/profil" className="font-semibold text-[#F36B21]">Geschäftsprofil</Link> an.
            </p>
          )}
          {status === "error" && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

          {status === "ready" && data && (
            <>
              {local && (
                <p role="status" className="mt-6 rounded-xl bg-orange-50 p-4 text-sm">
                  Der QR-Code zeigt noch auf eine lokale Adresse und funktioniert für Kunden nicht. Öffne diese Seite über
                  deine echte Internet-Adresse, bevor du druckst.
                </p>
              )}
              {!data.published && (
                <p role="status" className="mt-4 rounded-xl bg-orange-50 p-4 text-sm">
                  Dein Profil ist noch nicht veröffentlicht. Kunden sehen sonst eine Fehlerseite.{" "}
                  <Link href="/dashboard/profil" className="font-semibold text-[#F36B21]">Jetzt veröffentlichen</Link>
                </p>
              )}
              {(!data.program || !data.program.active) && (
                <p role="status" className="mt-4 rounded-xl bg-orange-50 p-4 text-sm">
                  Dein Treueprogramm ist nicht aktiv. Auf dem Schild steht dann nur dein Profil.{" "}
                  <Link href="/dashboard/treueprogramm" className="font-semibold text-[#F36B21]">Programm aktivieren</Link>
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <fieldset className="flex items-center gap-2">
                  <legend className="sr-only">Papierformat</legend>
                  {(Object.keys(SIZES) as SizeKey[]).map((k) => (
                    <label key={k} className={`cursor-pointer rounded-full border px-4 py-2 font-bold ${size === k ? "border-[#F36B21] bg-[#F36B21] text-white" : "border-gray-300"}`}>
                      <input type="radio" name="size" value={k} checked={size === k} onChange={() => setSize(k)} className="sr-only" />
                      {k}
                    </label>
                  ))}
                </fieldset>
                <button type="button" onClick={() => window.print()}
                  className="rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white">
                  Drucken
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                Tipp: Wähle im Druckdialog „Ränder: keine“ und aktiviere „Hintergrundgrafiken“. Am besten auf dickerem Papier drucken.
              </p>
            </>
          )}
        </section>

        {status === "ready" && data && (
          <div className="mt-8 flex justify-center print:mt-0 print:block">
            <div
              className="relative flex flex-col items-center justify-between overflow-hidden border border-gray-300 bg-white text-center shadow-sm print:border-0 print:shadow-none"
              style={{
                width: `${w}mm`,
                height: `${h}mm`,
                padding: `${w * 0.07}mm`,
                WebkitPrintColorAdjust: "exact",
                printColorAdjust: "exact",
              }}
            >
              <div className="w-full">
                {data.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.logo} alt="" className="mx-auto object-contain" style={{ height: `${h * 0.1}mm`, maxWidth: "70%" }} />
                )}
                <p className="font-black leading-tight" style={{ fontSize: `${w * 0.085}mm`, marginTop: data.logo ? `${h * 0.015}mm` : 0 }}>
                  {data.name}
                </p>
              </div>

              <div className="w-full">
                <p className="font-extrabold leading-tight text-[#F36B21]" style={{ fontSize: `${w * 0.075}mm` }}>
                  Treuekarte
                </p>
                <p className="font-semibold" style={{ fontSize: `${w * 0.042}mm` }}>
                  Scannen und Stempel sammeln
                </p>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`QR-Code für ${data.name}`} style={{ width: `${w * 0.62}mm`, height: `${w * 0.62}mm` }} />

              <div className="w-full">
                {data.program?.active && (
                  <p className="font-bold" style={{ fontSize: `${w * 0.045}mm` }}>
                    {data.program.stamps} Stempel sammeln und erhalten: {data.program.reward}
                  </p>
                )}
                <p className="text-gray-600" style={{ fontSize: `${w * 0.032}mm`, marginTop: `${h * 0.01}mm` }}>
                  Ohne App: einfach mit der Handykamera scannen.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
