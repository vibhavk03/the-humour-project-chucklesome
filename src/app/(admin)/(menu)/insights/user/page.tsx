'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Users as UsersIcon, Shield, UserCheck } from 'lucide-react';
import UserSignupsChart from '@/components/chart/UserSignupsChart';
import { UserService } from '@/services/users.service';

export default function UsersInsightsPage() {
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [totalSuperAdmins, setTotalSuperAdmins] = useState<number>(0);
  const [active7d, setActive7d] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // Total users (from totalCount)
        const { totalCount } = await UserService.searchUsersEnhanced({
          searchQuery: '',
          isSuperAdminFilter: null,
          offset: 0,
          limit: 1,
          searchType: 'all',
        });
        if (!mounted) return;
        setTotalUsers(totalCount || 0);

        // Superadmins
        const superCount = await UserService.getSuperAdminCount();
        if (!mounted) return;
        setTotalSuperAdmins(superCount || 0);

        // Active in last 7 days (sample by fetching a chunk; replace with aggregate if available)
        const LIMIT = 1000;
        const { users } = await UserService.searchUsersEnhanced({
          searchQuery: '',
          isSuperAdminFilter: null,
          offset: 0,
          limit: LIMIT,
          searchType: 'all',
        });

        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        const act =
          (users || []).filter(u => {
            if (!u.modified_datetime_utc) return false;
            const last = new Date(u.modified_datetime_utc).getTime();
            return Date.now() - last <= sevenDays;
          }).length;

        if (!mounted) return;
        setActive7d(act);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">User Insights</h1>
        <p className="page-subtitle">Track growth, engagement, and admin activity.</p>
      </div>

      {/* KPIs */}
      <div className="flex items-center gap-3 flex-wrap">
        <KPI
          icon={<UsersIcon className="h-4 w-4 text-primary" />}
          label="Total Users"
          value={loading ? '…' : totalUsers.toLocaleString()}
          accent="border-l-primary/60"
        />
        <KPI
          icon={<Shield className="h-4 w-4 text-accent" />}
          label="Superadmins"
          value={loading ? '…' : totalSuperAdmins.toLocaleString()}
          accent="border-l-accent/60"
        />
        <KPI
          icon={<UserCheck className="h-4 w-4 text-emerald-500" />}
          label="Active (7d)"
          value={loading ? '…' : active7d.toLocaleString()}
          accent="border-l-emerald-500/60"
        />
      </div>

      {/* Signups over time */}
      <Card>
        <CardContent className="p-6">
          <UserSignupsChart />
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: string | number; accent: string }) {
  return (
    <Card className={`border-l-4 ${accent}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
