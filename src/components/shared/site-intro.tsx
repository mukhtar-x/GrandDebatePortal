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
  const isAdminRoute = pathname === "/admin" || pathname?.startsWith("/admin/");

  useEffect(() => {
    if (isAdminRoute) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    try {
      if (localStorage.getItem(INTRO_SEEN_KEY) || reduceMotion.matches) return;
    } catch {
      // Storage can be unavailable in private browsing; the intro remains skippable.
    }

    setIntroFinished(false);
    setShowIntro(true);
  }, [isAdminRoute]);

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
      {children}
      {showIntro && !isAdminRoute ? <SiteIntro onFinished={finishIntro} /> : null}
    </IntroFinishedContext.Provider>
  );
}

function SiteIntro({ onFinished }: { onFinished: () => void }) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const dismissed = useRef(false);

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
  }, [dismiss]);

  if (!isVisible) return null;

  return (
    <div
      className={isLeaving ? "site-intro is-leaving" : "site-intro"}
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
      <button className="site-intro-skip" type="button" onClick={dismiss}>
        Skip intro <ActionIcon />
      </button>
    </div>
  );
}
