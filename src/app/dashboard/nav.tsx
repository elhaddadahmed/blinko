"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const ITEMS = [
  { href: "/dashboard/profil", label: "Geschäftsprofil" },
  { href: "/dashboard/treueprogramm", label: "Treueprogramm" },
  { href: "/dashboard/qr", label: "QR-Code & NFC" },
] as const;

const COMING_SOON = ["Statistiken"] as const;

export default function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/anmelden");
    router.refresh();
  }

  return (
    <header className="border-b border-orange-100 bg-white print:hidden">
      <nav
        aria-label="Dashboard"
        className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 text-sm"
      >
        <Link href="/" className="mr-2 text-lg font-extrabold">
          <span className="text-[#F36B21]">B</span> Blinko
        </Link>

        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            className={
              pathname === item.href
                ? "font-bold text-[#F36B21]"
                : "font-medium hover:text-[#F36B21]"
            }
          >
            {item.label}
          </Link>
        ))}

        {COMING_SOON.map((label) => (
          <span key={label} className="text-gray-400" title="Noch nicht verfügbar">
            {label} <span className="text-xs">(bald)</span>
          </span>
        ))}

        <button
          type="button"
          onClick={logout}
          className="ml-auto font-medium text-gray-600 hover:text-[#F36B21]"
        >
          Abmelden
        </button>
      </nav>
    </header>
  );
}
