"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const mobileMenu = useRef<HTMLDivElement>(null);
  const mobileToggle = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
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

  useEffect(() => setIsOpen(false), [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !mobileMenu.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        mobileToggle.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

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

      <div className={isOpen ? "mobile-nav is-open" : "mobile-nav"} ref={mobileMenu}>
        <button
          className="mobile-nav-toggle"
          ref={mobileToggle}
          type="button"
          aria-label={isOpen ? "Close site navigation" : "Open site navigation"}
          aria-expanded={isOpen}
          aria-controls="mobile-navigation-panel"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav
          id="mobile-navigation-panel"
          className="mobile-nav-panel"
          aria-label="Mobile navigation"
          aria-hidden={!isOpen}
          inert={!isOpen}
        >
          {navigation.map((item) => (
            <Link
              key={item.key}
              className={navLinkClass(item.key, active)}
              href={item.href}
              aria-current={item.key === active ? "page" : undefined}
              onClick={() => setIsOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
