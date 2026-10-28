"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function StartCard({ slug }: { slug: string }) {
  const router = useRouter();
  const key = `blinko-card:${slug}`;
  // Gespeicherte Karte nur im Browser lesen (auf dem Server: keine)
  const saved = useSyncExternalStore(
    () => () => undefined,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (busy) return;
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("create_loyalty_card", {
      p_slug: slug,
    });
    setBusy(false);
    if (rpcError || !data?.ok) {
      setError("Die Treuekarte konnte nicht erstellt werden. Bitte versuche es später erneut.");
      return;
    }
    try {
      localStorage.setItem(key, data.token as string);
    } catch {
      /* Karte bleibt über den Link erreichbar */
    }
    router.push(`/karte/${data.token}`);
  }

  return (
    <div className="mt-4">
      {saved ? (
        <Link
          href={`/karte/${saved}`}
          className="inline-block rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white"
        >
          Meine Treuekarte öffnen
        </Link>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="rounded-full bg-[#F36B21] px-5 py-3 font-bold text-white disabled:opacity-60"
        >
          {busy ? "Karte wird erstellt …" : "Treuekarte starten"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
