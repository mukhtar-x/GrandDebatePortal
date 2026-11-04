/** Set once the homepage intro has been seen on this device. */
export const INTRO_SEEN_KEY = "tgd-intro-seen-v1";

/**
 * Runs before first paint (see layout.tsx) and hides the page while the intro is about to play,
 * so the homepage does not flash first. Mirrors the conditions in SiteIntroProvider; a CSS
 * fallback reveals the page after a few seconds if the intro never mounts.
 */
export const INTRO_PENDING_SCRIPT = `try{if(location.pathname==="/"&&!localStorage.getItem("${INTRO_SEEN_KEY}")&&!matchMedia("(max-width: 760px)").matches&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.dataset.intro="pending"}}catch(e){}`;
