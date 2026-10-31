import Link from "next/link";
import Logo from "@/components/logo";
import SiteFooter from "@/components/site-footer";
import { LEGAL } from "@/lib/legal";

export default function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-10 text-[#202A35]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-2xl font-extrabold">
          <Logo size={36} />
        </Link>

        {!LEGAL.reviewed && (
          <p role="note" className="mt-6 rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm leading-6">
            <strong>Entwurf:</strong> Dieser Text ist eine Vorlage und noch nicht rechtlich geprüft.
            Angaben in [eckigen Klammern] müssen vor dem Start ausgefüllt oder angepasst werden.
          </p>
        )}

        <article className="mt-6 rounded-3xl border border-orange-100 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold">{title}</h1>
          <div className="mt-6 space-y-4 leading-7 text-gray-700 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#202A35] [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
            {children}
          </div>
        </article>

        <SiteFooter />
      </div>
    </main>
  );
}
