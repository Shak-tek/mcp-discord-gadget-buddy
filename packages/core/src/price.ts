export type Money = { value: number, currency: string, qualifier?: "under" | "over" | "around" | "range" };
const CURRENCY = /[$€£]|USD|EUR|GBP/; // no named group
const NUM = /((?:\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,]\d+)?)/;
const RANGE = new RegExp(
    `(?:${CURRENCY.source}\\s*)?${NUM.source}\\s*(?:-|to|–|—)\\s*(?:${CURRENCY.source}\\s*)?${NUM.source}`,
    "i"
); const SINGLE = new RegExp(`(?:(under|below|<=|less than|around|~|about|approx\\.)\\s*)?(?:${CURRENCY.source}\\s*)?(${NUM.source})`, "i");

export function detectBudget(text: string): Money | null {
    const r = text.match(RANGE);
    if (r) {
        const v1 = parseFloat(r[1].replace(/[.,](?=\d{3}\b)/g, "")); // drop thousands sep
        const v2 = parseFloat(r[2].replace(/[.,](?=\d{3}\b)/g, ""));
        const cur = (r.groups?.cur || "").toUpperCase() || inferCurrency(text);
        return { value: (v1 + v2) / 2, currency: cur, qualifier: "range" };
    }
    const s = text.match(SINGLE);
    if (s) {
        const q = (s[1] || "").toLowerCase();
        const val = parseFloat(s[2].replace(/[.,](?=\d{3}\b)/g, ""));
        const cur = (s.groups?.cur || "").toUpperCase() || inferCurrency(text);
        const qualifier = q.includes("under") || q.includes("less") || q.includes("<=") ? "under"
            : q.includes("around") || q.includes("about") || q.includes("approx") || q.includes("~") ? "around"
                : undefined;
        return { value: val, currency: cur, qualifier };
    }
    return null;
}
function inferCurrency(text: string) { return /€|EUR/i.test(text) ? "EUR" : /\$|USD/i.test(text) ? "USD" : /£|GBP/i.test(text) ? "GBP" : "EUR"; }
