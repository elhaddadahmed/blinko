"use client";

import { useEffect, useState } from "react";

type Nearby = { lat: number; lng: number; radius_m: number; text: string | null };

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const COOLDOWN_MS = 12 * 60 * 60 * 1000;

export default function NearbyWatcher({
  nearby, businessName, slug,
}: { nearby: Nearby; businessName: string; slug: string }) {
  const key = `blinko-nearby:${slug}`;
  const shownKey = `blinko-nearby-shown:${slug}`;
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const [distance, setDistance] = useState<number | null>(null);
  const [hit, setHit] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) return;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const d = distanceM(pos.coords.latitude, pos.coords.longitude, nearby.lat, nearby.lng);
        setDistance(Math.round(d));
        setError("");
        if (d > nearby.radius_m) return;

        // Ruhezeit (21 bis 8 Uhr) und Pause von 12 Stunden zwischen zwei Hinweisen
        const hour = new Date().getHours();
        if (hour < 8 || hour >= 21) return;
        let last = 0;
        try {
          last = Number(localStorage.getItem(shownKey)) || 0;
        } catch {
          /* ohne Speicher: Hinweis erscheint nur im Fenster */
        }
        if (Date.now() - last < COOLDOWN_MS) return;
        try {
          localStorage.setItem(shownKey, String(Date.now()));
        } catch {
          /* ignorieren */
        }
        setHit(true);
        if ("Notification" in window && Notification.permission === "granted") {
          navigator.serviceWorker?.getRegistration("/sw.js").then((reg) =>
            reg?.showNotification(`Du bist in der Nähe von ${businessName}`, {
              body: nearby.text ?? "Schau vorbei und sammle einen Stempel.",
              icon: "/icons/icon-192.png",
              tag: "blinko-nearby",
            })
          );
        }
      },
      (err) => {
        if (err.code === 1) {
          setError("Der Standort wurde nicht freigegeben.");
          setEnabled(false);
          try {
            localStorage.removeItem(key);
          } catch {
            /* ignorieren */
          }
        } else {
          setError("Der Standort ist gerade nicht verfügbar.");
        }
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, key, shownKey, nearby, businessName]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setHit(false);
    setDistance(null);
    setError("");
    try {
      if (next) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
    } catch {
      /* ignorieren */
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-[#FFF8EF] p-4 text-sm leading-6 text-gray-700">
      <p className="font-semibold">Hinweis, wenn ich in der Nähe bin (Beta)</p>
      <p>
        Funktioniert nur, solange diese Karte geöffnet ist. Dein Standort bleibt auf deinem Gerät und wird
        nicht gespeichert oder gesendet.
      </p>
      <button
        type="button"
        onClick={toggle}
        className="mt-3 rounded-full border border-[#F36B21] px-4 py-2 font-bold text-[#F36B21]"
      >
        {enabled ? "Ausschalten" : "Einschalten"}
      </button>
      {enabled && distance !== null && (
        <p className="mt-2 text-gray-600">Entfernung zu {businessName}: ca. {distance} m</p>
      )}
      {hit && (
        <p role="status" className="mt-3 rounded-xl bg-[#F36B21] p-3 font-semibold text-white">
          Du bist in der Nähe von {businessName}. {nearby.text ?? "Schau vorbei und sammle einen Stempel."}
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
