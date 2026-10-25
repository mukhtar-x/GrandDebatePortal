"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IntroFinishedContext } from "@/components/shared/site-intro-context";

const INTRO_VIDEO = "/assets/05_Videos/tgd_intro_3d_cinematic_720p_muted_for_autoplay.mp4";
const VIDEO_POSTER = "/assets/05_Videos/video_poster_frame.jpg";

export function SiteIntroProvider({ children }: { children: ReactNode }) {
  const [introFinished, setIntroFinished] = useState(false);
  const finishIntro = useCallback(() => setIntroFinished(true), []);

  return (
    <IntroFinishedContext.Provider value={introFinished}>
      {children}
      <SiteIntro onFinished={finishIntro} />
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
    window.setTimeout(() => setIsVisible(false), 650);
  }, [onFinished]);

  useEffect(() => {
    if (!isVisible) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      dismiss();
      return;
    }

    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const timeout = window.setTimeout(dismiss, 18_000);

    return () => {
      window.clearTimeout(timeout);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [dismiss, isVisible]);

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
        preload="auto"
        poster={VIDEO_POSTER}
        onEnded={dismiss}
        onError={dismiss}
        aria-hidden="true"
      >
        <source src={INTRO_VIDEO} type="video/mp4" />
      </video>
      <div className="site-intro-vignette" />
      <button className="site-intro-skip" type="button" onClick={dismiss}>
        Skip intro <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
