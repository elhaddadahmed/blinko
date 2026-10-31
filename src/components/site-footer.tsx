import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-orange-100 py-6 text-sm text-gray-600 print:hidden">
      <nav aria-label="Rechtliches" className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/impressum" className="hover:text-[#F36B21]">Impressum</Link>
        <Link href="/datenschutz" className="hover:text-[#F36B21]">Datenschutz</Link>
        <Link href="/agb" className="hover:text-[#F36B21]">AGB</Link>
        <Link href="/avv" className="hover:text-[#F36B21]">Auftragsverarbeitung (AVV)</Link>
      </nav>
    </footer>
  );
}
