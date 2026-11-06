"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
    ChartConfig, 
    ChartContainer, 
    ChartTooltip, 
    ChartTooltipContent,
} from "@/components/ui/chart";
import { ShareService } from "@/services/share.service";
import Spinner from "@/components/ui/spinner";
import { useTimeZone } from "@/components/TimeZoneContext";

type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
type ShareDestination = { id: number; name: string };
type DailyData = { date: string } & { [key: string]: number | string };

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function OverviewChart() {
  const { timeZone } = useTimeZone();
  const [chartData, setChartData] = useState<DailyData[]>([]);
  const [destinations, setDestinations] = useState<ShareDestination[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const chartConfig = {
    ...destinations.slice(0, 5).reduce((acc, dest, index) => ({
      ...acc,
      [dest.name]: {
        label: dest.name,
        color: CHART_COLORS[index],
      }
    }), {})
  } satisfies ChartConfig;

  useEffect(() => {
    async function fetchData() {
      try {
        const allDestinations = await ShareService.getAllDestinations();
        const top5Destinations = allDestinations.slice(0, 5).map((dest) => ({
          ...dest,
          name: dest.name ?? "Unknown",
        }));
        setDestinations(top5Destinations);

        const dailyTotals: Record<DayOfWeek, any> = {
          'Sunday': { date: 'Sunday' },
          'Monday': { date: 'Monday' },
          'Tuesday': { date: 'Tuesday' },
          'Wednesday': { date: 'Wednesday' },
          'Thursday': { date: 'Thursday' },
          'Friday': { date: 'Friday' },
          'Saturday': { date: 'Saturday' }
        };

        // Initialize counters for each destination
        top5Destinations.forEach(dest => {
          Object.values(dailyTotals).forEach(day => {
            day[dest.name] = 0;
          });
        });

        // Fetch and process shares for each destination
        await Promise.all(
          top5Destinations.map(async (dest) => {
            const shares = await ShareService.getSharesByDestination(dest.id);
            shares.forEach((share: any) => {
              const dayOfWeek = new Date(share.created_datetime_utc)
                .toLocaleDateString('en-US', { weekday: 'long', timeZone }) as DayOfWeek;
              dailyTotals[dayOfWeek][dest.name]++;
            });
          })
        );

        setChartData(Object.values(dailyTotals));
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [timeZone]);

  if (isLoading) {
    return (
      <Card className="w-[500px] h-[450px]">
        <CardHeader>
          <CardTitle>Weekly Sharing Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[380px]">
          <Spinner size="lg">Loading chart</Spinner>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-[500px] h-[450px]">
      <CardHeader>
        <CardTitle>Weekly Sharing Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="w-full h-[380px]">
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            {destinations.slice(0, 5).map((dest, index) => (
              <Bar 
                key={dest.id}
                dataKey={dest.name} 
                fill={CHART_COLORS[index]} 
                radius={4} 
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
