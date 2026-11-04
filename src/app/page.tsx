import Link from "next/link";
import { ActionIcon } from "@/components/shared/action-icon";
import { HeroLogoReveal } from "@/components/shared/hero-logo-reveal";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader } from "@/components/shared/site-header";
import { EVENT_DETAILS } from "@/data/event";
import type { Metadata } from "next";
import { getCanonicalUrl, getPublicSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: { absolute: "The Grand Debate ’26 - TLC" },
  description: "Three days of debate, diplomacy and dialogue. Join The Grand Debate '26 at FAST-NUCES Karachi, 18–20 November 2026.",
  alternates: getCanonicalUrl("/") ? { canonical: getCanonicalUrl("/") } : undefined,
};

export default function Home() {
  const siteUrl = getPublicSiteUrl();
  const eventStructuredData = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: EVENT_DETAILS.name,
    description: "Three days of debate, diplomacy and dialogue hosted by TLC, FAST-NUCES Karachi.",
    startDate: "2026-11-18T08:00:00+05:00",
    endDate: "2026-11-20T16:00:00+05:00",
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: EVENT_DETAILS.venue, address: { "@type": "PostalAddress", addressLocality: "Karachi", addressCountry: "PK" } },
    organizer: { "@type": "Organization", name: EVENT_DETAILS.organizer, email: EVENT_DETAILS.contactEmail },
    ...(siteUrl ? { url: siteUrl.toString() } : {}),
  };

  return (
    <div className="portal-site">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventStructuredData).replace(/</g, "\\u003c") }} />
      <SiteHeader />
      <main className="portal-main">
        <section className="home-hero">
          <div className="home-copy">
            <p className="home-overline">16th Edition · TLC, FAST-NUCES Karachi</p>
            <h1 className="home-title">
              The Grand
              <span>Debate <small>&apos;26</small></span>
            </h1>
            <p className="home-intro">
              Three days of debate, diplomacy and dialogue. Find your voice, test
              your ideas and take your place at the table.
            </p>

            <div className="home-actions">
              <Link className="button button-primary" href="/register">
                Register for the conference <ActionIcon direction="up-right" />
              </Link>
              <Link className="button button-secondary" href="/portal">
                Track an application
              </Link>
            </div>

            <dl className="home-event-meta">
              <div>
                <dt>Conference dates</dt>
                <dd>{EVENT_DETAILS.dates}</dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>FAST-NUCES Karachi Main Campus</dd>
              </div>
            </dl>
          </div>

          <div className="home-art" aria-hidden="true">
            <HeroLogoReveal />
          </div>
        </section>

        <section className="home-next-steps" aria-labelledby="home-next-title">
          <div className="home-section-heading">
            <p className="section-overline">Your conference journey</p>
            <h2 id="home-next-title">Where would you like to begin?</h2>
          </div>

          <div className="home-action-grid">
            <Link className="home-action-card" href="/register">
              <span className="home-card-number">01</span>
              <span className="home-card-title">Join the debate</span>
              <span className="home-card-copy">
                Register as a solo delegate or bring a delegation of 4–7 students.
              </span>
              <span className="home-card-link">Explore registration <ActionIcon /></span>
            </Link>
            <Link className="home-action-card" href="/portal">
              <span className="home-card-number">02</span>
              <span className="home-card-title">Check your status</span>
              <span className="home-card-copy">
                Look up an existing application and follow its review progress.
              </span>
              <span className="home-card-link">Open application portal <ActionIcon /></span>
            </Link>
          </div>
        </section>

        <section className="brand-ambassador-callout" aria-labelledby="brand-ambassador-title">
          <div className="brand-ambassador-copy">
            <div className="brand-ambassador-heading">
              <p className="section-overline">Represent The Grand Debate</p>
              <h2 id="brand-ambassador-title">Become a Brand Ambassador</h2>
              <p>Bring your campus community to TGD &apos;26.</p>
            </div>
            <div className="brand-ambassador-benefits">
              <p className="brand-ambassador-benefits-label">Ambassador perks</p>
              <ul className="brand-ambassador-perks">
                <li><strong>Fee waiver</strong><span>Bring 15+ delegates or 2 delegations</span></li>
                <li><strong>On-day hospitality</strong><span>Food and refreshments during the event</span></li>
                <li><strong>Event keepsakes</strong><span>Exclusive merchandise and souvenirs</span></li>
                <li><strong>Top ambassador award</strong><span>100% fee waiver, Best Brand Ambassador award, and a surprise award</span></li>
              </ul>
            </div>
          </div>
          <a
            className="button button-primary"
            href="https://docs.google.com/forms/d/e/1FAIpQLSfvOkzClM80pgp0WkS0WuxLZTd-niseWyoKcjuA1VxpwgGKDA/viewform"
            target="_blank"
            rel="noopener noreferrer"
          >
            Register as Brand Ambassador <ActionIcon direction="up-right" />
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
