"use client";

import { useId, useState } from "react";

/** Shows the first few lines of a long paragraph, with a toggle for the rest. */
export function ExpandableText({ text, className, collapseAfter = 260 }: { text: string; className?: string; collapseAfter?: number }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const long = text.length > collapseAfter;

  return (
    <div className={className}>
      <p id={id} className={long && !expanded ? "expandable-text is-clamped" : "expandable-text"}>
        {text}
      </p>
      {long ? (
        <button
          className="expandable-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}
