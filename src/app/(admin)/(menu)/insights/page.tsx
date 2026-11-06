'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  InsightsService,
  type InsightsRange,
  type SeriesPoint,
  type Stats,
} from '@/services/insights.service';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import React from "react";
import Link from 'next/link';
import { useTimeZone } from '@/components/TimeZoneContext';

type NGramItem = { key: string; count: number; pct: number };

function normalizeStart(text: string): string[] {
  // lower, strip leading punctuation/quotes/emojis, collapse spaces
  const cleaned = text
    .toLowerCase()
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[“”‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.split(' ') : [];
}

function topStartingNGrams(
  rows: { content?: string | null }[],
  n: 1 | 2 | 3,
  limit = 10
): NGramItem[] {
  const counts = new Map<string, number>();
  let total = 0;

  for (const r of rows) {
    const w = normalizeStart(r.content ?? '');
    if (!w.length) continue;
    const start = w.slice(0, n).join(' ');
    if (!start) continue;
    counts.set(start, (counts.get(start) ?? 0) + 1);
    total++;
  }

  const items: NGramItem[] = Array.from(counts.entries())
    .map(([key, count]) => ({ key, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return items;
}

export default function InsightsPage() {
  const { timeZone } = useTimeZone();
  const [topStart1, setTopStart1] = useState<NGramItem[]>([]);
  const [topStart2, setTopStart2] = useState<NGramItem[]>([]);
  const [topStart3, setTopStart3] = useState<NGramItem[]>([]);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [start, setStart] = useState<string>(''); // yyyy-MM-dd
  const [end, setEnd] = useState<string>('');
  const [phase, setPhase] = useState<'idle' | 'loading'>('idle');
  const [readyOpen, setReadyOpen] = useState(false);

  const [reportName, setReportName] = useState<string>('');

  const [series, setSeries] = useState<SeriesPoint[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [range, setRange] = useState<{ startISO: string; endISO: string } | null>(null);
  const rangeFormatter = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium' }),
    [timeZone]
  );

  const reportRef = useRef<HTMLDivElement | null>(null);

  const hasReport = !!series && !!stats && !!range;
  const nameOk = reportName.trim().length > 0;

  const labelClass =
    'text-[13px] font-medium text-muted-foreground';
  const fieldClass =
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] text-foreground placeholder:text-muted-foreground ' +
    'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary';
  const primaryBtn =
    'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';
  const secondaryBtn =
    'inline-flex items-center justify-center rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80';

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);

  const [selectedRange, setSelectedRange] =
    useState<'7d' | 'lastMonth' | 'all' | 'custom'>('all');

  const toYMD = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

  const firstOfThisMonth = () => {
    const now = new Date();
    return toYMD(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const applyPreset = (key: typeof selectedRange) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let s = '', e = '';

    if (key === '7d') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      s = toYMD(start);
      e = toYMD(today);
    } else if (key === 'lastMonth') {
      const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastMonthLastDay = new Date(firstThisMonth.getTime() - 1);
      const lastMonthFirstDay = new Date(
        lastMonthLastDay.getFullYear(),
        lastMonthLastDay.getMonth(),
        1
      );
      s = toYMD(lastMonthFirstDay);
      e = toYMD(lastMonthLastDay);
    } else if (key === 'all') {
      const earliest = new Date(2024, 0, 1);
      s = toYMD(earliest);
      e = toYMD(today);
    } else if (key === 'custom') {
      s = firstOfThisMonth();
      e = toYMD(today);
      setSelectedRange('custom');
      setStart(s);
      setEnd(e);
      return;
    }

    setSelectedRange(key);
    setStart(s);
    setEnd(e);
  };

  const buildReport = useCallback(async () => {
    if (!start || !end || !nameOk) return;
    setPhase('loading');

    const payload: InsightsRange = {
      startISO: new Date(start),
      endISO: new Date(end),
      searchQuery: '',
      searchType: 'all',
    };

    try {
      const rows = await InsightsService.fetchCaptionsRange(payload);
      const s = InsightsService.buildSeries(rows);
      const t = InsightsService.computeStats(rows);
      setTopStart1(topStartingNGrams(rows, 1, 10));
      setTopStart2(topStartingNGrams(rows, 2, 10));
      setTopStart3(topStartingNGrams(rows, 3, 10));

      setSeries(s);
      setStats(t);
      setRange({
        startISO: new Date(start).toISOString(),
        endISO: new Date(end).toISOString(),
      });

      setReadyOpen(true);
    } finally {
      setPhase('idle');
      setBuilderOpen(false);
    }
  }, [start, end, nameOk]);

  const niceRange = useMemo(() => {
    if (!range) return '';
    const a = rangeFormatter.format(new Date(range.startISO));
    const b = rangeFormatter.format(new Date(range.endISO));
    return `${a} — ${b}`;
  }, [range, rangeFormatter]);

  const exportCSV = useCallback(() => {
    if (!hasReport) return;
    const base = slugify(reportName);
    InsightsService.exportCSVFromRange(
      {
        startISO: new Date(range!.startISO),
        endISO: new Date(range!.endISO),
        searchQuery: '',
        searchType: 'all',
      },
      `${base || 'captions-insights'}.csv`,
    );
  }, [hasReport, range, reportName]);

  const exportPDF = useCallback(async () => {
    if (!reportRef.current) return;

    const node = reportRef.current;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth - 48;
    const ratio = imgWidth / canvas.width;
    const chunkHeightPx = Math.floor((pageHeight - 48) / ratio);

    for (let srcY = 0; srcY < canvas.height; srcY += chunkHeightPx) {
      const slice = document.createElement('canvas');
      const h = Math.min(chunkHeightPx, canvas.height - srcY);
      slice.width = canvas.width;
      slice.height = h;
      slice.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, h, 0, 0, canvas.width, h);

      if (srcY > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', 24, 24, imgWidth, h * ratio, undefined, 'FAST');
    }

    const base = slugify(reportName) || 'captions-insights';
    pdf.save(`${base}.pdf`);
  }, [reportName]);

  const canBuild =
    nameOk &&
    (selectedRange !== 'custom' || (selectedRange === 'custom' && !!start && !!end));


  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Captions Insights</h1>
        <p className="page-subtitle">Generate shareable reports and export data for analysis.</p>
      </div>

      {/* Generate card */}
      <div className="grid gap-6 md:grid-cols-3 max-w-5xl">
        <div className="surface-card text-foreground">
          <h2 className="text-lg font-semibold">Captions</h2>
          <p className="mt-1.5 text-[14px] leading-6 text-muted-foreground">
            Build a focused insights report on Crack’d captions. Choose a custom date range, name the
            report, then download a CSV or ready-to-share PDF.
          </p>

          <div className="mt-4 flex justify-end">
            <button className={primaryBtn} onClick={() => { applyPreset('all'); setBuilderOpen(true); }}>
              Build
            </button>
          </div>
        </div>
      </div>

      {hasReport && (
        <div
          ref={reportRef}
          style={{
            position: 'absolute',
            left: '-99999px',
            top: 0,
            width: '800px',
            pointerEvents: 'none',
            background: '#ffffff',
            padding: '24px',
            borderRadius: '12px',
          }}
        >
          <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>{reportName}</h2>
          <div style={{ color: '#6b7280', marginBottom: '16px' }}>{niceRange}</div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <PDFStat label="Total Captions" value={String(stats!.total)} />
            <PDFStat label="Distinct Users" value={String(stats!.distinctUsers)} />
            <PDFStat label="Median Length" value={String(stats!.medianLen)} />
            <PDFStat label="% in 40–80 chars" value={`${stats!.sweetPct}%`} />
            <PDFStat label="% start with “when”" value={`${stats!.startsWithWhenPct.toFixed(1)}%`} />
            <PDFStat label="Top start trigrams coverage" value={`${stats!.topStartTriCoverage}%`} />
            <PDFStat label="Near-dup clusters" value={String(stats!.clusterCount)} />
            <PDFStat label="Largest cluster size" value={String(stats!.largestCluster)} />
          </div>

          <div style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
              Captions Created per Day
            </h3>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series!} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Starting phrases */}
          <div
            style={{
              marginTop: 24,
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 16,
            }}
          >
            <PDFNGramChart title="Top Starting Word" data={topStart1} />
            <PDFNGramChart title="Top Starting Bigrams" data={topStart2} />
            <PDFNGramChart title="Top Starting Trigrams" data={topStart3} />
          </div>

        </div>
      )}

      {builderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setBuilderOpen(false)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl bg-card text-card-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-5">
              <h2 className="text-2xl font-semibold">Generate a Caption Report</h2>
              <button className={secondaryBtn} onClick={() => setBuilderOpen(false)}>
                Close
              </button>
            </div>

            <div className="space-y-5 p-6">
              {/* Report name (required) */}
              <label className="flex flex-col gap-2">
                <span className={labelClass}>Report name</span>
                <input
                  type="text"
                  placeholder="Choose report name"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  className={fieldClass}
                />
              </label>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { k: '7d', label: 'Last 7 days' },
                      { k: 'lastMonth', label: 'Last Month' },
                      { k: 'all', label: 'All Time' },
                      { k: 'custom', label: 'Custom' },
                    ].map(({ k, label }) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => applyPreset(k as any)}
                        className={
                          (selectedRange === k ? `${primaryBtn}` : `${secondaryBtn}`) +
                          ' px-3 py-2 shrink-0 whitespace-nowrap'
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedRange === 'custom' && (
                  <>
                    <DateField
                      label="Choose a Start Date:"
                      value={start}
                      onChange={(v) => { setStart(v); setSelectedRange('custom'); }}
                      inputClass={fieldClass}
                      labelClass={labelClass}
                    />
                    <DateField
                      label="Choose an End Date:"
                      value={end}
                      onChange={(v) => { setEnd(v); setSelectedRange('custom'); }}
                      inputClass={fieldClass}
                      labelClass={labelClass}
                    />
                  </>
                )}
              </div>

              <button
                className={`${primaryBtn} w-full py-3 text-base`} disabled={!canBuild} onClick={buildReport}>
                Build
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'loading' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-card p-12 text-center text-card-foreground shadow-xl">
            <div className="text-xl font-semibold">Loading Report …</div>
            <div className="mt-2 text-sm text-muted-foreground">Do Not Exit This Page</div>
          </div>
        </div>
      )}

      {readyOpen && hasReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-2xl rounded-2xl bg-card p-10 text-center text-card-foreground shadow-xl">
            <button
              className={`${secondaryBtn} absolute right-4 top-4`}
              onClick={() => setReadyOpen(false)}
            >
              ✕
            </button>
            <div className="text-2xl font-semibold">Your Report is Ready!</div>
            <div className="mt-2 text-muted-foreground">
              <span className="font-medium">Name:</span> {reportName}
            </div>
            <div className="mt-6 flex flex-col items-center justify-center gap-6 sm:flex-row">
              <button className={`${primaryBtn} text-lg px-6 py-3`} onClick={exportCSV}>
                Download CSV
              </button>
              <button className={`${primaryBtn} text-lg px-6 py-3`} onClick={exportPDF}>
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PDFStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>{label}</div>
      <div style={{ marginTop: '4px', fontSize: '22px', fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function PDFNGramChart({ title, data }: { title: string; data: NGramItem[] }) {
  // taller if there are many rows so labels aren't cramped
  const h = Math.max(260, 28 * data.length + 40);

  // truncates long n-grams in ticks; full text still in tooltip
  const trim = (s: string) => (s.length > 28 ? s.slice(0, 25) + '…' : s);

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        pageBreakInside: 'avoid',   // <-- helps avoid being cut across pages
        background: '#fff',
      }}
    >
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
      <div style={{ width: '100%', height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            barCategoryGap={6}
          >
            <CartesianGrid strokeDasharray="3 3" />
            {/* numeric on X; categories (phrases) on Y */}
            <XAxis type="number" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="key"
              width={180}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
              tickFormatter={trim}
              interval={0}
            />
            <Tooltip
              formatter={(v: any, _n: any, p: any) => [v, p?.payload?.key]}
              labelFormatter={() => ''}
            />
            <Bar dataKey="count" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {data.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
          Coverage of top item: {data[0].pct}%
        </div>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  inputClass,
  labelClass,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputClass?: string;
  labelClass?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className={labelClass}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}
