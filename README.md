# Blinko

Digitale Kundenbindung für lokale Unternehmen (Next.js, Supabase).

## Start
1. `cp .env.example .env.local` und Supabase-Werte eintragen
2. `npm install && npm run dev`

## Datenbank
SQL-Migrationen liegen in `supabase/migrations/` und werden im Supabase SQL Editor ausgeführt.

## Status
Konto, Anmeldung, Dashboard-Navigation, Profil-Editor (inkl. Öffnungszeiten), Treueprogramm (Einrichtung, Kundenkarte, Stempeln, Einlösen, Statistiken), öffentliche Profilseite sowie QR-Code mit NFC-Anleitung sind umgesetzt. Treueprogramm, Feedback und Statistiken folgen.

## Treueprogramm (Datenbank)
`supabase/migrations/0002_loyalty.sql` legt Programme, Karten, Stempel, Einlösungen und Scan-Tokens samt Sicherheitsregeln an.
Tests: `supabase/tests/loyalty_security_test.sql` (nur gegen eine lokale Test-Datenbank ausführen).

## Rechtliches
Trage deine Anbieterdaten in `src/lib/legal.ts` ein. Die Seiten `/impressum`, `/datenschutz`, `/agb` und `/avv` sind Entwürfe
und zeigen einen Hinweis, bis `reviewed` auf `true` steht (nach rechtlicher Prüfung).
Konto löschen und Datenexport: Dashboard → Konto (Migration `supabase/migrations/0003_delete_account.sql`).

## Datenbank in einem Schritt
`supabase/setup_all.sql` enthält alle Migrationen (0001 bis 0005) in einer Datei. Ganzen Inhalt im Supabase SQL Editor
ausführen (mehrfaches Ausführen ist unkritisch). Am Ende zeigt eine Abfrage fünf Werte, die alle `true` sein müssen.

## Push-Benachrichtigungen (optional)
Kunden können auf ihrer Karte Benachrichtigungen einschalten (Stempel erhalten, Belohnung bereit).
Einrichtung: Schlüssel mit `npx web-push generate-vapid-keys` erzeugen und diese Variablen setzen:
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (geheim), `VAPID_SUBJECT` (`mailto:…`). Datenbank: Migration `0006_push.sql`.
Ohne diese Variablen bleibt die Funktion unsichtbar. Auf dem iPhone nur als Web-App vom Home-Bildschirm (iOS 16.4 oder neuer).

## Angebote und Nähe-Hinweis
- Angebote: Dashboard, Angebote. Nur an Geräte mit ausdrücklicher Einwilligung, Ruhezeit 21 bis 8 Uhr, 1 Angebot pro Tag und Programm,
  pro Gerät höchstens alle 3 Tage. Datenbank: `0007_campaigns_nearby.sql`, Versand: `/api/push/campaign` (benötigt die VAPID-Schlüssel).
- Nähe-Hinweis (Beta): Der Abgleich mit dem Standort passiert nur auf dem Gerät der Kundin oder des Kunden und nur, solange die Karte offen ist.
  Der Standort wird nie gespeichert. Im Hintergrund ist das mit einer Website nicht zuverlässig möglich.

## Geplante Angebote (Zeitdienst)
Geplante Angebote verschickt `/api/cron/dispatch`. Ein Zeitdienst (zum Beispiel cron-job.org, kostenlos) ruft die Adresse alle 5 Minuten auf,
mit dem Header `Authorization: Bearer <CRON_SECRET>`. `CRON_SECRET` ist mindestens 24 Zeichen lang und steht bei Vercel (Secret).
In der Datenbank steht nur der Hash: `insert into public.loyalty_settings (key, value) values ('cron_secret_hash', '<sha256 des Kennworts>')
on conflict (key) do update set value = excluded.value;`. Den Hash erzeugt `printf '%s' "KENNWORT" | shasum -a 256`.
Hinweis: Vercel Hobby erlaubt eigene Zeitpläne nur einmal täglich, deshalb der externe Zeitdienst.
