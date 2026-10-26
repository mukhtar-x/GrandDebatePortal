"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { IntroFinishedContext } from "@/components/shared/site-intro-context";

const LOGO_REVEAL_VIDEO = "/assets/05_Videos/tgd_logo_reveal_1080p_optimized.mp4";
const MOBILE_LOGO_REVEAL_VIDEO = "/assets/05_Videos/tgd_logo_reveal_mobile_720p.mp4";

export function HeroLogoReveal() {
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const introFinished = useContext(IntroFinishedContext);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      setShouldAnimate(introFinished && !reduceMotion.matches);
    };
    updateMotionPreference();
    reduceMotion.addEventListener("change", updateMotionPreference);

    return () => reduceMotion.removeEventListener("change", updateMotionPreference);
  }, [introFinished]);

  useEffect(() => {
    if (!shouldAnimate) return;

    const video = videoRef.current;
    if (!video) return;

    void video.play().catch(() => {
      // The poster remains visible if the browser blocks autoplay.
    });
  }, [shouldAnimate]);

  return (
    <video
      ref={videoRef}
      className="home-reveal"
      autoPlay={shouldAnimate}
      muted
      playsInline
      loop
      preload="auto"
      poster="/assets/05_Videos/tgd_logo_reveal_final_frame.png"
      onCanPlay={() => {
        if (shouldAnimate && videoRef.current) {
          void videoRef.current.play().catch(() => {
            // Keep the decoded first frame visible if the browser blocks autoplay.
          });
        }
      }}
      aria-hidden="true"
    >
      <source
        src={MOBILE_LOGO_REVEAL_VIDEO}
        type="video/mp4"
        media="(max-width: 760px)"
      />
      <source src={LOGO_REVEAL_VIDEO} type="video/mp4" />
    </video>
  );
}
