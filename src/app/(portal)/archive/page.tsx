import type { Metadata } from "next";
import Link from "next/link";
import { COMMITTEE_DETAILS } from "@/data/committee-details";
import { RULEBOOK_PATH, RULEBOOK_PUBLISHED, STUDY_GUIDES_PUBLISHED } from "@/data/event";
import { ActionIcon } from "@/components/shared/action-icon";
import { getCanonicalUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Document archive",
  description:
    "Study guides, rules of procedure and reference material for Grand Debate delegates.",
  alternates: getCanonicalUrl("/archive") ? { canonical: getCanonicalUrl("/archive") } : undefined,
  openGraph: { title: "Delegate resources · The Grand Debate '26", description: "Study guides, rules of procedure and reference material for delegates." },
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
    <div className="page-container page-compact archive-page">
      <header className="page-header registration-heading">
        <p className="section-overline">Delegate resources</p>
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
            const available = RULEBOOK_PUBLISHED && resource === "Rules of procedure";
            return (
              <div className="archive-resource" key={resource}>
                <span className="archive-resource-number">0{index + 1}</span>
                <span className="archive-resource-title">{resource}</span>
                {available ? (
                  <>
                    <span className="archive-coming-soon">PDF available</span>
                    <a
                      className="button button-quiet"
                      href={RULEBOOK_PATH}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                  </>
                ) : (
                  <span className="archive-coming-soon">Coming soon</span>
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
            Browse committees <ActionIcon />
          </Link>
        </div>
        <div className="archive-folder-list">
          {COMMITTEE_DETAILS.map((committee) => {
            const guide = STUDY_GUIDES_PUBLISHED ? committee.studyGuideHref : null;
            return (
              <details className="archive-folder" key={committee.code}>
                <summary>
                  <span className="archive-folder-name">
                    <span className="archive-folder-code">{committee.code}</span>
                    {committee.name}
                  </span>
                  <span className="archive-folder-status">
                    {guide ? "Study guide available" : "Coming soon"}
                  </span>
                </summary>
                <div className="archive-resource-list archive-folder-content">
                  {guide ? (
                    <div className="archive-resource">
                      <span className="archive-resource-number">01</span>
                      <span className="archive-resource-title">Study guide · PDF</span>
                      <a
                        className="button button-quiet"
                        href={guide}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download PDF
                      </a>
                    </div>
                  ) : (
                    <div className="archive-empty-state">
                      <span className="archive-empty-icon" aria-hidden="true">…</span>
                      <div>
                        <strong>Study guide coming soon</strong>
                        <p>The {committee.code} guide will be added here when it is published.</p>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
