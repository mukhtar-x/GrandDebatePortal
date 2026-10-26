import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 8) {
    console.error("Usage: npx tsx scripts/hash-admin-password.ts '<password of at least 8 characters>'");
    process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32);
console.log(`scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`);
