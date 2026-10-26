import type { Metadata } from "next";
import { PortalLookup } from "@/components/portal/portal-lookup";

export const metadata: Metadata = {
    title: "Track your application",
    description: "Look up your registration and track your application status.",
    robots: { index: false, follow: false },
    openGraph: { title: "Track your application · The Grand Debate '26", description: "Look up your registration and track your application status." },
};

export default function PortalPage() {
    return (
        <div className="page-container portal-page">
            <div className="page-eyebrow">
                <span className="eyebrow-dot" />
                Delegate application portal
            </div>
            <div className="page-heading">
                <p className="section-overline">Your conference journey</p>
                <h1>Track your application</h1>
                <p className="page-intro">
                    Enter the email address used for registration and your application ID to see
                    your latest status.
                </p>
            </div>

            <PortalLookup />
        </div>
    );
}
