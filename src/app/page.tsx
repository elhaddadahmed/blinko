import Link from "next/link";

const features = [
  {
    icon: "⌁",
    title: "NFC & QR-Codes",
    description:
      "Einfach antippen oder scannen. Deine Kunden landen direkt auf deiner digitalen Geschäftsseite.",
  },
  {
    icon: "♡",
    title: "Digitale Treuekarten",
    description:
      "Belohne Stammkunden mit digitalen Stempeln und einer Prämie, ganz ohne App.",
  },
  {
    icon: "✦",
    planned: true,
    title: "Kundenfeedback",
    description:
      "Verstehe deine Kunden besser und leite sie zu deinen öffentlichen Bewertungsseiten.",
  },
  {
    icon: "▥",
    title: "Statistiken",
    description:
      "Behalte gestartete Karten, vergebene Stempel und eingelöste Belohnungen im Blick.",
  },
  {
    icon: "↗",
    planned: true,
    title: "Marketing",
    description:
      "Präsentiere Angebote und Gutscheine, die Kunden zu einem weiteren Besuch motivieren.",
  },
  {
    icon: "▦",
    title: "Dein Dashboard",
    description:
      "Verwalte deine Unternehmensseite und deine Kundenbindungsprogramme zentral.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fff8ef] text-[#202a35]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
        <a href="#" className="flex items-center gap-2.5 text-2xl font-black tracking-tight">
          <span className="grid size-10 place-items-center rounded-xl bg-[#f36b21] text-white">
            B
          </span>
          Blinko<span className="text-[#f36b21]">.</span>
        </a>

        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
          <a href="#funktionen" className="hover:text-[#f36b21]">
            Funktionen
          </a>
          <a href="#branchen" className="hover:text-[#f36b21]">
            Für Unternehmen
          </a>
          <a href="#wallet" className="hover:text-[#f36b21]">
            Digitale Karten
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/anmelden" className="text-sm font-bold hover:text-[#f36b21]">
            Anmelden
          </Link>
          <Link
            href="/registrieren"
            className="rounded-full bg-[#f36b21] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d95612]"
          >
            Konto erstellen ↗
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-16 md:grid-cols-2 md:py-24 lg:px-10">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#ffe3c5] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#8b421b]">
            <span className="size-2 rounded-full bg-[#f36b21]" />
            Mehr als nur ein Stempel
          </span>

          <h1 className="mt-7 text-5xl leading-[1.05] font-black tracking-tight sm:text-6xl lg:text-7xl">
            Deine digitale{" "}
            <span className="text-[#f36b21]">Kundenbindung.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-[#59616a]">
            Gewinne Stammkunden für dein Geschäft. Verbinde NFC, QR-Codes
            und digitale Treuekarten auf einer einfachen Plattform – ganz
            ohne App für deine Kunden.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/registrieren"
              className="rounded-full bg-[#f36b21] px-6 py-4 font-bold text-white shadow-lg shadow-orange-200 transition hover:-translate-y-0.5 hover:bg-[#d95612]"
            >
              Konto erstellen ↗
            </Link>
            <a
              href="#funktionen"
              className="rounded-full border border-[#e5d8c9] px-6 py-4 font-bold transition hover:bg-white"
            >
              Mehr erfahren ↓
            </a>
          </div>

          <p className="mt-5 text-sm text-[#77736d]">
            Für Cafés, Restaurants, Friseure und lokale Geschäfte.
          </p>
        </div>

        <div className="relative">
          <div className="absolute -right-10 -top-10 size-48 rounded-full bg-[#ffe3c5] blur-2xl" />

          <div className="relative rounded-[2rem] border border-white bg-[#fff0e1] p-5 shadow-2xl shadow-orange-900/10 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-widest text-[#9b6849]">
                  BLINKO BUSINESS
                </p>
                <h2 className="mt-1 text-xl font-extrabold">Dein Geschäft</h2>
              </div>
              <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-[#b44e19]">
                Beispielansicht
              </span>
            </div>

            <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
             
              
<div className="flex items-center gap-4">
  <div className="grid size-14 place-items-center rounded-2xl bg-[#ffe3c5] text-3xl">
    ✨
  </div>
  <div>
    <h3 className="font-extrabold">Dein Unternehmen</h3>
    <p className="mt-1 text-sm text-[#77736d]">
      Dein Geschäft · Deine digitale Seite
    </p>
  </div>
</div>

<div className="mt-6 grid grid-cols-2 gap-3">
  <div className="rounded-2xl bg-[#fff8ef] p-4">
    <span className="text-xl">🕒</span>
    <p className="mt-2 font-bold">Öffnungszeiten</p>
    <p className="mt-1 text-xs text-[#77736d]">
      Immer aktuell auf deiner Seite
    </p>
  </div>
  <div className="rounded-2xl bg-[#fff8ef] p-4">
    <span className="text-xl">☕</span>
    <p className="mt-2 font-bold">Treuekarte</p>
    <p className="mt-1 text-xs text-[#77736d]">
      Stempel sammeln ohne App
    </p>
  </div>
</div>


              <div className="mt-4 rounded-2xl bg-[#f36b21] p-5 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold tracking-widest text-orange-100">
                      BEISPIEL-TREUEKARTE
                    </p>
                    <p className="mt-2 font-extrabold">5 von 7 Besuchen</p>
                  </div>
                  <span className="text-3xl">🎁</span>
                </div>

                <div className="mt-4 flex gap-2">
                  {Array.from({ length: 7 }).map((_, index) => (
                    <span
                      key={index}
                      className={`grid size-7 place-items-center rounded-full text-xs ${
                        index < 5
                          ? "bg-white text-[#f36b21]"
                          : "border border-white/60 text-white"
                      }`}
                    >
                      {index < 5 ? "✓" : ""}
                    </span>
                  ))}
                </div>

                <p className="mt-3 text-sm text-orange-50">
                  Noch 2 Besuche bis zu deiner Belohnung!
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-center gap-3 rounded-2xl border border-white bg-white/70 p-4 text-sm font-bold">
              <span className="text-2xl">📱</span>
              NFC antippen oder QR-Code scannen
            </div>
          </div>
        </div>
      </section>

      <section id="branchen" className="border-y border-[#efe4d7] bg-white/60 px-6 py-8">
        <p className="text-center text-xs font-bold tracking-[0.2em] text-[#8b8176] uppercase">
          Für lokale Unternehmen
        </p>
        <div className="mx-auto mt-5 flex max-w-5xl flex-wrap justify-center gap-x-10 gap-y-5 text-sm font-bold sm:text-base">
          <span>☕ Cafés</span>
          <span>🍽 Restaurants</span>
          <span>✂ Friseure</span>
          <span>🌿 Beauty & Wellness</span>
          <span>🛍 Einzelhandel</span>
        </div>
      </section>

      <section id="funktionen" className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
        <div className="max-w-2xl">
          <span className="rounded-full bg-[#ffe3c5] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#8b421b]">
            Alles an einem Ort
          </span>
          <h2 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
            Mehr Stammkunden.
            <br />
            Weniger Aufwand.
          </h2>
          <p className="mt-5 text-lg leading-8 text-[#687078]">
            Die Werkzeuge, die lokale Unternehmen brauchen, um ihre Kunden
            besser zu erreichen und langfristig zu binden.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-3xl border border-[#f0e4d7] bg-white p-7 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-orange-900/5"
            >
              <div className="grid size-12 place-items-center rounded-2xl bg-[#fff0e1] text-2xl font-bold text-[#f36b21]">
                {feature.icon}
              </div>
              <h3 className="mt-5 text-xl font-extrabold">
                {feature.title}
                {"planned" in feature && feature.planned && (
                  <span className="ml-2 rounded-full bg-[#f0e4d7] px-2.5 py-1 align-middle text-xs font-bold text-[#8b421b]">
                    Geplant
                  </span>
                )}
              </h3>
              <p className="mt-3 leading-7 text-[#687078]">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="wallet" className="px-6 pb-20">
        <div className="mx-auto grid max-w-7xl gap-10 rounded-[2rem] bg-[#202a35] p-8 text-white sm:p-12 lg:grid-cols-2 lg:items-center lg:p-16">
          <div>
            <span className="text-xs font-bold tracking-widest text-[#ffb27e] uppercase">
              Immer dabei
            </span>
            <h2 className="mt-4 text-3xl leading-tight font-black sm:text-4xl">
              Deine Treuekarte.
              <br />
              Direkt auf dem Smartphone.
            </h2>
            <p className="mt-5 max-w-xl leading-7 text-[#d5dbe1]">
              Deine Treuekarte läuft direkt im Browser, ganz ohne App. Die
              Integration in Apple Wallet und Google Wallet ist geplant.
            </p>
            <p className="mt-4 text-sm text-[#ffcfac]">
              Apple Wallet und Google Wallet sind noch nicht verfügbar.
            </p>
          </div>

          <div className="rounded-3xl bg-[#fff8ef] p-6 text-[#202a35]">
            <div className="flex items-center justify-between">
              <span className="font-extrabold">Blinko · Dein Unternehmen</span>
              <span className="text-2xl">☕</span>
            </div>
            <p className="mt-7 text-xs font-bold tracking-widest text-[#9b6849]">
              BEISPIEL-TREUEKARTE
            </p>
            <p className="mt-2 text-3xl font-black">5 / 7 Stempel</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#ffe3c5]">
              <div className="h-full w-[71%] rounded-full bg-[#f36b21]" />
            </div>
            <p className="mt-4 text-sm text-[#687078]">
              Noch zwei Besuche bis zur Belohnung.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div aria-disabled="true" className="rounded-xl border border-[#f0e4d7] p-3 text-center text-sm font-bold opacity-60">
                🍎 Apple Wallet · geplant
              </div>
              <div aria-disabled="true" className="rounded-xl border border-[#f0e4d7] p-3 text-center text-sm font-bold opacity-60">
                📲 Google Wallet · geplant
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="starten" className="bg-[#f36b21] px-6 py-16 text-center text-white sm:py-20">
        <h2 className="text-3xl font-black sm:text-5xl">
          Mach aus Besuchern Stammkunden.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl leading-7 text-orange-50">
          Blinko verbindet dein Geschäft mit den Menschen, die immer wiederkommen.
        </p>
        <Link
          href="/registrieren"
          className="mt-8 inline-flex rounded-full bg-white px-7 py-4 font-extrabold text-[#bd4d15] transition hover:bg-[#fff0e1]"
        >
          Konto erstellen ↗
        </Link>
        <p className="mt-4 text-sm text-orange-50">
          Schon dabei?{" "}
          <Link href="/anmelden" className="font-bold underline">
            Anmelden
          </Link>
        </p>
      </section>

      <footer className="flex flex-col gap-3 px-6 py-7 text-sm text-[#77736d] sm:flex-row sm:justify-between">
        <span>© 2026 Blinko · Konzept und Entwicklung</span>
        <span>NFC · QR · Treuekarten · Kundenbindung</span>
      </footer>
    </main>
  );
}
