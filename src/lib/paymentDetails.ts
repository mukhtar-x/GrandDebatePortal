/**
 * Where delegates send the registration fee. [Payment details to be confirmed]
 * Fill these in once confirmed; the receipt checker compares receipts against them, and the
 * WRONG_RECIPIENT check stays off while accountNumber is null.
 */
export const PAYMENT_DETAILS = {
    confirmed: false,
    accountTitle: null as string | null,
    provider: null as string | null, // e.g. "Meezan Bank", "Easypaisa", "JazzCash"
    accountNumber: null as string | null,
    iban: null as string | null,
};
