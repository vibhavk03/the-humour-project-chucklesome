"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type TimeZoneContextValue = {
  timeZone: string;
  timeZoneOptions: string[];
  setTimeZone: (nextTimeZone: string) => void;
};

const TIMEZONE_STORAGE_KEY = "timezone";
const TIMEZONE_COOKIE_NAME = "timezone";
const FALLBACK_TIMEZONE = "UTC";

const TimeZoneContext = createContext<TimeZoneContextValue | undefined>(undefined);

const getSystemTimeZone = () => {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") {
    return FALLBACK_TIMEZONE;
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
};

const getTimeZoneOptions = (systemTimeZone: string) => {
  if (typeof Intl === "undefined" || typeof Intl.supportedValuesOf !== "function") {
    return [systemTimeZone];
  }

  const options = Intl.supportedValuesOf("timeZone");
  return options.includes(systemTimeZone) ? options : [systemTimeZone, ...options];
};

const ensureTimeZoneOption = (options: string[], timeZone: string) =>
  options.includes(timeZone) ? options : [timeZone, ...options];

const getInitialTimeZoneState = () => {
  const systemTimeZone = getSystemTimeZone();

  if (typeof window === "undefined") {
    return {
      timeZone: systemTimeZone,
      timeZoneOptions: getTimeZoneOptions(systemTimeZone),
    };
  }

  const storedTimeZone = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
  const initialTimeZone = storedTimeZone || systemTimeZone;

  return {
    timeZone: initialTimeZone,
    timeZoneOptions: ensureTimeZoneOption(
      getTimeZoneOptions(systemTimeZone),
      initialTimeZone
    ),
  };
};

const setTimeZoneCookie = (timeZone: string) => {
  const encoded = encodeURIComponent(timeZone);
  document.cookie = `${TIMEZONE_COOKIE_NAME}=${encoded}; path=/; max-age=31536000; samesite=lax`;
};

const fallbackValue: TimeZoneContextValue = {
  timeZone: FALLBACK_TIMEZONE,
  timeZoneOptions: [FALLBACK_TIMEZONE],
  setTimeZone: () => undefined,
};

export function TimeZoneProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(getInitialTimeZoneState);
  const { timeZone, timeZoneOptions } = state;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!window.localStorage.getItem(TIMEZONE_STORAGE_KEY)) {
      window.localStorage.setItem(TIMEZONE_STORAGE_KEY, timeZone);
    }

    setTimeZoneCookie(timeZone);
  }, [timeZone]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== TIMEZONE_STORAGE_KEY) {
        return;
      }

      const nextTimeZone = event.newValue || getSystemTimeZone();
      setState((prev) => ({
        timeZone: nextTimeZone,
        timeZoneOptions: ensureTimeZoneOption(prev.timeZoneOptions, nextTimeZone),
      }));
      setTimeZoneCookie(nextTimeZone);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setTimeZone = (nextTimeZone: string) => {
    setState((prev) => ({
      timeZone: nextTimeZone,
      timeZoneOptions: ensureTimeZoneOption(prev.timeZoneOptions, nextTimeZone),
    }));
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, nextTimeZone);
    setTimeZoneCookie(nextTimeZone);
  };

  const value = useMemo(
    () => ({
      timeZone,
      timeZoneOptions,
      setTimeZone,
    }),
    [timeZone, timeZoneOptions]
  );

  return <TimeZoneContext.Provider value={value}>{children}</TimeZoneContext.Provider>;
}

export const useTimeZone = () => useContext(TimeZoneContext) ?? fallbackValue;
