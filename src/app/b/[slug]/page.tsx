import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function PublicBusinessPage({ params }: Props) {
  const { slug } = await params;

  const { data: profile, error } = await supabase
    .from("business_profiles")
    .select("name, category, description, address_public, slug")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !profile) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-12 text-[#202A35]">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-2xl font-extrabold">
          <span className="text-[#F36B21]">B</span> Blinko
        </Link>

        <section className="mt-8 overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
          <div className="bg-[#F36B21] px-8 py-10 text-white">
            <p className="text-sm font-semibold uppercase tracking-wider">
              {profile.category}
            </p>

            <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
              {profile.name}
            </h1>

            {profile.address_public && (
              <p className="mt-3 text-white/90">
                {profile.address_public}
              </p>
            )}
          </div>

          <div className="p-8">
            <h2 className="text-xl font-bold">Über uns</h2>

            <p className="mt-3 whitespace-pre-wrap leading-7 text-gray-600">
              {profile.description || "Weitere Informationen folgen bald."}
            </p>

            <div className="mt-8 rounded-2xl bg-[#FFF8EF] p-5">
              <h2 className="font-bold">Digitales Treueprogramm</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Hier wird später das digitale Treueprogramm dieses
                Unternehmens angezeigt.
              </p>
            </div>

            <p className="mt-8 text-center text-xs text-gray-400">
              Digitales Geschäftsprofil mit Blinko
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}