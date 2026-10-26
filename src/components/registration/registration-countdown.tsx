"use client";

import { useEffect, useState } from "react";
import {
  EARLY_BIRD_ENDS_AT,
  REGISTRATION_ENDS_AT,
} from "@/data/event";

type CountdownTarget = {
  title: string;
  description: string;
  deadline: number;
};

const earlyBirdTarget: CountdownTarget = {
  title: "Early bird rate ends in",
  description: "Save PKR 400 per delegate · until 7 November, 11:59 PM",
  deadline: new Date(EARLY_BIRD_ENDS_AT).getTime(),
};

const registrationTarget: CountdownTarget = {
  title: "Registration closes in",
  description: "Regular registration · until 15 November, 11:59 PM",
  deadline: new Date(REGISTRATION_ENDS_AT).getTime(),
};

function getTimeParts(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  return [
    { value: Math.floor(totalSeconds / 86400), label: "Days" },
    { value: Math.floor((totalSeconds % 86400) / 3600), label: "Hours" },
    { value: Math.floor((totalSeconds % 3600) / 60), label: "Minutes" },
    { value: totalSeconds % 60, label: "Seconds" },
  ];
}

export function RegistrationCountdown() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const target = now === null
    ? earlyBirdTarget
    : now < earlyBirdTarget.deadline
      ? earlyBirdTarget
      : registrationTarget;
  const closed = now !== null && now >= registrationTarget.deadline;
  const parts = getTimeParts(now === null ? 0 : target.deadline - now);

  return (
    <section className="registration-countdown" aria-label="Registration deadlines">
      <div className="countdown-copy">
        <p className="section-overline">Registration deadlines</p>
        <h2>{closed ? "Registration is now closed" : target.title}</h2>
        <p>{closed ? "Thank you for your interest in The Grand Debate ’26." : target.description}</p>
      </div>
      {!closed ? (
        <div className="countdown-clock" aria-label={`${parts.map(({ value, label }) => `${value} ${label}`).join(", ")} remaining`}>
          {parts.map(({ value, label }) => (
            <div className="countdown-unit" key={label}>
              <strong>{now === null ? "--" : String(value).padStart(2, "0")}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
