import LegalPage from "@/components/legal-page";
import { LEGAL, fill } from "@/lib/legal";

export const metadata = { title: "Auftragsverarbeitungsvertrag – Blinko" };

export default function AvvPage() {
  return (
    <LegalPage title="Auftragsverarbeitungsvertrag (AVV)">
      <p>
        gemäß Art. 28 DSGVO zwischen dem Kunden (Verantwortlicher) und {fill(LEGAL.name)},{" "}
        {fill(LEGAL.street)}, {fill(LEGAL.zipCity)} (Auftragsverarbeiter).
      </p>

      <h2>1. Gegenstand und Dauer</h2>
      <p>
        Der Auftragsverarbeiter betreibt für den Verantwortlichen das digitale Treueprogramm in Blinko.
        Der Vertrag gilt, solange der Verantwortliche Blinko nutzt.
      </p>

      <h2>2. Art, Zweck, Daten und Betroffene</h2>
      <ul>
        <li>Zweck: Bereitstellung von Treuekarten, Stempeln und Einlösungen für die Kundschaft des Verantwortlichen.</li>
        <li>Datenarten: pseudonymer Kartenschlüssel (nur als Hash), Stempelstand, Zeitpunkte von Stempeln und Einlösungen.</li>
        <li>Betroffene: Kundinnen und Kunden des Verantwortlichen, die eine Treuekarte nutzen.</li>
      </ul>

      <h2>3. Pflichten des Auftragsverarbeiters</h2>
      <ul>
        <li>Verarbeitung nur auf dokumentierte Weisung des Verantwortlichen.</li>
        <li>Verpflichtung zur Vertraulichkeit aller Personen mit Datenzugriff.</li>
        <li>Technische und organisatorische Maßnahmen nach Art. 32 DSGVO (siehe Punkt 6).</li>
        <li>Unterstützung bei Betroffenenanfragen und bei der Meldung von Datenpannen ohne schuldhaftes Zögern.</li>
        <li>Löschung oder Rückgabe der Daten nach Vertragsende, soweit keine Aufbewahrungspflicht besteht.</li>
        <li>Bereitstellung der Nachweise, die zur Kontrolle der Pflichten erforderlich sind.</li>
      </ul>

      <h2>4. Unterauftragsverarbeiter</h2>
      <p>Der Verantwortliche stimmt dem Einsatz folgender Unterauftragsverarbeiter zu:</p>
      <ul>
        <li>Vercel Inc. (Hosting)</li>
        <li>Supabase (Datenbank und Anmeldung), Region: {fill(LEGAL.supabaseRegion)}</li>
        {LEGAL.emailProvider.trim() && <li>{LEGAL.emailProvider} (E-Mail-Versand)</li>}
      </ul>
      <p>Über Änderungen wird der Verantwortliche vorab informiert und kann ihnen widersprechen.</p>

      <h2>5. Weisungen und Verantwortung</h2>
      <p>
        Der Verantwortliche bleibt für die Rechtmäßigkeit der Verarbeitung gegenüber seinen Kundinnen und
        Kunden verantwortlich, insbesondere für Information und Rechtsgrundlage.
      </p>

      <h2>6. Technische und organisatorische Maßnahmen</h2>
      <ul>
        <li>Verschlüsselte Übertragung (HTTPS).</li>
        <li>Zugriffsbeschränkung auf Datenbankebene (Row Level Security): Jedes Unternehmen sieht nur seine eigenen Daten.</li>
        <li>Kartenschlüssel und Scan-Codes werden nur als Hash gespeichert. Scan-Codes sind kurzlebig und einmalig.</li>
        <li>Stempel und Einlösungen werden nur über geprüfte Serverfunktionen vergeben.</li>
        <li>[Backups, Protokollierung und weitere Maßnahmen prüfen und ergänzen.]</li>
      </ul>

      <h2>7. Haftung und Schlussbestimmungen</h2>
      <p>[Haftungsregelung und Gerichtsstand rechtlich prüfen lassen.]</p>

      <p className="text-sm text-gray-500">Stand: {LEGAL.termsVersion}</p>
    </LegalPage>
  );
}
