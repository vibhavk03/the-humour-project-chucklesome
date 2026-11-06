export function normText(s: string) {
    return s
        .toLowerCase()
        .replace(/[^\p{L}\p{N} ]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function diceCoefficient(a: string, b: string) {
    const bigrams = (t: string) => {
        const arr: string[] = [];
        for (let i = 0; i < t.length - 1; i++) arr.push(t.slice(i, i + 2));
        return arr;
    };
    const A = bigrams(a);
    const B = bigrams(b);
    if (!A.length && !B.length) return 1;
    const counts = new Map<string, number>();
    for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
    let overlap = 0;
    for (const g of B) {
        const c = counts.get(g) ?? 0;
        if (c > 0) {
            overlap++;
            counts.set(g, c - 1);
        }
    }
    return (2 * overlap) / (A.length + B.length);
}

export function clusterNearDuplicates(texts: string[], threshold = 0.9) {
    const buckets = new Map<string, number[]>();
    texts.forEach((t, i) => {
        const key = normText(t).slice(0, 12);
        const arr = buckets.get(key) ?? [];
        arr.push(i);
        buckets.set(key, arr);
    });

    const visited = new Set<number>();
    const clusters: number[][] = [];

    for (const idxs of buckets.values()) {
        for (let i = 0; i < idxs.length; i++) {
            const a = idxs[i];
            if (visited.has(a)) continue;
            const group = [a];
            visited.add(a);
            for (let j = i + 1; j < idxs.length; j++) {
                const b = idxs[j];
                if (visited.has(b)) continue;
                const sim = diceCoefficient(normText(texts[a]), normText(texts[b]));
                if (sim >= threshold) {
                    group.push(b);
                    visited.add(b);
                }
            }
            if (group.length > 1) clusters.push(group);
        }
    }
    return clusters;
}