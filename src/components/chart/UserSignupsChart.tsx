"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { useState, useEffect } from 'react';
// import { useTheme } from 'next-themes';
import { UserService } from '@/services/users.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, Users, TrendingUp, Activity, Download, Target, Clock, Trophy, Shield, User } from 'lucide-react';
import { useTimeZone } from '@/components/TimeZoneContext';

interface ChartData {
  date: string;
  signups: number;
  dayOfWeek?: string;
}

interface StatsData {
  totalUsers: number;
  totalUsersInPeriod: number;
  todaySignups: number;
  avgDaily: number;
  peakDay: string;
  peakSignups: number;
  superAdminCount: number;
  regularUserCount: number;
}

interface DayOfWeekData {
  day: string;
  signups: number;
  percentage: number;
}

type TimeRange = '7d' | '30d' | '90d';
type EndTimeMode = 'today' | 'custom';
type DurationMode = 'preset' | 'custom';
type ChartType = 'line' | 'bar';
type GroupBy = 'day' | 'week' | 'month';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];
const getTodayKey = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export default function UserSignupsChart() {
  const { timeZone } = useTimeZone();
  const [isDark, setIsDark] = useState(false);
  
  useEffect(() => {
    // Check if dark mode is active
    const checkTheme = () => {
      const isDarkMode = document.documentElement.classList.contains('dark') || 
                        window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(isDarkMode);
    };
    
    checkTheme();
    
    // Listen for theme changes
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addListener(checkTheme);
    
    return () => {
      observer.disconnect();
      mediaQuery.removeListener(checkTheme);
    };
  }, []);

  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [dayOfWeekData, setDayOfWeekData] = useState<DayOfWeekData[]>([]);
  const [statsData, setStatsData] = useState<StatsData>({
    totalUsers: 0,
    totalUsersInPeriod: 0,
    todaySignups: 0,
    avgDaily: 0,
    peakDay: '',
    peakSignups: 0,
    superAdminCount: 0,
    regularUserCount: 0
  });

  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [showDayOfWeekAnalysis, setShowDayOfWeekAnalysis] = useState(true);
  useEffect(() => { setShowDayOfWeekAnalysis(true); }, []);
  const [endTimeMode, setEndTimeMode] = useState<EndTimeMode>('today');
  const [durationMode, setDurationMode] = useState<DurationMode>('preset');
  const [customEndDate, setCustomEndDate] = useState<string>(() => getTodayKey(timeZone));
  const [customDuration, setCustomDuration] = useState<string>('30');
  const [customDurationError, setCustomDurationError] = useState<string>('');

  useEffect(() => {
    if (endTimeMode === 'today') {
      setCustomEndDate(getTodayKey(timeZone));
    }
  }, [endTimeMode, timeZone]);

  const validateCustomDuration = (value: string): string => {
    const numValue = parseInt(value);
    if (!value.trim()) {
      return 'Duration is required';
    }
    if (isNaN(numValue)) {
      return 'Please enter a valid number';
    }
    if (numValue < 1) {
      return 'Duration must be at least 1 day';
    }
    if (numValue > 90) {
      return 'Duration cannot exceed 90 days';
    }
    return '';
  };

  const handleCustomDurationChange = (value: string) => {
    setCustomDuration(value);
    const error = validateCustomDuration(value);
    setCustomDurationError(error);
  };

  const isApplyDisabled = () => {
    if (durationMode === 'custom') {
      return customDurationError !== '' || !customDuration.trim();
    }
    return false;
  };

  useEffect(() => {
    const fetchSignupData = async () => {
      try {
        // Use initialLoading for first load, isRefreshing for subsequent loads
        if (initialLoading) {
          setInitialLoading(true);
        } else {
          setIsRefreshing(true);
        }
                
        // Calculate date range
        const now = new Date();
        let endDate: Date;
        let startDate = new Date();
        
        // Determine end date based on mode
        switch (endTimeMode) {
          case 'today':
            endDate = now;
            break;
          case 'custom':
            endDate = new Date(customEndDate);
            endDate.setHours(23, 59, 59, 999);
            break;
        }
        
        // Determine duration
        let durationDays: number;
        if (durationMode === 'preset') {
          switch (timeRange) {
            case '7d':
              durationDays = 7;
              break;
            case '30d':
              durationDays = 30;
              break;
            case '90d':
              durationDays = 90;
              break;
          }
        } else {
          const durationValue = parseInt(customDuration);
          if (isNaN(durationValue) || durationValue < 1 || durationValue > 90) {
            // Don't proceed with invalid duration, return early
            setIsRefreshing(false);
            setInitialLoading(false);
            return;
          }
          durationDays = durationValue;
        }
        
        // Calculate start date
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - durationDays);
        
        const signupsByPeriod = await UserService.getSignupsByPeriod(startDate, endDate, groupBy);
        const dayOfWeekStats = await UserService.getSignupsByDayOfWeekBatch(startDate, endDate);
        
        // Create array with all dates in range
        const chartDataArray: ChartData[] = [];
        const currentDate = new Date(startDate);
        
        while (currentDate <= endDate) {
          let periodKey: string;
          let displayDate: string;
          
          switch (groupBy) {
            case 'day':
              periodKey = currentDate.toISOString().split('T')[0];
              displayDate = periodKey;
              break;
            case 'week':
              const weekStart = new Date(currentDate);
              weekStart.setDate(currentDate.getDate() - currentDate.getDay());
              periodKey = weekStart.toISOString().split('T')[0];
              displayDate = periodKey;
              break;
            case 'month':
              periodKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
              displayDate = periodKey;
              break;
            default:
              periodKey = currentDate.toISOString().split('T')[0];
              displayDate = periodKey;
          }
          
          const signups = signupsByPeriod[periodKey] || 0;
          
          chartDataArray.push({
            date: displayDate,
            signups,
            dayOfWeek: currentDate.toLocaleDateString('en-US', { weekday: 'short',
              timeZone })
          });
          
          // Increment date based on groupBy
          switch (groupBy) {
            case 'day':
              currentDate.setDate(currentDate.getDate() + 1);
              break;
            case 'week':
              currentDate.setDate(currentDate.getDate() + 7);
              break;
            case 'month':
              currentDate.setMonth(currentDate.getMonth() + 1);
              break;
          }
        }
        
        setChartData(chartDataArray);

        
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const totalSignupsForAnalysis = Object.values(dayOfWeekStats).reduce((sum, count) => sum + count, 0);
        
        const dayOfWeekArray: DayOfWeekData[] = dayNames.map(day => ({
          day,
          signups: dayOfWeekStats[day] || 0,
          percentage: totalSignupsForAnalysis > 0 ? ((dayOfWeekStats[day] || 0) / totalSignupsForAnalysis) * 100 : 0
        }));
        
        setDayOfWeekData(dayOfWeekArray);
        
        // Calculate enhanced statistics
        const today = new Date().toISOString().split('T')[0];
        const todaySignups = signupsByPeriod[today] || 0;

        const totalSignups = chartDataArray.reduce((sum, day) => sum + day.signups, 0);
        const avgDaily = chartDataArray.length > 0 ? totalSignups / chartDataArray.length : 0;

        // Get user role and status breakdown (keep these as efficient counts)
        const totalUsersCount = await UserService.getAllUsersCount();
        const superAdminCount = await UserService.getSuperAdminCount();
        const regularUserCount = await UserService.getRegularUserCount();

        // Find peak day
        const peakEntry = chartDataArray.reduce((max, entry) => 
          entry.signups > max.signups ? entry : max, chartDataArray[0] || { signups: 0, date: '' });

        setStatsData({
          totalUsers: totalUsersCount,
          totalUsersInPeriod: totalSignupsForAnalysis,
          todaySignups,
          avgDaily,
          peakDay: peakEntry.date,
          peakSignups: peakEntry.signups,
          superAdminCount,
          regularUserCount
        });
        
      } catch (error) {
        console.error('Error fetching signup data:', error);
      } finally {
        setInitialLoading(false);
        setIsRefreshing(false);
      }
    };

    fetchSignupData();
  }, [timeRange, groupBy, endTimeMode, durationMode, customEndDate, customDuration, initialLoading, timeZone]);

  const textColor = isDark ? '#f3f4f6' : '#374151';
  const gridColor = isDark ? '#4b5563' : '#d1d5db';
  const tooltipStyle = {
    backgroundColor: isDark ? '#1f2937' : '#ffffff',
    border: `1px solid ${isDark ? '#4b5563' : '#d1d5db'}`,
    borderRadius: '6px',
    color: isDark ? '#f3f4f6' : '#374151',
    boxShadow: isDark ? '0 4px 6px -1px rgba(0, 0, 0, 0.3)' : '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={tooltipStyle}>
          <p style={{ margin: 0, color: textColor, fontSize: '12px' }}>
            {`${data.day}: ${data.signups} (${data.percentage?.toFixed(1) || '0'}%)`}
          </p>
        </div>
      );
    }
    return null;
  };

  const formatXAxisLabel = (value: string) => {
    const date = new Date(value);
    switch (groupBy) {
      case 'day':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
      case 'week':
        return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })}`;
      case 'month':
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone });
      default:
        return value;
    }
  };

  const formatTooltipLabel = (value: string) => {
    const date = new Date(value);
    switch (groupBy) {
      case 'day':
        return date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          weekday: 'long', 
          timeZone
        });
      case 'week':
        return `Week of ${date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone })}`;
      case 'month':
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone });
      default:
        return value;
    }
  };

  const exportData = () => {
    const csvContent = [
      ['Date', 'Signups'].join(','),
      ...chartData.map(item => [
        item.date,
        item.signups
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-signups-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (initialLoading) {
    return (
      <div className="h-[600px] flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Activity className="animate-spin h-5 w-5 text-muted-foreground" />
          <p className="text-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 xl:grid-cols-9 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">All-Time Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total registered</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Period Signups</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.totalUsersInPeriod.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {durationMode === 'preset' ? timeRange : `${customDuration} days`}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Signups</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.todaySignups}</div>
            <p className="text-xs text-muted-foreground">New today</p>
          </CardContent>
        </Card>
          
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Average</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.avgDaily.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">signups/day</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Peak Day</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.peakSignups}</div>
            <p className="text-xs text-muted-foreground">
              signups
            </p>
            <p className="text-xs text-muted-foreground">
              {statsData.peakDay && new Date(statsData.peakDay).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                timeZone
              })}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Super Admins</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.superAdminCount}</div>
            <p className="text-xs text-muted-foreground">Admin users</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Regular Users</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.regularUserCount}</div>
            <p className="text-xs text-muted-foreground">Standard users</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              User Sign-ups Analytics
              {isRefreshing && <Activity className="animate-spin h-4 w-4" />}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center border border-border rounded-md">
                <select 
                  value={durationMode === 'preset' ? timeRange : 'custom'}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'custom') {
                      setDurationMode('custom');
                    } else {
                      setDurationMode('preset');
                      setTimeRange(value as TimeRange);
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
                {durationMode === 'custom' && (
                  <input
                    type="number"
                    value={customDuration}
                    onChange={(e) => handleCustomDurationChange(e.target.value)}
                    placeholder="Days"
                    className="w-20 h-9 px-2 text-sm bg-transparent border-0 border-l focus:outline-none"
                    min="1"
                    max="90"
                  />
                )}
              </div>
              
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
                  variant={chartType === 'line' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartType('line')}
                  disabled={isRefreshing}
                  className={chartType === 'line' ? '' : 'rounded-r-none border-r-0'}
                >
                  Line
                </Button>
                <Button
                  variant={chartType === 'bar' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChartType('bar')}
                  disabled={isRefreshing}
                  className={chartType === 'bar' ? '' : 'rounded-l-none'}
                >
                  Bar
                </Button>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={exportData}
                disabled={isRefreshing}
              >
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] relative">
            {isRefreshing && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
                <div className="flex items-center gap-2">
                  <Activity className="animate-spin h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'line' ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10, fill: textColor }}
                    tickFormatter={formatXAxisLabel}
                    axisLine={{ stroke: gridColor }}
                    tickLine={{ stroke: gridColor }}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: textColor }}
                    allowDecimals={false}
                    axisLine={{ stroke: gridColor }}
                    tickLine={{ stroke: gridColor }}
                  />
                  <Tooltip 
                    labelFormatter={formatTooltipLabel}
                    formatter={(value, name) => [value, 'Sign-ups']}
                    contentStyle={{ 
                      fontSize: '14px',
                      ...tooltipStyle
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="signups" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    name="signups"
                  />
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10, fill: textColor }}
                    tickFormatter={formatXAxisLabel}
                    axisLine={{ stroke: gridColor }}
                    tickLine={{ stroke: gridColor }}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: textColor }}
                    allowDecimals={false}
                    axisLine={{ stroke: gridColor }}
                    tickLine={{ stroke: gridColor }}
                  />
                  <Tooltip 
                    labelFormatter={formatTooltipLabel}
                    formatter={(value) => [value, 'Sign-ups']}
                    contentStyle={{ 
                      fontSize: '14px',
                      ...tooltipStyle
                    }}
                  />
                  <Bar 
                    dataKey="signups" 
                    fill="#3b82f6"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Day of Week Analysis */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between 
                          items-start sm:items-center gap-4">
            <CardTitle>Sign-ups by Day of Week</CardTitle>
          </div>
        </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Bar chart for day of week */}
              <div className="h-[300px] relative p-4">
                <h4 className="text-sm font-medium mb-4 text-foreground text-center">
                  Signups by Day
                </h4>
                {isRefreshing && (
                  <div className="absolute inset-0 bg-background/60 flex 
                                  items-center justify-center z-10">
                    <Activity className="animate-spin h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayOfWeekData}>
                    <CartesianGrid 
                      strokeDasharray="3 3" stroke={gridColor} opacity={0.3}
                    />
                    <XAxis 
                      dataKey="day" 
                      tick={{ fontSize: 12, fill: textColor }} 
                      axisLine={{ stroke: gridColor }}
                      tickLine={{ stroke: gridColor }}
                    />
                    <YAxis 
                      allowDecimals={false} 
                      tick={{ fontSize: 12, fill: textColor }} 
                      axisLine={{ stroke: gridColor }}
                      tickLine={{ stroke: gridColor }}
                    />
                    <Tooltip 
                      formatter={(value, name) => [
                        name === 'signups' ? value : `${value}%`,
                        name === 'signups' ? 'Sign-ups' : 'Percentage'
                      ]}
                      contentStyle={{ 
                        fontSize: '12px',
                        ...tooltipStyle
                      }}
                    />
                    <Bar 
                      dataKey="signups" 
                      fill="#3b82f6" 
                      radius={[2, 2, 0, 0]} 
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              {/* Pie chart for day of week */}
              <div className="h-[300px] relative p-4">
                  <h4 className="text-sm font-medium mb-4 text-foreground text-center">
                    Distribution by Day
                  </h4>
                <div className="flex flex-col md:flex-row 
                                items-center gap-6 h-[260px]">
                {/* Pie Chart */}
                <div className="relative w-full md:w-2/3 h-full">
                {isRefreshing && (
                  <div className="absolute inset-0 bg-background/60 
                                  flex items-center justify-center z-10">
                  <Activity className="animate-spin h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dayOfWeekData}
                        cx="50%"
                        cy="50%"
                        outerRadius={110}
                        fill="#8884d8"
                        dataKey="signups"
                        label={false}
                      >
                        {dayOfWeekData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Legend */}
                <div className="w-full md:w-1/3 flex flex-col gap-2 text-sm">
                  {dayOfWeekData.map((entry, index) => (
                    <div key={entry.day} className="flex items-center gap-2">
                      <div 
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      ></div>
                      <span className="text-muted-foreground text-xs">
                        {entry.day}: {entry.signups} ({entry.percentage.toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
                </div>
              </div>
            </div>
          </CardContent>
        
      </Card>
    </div>
  );
}
