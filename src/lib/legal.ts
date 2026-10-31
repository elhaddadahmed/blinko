/**
 * Angaben des Anbieters für Impressum, Datenschutz, AGB und AVV.
 * Trage hier deine echten Daten ein. Leere Felder erscheinen als [bitte ausfüllen].
 * Setze `reviewed` erst auf true, wenn die Rechtstexte rechtlich geprüft wurden:
 * Dann verschwindet der Entwurfs-Hinweis auf den Rechtsseiten.
 */
export const LEGAL = {
  reviewed: false,
  termsVersion: "2026-10",
  name: "", // Vor- und Nachname bzw. Firma inkl. Rechtsform
  street: "",
  zipCity: "",
  country: "Deutschland",
  email: "",
  phone: "",
  vatId: "", // Umsatzsteuer-ID, falls vorhanden
  supabaseRegion: "", // z. B. EU (Frankfurt)
  emailProvider: "", // Anbieter für E-Mails (SMTP), falls eingerichtet
};

export const fill = (value: string) => (value.trim() ? value : "[bitte ausfüllen]");
