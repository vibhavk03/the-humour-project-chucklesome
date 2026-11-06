"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyStudyLinkButtonProps = {
  url: string;
  className?: string;
};

function copyWithSelection(url: string) {
  const textarea = document.createElement("textarea");
  textarea.value = url;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export function CopyStudyLinkButton({ url, className }: CopyStudyLinkButtonProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch {
      try {
        if (!copyWithSelection(url)) throw new Error("Copy command failed");
        setCopyStatus("copied");
      } catch {
        setCopyStatus("error");
      }
    }

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopyStatus("idle"), 1800);
  };

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void handleCopy();
        }}
        aria-label={copyStatus === "error" ? "Copy failed; try again" : "Copy study link"}
        title={copyStatus === "error" ? "Copy failed; try again" : "Copy study link"}
      >
        {copyStatus === "copied" ? (
          <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
      {copyStatus !== "idle" ? (
        <span
          role={copyStatus === "error" ? "alert" : "status"}
          className={cn(
            "absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium shadow-md animate-in fade-in-0 zoom-in-95",
            copyStatus === "error"
              ? "bg-destructive text-destructive-foreground"
              : "bg-foreground text-background"
          )}
        >
          {copyStatus === "error" ? "Copy failed" : "Copied!"}
        </span>
      ) : null}
    </span>
  );
}
