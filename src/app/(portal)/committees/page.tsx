import type { Metadata } from "next";
import { ActionIcon } from "@/components/shared/action-icon";
import Image from "next/image";
import { COMMITTEE_DETAILS } from "@/data/committee-details";
import { getCanonicalUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Committees",
  description:
    "Explore the five committees and their agendas at The Grand Debate '26.",
  alternates: getCanonicalUrl("/committees") ? { canonical: getCanonicalUrl("/committees") } : undefined,
  openGraph: { title: "Committees at The Grand Debate '26", description: "Explore the five Model UN committees and choose your debate at The Grand Debate '26." },
};

export default function CommitteesPage() {
  return (
    <div className="page-container committee-page">
      <div className="page-eyebrow">
        <span className="eyebrow-dot" />
        Five committees · Agendas announced
      </div>
      <header className="page-heading">
        <p className="section-overline">Choose where to make your case</p>
        <h1>Committees</h1>
        <p className="page-intro">
          Review each committee&apos;s agenda and character, then indicate your first and
          second preferences on the registration form.
        </p>
      </header>

      <div className="committee-grid">
        {COMMITTEE_DETAILS.map((committee, index) => (
          <article className="committee-card" key={committee.code}>
            <div className="committee-card-top">
              <span className="committee-number">0{index + 1}</span>
              <span className="committee-code">{committee.code}</span>
            </div>
            <Image
              className="committee-logo"
              src={committee.logo}
              alt={`${committee.name} emblem`}
              width={committee.logoWidth}
              height={committee.logoHeight}
            />
            <h2>{committee.name}</h2>
            <div className="committee-agenda">
              <span>Agenda</span>
              <strong>{committee.agenda}</strong>
            </div>
            <p className="committee-agenda-description">{committee.agendaDescription}</p>
            <p className="committee-suited">
              <strong>Suited to</strong>
              {committee.suitedTo}
            </p>
            <dl className="committee-facts">
              <div>
                <dt>Level</dt>
                <dd>To be confirmed</dd>
              </div>
              <div>
                <dt>Seats</dt>
                <dd>To be confirmed</dd>
              </div>
            </dl>
            {committee.studyGuideHref ? (
              <a
                className="button button-quiet committee-guide-button"
                href={committee.studyGuideHref}
                target="_blank"
                rel="noreferrer"
              >
                Study guide · PDF <ActionIcon direction="down" />
              </a>
            ) : (
              <button className="button button-quiet committee-guide-button" type="button" disabled>
                Study guide coming soon
              </button>
            )}
          </article>
        ))}
      </div>

      <aside className="committee-allocation-note">
        <span className="section-overline">Committee allocation</span>
        <p>
          Every effort will be made to allocate delegates to one of their top two
          preferences. Preferences cannot be guaranteed because seats are limited
          and committees must be balanced.
        </p>
      </aside>
    </div>
  );
}
