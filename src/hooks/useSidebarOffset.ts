'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function useSidebarOffset(
  expanded = 256,   // w-64
  collapsed = 64    // w-16
) {
  const pathname = usePathname();
  const publicRoutes = ['/', '/sign-in', '/forgot-password', '/reset-password'];
  const isAdminRoute =
    !!pathname && !publicRoutes.includes(pathname) && !pathname.startsWith('/auth');

  // SSR-safe: on first render use expanded width for admin routes, 0 otherwise.
  const [offset, setOffset] = useState<number>(isAdminRoute ? expanded : 0);

  useEffect(() => {
    const compute = () => {
      const isCollapsed = localStorage.getItem('sidebar.collapsed') === 'true';
      setOffset(isAdminRoute ? (isCollapsed ? collapsed : expanded) : 0);
    };

    compute(); // sync from localStorage on mount

    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail as { collapsed?: boolean };
      if (typeof d?.collapsed === 'boolean') {
        setOffset(isAdminRoute ? (d.collapsed ? collapsed : expanded) : 0);
      }
    };

    const onStorage = () => compute();

    window.addEventListener('sidebar:state', onState as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('sidebar:state', onState as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [isAdminRoute, expanded, collapsed]);

  return offset;
}
