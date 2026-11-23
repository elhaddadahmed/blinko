"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { isIosBrowserTab, pushSupported, urlBase64ToUint8Array } from "@/lib/push";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const noop = () => () => undefined;

export default function PushToggle({ token, businessName }: { token: string; businessName: string }) {
  const supported = useSyncExternalStore(noop, () => Boolean(VAPID) && pushSupported(), () => false);
  const iosTab = useSyncExternalStore(noop, () => Boolean(VAPID) && isIosBrowserTab(), () => false);
  const [on, setOn] = useState(false);
  const [offers, setOffers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (cancelled) return;
        setOn(Boolean(sub));
        if (sub) {
          const { data } = await supabase.rpc("get_push_status", { p_token: token, p_endpoint: sub.endpoint });
          if (!cancelled) setOffers(Boolean(data?.offers_opt_in));
        }
      } catch {
        /* ohne Abo anzeigen */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported, token]);

  async function enable() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Benachrichtigungen sind blockiert. Du kannst sie in den Einstellungen deines Browsers erlauben.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const ready = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID),
        });
      }
      const keys = sub.toJSON().keys;
      const { data, error } = await supabase.rpc("save_push_subscription", {
        p_token: token,
        p_endpoint: sub.endpoint,
        p_p256dh: keys?.p256dh ?? "",
        p_auth: keys?.auth ?? "",
      });
      if (error || !data?.ok) throw new Error("save failed");
      ready.active?.postMessage({ type: "card-url", url: window.location.pathname });
      setOn(true);
    } catch {
      setMessage("Die Benachrichtigungen konnten nicht aktiviert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.rpc("remove_push_subscription", { p_token: token, p_endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setOn(false);
      setOffers(false);
    } catch {
      setMessage("Das Abschalten hat nicht geklappt. Bitte versuche es erneut.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleOffers(next: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) throw new Error("no subscription");
      const { data, error } = await supabase.rpc("set_offers_opt_in", {
        p_token: token,
        p_endpoint: sub.endpoint,
        p_opt_in: next,
      });
      if (error || !data?.ok) throw new Error("save failed");
      setOffers(next);
    } catch {
      setMessage("Die Einstellung konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  if (!VAPID) return null;

  if (iosTab) {
    return (
      <div className="mt-6 rounded-xl bg-[#FFF8EF] p-4 text-sm leading-6 text-gray-700">
        <p className="font-semibold">Benachrichtigungen (optional)</p>
        <p>
          Auf dem iPhone funktionieren sie nur, wenn du die Karte zum Home-Bildschirm hinzufügst
          (Teilen, dann „Zum Home-Bildschirm“) und sie von dort öffnest.
        </p>
      </div>
    );
  }

  if (!supported) return null;

  return (
    <div className="mt-6 rounded-xl bg-[#FFF8EF] p-4 text-sm leading-6 text-gray-700">
      <p className="font-semibold">Benachrichtigungen (optional)</p>
      <p>
        Wir melden dir, wenn du einen Stempel bekommen hast oder deine Belohnung bereit ist. Du kannst das
        jederzeit wieder ausschalten.
      </p>
      <button
        type="button"
        onClick={on ? disable : enable}
        disabled={busy}
        className="mt-3 rounded-full border border-[#F36B21] px-4 py-2 font-bold text-[#F36B21] disabled:opacity-60"
      >
        {busy ? "Bitte warten …" : on ? "Benachrichtigungen ausschalten" : "Benachrichtigungen einschalten"}
      </button>

      {on && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-orange-100 pt-4">
          <input
            type="checkbox"
            checked={offers}
            disabled={busy}
            onChange={(e) => void toggleOffers(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
          />
          <span>
            <span className="block font-semibold">Auch Angebote von {businessName} erhalten</span>
            <span className="block text-gray-600">
              Gelegentlich, höchstens eine Nachricht alle 3 Tage und nie nachts. Das ist eine eigene Einwilligung,
              die du hier jederzeit zurücknehmen kannst.
            </span>
          </span>
        </label>
      )}
      {message && <p role="alert" className="mt-2 text-red-700">{message}</p>}
    </div>
  );
}
