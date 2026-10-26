import type { Metadata } from "next";
import Link from "next/link";
import { COMMITTEE_DETAILS } from "@/data/committee-details";

export const metadata: Metadata = {
  title: "Document archive · The Grand Debate '26",
  description:
    "Study guides, rules of procedure and reference material for Grand Debate delegates.",
};

const GENERAL_RESOURCES = [
  "Rules of procedure",
  "Guide to writing a position paper",
  "Introduction to MUN",
] as const;

function ArchiveUpdateNote() {
  return (
    <div className="archive-update-note">
      <div>
        <strong>More resources will be added here.</strong>
        <p>
          General delegate materials are updated as they are published. Follow{" "}
          <a href="https://www.instagram.com/tgd_nuces/" target="_blank" rel="noreferrer">
            @tgd_nuces
          </a>{" "}
          for announcements.
        </p>
      </div>
    </div>
  );
}

export default function ArchivePage() {
  return (
    <div className="page-container archive-page">
      <div className="page-eyebrow">
        <span className="eyebrow-dot" />
        Delegate resources
      </div>
      <header className="page-heading">
        <p className="section-overline">Prepare for the floor</p>
        <h1>Document archive</h1>
        <p className="page-intro">
          This archive contains study guides, rules of procedure and other reference
          material for delegates. New documents are added as committees finalise their
          materials.
        </p>
      </header>

      <section className="archive-section" aria-labelledby="archive-general-title">
        <div className="archive-section-heading">
          <div>
            <p className="section-overline">Start with the essentials</p>
            <h2 id="archive-general-title">General resources</h2>
          </div>
          <span className="archive-count">{GENERAL_RESOURCES.length} resources</span>
        </div>
        <div className="archive-resource-list">
          {GENERAL_RESOURCES.map((resource, index) => {
            const isRulebook = resource === "Rules of procedure";
            return (
              <div className="archive-resource" key={resource}>
                <span className="archive-resource-number">0{index + 1}</span>
                <span className="archive-resource-title">{resource}</span>
                {isRulebook ? (
                  <>
                    <span className="archive-coming-soon">PDF available</span>
                    <a
                      className="button button-quiet"
                      href="/docs/event-rulebook.pdf"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                  </>
                ) : (
                  <>
                    <span className="archive-coming-soon">Coming soon</span>
                    <button className="button button-quiet" type="button" disabled>
                      Download
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <ArchiveUpdateNote />
      </section>

      <section className="archive-section" aria-labelledby="archive-committee-title">
        <div className="archive-section-heading">
          <div>
            <p className="section-overline">Guides and further reading</p>
            <h2 id="archive-committee-title">Committee materials</h2>
          </div>
          <Link className="archive-browse-link" href="/committees">
            Browse committees <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="archive-folder-list">
          {COMMITTEE_DETAILS.map((committee) => {
            const guideHref = `/docs/committees/${committee.code === "UN Women" ? "unwomen" : committee.code.toLowerCase()}-study-guide.pdf`;
            return (
              <details className="archive-folder" key={committee.code}>
                <summary>
                  <span className="archive-folder-name">
                    <span className="archive-folder-code">{committee.code}</span>
                    {committee.name}
                  </span>
                  <span className="archive-folder-status">Study guide available</span>
                </summary>
                <div className="archive-resource-list archive-folder-content">
                  <div className="archive-resource">
                    <span className="archive-resource-number">01</span>
                    <span className="archive-resource-title">Study guide · PDF</span>
                    <a
                      className="button button-quiet"
                      href={guideHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download PDF
                    </a>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
