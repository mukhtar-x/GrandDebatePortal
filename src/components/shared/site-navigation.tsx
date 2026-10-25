"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

type ActiveRoute = "home" | "committees" | "register" | "portal" | "archive" | null;

const navigation = [
  { label: "Home", href: "/", key: "home" },
  { label: "Committees", href: "/committees", key: "committees" },
  { label: "Register", href: "/register", key: "register" },
  { label: "Portal", href: "/portal", key: "portal" },
  { label: "Archive", href: "/archive", key: "archive" },
] as const;

function navLinkClass(key: string, active: ActiveRoute) {
  return key === active ? "site-nav-link is-active" : "site-nav-link";
}

export function SiteNavigation() {
  const pathname = usePathname();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const active: ActiveRoute =
    pathname === "/"
      ? "home"
      : pathname.startsWith("/committees")
        ? "committees"
        : pathname.startsWith("/register")
          ? "register"
          : pathname.startsWith("/portal")
            ? "portal"
            : pathname.startsWith("/archive")
              ? "archive"
              : null;

  function closeMobileMenu() {
    if (mobileMenu.current) mobileMenu.current.open = false;
  }

  return (
    <>
      <nav className="site-nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <Link
            key={item.key}
            className={navLinkClass(item.key, active)}
            href={item.href}
            aria-current={item.key === active ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <details className="mobile-nav" ref={mobileMenu}>
        <summary aria-label="Site navigation">
          <span />
          <span />
          <span />
        </summary>
        <nav className="mobile-nav-panel" aria-label="Mobile navigation">
          {navigation.map((item) => (
            <Link
              key={item.key}
              className={navLinkClass(item.key, active)}
              href={item.href}
              aria-current={item.key === active ? "page" : undefined}
              onClick={closeMobileMenu}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </details>
    </>
  );
}
