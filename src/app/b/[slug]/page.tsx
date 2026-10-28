import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DAYS, parseHours } from "@/lib/hours";
import StartCard from "./start-card";

type Props = {
  params: Promise<{ slug: string }>;
};

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-12 text-[#202A35]">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-2xl font-extrabold">
          <span className="text-[#F36B21]">B</span> Blinko
        </Link>
        {children}
      </div>
    </main>
  );
}

function ProfileSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Profil wird geladen"
      className="mt-8 overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm"
    >
      <div className="h-40 animate-pulse bg-orange-200" />
      <div className="space-y-3 p-8">
        <div className="h-5 w-1/3 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
      </div>
    </section>
  );
}

async function BusinessProfile({ params }: Props) {
  const { slug } = await params;

  const { data: profile, error } = await supabase
    .from("business_profiles")
    .select("business_id, name, category, description, address_public, website_url, phone_public, opening_hours, slug")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !profile) {
    notFound();
  }

  const { data: program } = await supabase
    .from("loyalty_programs")
    .select("name, description, stamps_required, reward, terms")
    .eq("business_id", profile.business_id)
    .eq("is_active", true)
    .maybeSingle();

  const hours = parseHours(profile.opening_hours);
  const hasHours = Object.keys(hours).length > 0;

  return (
    <section className="mt-8 overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
      <div className="bg-[#F36B21] px-8 py-10 text-white">
        <p className="text-sm font-semibold uppercase tracking-wider">
          {profile.category}
        </p>

        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
          {profile.name}
        </h1>

        {profile.address_public && (
          <p className="mt-3 text-white/90">{profile.address_public}</p>
        )}
      </div>

      <div className="p-8">
        {profile.description && (
          <>
            <h2 className="text-xl font-bold">Über uns</h2>
            <p className="mt-3 whitespace-pre-wrap leading-7 text-gray-600">
              {profile.description}
            </p>
          </>
        )}

        {(profile.phone_public || profile.website_url) && (
          <ul className="mt-6 space-y-2 font-semibold">
            {profile.phone_public && (
              <li>
                <a
                  href={`tel:${profile.phone_public.replace(/[^\d+]/g, "")}`}
                  className="text-[#F36B21] underline-offset-4 hover:underline"
                >
                  {profile.phone_public}
                </a>
              </li>
            )}
            {profile.website_url && /^https?:\/\//i.test(profile.website_url) && (
              <li>
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-[#F36B21] underline-offset-4 hover:underline"
                >
                  {profile.website_url.replace(/^https?:\/\//i, "")}
                </a>
              </li>
            )}
          </ul>
        )}

        {hasHours && (
          <>
            <h2 className="mt-8 text-xl font-bold">Öffnungszeiten</h2>
            <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-1 text-gray-700">
              {DAYS.filter(([key]) => hours[key]).map(([key, label]) => (
                <div key={key} className="contents">
                  <dt className="font-medium">{label}</dt>
                  <dd>{hours[key]}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        {program && (
          <div className="mt-8 rounded-2xl bg-[#FFF8EF] p-5">
            <h2 className="font-bold">{program.name}</h2>
            {program.description && (
              <p className="mt-2 text-sm leading-6 text-gray-600">{program.description}</p>
            )}
            <p className="mt-3 font-semibold">
              Sammle {program.stamps_required} Stempel und erhalte: {program.reward}
            </p>
            <StartCard slug={profile.slug} />
            {program.terms && (
              <p className="mt-4 whitespace-pre-wrap text-xs leading-5 text-gray-500">
                {program.terms}
              </p>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-gray-400">
          Digitales Geschäftsprofil mit Blinko
        </p>
      </div>
    </section>
  );
}

export default function PublicBusinessPage({ params }: Props) {
  return (
    <PageShell>
      <Suspense fallback={<ProfileSkeleton />}>
        <BusinessProfile params={params} />
      </Suspense>
    </PageShell>
  );
}
