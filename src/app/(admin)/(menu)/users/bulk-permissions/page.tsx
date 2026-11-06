"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserService } from "@/services/users.service";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type AssignAction = "no-change" | "assign" | "unassign";

type ParsedEmails = {
  total: number;
  valid: string[];
  invalid: string[];
  duplicates: string[];
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseEmails = (value: string): ParsedEmails => {
  const tokens = value
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const normalized = tokens.map((token) => token.toLowerCase());

  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];

  normalized.forEach((email) => {
    if (seen.has(email)) {
      duplicates.push(email);
      return;
    }

    seen.add(email);
    if (emailRegex.test(email)) {
      valid.push(email);
    } else {
      invalid.push(email);
    }
  });

  return { total: tokens.length, valid, invalid, duplicates };
};

export default function BulkPermissionsPage() {
  const [emailInput, setEmailInput] = useState("");
  const [superAdminAction, setSuperAdminAction] =
    useState<AssignAction>("no-change");
  const [matrixAdminAction, setMatrixAdminAction] =
    useState<AssignAction>("no-change");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    updatedCount: number;
    missingEmails: string[];
    updated: Array<{
      id: string;
      email: string | null;
      is_superadmin: boolean;
      is_matrix_admin: boolean;
    }>;
  } | null>(null);

  const parsed = useMemo(() => parseEmails(emailInput), [emailInput]);

  const updates = useMemo(() => {
    const payload: {
      is_superadmin?: boolean;
      is_matrix_admin?: boolean;
    } = {};

    if (superAdminAction !== "no-change") {
      payload.is_superadmin = superAdminAction === "assign";
    }
    if (matrixAdminAction !== "no-change") {
      payload.is_matrix_admin = matrixAdminAction === "assign";
    }

    return payload;
  }, [superAdminAction, matrixAdminAction]);

  const updateLabels = useMemo(() => {
    const labels: string[] = [];
    if (superAdminAction === "assign") labels.push("Assign Super Admin");
    if (superAdminAction === "unassign") labels.push("Un-assign Super Admin");
    if (matrixAdminAction === "assign") labels.push("Assign Matrix Admin");
    if (matrixAdminAction === "unassign") labels.push("Un-assign Matrix Admin");
    return labels;
  }, [superAdminAction, matrixAdminAction]);

  const canSubmit =
    parsed.valid.length > 0 &&
    Object.keys(updates).length > 0 &&
    !isSubmitting;

  const handleApply = async () => {
    if (parsed.valid.length === 0) {
      toast({
        title: "No valid emails",
        description: "Add at least one valid email address to continue.",
        variant: "destructive",
      });
      return;
    }

    if (Object.keys(updates).length === 0) {
      toast({
        title: "No changes selected",
        description: "Select at least one permission update to apply.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await UserService.bulkUpdatePermissions(
        parsed.valid,
        updates,
      );
      setLastResult(result);
      const missingCount = result.missingEmails?.length ?? 0;
      toast({
        title: "Bulk permissions updated",
        description:
          missingCount > 0
            ? `Updated ${result.updatedCount} users. ${missingCount} emails not found.`
            : `Updated ${result.updatedCount} users.`,
      });
    } catch (error) {
      toast({
        title: "Bulk update failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to update permissions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Bulk Permissions</h1>
        <p className="page-subtitle">
          Paste email addresses and apply permission changes in one action.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Email Addresses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder="Paste emails separated by commas, spaces, or new lines."
              className="min-h-[180px]"
            />
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Total: {parsed.total}</Badge>
              <Badge variant="secondary">Valid: {parsed.valid.length}</Badge>
              <Badge
                variant="secondary"
                className={cn(
                  parsed.invalid.length > 0 && "bg-red-100 text-red-700",
                )}
              >
                Invalid: {parsed.invalid.length}
              </Badge>
              <Badge variant="secondary">Duplicates: {parsed.duplicates.length}</Badge>
            </div>
            {parsed.invalid.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Invalid emails:{" "}
                {parsed.invalid.slice(0, 6).join(", ")}
                {parsed.invalid.length > 6
                  ? ` +${parsed.invalid.length - 6} more`
                  : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Super Admin</label>
              <Select
                value={superAdminAction}
                onValueChange={(value) =>
                  setSuperAdminAction(value as AssignAction)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select admin action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-change">No change</SelectItem>
                  <SelectItem value="assign">Assign Super Admin</SelectItem>
                  <SelectItem value="unassign">Un-assign Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Matrix Admin</label>
              <Select
                value={matrixAdminAction}
                onValueChange={(value) =>
                  setMatrixAdminAction(value as AssignAction)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select matrix action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-change">No change</SelectItem>
                  <SelectItem value="assign">Assign Matrix Admin</SelectItem>
                  <SelectItem value="unassign">Un-assign Matrix Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Changes to apply:
              </p>
              {updateLabels.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {updateLabels.map((label) => (
                    <Badge key={label} variant="secondary">
                      {label}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No permission changes selected.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handleApply} disabled={!canSubmit}>
                {isSubmitting ? "Applying..." : "Apply Permissions"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEmailInput("");
                  setSuperAdminAction("no-change");
                  setMatrixAdminAction("no-change");
                  setLastResult(null);
                }}
                disabled={isSubmitting}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {lastResult && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Last Update</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                Updated: {lastResult.updatedCount}
              </Badge>
              <Badge
                variant="secondary"
                className={cn(
                  lastResult.missingEmails.length > 0 &&
                    "bg-amber-100 text-amber-800",
                )}
              >
                Missing: {lastResult.missingEmails.length}
              </Badge>
            </div>
            {lastResult.missingEmails.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Missing emails:{" "}
                {lastResult.missingEmails.slice(0, 6).join(", ")}
                {lastResult.missingEmails.length > 6
                  ? ` +${lastResult.missingEmails.length - 6} more`
                  : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
