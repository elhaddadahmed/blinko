import LegalPage from "@/components/legal-page";
import { LEGAL, fill } from "@/lib/legal";

export const metadata = { title: "AGB – Blinko" };

export default function AgbPage() {
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen">
      <h2>1. Geltungsbereich</h2>
      <p>
        Diese Bedingungen gelten für die Nutzung von Blinko durch Unternehmer im Sinne von § 14 BGB.
        Anbieter ist {fill(LEGAL.name)}, {fill(LEGAL.street)}, {fill(LEGAL.zipCity)}.
        Abweichende Bedingungen des Kunden gelten nicht.
      </p>

      <h2>2. Leistung</h2>
      <p>
        Blinko stellt eine Webanwendung bereit, mit der Unternehmen ein öffentliches Profil, ein digitales
        Stempelkarten-Programm, QR-Codes und Auswertungen betreiben können. Der Funktionsumfang
        ergibt sich aus der jeweils aktuellen Beschreibung. Geplante Funktionen sind nicht geschuldet.
      </p>

      <h2>3. Konto</h2>
      <p>
        Der Kunde legt ein Konto an und hält seine Zugangsdaten geheim. Er ist verantwortlich für Handlungen
        unter seinem Konto. Er gibt wahrheitsgemäße Angaben an.
      </p>

      <h2>4. Preise und Zahlung</h2>
      <p>[Preise, Abrechnungszeitraum, Zahlungsarten und Fälligkeit hier eintragen.]</p>

      <h2>5. Laufzeit und Kündigung</h2>
      <p>[Vertragslaufzeit, Probezeit und Kündigungsfristen hier eintragen.]</p>

      <h2>6. Pflichten des Kunden</h2>
      <ul>
        <li>Der Kunde stellt nur rechtmäßige Inhalte ein und hält Rechte Dritter ein.</li>
        <li>Er legt faire Teilnahmebedingungen für sein Treueprogramm fest und löst Belohnungen wie angekündigt ein.</li>
        <li>Er ist gegenüber seinen Kundinnen und Kunden für die Datenverarbeitung im Treueprogramm verantwortlich und stellt die nötigen Datenschutzinformationen bereit.</li>
      </ul>

      <h2>7. Verfügbarkeit</h2>
      <p>
        Der Anbieter bemüht sich um einen störungsfreien Betrieb. Eine bestimmte Verfügbarkeit ist nicht
        zugesagt, soweit nichts anderes vereinbart ist. [Wartungsfenster und Verfügbarkeit hier regeln.]
      </p>

      <h2>8. Haftung</h2>
      <p>[Haftungsregelung rechtlich prüfen lassen und hier eintragen.]</p>

      <h2>9. Datenschutz</h2>
      <p>
        Es gilt die Datenschutzerklärung. Soweit der Anbieter personenbezogene Daten im Auftrag des Kunden
        verarbeitet, gilt zusätzlich der Auftragsverarbeitungsvertrag.
      </p>

      <h2>10. Schlussbestimmungen</h2>
      <p>
        Es gilt deutsches Recht. Gerichtsstand ist, soweit zulässig, [Ort eintragen]. Der Anbieter darf diese
        Bedingungen mit angemessener Frist ändern. [Änderungsverfahren hier regeln.]
      </p>

      <p className="text-sm text-gray-500">Stand: {LEGAL.termsVersion}</p>
    </LegalPage>
  );
}
