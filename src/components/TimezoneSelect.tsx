"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useTimeZone } from "@/components/TimeZoneContext";

const formatOptionId = (listboxId: string, index: number) =>
  `${listboxId}-option-${index}`;

export default function TimezoneSelect() {
  const router = useRouter();
  const { timeZone, timeZoneOptions, setTimeZone } = useTimeZone();
  const [query, setQuery] = useState(timeZone);
  const [isOpen, setIsOpen] = useState(false);
  const [hasTypedSinceOpen, setHasTypedSinceOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputId = useId();
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setQuery(timeZone);
  }, [timeZone]);

  const filteredOptions = useMemo(() => {
    const normalized = hasTypedSinceOpen ? query.trim().toLowerCase() : "";
    if (!normalized) {
      return timeZoneOptions;
    }
    return timeZoneOptions.filter((zone) =>
      zone.toLowerCase().includes(normalized)
    );
  }, [hasTypedSinceOpen, query, timeZoneOptions]);

  useEffect(() => {
    if (isOpen) {
      setHasTypedSinceOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (filteredOptions.length === 0) {
      setHighlightedIndex(0);
      return;
    }

    const selectedIndex = filteredOptions.findIndex((zone) => zone === timeZone);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredOptions, isOpen, timeZone]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current) {
        return;
      }

      if (wrapperRef.current.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
      setQuery(timeZone);
    };

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        setQuery(timeZone);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isOpen, timeZone]);

  const handleSelect = (zone: string) => {
    if (zone !== timeZone) {
      setTimeZone(zone);
      router.refresh();
    }
    setQuery(zone);
    setIsOpen(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredOptions.length === 0) {
        return;
      }
      if (!isOpen) {
        setIsOpen(true);
        setHasTypedSinceOpen(false);
        setHighlightedIndex(0);
        return;
      }
      setHighlightedIndex((prev) => (prev + 1) % filteredOptions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredOptions.length === 0) {
        return;
      }
      if (!isOpen) {
        setIsOpen(true);
        setHasTypedSinceOpen(false);
        setHighlightedIndex(filteredOptions.length - 1);
        return;
      }
      setHighlightedIndex(
        (prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length
      );
      return;
    }

    if (event.key === "Enter") {
      if (filteredOptions.length === 0) {
        return;
      }
      event.preventDefault();
      const zone = filteredOptions[highlightedIndex] ?? filteredOptions[0];
      handleSelect(zone);
      return;
    }

    if (event.key === "Tab") {
      setIsOpen(false);
      setQuery(timeZone);
    }
  };

  const activeDescendant =
    isOpen && filteredOptions[highlightedIndex]
      ? formatOptionId(listboxId, highlightedIndex)
      : undefined;

  return (
    <div ref={wrapperRef} className="timezone-select">
      <label htmlFor={inputId} className="timezone-select__label">
        Timezone
      </label>
      <div className="timezone-select__control">
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHasTypedSinceOpen(true);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={(event) => {
            event.target.select();
            setIsOpen(true);
            setHasTypedSinceOpen(false);
          }}
          onKeyDown={handleKeyDown}
          className="timezone-select__input"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          placeholder="Search timezones"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          aria-label="Toggle timezone list"
          onClick={() => {
            setIsOpen((prev) => {
              if (!prev) {
                setHasTypedSinceOpen(false);
              }
              return !prev;
            });
            inputRef.current?.focus();
          }}
          className="timezone-select__toggle"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`timezone-select__icon${isOpen ? " is-open" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8l4 4 4-4" />
          </svg>
        </button>
      </div>

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={inputId}
          className="timezone-select__list"
        >
          {filteredOptions.length ? (
            filteredOptions.map((zone, index) => {
              const isSelected = zone === timeZone;
              const isActive = index === highlightedIndex;
              const optionClassName = [
                "timezone-select__option",
                isSelected ? "is-selected" : "",
                !isSelected && isActive ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <li key={zone}>
                  <button
                    id={formatOptionId(listboxId, index)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(zone)}
                    className={optionClassName}
                  >
                    {zone}
                  </button>
                </li>
              );
            })
          ) : (
            <li className="timezone-select__empty">No matches found.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
