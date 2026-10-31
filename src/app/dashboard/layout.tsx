import DashboardNav from "./nav";
import SiteFooter from "@/components/site-footer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DashboardNav />
      {children}
      <div className="mx-auto max-w-2xl px-5 pb-10">
        <SiteFooter />
      </div>
    </>
  );
}
