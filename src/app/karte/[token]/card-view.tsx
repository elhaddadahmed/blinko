"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";

type Card = {
  business_name: string;
  slug: string;
  program_name: string;
  description: string | null;
  reward: string;
  terms: string | null;
  stamps_required: number;
  stamps: number;
  status: string;
  program_active: boolean;
  reward_ready: boolean;
};

type Scan = { qr: string; code: string; expiresAt: number };

export default function CardView({ token }: { token: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [scan, setScan] = useState<Scan | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  const canScan = card?.status === "active" && card?.program_active === true;
  const stampCount = card?.stamps;

  // Karte laden und regelmäßig aktualisieren (zeigt neue Stempel automatisch)
  useEffect(() => {
    let stop = false;
    async function poll() {
      const { data, error } = await supabase.rpc("get_loyalty_card", { p_token: token });
      if (stop) return;
      if (error) {
        setState((s) => (s === "loading" ? "error" : s));
        return;
      }
      if (data?.ok) {
        setCard(data as Card);
        setState("ok");
      } else {
        setState("notfound");
      }
    }
    void poll();
    const id = setInterval(poll, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [token]);

  // Wechselnden Scan-Code erzeugen (alle 45 s und nach jedem neuen Stempel)
  useEffect(() => {
    if (!canScan) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function issue() {
      const { data } = await supabase.rpc("issue_scan_token", { p_token: token });
      if (stop) return;
      if (data?.ok) {
        const qr = await QRCode.toDataURL("blinko:" + data.token, { width: 480, margin: 2 });
        if (stop) return;
        setScan({ qr, code: data.code as string, expiresAt: new Date(data.expires_at as string).getTime() });
      }
      timer = setTimeout(issue, 45000);
    }
    void issue();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [token, canScan, stampCount]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Link kopieren:", window.location.href);
    }
  }

  if (state === "loading") return <p aria-busy="true">Karte wird geladen …</p>;
  if (state === "error") {
    return (
      <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
        Die Karte konnte nicht geladen werden. Prüfe deine Verbindung und lade die Seite neu.
      </p>
    );
  }
  if (state === "notfound" || !card) {
    return (
      <section className="rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Karte nicht gefunden</h1>
        <p className="mt-3 text-gray-600">
          Dieser Link ist ungültig, oder das Unternehmen hat sein Profil nicht mehr veröffentlicht.
        </p>
        <Link href="/" className="mt-4 inline-block font-semibold text-[#F36B21]">Zur Startseite</Link>
      </section>
    );
  }

  const left = card.stamps_required - card.stamps;
  const secondsLeft = scan ? Math.max(0, Math.round((scan.expiresAt - now) / 1000)) : 0;

  return (
    <section className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#F36B21]">
        {card.business_name}
      </p>
      <h1 className="mt-1 text-2xl font-extrabold">{card.program_name}</h1>
      {card.description && <p className="mt-2 text-sm text-gray-600">{card.description}</p>}

      <div className="mt-6 flex flex-wrap gap-2" role="img"
        aria-label={`${card.stamps} von ${card.stamps_required} Stempeln`}>
        {Array.from({ length: card.stamps_required }, (_, i) => (
          <span key={i}
            className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold ${
              i < card.stamps ? "border-[#F36B21] bg-[#F36B21] text-white" : "border-gray-300 text-gray-300"
            }`}>
            {i < card.stamps ? "✓" : i + 1}
          </span>
        ))}
      </div>

      <p className="mt-4 text-lg font-bold">
        {card.stamps} von {card.stamps_required} Stempeln
      </p>
      <p className="text-gray-600">
        {card.reward_ready
          ? `Belohnung bereit: ${card.reward}. Zeige den Code unten vor.`
          : `Noch ${left} ${left === 1 ? "Stempel" : "Stempel"} bis: ${card.reward}`}
      </p>

      {!canScan ? (
        <p className="mt-6 rounded-xl bg-orange-50 p-4 text-sm">
          {card.status !== "active"
            ? "Diese Karte ist gesperrt. Bitte sprich das Unternehmen an."
            : "Dieses Treueprogramm ist im Moment nicht aktiv."}
        </p>
      ) : (
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">Zeige diesen Code beim Bezahlen vor:</p>
          {scan ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={scan.qr} alt="QR-Code zum Stempeln" width={240} height={240}
                className={`mx-auto mt-3 rounded-2xl border border-orange-100 ${secondsLeft === 0 ? "opacity-30" : ""}`} />
              <p className="mt-3 text-sm text-gray-600">Oder nenne diese Nummer:</p>
              <p className="font-mono text-3xl font-extrabold tracking-widest">{scan.code}</p>
              <p className="mt-1 text-xs text-gray-500">
                {secondsLeft > 0 ? `Wechselt in ${secondsLeft} s` : "Wird erneuert …"}
              </p>
            </>
          ) : (
            <p className="mt-4" aria-busy="true">Code wird erstellt …</p>
          )}
        </div>
      )}

      <div className="mt-8 rounded-xl bg-[#FFF8EF] p-4 text-sm leading-6 text-gray-700">
        <p className="font-semibold">Wichtig: Karte merken</p>
        <p>
          Du brauchst kein Konto. Dafür gilt: Wer diesen Link hat, hat die Karte. Speichere ihn als
          Lesezeichen und gib ihn nicht weiter. Geht der Link verloren, kann die Karte nicht
          wiederhergestellt werden.
        </p>
        <button type="button" onClick={copyLink}
          className="mt-3 rounded-full border border-[#F36B21] px-4 py-2 font-bold text-[#F36B21]">
          {copied ? "Kopiert ✓" : "Link kopieren"}
        </button>
      </div>

      {card.terms && (
        <p className="mt-4 whitespace-pre-wrap text-xs leading-5 text-gray-500">{card.terms}</p>
      )}
      <Link href={`/b/${card.slug}`} className="mt-4 inline-block text-sm font-semibold text-[#F36B21]">
        Zum Profil von {card.business_name}
      </Link>
    </section>
  );
}
