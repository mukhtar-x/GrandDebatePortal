import type { ReactNode } from "react";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader } from "@/components/shared/site-header";

export default function PortalLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="portal-site">
      <SiteHeader />
      <main className="portal-main">{children}</main>
      <SiteFooter />
    </div>
  );
}
