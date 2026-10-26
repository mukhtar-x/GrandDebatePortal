import type { Metadata } from "next";
import Image from "next/image";
import { RegistrationFlow } from "@/components/registration/registration-flow";
import { RegistrationCountdown } from "@/components/registration/registration-countdown";
import { EVENT_DETAILS } from "@/data/event";

export const metadata: Metadata = {
    title: "Register · The Grand Debate '26",
    description: "Register as a solo delegate or delegation for The Grand Debate '26.",
};

function EventInfoStrip() {
    return (
        <div className="event-strip" aria-label="Event details">
            <div>
                <span className="event-strip-label">When</span>
                <span>{EVENT_DETAILS.dates}</span>
            </div>
            <div>
                <span className="event-strip-label">Daily</span>
                <span>{EVENT_DETAILS.dailyHours}</span>
            </div>
            <div>
                <span className="event-strip-label">Where</span>
                <span>{EVENT_DETAILS.venue}</span>
            </div>
        </div>
    );
}

export default function RegisterPage() {
    return (
        <div className="page-container">
            <div className="registration-brand-banner">
                <Image
                    src="/assets/07_Posters_and_Headers/tgd_google_forms_header_1600x400.png"
                    alt="The Grand Debate '26"
                    width={1600}
                    height={400}
                    priority
                />
            </div>
            <div className="page-eyebrow">
                <span className="eyebrow-dot" />
                Registration open · School &amp; university delegates
            </div>
            <div className="registration-intro-group">
                <div className="page-heading">
                    <p className="section-overline">18–20 November 2026 · Karachi</p>
                    <h1>Register for The Grand Debate &apos;26</h1>
                    <p className="page-intro">
                        Join three days of debate, diplomacy and dialogue. Choose your registration type,
                        add your delegate details, then review the payment information.
                    </p>
                </div>
                <RegistrationCountdown />
            </div>

            <EventInfoStrip />
            <RegistrationFlow />
        </div>
    );
}
