"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { Separator } from "@/components/ui/separator";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTimeZone } from "@/components/TimeZoneContext";

type LlmModelRow = Record<string, unknown>;

const formatColumnLabel = (key: string) => {
  if (key === "id") return "Id";
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
};

const formatCellValue = (value: unknown, key: string, timeZone: string) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) {
    return value.toLocaleString("en-US", { timeZone, timeZoneName: "short" });
  }
  if (typeof value === "string") {
    if (/date|datetime|timestamp|_utc/i.test(key)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleString("en-US", { timeZone, timeZoneName: "short" });
      }
    }
    return value;
  }
  if (typeof value === "number") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export default function LlmModelsPage() {
  const { timeZone } = useTimeZone();
  const [models, setModels] = useState<LlmModelRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchModels = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      if (!supabase) {
        if (active) {
          setErrorMessage("Supabase client unavailable.");
          setIsLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from("llm_models")
          .select("*")
          .order("id", { ascending: true });

        if (!active) return;

        if (error) {
          console.error("Error fetching LLM models:", error);
          setErrorMessage("Failed to load LLM models.");
          setModels([]);
          return;
        }

        setModels(data || []);
      } catch (error) {
        if (!active) return;
        console.error("Error fetching LLM models:", error);
        setErrorMessage("Failed to load LLM models.");
        setModels([]);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    fetchModels();
    return () => {
      active = false;
    };
  }, []);

  const columns = useMemo(() => {
    if (models.length === 0) return [];
    const columnSet = new Set<string>();
    models.forEach((row) => {
      Object.keys(row).forEach((key) => columnSet.add(key));
    });
    const keys = Array.from(columnSet);
    const hasId = keys.includes("id");
    const remaining = keys.filter((key) => key !== "id");
    return hasId ? ["id", ...remaining] : remaining;
  }, [models]);

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">LLM Models</h1>
        <p className="page-subtitle">All registered models in the system.</p>
      </div>

      <Separator />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading LLM models...</div>
      ) : errorMessage ? (
        <Card className="p-6">
          <CardHeader className="p-0">
            <CardTitle>Unable to load models</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
        </Card>
      ) : models.length === 0 ? (
        <Card className="p-6">
          <CardHeader className="p-0">
            <CardTitle>No models found</CardTitle>
            <CardDescription>There are no rows in the llm_models table.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="bg-card rounded-lg border overflow-x-auto">
          <table className="min-w-full table-base font-sans">
            <thead className="table-head">
              <tr>
                {columns.map((column) => (
                  <th key={column}>{formatColumnLabel(column)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {models.map((row, rowIndex) => {
                const rowKey = (row.id as number | string | undefined) ?? rowIndex;
                return (
                  <tr key={rowKey}>
                    {columns.map((column) => (
                      <td
                        key={column}
                        className={
                          column === "id"
                            ? "whitespace-nowrap font-sans text-muted-foreground"
                            : "text-sm text-muted-foreground whitespace-pre-wrap break-words"
                        }
                      >
                        {formatCellValue(row[column], column, timeZone)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
