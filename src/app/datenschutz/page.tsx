import LegalPage from "@/components/legal-page";
import { LEGAL, fill } from "@/lib/legal";

export const metadata = { title: "Datenschutzerklärung – Blinko" };

export default function DatenschutzPage() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <h2>1. Verantwortlicher</h2>
      <p>
        {fill(LEGAL.name)}, {fill(LEGAL.street)}, {fill(LEGAL.zipCity)}, {LEGAL.country}.
        E-Mail: {fill(LEGAL.email)}.
      </p>
      <p>
        Blinko wird an zwei Stellen genutzt: von Unternehmen, die ein Konto und ein Treueprogramm
        betreiben, und von deren Kundinnen und Kunden, die eine digitale Treuekarte nutzen. Für die
        Daten der Treuekarten ist das jeweilige Unternehmen verantwortlich. Wir verarbeiten sie in
        dessen Auftrag (siehe Auftragsverarbeitungsvertrag).
      </p>

      <h2>2. Hosting und Dienstleister</h2>
      <ul>
        <li>
          <strong>Vercel Inc.</strong> (Hosting der Anwendung). Dabei werden technisch notwendige
          Verbindungsdaten wie IP-Adresse und Zeitpunkt des Aufrufs verarbeitet.
        </li>
        <li>
          <strong>Supabase</strong> (Datenbank und Anmeldung). Region der Datenbank: {fill(LEGAL.supabaseRegion)}.
        </li>
        {LEGAL.emailProvider.trim() && (
          <li>
            <strong>{LEGAL.emailProvider}</strong> (Versand von E-Mails, zum Beispiel Bestätigungs-E-Mails).
          </li>
        )}
      </ul>
      <p>
        Mit den Dienstleistern bestehen Verträge zur Auftragsverarbeitung. Soweit Daten in Länder außerhalb
        der EU übermittelt werden, geschieht das auf Grundlage eines Angemessenheitsbeschlusses oder von
        Standardvertragsklauseln. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b und f DSGVO (Bereitstellung und
        sicherer Betrieb des Dienstes).
      </p>

      <h2>3. Konto von Unternehmen</h2>
      <p>
        Bei der Registrierung speichern wir E-Mail-Adresse, Passwort (nur verschlüsselt als Hashwert),
        den Zeitpunkt der Zustimmung zu AGB und AVV sowie die Angaben zu Ihrem Unternehmen (Name, Branche,
        Beschreibung, Adresse, Telefon, Website, Öffnungszeiten, Treueprogramm). Rechtsgrundlage ist
        Art. 6 Abs. 1 lit. b DSGVO. Wir speichern die Daten, solange das Konto besteht. Sie können Ihr Konto
        im Dashboard unter „Konto“ löschen.
      </p>

      <h2>4. Öffentliches Profil</h2>
      <p>
        Veröffentlichen Sie Ihr Profil, sind Name, Branche, Beschreibung, Adresse, Telefonnummer, Website,
        Öffnungszeiten und das aktive Treueprogramm für alle Besucherinnen und Besucher sichtbar.
      </p>

      <h2>5. Digitale Treuekarte (Kundinnen und Kunden)</h2>
      <p>
        Für die Treuekarte verlangen wir keinen Namen und keine E-Mail-Adresse. Es wird ein geheimer
        Kartenlink erzeugt, von dem nur ein Hashwert gespeichert wird. Gespeichert werden außerdem der
        Stempelstand sowie Zeitpunkt der Stempel und Einlösungen. Zusätzlich speichert Ihr Browser den
        Kartenlink, damit Sie die Karte wieder öffnen können. Geht der Link verloren, kann die Karte nicht
        wiederhergestellt werden. Wer den Link kennt, kann die Karte nutzen. Bewahren Sie ihn deshalb
        privat auf. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Wenden Sie sich für Auskunft und
        Löschung an das Unternehmen, bei dem Sie die Karte nutzen.
      </p>

      <h2>6. Push-Benachrichtigungen (freiwillig)</h2>
      <p>
        Auf der Treuekarte können Sie Benachrichtigungen einschalten, zum Beispiel wenn Sie einen Stempel
        bekommen oder Ihre Belohnung bereit ist. Dafür speichern wir die technischen Daten Ihres Push-Abos
        (Adresse des Push-Dienstes Ihres Browsers und Schlüssel) und ordnen sie Ihrer Karte zu. Die Nachrichten
        werden über den Push-Dienst Ihres Browser- oder Geräteherstellers zugestellt (zum Beispiel Apple,
        Google oder Mozilla). Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1
        TDDDG). Sie können sie jederzeit auf der Karte oder in den Einstellungen Ihres Browsers widerrufen.
        Wir senden darüber keine Werbung.
      </p>

      <h2>7. Angebote (freiwillig, getrennte Einwilligung)</h2>
      <p>
        Zusätzlich zu den Benachrichtigungen über Stempel können Sie auf der Karte erlauben, dass Ihnen das
        Unternehmen gelegentlich Angebote als Push-Nachricht schickt. Das ist eine eigene Einwilligung
        (Art. 6 Abs. 1 lit. a DSGVO), die standardmäßig ausgeschaltet ist. Wir speichern dafür, ob Sie zugestimmt
        haben, wann, und wann Sie zuletzt ein Angebot bekommen haben. Es gelten Ruhezeiten (21 bis 8 Uhr) und
        eine Höchstzahl: pro Gerät höchstens ein Angebot alle drei Tage. Sie können die Einwilligung jederzeit
        mit einem Klick auf der Karte zurücknehmen. Aktuelle Angebote erscheinen außerdem auf der öffentlichen
        Profilseite und auf Ihrer Karte.
      </p>

      <h2>8. Nähe-Hinweis (freiwillig, Beta)</h2>
      <p>
        Wenn Sie den Nähe-Hinweis einschalten, fragt Ihr Browser nach Ihrem Standort. Der Abgleich mit dem
        Standort des Geschäfts geschieht ausschließlich auf Ihrem Gerät, solange die Karte geöffnet ist. Ihr
        Standort wird weder gespeichert noch an uns oder das Unternehmen übertragen. Die Einstellung merkt sich
        Ihr Browser lokal. Sie können sie jederzeit ausschalten und die Standortfreigabe im Browser widerrufen.
      </p>

      <h2>9. Cookies und lokale Speicherung</h2>
      <p>
        Wir setzen keine Tracking- oder Analyse-Dienste ein. Für angemeldete Unternehmen wird die Sitzung
        im Browser gespeichert, und die Treuekarte speichert ihren Link im Browser. Beides ist für den
        gewünschten Dienst erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG).
      </p>

      <h2>10. Ihre Rechte</h2>
      <p>
        Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
        Datenübertragbarkeit und Widerspruch (Art. 15 bis 21 DSGVO). Sie können eine erteilte Einwilligung
        jederzeit widerrufen. Außerdem haben Sie das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu
        beschweren. Schreiben Sie uns unter {fill(LEGAL.email)}.
      </p>

      <p className="text-sm text-gray-500">Stand: {LEGAL.termsVersion}</p>
    </LegalPage>
  );
}
