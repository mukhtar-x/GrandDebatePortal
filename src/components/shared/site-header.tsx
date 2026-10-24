"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/" aria-label="The Grand Debate home">
          <Image
            className="brand-mark"
            src="/tgd-logo-mark.png"
            alt=""
            width={58}
            height={58}
            priority
          />
          <span className="brand-copy">
            <span className="brand-title">The Grand Debate</span>
            <span className="brand-edition">16th Edition · FAST-NUCES Karachi</span>
          </span>
        </Link>

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

        <details
          className="mobile-nav"
          open={mobileMenuOpen}
          onToggle={(event) => setMobileMenuOpen(event.currentTarget.open)}
        >
          <summary aria-label="Site navigation" aria-expanded={mobileMenuOpen}>
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
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
