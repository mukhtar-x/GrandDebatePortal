import type { Metadata } from "next";
import { RegistrationFlow } from "@/components/registration/registration-flow";
import { RegistrationCountdown } from "@/components/registration/registration-countdown";
import { getCanonicalUrl } from "@/lib/site-url";

export const metadata: Metadata = {
    title: "Register",
    description: "Register as a solo delegate or delegation for The Grand Debate '26.",
    alternates: getCanonicalUrl("/register") ? { canonical: getCanonicalUrl("/register") } : undefined,
    openGraph: { title: "Register for The Grand Debate '26", description: "Register as a solo delegate or delegation for The Grand Debate '26 at FAST-NUCES Karachi." },
};

export default function RegisterPage() {
    return (
        <div className="page-container registration-page">
            {/* Kept compact so the form starts within the first screen. */}
            <header className="registration-header">
                <div className="registration-heading">
                    <p className="section-overline">18–20 November 2026 · FAST-NUCES Karachi</p>
                    <h1>Register for The Grand Debate &apos;26</h1>
                    <p className="page-intro">
                        Choose solo or delegation, add your details, then pay with your QuickPay ID
                        and upload the receipt.
                    </p>
                </div>
                <RegistrationCountdown />
            </header>
            <RegistrationFlow />
        </div>
    );
}
