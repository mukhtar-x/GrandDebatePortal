import type { Metadata } from "next";
import { ActionIcon } from "@/components/shared/action-icon";
import { ExpandableText } from "@/components/shared/expandable-text";
import Image from "next/image";
import { COMMITTEE_DETAILS } from "@/data/committee-details";
import { STUDY_GUIDES_PUBLISHED } from "@/data/event";
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
    <div className="page-container page-compact committee-page">
      <header className="page-header registration-heading">
        <p className="section-overline">Five committees · Agendas announced</p>
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
            <ExpandableText className="committee-agenda-description" text={committee.agendaDescription} />
            <p className="committee-suited">
              <strong>Suited to</strong>
              {committee.suitedTo}
            </p>
            {STUDY_GUIDES_PUBLISHED && committee.studyGuideHref ? (
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
