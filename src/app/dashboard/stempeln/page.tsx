"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import jsQR from "jsqr";
import { supabase } from "@/lib/supabase";

type Preview = {
  card_id: string;
  business_name: string;
  program_name: string;
  reward: string;
  stamps: number;
  stamps_required: number;
  reward_ready: boolean;
  card_status: string;
  program_active: boolean;
};
type Cred = { token: string | null; code: string | null };
type Mode = "idle" | "scanning" | "confirm" | "done";

const ERRORS: Record<string, string> = {
  invalid_or_expired: "Code ungültig oder abgelaufen. Der Kunde soll den Code auf seiner Karte neu anzeigen.",
  rate_limited: "Zu viele Fehlversuche. Bitte warte ein paar Minuten.",
  not_authenticated: "Bitte melde dich zuerst an.",
  card_or_program_inactive: "Diese Karte ist gesperrt oder das Programm ist nicht aktiv.",
  reward_ready: "Die Karte ist voll. Löse zuerst die Belohnung ein.",
  not_enough_stamps: "Für diese Belohnung fehlen noch Stempel (oder sie wurde schon eingelöst).",
  card_not_found: "Karte nicht gefunden.",
};
const errText = (code?: string) => (code && ERRORS[code]) || "Das hat nicht geklappt. Bitte versuche es erneut.";

export default function StampPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [codeInput, setCodeInput] = useState("");
  const [cred, setCred] = useState<Cred | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const lookup = useCallback(async (c: Cred) => {
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("preview_scan", {
      p_token: c.token,
      p_code: c.code,
    });
    setBusy(false);
    if (rpcError || !data?.ok) {
      setError(errText(data?.error));
      setMode("idle");
      return;
    }
    setCred(c);
    setPreview(data as Preview);
    setMode("confirm");
  }, []);

  const handleScanned = useCallback(
    (text: string) => {
      const value = text.replace(/^blinko:/, "").trim();
      if (/^\d{6}$/.test(value)) void lookup({ token: null, code: value });
      else if (/^[0-9a-f]{64}$/i.test(value)) void lookup({ token: value, code: null });
      else {
        setError("Das ist kein Blinko-Code.");
        setMode("idle");
      }
    },
    [lookup]
  );

  useEffect(() => stopCamera, [stopCamera]);

  async function startScan() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setMode("scanning");
    } catch {
      setError("Die Kamera ist nicht verfügbar. Gib stattdessen den 6-stelligen Code ein.");
    }
  }

  useEffect(() => {
    if (mode !== "scanning") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const id = setInterval(() => {
      if (!ctx || video.videoWidth === 0) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(img.data, img.width, img.height);
      if (found?.data) {
        clearInterval(id);
        stopCamera();
        handleScanned(found.data);
      }
    }, 250);
    return () => clearInterval(id);
  }, [mode, handleScanned, stopCamera]);

  function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(codeInput.trim())) {
      setError("Bitte gib genau 6 Ziffern ein.");
      return;
    }
    void lookup({ token: null, code: codeInput.trim() });
  }

  async function stamp() {
    if (!cred || busy) return;
    setBusy(true);
    setError("");
    const { data } = await supabase.rpc("stamp_card", { p_token: cred.token, p_code: cred.code });
    setBusy(false);
    if (data?.ok) {
      setResult(
        data.reward_ready
          ? `Stempel vergeben: ${data.stamps} von ${data.stamps_required}. Die Belohnung ist bereit.`
          : `Stempel vergeben: ${data.stamps} von ${data.stamps_required}.`
      );
      setMode("done");
    } else if (data?.error === "reward_ready" && preview) {
      setPreview({ ...preview, reward_ready: true });
      setError(errText("reward_ready"));
    } else {
      setError(errText(data?.error));
      if (data?.error === "invalid_or_expired") setMode("idle");
    }
  }

  async function redeem() {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    const { data } = await supabase.rpc("redeem_reward", { p_card_id: preview.card_id });
    setBusy(false);
    if (data?.ok) {
      setResult(`Belohnung eingelöst: ${preview.reward}. Die Karte beginnt eine neue Runde.`);
      setMode("done");
    } else {
      setError(errText(data?.error));
    }
  }

  function reset() {
    stopCamera();
    setMode("idle");
    setCred(null);
    setPreview(null);
    setCodeInput("");
    setError("");
    setResult("");
  }

  const btn = "rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white disabled:opacity-60";

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-10 text-[#202A35]">
      <div className="mx-auto max-w-md">
        <section className="rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold">Stempeln</h1>
          <p className="mt-3 text-gray-600">
            Scanne den QR-Code auf der Karte deines Kunden oder gib den 6-stelligen Code ein.
          </p>

          {error && (
            <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
              {error}{" "}
              {error.includes("anmelden") && (
                <Link href="/anmelden" className="font-semibold underline">Zur Anmeldung</Link>
              )}
            </p>
          )}

          {mode === "idle" && (
            <div className="mt-6 space-y-6">
              <button type="button" onClick={startScan} className={`${btn} w-full`}>
                Kamera starten
              </button>
              <form onSubmit={submitCode}>
                <label htmlFor="code" className="mb-2 block font-semibold">Oder Code eingeben</label>
                <input id="code" inputMode="numeric" autoComplete="off" maxLength={6}
                  value={codeInput} onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 font-mono text-xl tracking-widest"
                  placeholder="123456" />
                <button type="submit" disabled={busy} className={`${btn} mt-3 w-full`}>
                  {busy ? "Wird geprüft …" : "Code prüfen"}
                </button>
              </form>
            </div>
          )}

          {mode === "scanning" && (
            <div className="mt-6">
              <video ref={videoRef} playsInline muted className="w-full rounded-2xl bg-black" />
              <button type="button" onClick={reset}
                className="mt-4 w-full rounded-full border border-gray-300 px-5 py-3 font-bold">
                Abbrechen
              </button>
            </div>
          )}

          {mode === "confirm" && preview && (
            <div className="mt-6">
              <div className="rounded-2xl bg-[#FFF8EF] p-5">
                <p className="text-sm font-semibold text-[#F36B21]">{preview.business_name}</p>
                <p className="text-xl font-bold">{preview.program_name}</p>
                <p className="mt-2 text-lg">{preview.stamps} von {preview.stamps_required} Stempeln</p>
                <p className="text-sm text-gray-600">Belohnung: {preview.reward}</p>
              </div>
              <div className="mt-5 space-y-3">
                {preview.reward_ready ? (
                  <button type="button" onClick={redeem} disabled={busy} className={`${btn} w-full`}>
                    {busy ? "Wird eingelöst …" : "Belohnung einlösen"}
                  </button>
                ) : (
                  <button type="button" onClick={stamp} disabled={busy} className={`${btn} w-full`}>
                    {busy ? "Wird gestempelt …" : "Stempel vergeben"}
                  </button>
                )}
                <button type="button" onClick={reset}
                  className="w-full rounded-full border border-gray-300 px-5 py-3 font-bold">
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {mode === "done" && (
            <div className="mt-6">
              <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{result}</p>
              <button type="button" onClick={reset} className={`${btn} mt-5 w-full`}>
                Nächster Kunde
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
