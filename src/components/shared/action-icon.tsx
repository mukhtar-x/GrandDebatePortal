import type { ReactNode } from "react";

type ActionIconDirection = "right" | "up-right" | "down" | "refresh";

export function ActionIcon({
  direction = "right",
}: {
  direction?: ActionIconDirection;
}) {
  const paths: Record<ActionIconDirection, ReactNode> = {
    right: <path d="M4.5 12h14m-6-6 6 6-6 6" />,
    "up-right": <path d="M7 17 17 7M8 7h9v9" />,
    down: <path d="M12 4.5v14m-6-6 6 6 6-6" />,
    refresh: <path d="M20 7v5h-5M4.5 17v-5h5M5.7 9A7 7 0 0 1 18 6.5L20 12M4.5 12l2 5.5A7 7 0 0 0 18.3 15" />,
  };

  return (
    <svg
      className="action-icon"
      data-direction={direction}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[direction]}
    </svg>
  );
}
