"use client";

import Image from "next/image";
import { useContext, useEffect, useState } from "react";
import { IntroFinishedContext } from "@/components/shared/site-intro-context";

const LOGO_REVEAL_VIDEO = "/assets/05_Videos/tgd_logo_reveal_1080p_optimized.mp4";
const MOBILE_LOGO_REVEAL_VIDEO = "/assets/05_Videos/tgd_logo_reveal_mobile_720p.mp4";
const VIDEO_POSTER = "/assets/05_Videos/video_poster_frame.jpg";

export function HeroLogoReveal() {
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const introFinished = useContext(IntroFinishedContext);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      setShouldAnimate(introFinished && !reduceMotion.matches);
    };
    updateMotionPreference();
    reduceMotion.addEventListener("change", updateMotionPreference);

    return () => reduceMotion.removeEventListener("change", updateMotionPreference);
  }, [introFinished]);

  if (!shouldAnimate) {
    return (
      <Image
        className="home-reveal"
        src={VIDEO_POSTER}
        alt=""
        width={1920}
        height={1080}
      />
    );
  }

  return (
    <video
      className="home-reveal"
      autoPlay
      muted
      playsInline
      preload="none"
      poster={VIDEO_POSTER}
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
