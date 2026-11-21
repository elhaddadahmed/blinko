"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/logo";

const ITEMS = [
  { href: "/dashboard", label: "Übersicht" },
  { href: "/dashboard/profil", label: "Geschäftsprofil" },
  { href: "/dashboard/treueprogramm", label: "Treueprogramm" },
  { href: "/dashboard/stempeln", label: "Stempeln" },
  { href: "/dashboard/statistiken", label: "Statistiken" },
  { href: "/dashboard/qr", label: "QR-Code & NFC" },
  { href: "/dashboard/konto", label: "Konto" },
] as const;

export default function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [rewards, setRewards] = useState(0);

  // Zählt Karten mit bereiter Belohnung und zeigt sie als Hinweis am Menüpunkt „Stempeln“
  useEffect(() => {
    let stop = false;
    async function check() {
      if (document.hidden) return;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: biz } = await supabase.from("businesses").select("id").eq("owner_id", auth.user.id).limit(1);
      if (!biz?.length) return;
      const { data: prog } = await supabase
        .from("loyalty_programs").select("stamps_required").eq("business_id", biz[0].id).maybeSingle();
      if (!prog) return;
      const res = await supabase
        .from("loyalty_cards").select("id", { count: "exact", head: true })
        .eq("status", "active").gte("stamps", prog.stamps_required as number);
      if (!stop && !res.error) setRewards(res.count ?? 0);
    }
    void check();
    const id = setInterval(check, 30000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

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
          <Logo size={30} />
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
            {item.href === "/dashboard/stempeln" && rewards > 0 && (
              <span className="ml-1.5 rounded-full bg-[#F36B21] px-2 py-0.5 text-xs font-bold text-white">
                {rewards}
                <span className="sr-only"> Belohnungen bereit</span>
              </span>
            )}
          </Link>
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
