import { loadEnvConfig } from "@next/env";

async function main(): Promise<void> {
    loadEnvConfig(process.cwd());
    const { sendReallocationSmokeTest } = await import("../src/lib/mailer");
    const sent = await sendReallocationSmokeTest();
    console.info(`[email-reallocation-test] k240511@nu.edu.pk: ${sent ? "sent" : "not sent"}`);
    if (!sent) process.exitCode = 1;
}

main().catch((error: unknown) => {
    console.error("Reallocation email test failed:", error);
    process.exitCode = 1;
});
