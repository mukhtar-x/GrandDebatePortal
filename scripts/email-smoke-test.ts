import { sendRegistrationSmokeTest } from "@/lib/mailer";

const deliveries = [
    { recipient: "ismailsilat7@gmail.com", participantType: "delegation" as const },
    { recipient: "k240546@nu.edu.pk", participantType: "solo" as const },
];

async function main() {
    let failed = false;
    for (const delivery of deliveries) {
        const sent = await sendRegistrationSmokeTest(delivery.recipient, delivery.participantType);
        console.info(
            `[email-smoke] ${delivery.participantType} registration to ${delivery.recipient}: ${sent ? "sent" : "failed"}`,
        );
        failed ||= !sent;
    }
    if (failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
    console.error("[email-smoke] Could not complete the email smoke test.", error);
    process.exitCode = 1;
});
