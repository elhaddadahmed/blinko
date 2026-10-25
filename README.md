# Blinko

Digitale Kundenbindung für lokale Unternehmen (Next.js, Supabase).

## Start
1. `cp .env.example .env.local` und Supabase-Werte eintragen
2. `npm install && npm run dev`

## Datenbank
SQL-Migrationen liegen in `supabase/migrations/` und werden im Supabase SQL Editor ausgeführt.

## Status
Konto, Anmeldung, Dashboard-Navigation, Profil-Editor (inkl. Öffnungszeiten), Treueprogramm-Einrichtung, öffentliche Profilseite sowie QR-Code mit NFC-Anleitung sind umgesetzt. Treueprogramm, Feedback und Statistiken folgen.

## Treueprogramm (Datenbank)
`supabase/migrations/0002_loyalty.sql` legt Programme, Karten, Stempel, Einlösungen und Scan-Tokens samt Sicherheitsregeln an.
Tests: `supabase/tests/loyalty_security_test.sql` (nur gegen eine lokale Test-Datenbank ausführen).
