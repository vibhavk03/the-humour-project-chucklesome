"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type Props = {
  captions: { content?: string | null }[];
  title?: string;
  n?: 2 | 3;           // default 3
  topK?: number;       // default 10
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}'" ]+/gu, " ") // keep letters, numbers, quotes, space
    .replace(/\s+/g, " ")
    .trim();
}

function ngrams(tokens: string[], n: number) {
  const out: string[] = [];
  for (let i = 0; i + n - 1 < tokens.length; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

export default function NgramCoverageChart({ captions, title = "Top Trigram Coverage", n = 3, topK = 10 }: Props) {
  const freq = new Map<string, number>();
  let totalWithNgram = 0;

  for (const c of captions) {
    const text = normalize(c.content ?? "");
    if (!text) continue;
    const toks = text.split(" ");
    if (toks.length < n) continue;

    // Count unique n-grams per caption (so one caption doesn’t inflate a phrase)
    const seen = new Set(ngrams(toks, n));
    if (seen.size === 0) continue;
    totalWithNgram++;

    for (const g of seen) {
      freq.set(g, (freq.get(g) ?? 0) + 1);
    }
  }

  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([gram, count]) => ({
      ngram: gram,
      count,
      pct: totalWithNgram ? Math.round((100 * count) / totalWithNgram) : 0,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="ngram" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60}/>
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} domain={[0, (dataMax: number) => Math.max(100, dataMax)]}/>
              <Tooltip formatter={(v: any, name) => name === "pct" ? [`${v}%`, "Coverage"] : [v, "Count"]} />
              <Bar dataKey="pct" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}