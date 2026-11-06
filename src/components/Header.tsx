"use client";

import Link from "next/link";
import { ModeToggle } from "@/components/button/ModeToggle";
import { signOutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { checkAuth } from "@/utils/auth";
import { usePathname } from "next/navigation";
import { useSidebarOffset } from "@/hooks/useSidebarOffset";

export function Header() {
  const pathname = usePathname();
  const publicRoutes = ["/", "/sign-in", "/forgot-password", "/reset-password"];
  const isAdminRoute =
    !publicRoutes.includes(pathname) && !pathname.startsWith("/auth");
  const offset = useSidebarOffset(); 

  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { user } = await checkAuth();
      setShowLogout(!!user || isAdminRoute);
    };
    checkSession();
  }, [isAdminRoute]);

  return (
    <header
      className="fixed top-0 right-0 z-40 flex h-14 items-center border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-primary/60 after:via-accent/40 after:to-transparent"
      style={{ left: isAdminRoute ? `${offset}px` : "0px" }}  // SSR-safe string
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="text-xl sm:text-2xl font-semibold tracking-tight">
            <Link href="/overview">
              <span className="text-primary">Crack&apos;d</span>{" "}
              <span className="text-foreground">Backstage</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <ModeToggle />
            {showLogout && (
              <Button
                onClick={async () => {
                  await signOutAction();
                  setShowLogout(false);
                }}
                className="gap-2"
                variant="secondary"
              >
                Log Out <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
