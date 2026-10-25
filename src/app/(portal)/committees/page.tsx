import type { Metadata } from "next";
import Image from "next/image";
import { COMMITTEE_DETAILS } from "@/data/committee-details";

export const metadata: Metadata = {
  title: "Committees · The Grand Debate '26",
  description:
    "Explore the five committees at The Grand Debate '26 and find the debate that suits you.",
};

export default function CommitteesPage() {
  return (
    <div className="page-container committee-page">
      <div className="page-eyebrow">
        <span className="eyebrow-dot" />
        Five committees · Agendas to be announced
      </div>
      <header className="page-heading">
        <p className="section-overline">Choose where to make your case</p>
        <h1>Committees</h1>
        <p className="page-intro">
          Each committee has its own agenda, procedure and character. Review the
          options below, then indicate your first and second preferences on the
          registration form.
        </p>
        <p className="committee-update-note">
          Agendas are being finalised and will be announced shortly. Follow{" "}
          <a href="https://www.instagram.com/tgd_nuces/" target="_blank" rel="noreferrer">
            @tgd_nuces
          </a>{" "}
          for updates.
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
              <strong>To be announced</strong>
            </div>
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
            <a
              className="button button-quiet committee-guide-button"
              href={`/docs/committees/${committee.code === "UN Women" ? "unwomen" : committee.code.toLowerCase()}-study-guide.pdf`}
              target="_blank"
              rel="noreferrer"
            >
              Study guide · PDF <span aria-hidden="true">↓</span>
            </a>
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
