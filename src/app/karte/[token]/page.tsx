import { Suspense } from "react";
import CardView from "./card-view";

export const metadata = {
  title: "Meine Treuekarte",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

async function Inner({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CardView token={token} />;
}

export default function CardPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="min-h-screen bg-[#FFF8EF] px-5 py-10 text-[#202A35]">
      <div className="mx-auto max-w-md">
        <Suspense fallback={<p aria-busy="true">Karte wird geladen …</p>}>
          <Inner params={params} />
        </Suspense>
      </div>
    </main>
  );
}
