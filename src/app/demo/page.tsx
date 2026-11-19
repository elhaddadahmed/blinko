"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/logo";

const REQUIRED = 7;
const STEPS = [
  { title: "Der Kunde scannt den QR-Code", text: "Am Tisch oder an der Kasse hängt ein QR-Code oder ein NFC-Tag. Der Kunde hält sein Smartphone daran. Eine App braucht er nicht." },
  { title: "Dein Profil öffnet sich", text: "Der Kunde sieht dein Geschäft, die Öffnungszeiten und dein Treueprogramm. Mit einem Tipp startet er seine Karte." },
  { title: "Die Karte sammelt Stempel", text: "Bei jedem Besuch zeigt der Kunde seinen Code. Du scannst ihn oder tippst die Nummer ein, und der Stempel ist gesetzt." },
  { title: "Belohnung einlösen", text: "Ist die Karte voll, löst du die Belohnung mit einem Klick ein. Danach beginnt eine neue Runde." },
];

export default function DemoPage() {
  const [step, setStep] = useState(0);
  const [stamps, setStamps] = useState(0);
  const [redeemed, setRedeemed] = useState(false);
  const full = stamps >= REQUIRED;

  function stamp() {
    setStamps((s) => Math.min(REQUIRED, s + 1));
  }

  function restart() {
    setStep(0);
    setStamps(0);
    setRedeemed(false);
  }

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-10 text-[#202A35]">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-2xl font-extrabold"><Logo size={36} /></Link>
        <h1 className="mt-8 text-3xl font-black sm:text-4xl">So funktioniert Blinko</h1>
        <p className="mt-3 text-gray-600">
          Eine Beispiel-Demo mit erfundenen Daten. Es wird nichts gespeichert.
        </p>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <section aria-live="polite">
            <p className="text-sm font-bold text-[#F36B21]">Schritt {step + 1} von {STEPS.length}</p>
            <h2 className="mt-1 text-2xl font-bold">{STEPS[step].title}</h2>
            <p className="mt-3 leading-7 text-gray-700">{STEPS[step].text}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              {step > 0 && (
                <button type="button" onClick={() => setStep(step - 1)}
                  className="rounded-full border border-gray-300 px-5 py-3 font-bold">Zurück</button>
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" onClick={() => setStep(step + 1)}
                  className="rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white">Weiter</button>
              ) : (
                <Link href="/registrieren" className="rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white">
                  Jetzt testen ↗
                </Link>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Beispielansicht</p>

            {step === 0 && (
              <div className="mt-4 text-center">
                <div className="mx-auto grid h-40 w-40 place-items-center rounded-2xl border-4 border-[#202A35] text-6xl" aria-hidden="true">▦</div>
                <p className="mt-4 font-bold">QR-Code oder NFC-Tag</p>
                <p className="text-sm text-gray-600">an der Kasse</p>
              </div>
            )}

            {step === 1 && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase text-[#F36B21]">Café</p>
                <p className="text-2xl font-extrabold">Café Muster</p>
                <p className="mt-2 text-sm text-gray-600">Mo bis Fr 07:00 bis 16:00</p>
                <div className="mt-4 rounded-2xl bg-[#FFF8EF] p-4">
                  <p className="font-bold">Sammle 7 Stempel und erhalte: Ein Gratis-Kaffee</p>
                  <button type="button" onClick={() => setStep(2)}
                    className="mt-3 rounded-full bg-[#F36B21] px-4 py-2 font-bold text-white">Treuekarte starten</button>
                </div>
              </div>
            )}

            {(step === 2 || step === 3) && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase text-[#F36B21]">Café Muster</p>
                <p className="text-xl font-extrabold">Treuekarte</p>
                <div className="mt-4 flex flex-wrap gap-2" role="img" aria-label={`${stamps} von ${REQUIRED} Stempeln`}>
                  {Array.from({ length: REQUIRED }, (_, i) => (
                    <span key={i}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition ${
                        i < stamps ? "border-[#F36B21] bg-[#F36B21] text-white" : "border-gray-300 text-gray-300"
                      }`}>
                      {i < stamps ? "✓" : i + 1}
                    </span>
                  ))}
                </div>
                <p className="mt-3 font-bold">{stamps} von {REQUIRED} Stempeln</p>

                {redeemed ? (
                  <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">
                    Belohnung eingelöst. Die Karte beginnt eine neue Runde.
                  </p>
                ) : full ? (
                  <button type="button" onClick={() => { setRedeemed(true); setStamps(0); }}
                    className="mt-4 w-full rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white">
                    Belohnung einlösen (als Inhaber)
                  </button>
                ) : (
                  <button type="button" onClick={stamp}
                    className="mt-4 w-full rounded-full border border-[#F36B21] px-5 py-3 font-bold text-[#F36B21]">
                    Stempel vergeben (als Inhaber)
                  </button>
                )}
              </div>
            )}
          </section>
        </div>

        <button type="button" onClick={restart} className="mt-8 text-sm font-semibold text-gray-600 underline">
          Demo neu starten
        </button>
      </div>
    </main>
  );
}
