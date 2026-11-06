"use client"

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ModeToggleProps = {
  showLabel?: boolean;
};

const THEME_LABELS: Record<string, string> = {
  light: "Light Mode",
  dark: "Dark Mode",
  system: "System Default",
};

export function ModeToggle({ showLabel = false }: ModeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const themeLabel = mounted
    ? THEME_LABELS[theme ?? "system"] ?? THEME_LABELS.system
    : THEME_LABELS.system;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={showLabel ? "default" : "icon"}
          className={cn(showLabel ? "w-full justify-start gap-2" : "")}
        >
          <span className="relative h-[1.2rem] w-[1.2rem]">
            <Sun className="absolute inset-0 h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute inset-0 h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </span>
          {showLabel && <span className="text-sm font-medium">{themeLabel}</span>}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={showLabel ? "start" : "end"}>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light Mode
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark Mode
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System Default
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
};
