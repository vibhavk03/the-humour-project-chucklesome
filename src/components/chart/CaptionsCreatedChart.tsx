"use client";

import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Download } from "lucide-react";
import { useTimeZone } from "@/components/TimeZoneContext";

type Point = { date: string; count: number };  
type ChartType = "line" | "bar";
type TimeRange = "7d" | "30d" | "90d";
type DurationMode = "preset" | "custom";
type GroupBy = "day" | "week" | "month";

function toUTCDate(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function parseYMDAsUTC(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}
function periodKey(date: Date, groupBy: GroupBy) {
  const utc = toUTCDate(date);
  if (groupBy === "day") return utc.toISOString().slice(0, 10);
  if (groupBy === "week") {
    const weekStart = new Date(utc);
    weekStart.setUTCDate(utc.getUTCDate() - utc.getUTCDay()); // Sunday
    return weekStart.toISOString().slice(0, 10);
  }
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function stepDate(date: Date, groupBy: GroupBy) {
  const d = new Date(date);
  if (groupBy === "day") d.setUTCDate(d.getUTCDate() + 1);
  else if (groupBy === "week") d.setUTCDate(d.getUTCDate() + 7);
  else {
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(1);
  }
  return d;
}

function formatXAxisLabel(value: string, groupBy: GroupBy, timeZone: string) {
  const date = parseYMDAsUTC(value);
  switch (groupBy) {
    case "day":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
    case "week":
      return `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })}`;
    case "month":
      return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone });
  }
}
function formatTooltipLabel(value: string, groupBy: GroupBy, timeZone: string) {
  const date = parseYMDAsUTC(value);
  switch (groupBy) {
    case "day":
      return date.toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone,
      });
    case "week":
      return `Week of ${date.toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric", timeZone,
      })}`;
    case "month":
      return date.toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone });
  }
}

export default function CaptionsCreatedChart({ data }: { data: Point[] }) {
  const { timeZone } = useTimeZone();
  const [isDark, setIsDark] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("line");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [durationMode, setDurationMode] = useState<DurationMode>("preset");
  const [customDuration, setCustomDuration] = useState<string>("30");
  const [customDurationError, setCustomDurationError] = useState<string>("");
  const [groupBy, setGroupBy] = useState<GroupBy>("day");

  useEffect(() => {
    const checkTheme = () => {
      const dark =
        document.documentElement.classList.contains("dark") ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDark(dark);
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", checkTheme);
    return () => {
      observer.disconnect();
      mq.removeEventListener?.("change", checkTheme);
    };
  }, []);

  useEffect(() => {
    if (durationMode === "custom") {
      const num = parseInt(customDuration);
      if (!customDuration.trim()) setCustomDurationError("Duration is required");
      else if (Number.isNaN(num)) setCustomDurationError("Enter a number");
      else if (num < 1) setCustomDurationError("Min 1 day");
      else if (num > 90) setCustomDurationError("Max 90 days");
      else setCustomDurationError("");
    } else {
      setCustomDurationError("");
    }
  }, [durationMode, customDuration]);

  const chartData: Point[] = useMemo(() => {
    setIsRefreshing(true);

    try {
      const end = new Date();
      end.setUTCHours(23, 59, 59, 999);

      let days = 30;
      if (durationMode === "preset") {
        days = timeRange === "7d" ? 7 : timeRange === "90d" ? 90 : 30;
      } else if (!customDurationError) {
        days = Math.min(90, Math.max(1, parseInt(customDuration)));
      }

      const start = new Date(end);
      start.setUTCDate(end.getUTCDate() - days + 1); // inclusive

      const dayMap = new Map<string, number>();
      for (const p of data) {
        const d = parseYMDAsUTC(p.date);
        if (d < toUTCDate(start) || d > toUTCDate(end)) continue;
        dayMap.set(p.date, (dayMap.get(p.date) ?? 0) + p.count);
      }

      const buckets = new Map<string, number>();
      if (groupBy === "day") {
        for (const [k, v] of dayMap) buckets.set(k, (buckets.get(k) ?? 0) + v);
      } else {
        for (const [k, v] of dayMap) {
          const d = parseYMDAsUTC(k);
          const key = periodKey(d, groupBy);
          buckets.set(key, (buckets.get(key) ?? 0) + v);
        }
      }

      const series: Point[] = [];
      let cursor: Date;
      if (groupBy === "week") {
        const aligned = new Date(start);
        aligned.setUTCDate(start.getUTCDate() - start.getUTCDay()); // Sunday
        cursor = aligned;
      } else if (groupBy === "month") {
        const aligned = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
        cursor = aligned;
      } else {
        cursor = toUTCDate(start);
      }

      while (cursor <= end) {
        const key = periodKey(cursor, groupBy);
        series.push({ date: key, count: buckets.get(key) ?? 0 });
        cursor = stepDate(cursor, groupBy);
      }

      return series;
    } finally {
      setIsRefreshing(false);
    }
  }, [data, timeRange, durationMode, customDuration, customDurationError, groupBy]);

  const textColor = isDark ? "#f3f4f6" : "#374151";
  const gridColor = isDark ? "#4b5563" : "#d1d5db";

  const exportData = () => {
    const csv = [
      ["Date", "CaptionsCreated"].join(","),
      ...chartData.map((p) => [p.date, p.count].join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `captions-created-${
      durationMode === "preset" ? timeRange : `${customDuration}d`
    }-${groupBy}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <CardTitle className="flex items-center gap-2">
            Captions Created
            {isRefreshing && <Activity className="animate-spin h-4 w-4" />}
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            {/* controls unchanged */}
            <div className="flex items-center border border-border rounded-md">
              <select
                value={durationMode === "preset" ? timeRange : "custom"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "custom") setDurationMode("custom");
                  else {
                    setDurationMode("preset");
                    setTimeRange(v as TimeRange);
                  }
                }}
                className="h-9 px-3 text-sm bg-transparent border-0 focus:outline-none cursor-pointer"
                disabled={isRefreshing}
              >
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="90d">90 days</option>
                <option value="custom">Custom</option>
              </select>
              {durationMode === "custom" && (
                <input
                  type="number"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder="Days"
                  className="w-20 h-9 px-2 text-sm bg-transparent border-0 border-l focus:outline-none"
                  min={1}
                  max={90}
                />
              )}
            </div>
            {customDurationError && (
              <span className="text-xs text-red-600">{customDurationError}</span>
            )}

            <div className="flex items-center border border-border rounded-md">
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="h-9 px-3 text-sm bg-transparent border-0 focus:outline-none cursor-pointer"
                disabled={isRefreshing}
              >
                <option value="day">By Day</option>
                <option value="week">By Week</option>
                <option value="month">By Month</option>
              </select>
            </div>

            <div className="flex items-center">
              <Button
                variant={chartType === "line" ? "default" : "outline"}
                size="sm"
                onClick={() => setChartType("line")}
                disabled={isRefreshing}
                className={chartType === "line" ? "" : "rounded-r-none border-r-0"}
              >
                Line
              </Button>
              <Button
                variant={chartType === "bar" ? "default" : "outline"}
                size="sm"
                onClick={() => setChartType("bar")}
                disabled={isRefreshing}
                className={chartType === "bar" ? "" : "rounded-l-none"}
              >
                Bar
              </Button>
            </div>

            <Button variant="outline" size="sm" onClick={exportData} disabled={isRefreshing}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-[340px] relative">
          {isRefreshing && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
              <Activity className="animate-spin h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "line" ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: isDark ? "#f3f4f6" : "#374151" }}
                  tickFormatter={(v) => formatXAxisLabel(String(v), groupBy, timeZone)}
                  axisLine={{ stroke: gridColor }}
                  tickLine={{ stroke: gridColor }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: isDark ? "#f3f4f6" : "#374151" }}
                  allowDecimals={false}
                  axisLine={{ stroke: gridColor }}
                  tickLine={{ stroke: gridColor }}
                />
                <Tooltip
                  labelFormatter={(v) => formatTooltipLabel(String(v), groupBy, timeZone)}
                  formatter={(v) => [v as number, "Captions"]}
                  contentStyle={{
                    backgroundColor: isDark ? "#1f2937" : "#ffffff",
                    border: `1px solid ${gridColor}`,
                    borderRadius: 6,
                    color: isDark ? "#f3f4f6" : "#374151",
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="Captions" />
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: isDark ? "#f3f4f6" : "#374151" }}
                  tickFormatter={(v) => formatXAxisLabel(String(v), groupBy, timeZone)}
                  axisLine={{ stroke: gridColor }}
                  tickLine={{ stroke: gridColor }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: isDark ? "#f3f4f6" : "#374151" }}
                  allowDecimals={false}
                  axisLine={{ stroke: gridColor }}
                  tickLine={{ stroke: gridColor }}
                />
                <Tooltip
                  labelFormatter={(v) => formatTooltipLabel(String(v), groupBy, timeZone)}
                  formatter={(v) => [v as number, "Captions"]}
                  contentStyle={{
                    backgroundColor: isDark ? "#1f2937" : "#ffffff",
                    border: `1px solid ${gridColor}`,
                    borderRadius: 6,
                    color: isDark ? "#f3f4f6" : "#374151",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
