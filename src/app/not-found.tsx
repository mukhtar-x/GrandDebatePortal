import Link from "next/link";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader } from "@/components/shared/site-header";
import { ActionIcon } from "@/components/shared/action-icon";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Page not found" },
  description: "We couldn't find that page on The Grand Debate '26 website.",
};

export default function NotFound() {
  return (
    <div className="portal-site">
      <style>{`
        .not-found-main {
          display: grid;
          min-height: min(760px, calc(100vh - 250px));
          place-items: center;
          padding: 64px 24px;
          background: radial-gradient(ellipse at 50% 46%, rgba(32, 53, 101, .68), transparent 58%), var(--oxford-blue);
        }
        .not-found-card {
          width: min(100%, 780px);
          padding: clamp(32px, 6vw, 72px);
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          text-align: center;
        }
        .not-found-eyebrow { margin: 0; color: var(--grand-gold); font-family: var(--font-display); font-size: 13px; font-weight: 700; letter-spacing: .19em; text-transform: uppercase; }
        .not-found-code { margin: 14px 0 0; color: var(--grand-gold); font-family: var(--font-display); font-size: clamp(100px, 18vw, 168px); font-weight: 700; letter-spacing: .07em; line-height: .98; text-shadow: 0 0 52px rgba(201, 160, 85, .18); }
        .not-found-heading { margin: 20px 0 12px; color: var(--white); font-family: var(--font-display); font-size: clamp(27px, 4vw, 40px); font-weight: 600; line-height: 1.25; }
        .not-found-copy { max-width: 560px; margin: 0 auto; color: var(--ink-soft); font-size: 15px; }
        .not-found-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 30px; }
        .not-found-contact { margin: 24px 0 0; color: rgba(255, 255, 255, .68); font-size: 13px; }
        .not-found-contact a { color: var(--desert-sand); text-underline-offset: 3px; }
        @media (max-width: 560px) {
          .not-found-main { min-height: 560px; padding: 36px 18px; }
          .not-found-card { padding: 34px 22px; }
          .not-found-actions { flex-direction: column; }
          .not-found-actions > * { justify-content: center; }
        }
      `}</style>
      <SiteHeader />
      <main className="portal-main not-found-main">
        <section className="not-found-card" aria-labelledby="not-found-title">
          <p className="not-found-eyebrow">The Grand Debate &apos;26 · FAST NUCES Karachi</p>
          <p className="not-found-code" aria-hidden="true">404</p>
          <h1 className="not-found-heading" id="not-found-title">This page missed the floor.</h1>
          <p className="not-found-copy">
            The address may be outdated, or the page may have moved. Head back to the conference homepage, and let us know if you think this is a mistake.
          </p>
          <div className="not-found-actions">
            <Link className="button button-primary" href="/">Back to the homepage <ActionIcon direction="up-right" /></Link>
            <a className="button button-secondary" href="mailto:tlc.khi@nu.edu.pk?subject=Broken%20link%20on%20The%20Grand%20Debate%20website">Report a mistake</a>
          </div>
          <p className="not-found-contact">Contact <a href="mailto:tlc.khi@nu.edu.pk">tlc.khi@nu.edu.pk</a></p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
