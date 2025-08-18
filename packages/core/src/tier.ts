export type Item = { name: string; price?: number; currency?: string; mentions: number; pros: string[]; cons: string[]; links: string[] };

export function buildTierList(items: Item[]) {
    // Weighted scoring: mentions (50%), avg sentiment (30%), value/price (20%)
    const scored = items.map(i => {
        const s = sentiment(i.pros, i.cons); // simple +1/-1 per bullet
        const value = i.price ? Math.min(1, 500 / i.price) : 0.5; // cheap-ish heuristic
        const score = 0.5 * (normalize(i.mentions)) + 0.3 * ((s + 1) / 2) + 0.2 * (value);
        return { ...i, score };
    }).sort((a, b) => b.score - a.score);

    const n = scored.length;
    const toTier = (k: number) => k < 0.15 * n ? "S" : k < 0.35 * n ? "A" : k < 0.6 * n ? "B" : k < 0.85 * n ? "C" : "D";
    return scored.map((x, idx) => ({ ...x, tier: toTier(idx) }));
}

function normalize(x: number) { return x > 0 ? Math.min(1, Math.log10(1 + x) / 2) : 0; }
function sentiment(pros: string[], cons: string[]) { return (pros.length - cons.length) / Math.max(1, pros.length + cons.length); }
