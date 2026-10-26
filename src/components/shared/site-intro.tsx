"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { IntroFinishedContext } from "@/components/shared/site-intro-context";
import { ActionIcon } from "@/components/shared/action-icon";

const INTRO_VIDEO = "/assets/05_Videos/tgd_intro_3d_cinematic_720p_muted_for_autoplay.mp4";
const VIDEO_POSTER = "/assets/05_Videos/video_poster_frame.jpg";
const INTRO_SEEN_KEY = "tgd-intro-seen-v1";

export function SiteIntroProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [introFinished, setIntroFinished] = useState(true);
  const [showIntro, setShowIntro] = useState(false);
  const isHomeRoute = pathname === "/";
  const isAdminRoute = pathname === "/admin" || pathname?.startsWith("/admin/");
  const introActive = showIntro && !introFinished && isHomeRoute && !isAdminRoute;

  useEffect(() => {
    if (!isHomeRoute || isAdminRoute) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 760px)");
    const syncIntro = () => {
      if (mobile.matches || reduceMotion.matches) {
        setIntroFinished(true);
        setShowIntro(false);
        return;
      }

      try {
        if (localStorage.getItem(INTRO_SEEN_KEY)) return;
      } catch {
        // Storage can be unavailable in private browsing; the intro remains skippable.
      }

      setIntroFinished(false);
      setShowIntro(true);
    };

    syncIntro();
    mobile.addEventListener("change", syncIntro);
    reduceMotion.addEventListener("change", syncIntro);
    return () => {
      mobile.removeEventListener("change", syncIntro);
      reduceMotion.removeEventListener("change", syncIntro);
    };
  }, [isAdminRoute, isHomeRoute]);

  const finishIntro = useCallback(() => {
    setIntroFinished(true);
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // The intro still closes when persistent storage is unavailable.
    }
  }, []);

  return (
    <IntroFinishedContext.Provider value={introFinished}>
      <div className="site-intro-content" inert={introActive || undefined} aria-hidden={introActive || undefined}>
        {children}
      </div>
      {introActive ? <SiteIntro onFinished={finishIntro} /> : null}
    </IntroFinishedContext.Provider>
  );
}

function SiteIntro({ onFinished }: { onFinished: () => void }) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const dismissed = useRef(false);
  const skipButtonRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    setIsLeaving(true);
    onFinished();
    window.setTimeout(() => setIsVisible(false), 350);
  }, [onFinished]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      dismiss();
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    skipButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      } else if (event.key === "Tab") {
        event.preventDefault();
        skipButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [dismiss]);

  if (!isVisible) return null;

  return (
    <div
      className={isLeaving ? "site-intro is-leaving" : "site-intro"}
      role="dialog"
      aria-modal="true"
      aria-label="The Grand Debate introduction"
      aria-hidden={isLeaving}
    >
      <video
        className="site-intro-video"
        autoPlay
        muted
        playsInline
        preload="none"
        poster={VIDEO_POSTER}
        onEnded={dismiss}
        onError={dismiss}
        aria-hidden="true"
      >
        <source src={INTRO_VIDEO} type="video/mp4" />
      </video>
      <div className="site-intro-vignette" />
      <button ref={skipButtonRef} className="site-intro-skip" type="button" onClick={dismiss}>
        Skip intro <ActionIcon />
      </button>
    </div>
  );
}
