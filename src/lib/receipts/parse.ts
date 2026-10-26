export interface ParsedReceipt {
    amount: number | null;
    amountCandidates: number[];
    date: string | null;
    transactionId: string | null;
    recipientAccount: string | null;
    recipientName: string | null;
    channel: string | null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const CHANNELS: [RegExp, string][] = [
    [/easy\s*paisa/i, "Easypaisa"],
    [/jazz\s*cash/i, "JazzCash"],
    [/sada\s*pay/i, "SadaPay"],
    [/naya\s*pay/i, "NayaPay"],
    [/raast/i, "Raast"],
    [/meezan/i, "Meezan Bank"],
    [/\bhbl\b|habib bank/i, "HBL"],
    [/\bubl\b|united bank/i, "UBL"],
    [/\bmcb\b/i, "MCB"],
    [/allied bank|\babl\b/i, "Allied Bank"],
    [/alfalah/i, "Bank Alfalah"],
    [/faysal/i, "Faysal Bank"],
    [/askari/i, "Askari Bank"],
    [/bank al habib/i, "Bank Al Habib"],
    [/standard chartered/i, "Standard Chartered"],
    [/\bibft\b|funds? transfer/i, "Bank transfer"],
];

function toNumber(raw: string): number {
    return Number(raw.replace(/,/g, ""));
}

function findAmounts(text: string): number[] {
    const amounts = new Set<number>();
    const labelled = /(?:rs\.?|pkr|amount|total|paid|sent)\s*[:=]?\s*(?:rs\.?|pkr)?\s*(\d{1,3}(?:,\d{3})+|\d{3,6})(?:\.\d{1,2})?/gi;
    for (const match of text.matchAll(labelled)) {
        const value = toNumber(match[1]);
        if (value >= 100 && value <= 200_000) amounts.add(value);
    }
    return [...amounts];
}

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string | null {
    const fullYear = year < 100 ? 2000 + year : year;
    if (month < 1 || month > 12 || day < 1 || day > 31 || fullYear < 2020 || fullYear > 2100) return null;
    return `${fullYear}-${pad(month)}-${pad(day)}`;
}

function findDate(text: string): string | null {
    const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

    const named = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([a-z]{3})[a-z]*[\s\-/.,]+(\d{2,4})\b/i);
    if (named && MONTHS.includes(named[2].toLowerCase())) {
        return isoDate(Number(named[3]), MONTHS.indexOf(named[2].toLowerCase()) + 1, Number(named[1]));
    }

    const monthFirst = text.match(/\b([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i);
    if (monthFirst && MONTHS.includes(monthFirst[1].toLowerCase())) {
        return isoDate(Number(monthFirst[3]), MONTHS.indexOf(monthFirst[1].toLowerCase()) + 1, Number(monthFirst[2]));
    }

    // Pakistani receipts write day first: 25/10/2026.
    const numeric = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
    if (numeric) return isoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
    return null;
}

export function normalizeTransactionId(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return normalized.length >= 6 ? normalized : null;
}

function findTransactionId(text: string): string | null {
    const match = text.match(
        /(?:\btid\b|\btrx\.?\s*id|\btxn\.?\s*id|transaction\s*(?:id|no\.?|number|#|ref\w*)|reference\s*(?:no\.?|number|#|id)?|\bref\.?\s*(?:no\.?|#)?|\brrn\b|\bstan\b)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9-]{5,29})/i,
    );
    return normalizeTransactionId(match?.[1]);
}

function findRecipientName(text: string): string | null {
    const match = text.match(
        /(?:account\s*title|beneficiary(?:\s*name)?|receiver(?:\s*name)?|sent\s*to|paid\s*to|\bto)\s*[:\-]?\s*([A-Za-z][A-Za-z .&'-]{2,50})/i,
    );
    return match?.[1].trim().replace(/\s+/g, " ") ?? null;
}

function findRecipientAccount(text: string): string | null {
    const match = text.match(
        /(?:iban|account\s*(?:no\.?|number|#)?|a\/c\s*(?:no\.?)?|mobile\s*(?:no\.?|number)?|wallet)\s*[:#\-]?\s*([A-Z]{2}\d{2}[A-Z0-9 ]{10,30}|[*xX\d][\d*xX \-]{5,30}\d)/i,
    );
    return match?.[1].replace(/[\s-]/g, "") ?? null;
}

/** Pulls payment fields out of OCR text. Every field is best-effort and may be null. */
export function parseReceiptText(text: string, expectedAmount: number): ParsedReceipt {
    const amountCandidates = findAmounts(text);
    const amount = amountCandidates.includes(expectedAmount)
        ? expectedAmount
        : (amountCandidates.sort((a, b) => b - a)[0] ?? null);

    return {
        amount,
        amountCandidates,
        date: findDate(text),
        transactionId: findTransactionId(text),
        recipientAccount: findRecipientAccount(text),
        recipientName: findRecipientName(text),
        channel: CHANNELS.find(([pattern]) => pattern.test(text))?.[1] ?? null,
    };
}

/** Word-set similarity (0..1) used to tell a re-uploaded receipt from a different one with the same layout. */
export function textSimilarity(a: string, b: string): number {
    const words = (text: string) =>
        new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
    const left = words(a);
    const right = words(b);
    if (left.size === 0 || right.size === 0) return 0;
    let shared = 0;
    for (const word of left) if (right.has(word)) shared++;
    return shared / (left.size + right.size - shared);
}
