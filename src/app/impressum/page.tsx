import LegalPage from "@/components/legal-page";
import { LEGAL, fill } from "@/lib/legal";

export const metadata = { title: "Impressum – Blinko" };

export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        {fill(LEGAL.name)}
        <br />
        {fill(LEGAL.street)}
        <br />
        {fill(LEGAL.zipCity)}
        <br />
        {LEGAL.country}
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: {fill(LEGAL.email)}
        {LEGAL.phone.trim() && (
          <>
            <br />
            Telefon: {LEGAL.phone}
          </>
        )}
      </p>

      {LEGAL.vatId.trim() && (
        <>
          <h2>Umsatzsteuer-ID</h2>
          <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: {LEGAL.vatId}</p>
        </>
      )}

      <h2>Verantwortlich für den Inhalt</h2>
      <p>
        Verantwortlich nach § 18 Abs. 2 MStV: {fill(LEGAL.name)}, Anschrift wie oben.
      </p>

      <h2>Inhalte der Unternehmensprofile</h2>
      <p>
        Die öffentlichen Unternehmensprofile und Treueprogramme werden von den jeweiligen Unternehmen
        selbst angelegt. Für diese Inhalte ist das jeweilige Unternehmen verantwortlich.
      </p>
    </LegalPage>
  );
}
