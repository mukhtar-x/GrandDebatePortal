import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader } from "@/components/shared/site-header";
import { EVENT_DETAILS } from "@/data/event";

export default function Home() {
  return (
    <div className="portal-site">
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
                Register for the conference <span aria-hidden="true">↗</span>
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
            <Image
              className="home-poster"
              src="/brand/event-poster.jpg"
              alt=""
              width={1200}
              height={1200}
              priority
            />
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
              <span className="home-card-link">Explore registration <span aria-hidden="true">→</span></span>
            </Link>
            <Link className="home-action-card" href="/portal">
              <span className="home-card-number">02</span>
              <span className="home-card-title">Check your status</span>
              <span className="home-card-copy">
                Look up an existing application and follow its review progress.
              </span>
              <span className="home-card-link">Open application portal <span aria-hidden="true">→</span></span>
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
