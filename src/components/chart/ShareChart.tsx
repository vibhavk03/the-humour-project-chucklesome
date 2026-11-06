"use client"

import { LineChart, Line, CartesianGrid, XAxis, YAxis } from "recharts"
import { useState, useMemo, useEffect, useCallback } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { ShareService } from "@/services/share.service"
import { useTheme } from "next-themes"
import { eachDayOfInterval, isWithinInterval } from "date-fns"
import { useTimeZone } from "@/components/TimeZoneContext"

type ShareDestination = { id: number; name: string }
type DailyData = { date: string } & { [key: string]: number | string }
type TimeRange = 'week' | 'month' | 'year' | 'all' | 'custom'

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(212, 72%, 59%)",
  "hsl(280, 65%, 59%)",
  "hsl(340, 65%, 60%)",
  "hsl(30, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(180, 70%, 45%)",
]

export default function ShareChart() {
  const { timeZone } = useTimeZone()
  const [destinations, setDestinations] = useState<ShareDestination[]>([])
  const [activeChart, setActiveChart] = useState<string>("__ALL__")
  const [chartData, setChartData] = useState<DailyData[]>([])
  const [timeRange, setTimeRange] = useState<TimeRange>('week')
  const [customRange, setCustomRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null })
  const [isLoading, setIsLoading] = useState(true)
  const [pendingCustomRange, setPendingCustomRange] = useState<{ start: string; end: string }>({ start: '', end: '' })
  const { theme, resolvedTheme } = useTheme();
  const effectiveTheme = resolvedTheme ?? theme;
  const isDark = effectiveTheme === "dark";
  const dayKeyFormatter = useMemo(
    () => new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }),
    [timeZone]
  );


  const applyCustomRange = () => {
    if (pendingCustomRange.start && pendingCustomRange.end) {
      setCustomRange({
        start: new Date(pendingCustomRange.start),
        end: new Date(pendingCustomRange.end),
      })
    }
  }

  const getStartDate = useCallback((): Date => {
    const now = new Date()
    switch (timeRange) {
      case 'week': return new Date(now.setDate(now.getDate() - 7))
      case 'month': return new Date(now.setMonth(now.getMonth() - 1))
      case 'year': return new Date(now.setFullYear(now.getFullYear() - 1))
      case 'custom': return customRange.start || new Date()
      default: return new Date(2000, 0, 1)
    }
  }, [timeRange, customRange])

  const getEndDate = useCallback((): Date => {
    const now = new Date()
    return timeRange === 'custom' && customRange.end ? customRange.end : now
  }, [timeRange, customRange])

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      try {
        const allDestinations = await ShareService.getAllDestinations()
        const normalizedDestinations = allDestinations.map((dest) => ({
          ...dest,
          name: dest.name ?? "Unknown",
        }))
        setDestinations(normalizedDestinations)

        const start = getStartDate()
        const end = getEndDate()

        if (timeRange === "custom" && (!start || !end)) return // early exit for custom

        const days = eachDayOfInterval({ start, end }).map(d => dayKeyFormatter.format(d))

        const dailyTotals: Record<string, DailyData> = {}
        days.forEach(date => {
          dailyTotals[date] = { date, total: 0 }
          normalizedDestinations.forEach(dest => {
            dailyTotals[date][dest.name] = 0
          })
        })

        await Promise.all(
          normalizedDestinations.map(async (dest) => {
            const rawShares = await ShareService.getSharesByDestination(dest.id)
            rawShares.forEach((share: any) => {
              const shareDate = new Date(share.created_datetime_utc)
              if (isWithinInterval(shareDate, { start, end })) {
                const key = dayKeyFormatter.format(shareDate)
                if (!dailyTotals[key]) return
                dailyTotals[key][dest.name] = (dailyTotals[key][dest.name] as number) + 1
                dailyTotals[key].total = (dailyTotals[key].total as number) + 1
              }
            })
          })
        )

        setChartData(Object.values(dailyTotals))
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    const shouldFetch = timeRange !== 'custom' || (customRange.start && customRange.end)

    if (shouldFetch) {
      fetchData()
    }
  }, [timeRange, customRange, getStartDate, getEndDate, dayKeyFormatter])

  const totals = useMemo(() => {
    const result: Record<string, number> = { total: 0 }
    destinations.forEach(dest => {
      const total = chartData.reduce((acc, curr) => acc + ((curr[dest.name] as number) || 0), 0)
      if (total > 0) {
        result[dest.name] = total
        result.total += total
      }
    })
    return result
  }, [chartData, destinations])

  const isAllChart = activeChart === "__ALL__"

  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
          <CardTitle>Sharing Analytics</CardTitle>
          <CardDescription>Showing total shares by date</CardDescription>
        </div>

        <div className="flex flex-wrap">
          {destinations
            .filter(dest => totals[dest.name] > 0)
            .map((dest) => (
              <button
                key={dest.id}
                data-active={activeChart === dest.name}
                className={`relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted sm:border-l sm:border-t-0 sm:px-8 sm:py-6`}
                onClick={() => setActiveChart(dest.name)}
              >
                <span className="text-sm text-muted-foreground">
                  {dest.name}
                </span>
                <span className="text-md font-bold leading-none sm:text-3xl">
                  {totals[dest.name]?.toLocaleString()}
                </span>
              </button>
            ))}

            {/* Total tab */}
            <button
              key="total"
              data-active={activeChart === "__ALL__"}
              className={`relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted sm:border-l sm:border-t-0 sm:px-8 sm:py-6 sm:rounded-tr-lg`}
              onClick={() => setActiveChart("__ALL__")}
              >
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-md font-bold leading-none sm:text-3xl">
              {totals.total.toLocaleString()}
              </span>
            </button>

        </div>
      </CardHeader>

      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        {['week', 'month', 'year', 'all', 'custom'].map((range) => (
          <button
            key={range}
            className={`px-3 py-1 rounded ${timeRange === range ? 'bg-muted font-bold' : 'bg-transparent'}`}
            onClick={() => {
              setTimeRange(range as TimeRange)
              setActiveChart("__ALL__")
            }}
          >
            {range.charAt(0).toUpperCase() + range.slice(1)}
          </button>
        ))}

        {timeRange === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={pendingCustomRange.start}
            onChange={(e) =>
              setPendingCustomRange((prev) => ({ ...prev, start: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyCustomRange()
            }}
          />
          <input
            type="date"
            value={pendingCustomRange.end}
            onChange={(e) =>
              setPendingCustomRange((prev) => ({ ...prev, end: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyCustomRange()
            }}
          />
          <button
            className="px-4 py-1.5 text-sm font-semibold rounded-md bg-primary text-white hover:bg-primary/90 transition"
            onClick={applyCustomRange}
          >
            Apply
          </button>
        </div>
      )}
      </div>

      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={{}} className="aspect-auto h-[600px] w-full">
          <LineChart 
            accessibilityLayer 
            data={chartData} 
            margin={{ top: 20, left: 12, right: 12, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              tickFormatter={(val) => Math.floor(val).toString()}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[150px]"
                  nameKey={isAllChart ? "total" : activeChart}
                />
              }
            />
            {isAllChart ? (
              <Line
                type="monotone"
                dataKey="total"
                stroke={`hsla(64, 90%, 55%, 1.00)`}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
            ) : (
              <Line
                type="monotone"
                dataKey={activeChart}
                stroke={
                  CHART_COLORS[
                    destinations.findIndex(d => d.name === activeChart) % CHART_COLORS.length
                  ]
                }
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
            )}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
