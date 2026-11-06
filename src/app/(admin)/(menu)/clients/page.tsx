"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Copy,
  KeyRound,
  MoreVertical,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { AuthClientsService } from "@/services/auth-clients.service";
import type {
  AuthClientRow,
  AuthClientSort,
  AuthClientSortColumn,
  ProfileNameRow,
} from "@/types/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface NewClientDraft {
  clientId: string;
  clientSecret: string;
}

const tokenEndpointPath = "/v1/oauth/token";
const defaultApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.almostcrackd.ai";

const apiEnvironments = [
  {
    name: "Staging",
    baseUrl: "https://api.almostcrackd.ai",
  },
  {
    name: "Production",
    baseUrl: "https://api.crackd.ai",
  },
];

const tokenRequestExample = `curl -X POST ${defaultApiBaseUrl}${tokenEndpointPath} \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "client_credentials",
    "client_id": "<client_id>",
    "client_secret": "<client_secret>"
  }'`;

const tokenResponseExample = `{
  "access_token": "<access-token>",
  "token_type": "Bearer",
  "expires_in": 300,
  "scope": "",
  "subject_type": "client"
}`;

const defaultSort: AuthClientSort = {
  column: "client_id",
  direction: "asc",
};

function normalizeSearch(value: string): string {
  return value.toLowerCase().trim();
}

function tokenEndpointUrl(baseUrl: string): string {
  return `${baseUrl}${tokenEndpointPath}`;
}

function rowLabel(row: AuthClientRow): string {
  return row.client_id || String(row.id);
}

function profileNameLabel(
  userId: string | null,
  profilesById: Record<string, ProfileNameRow>,
): string {
  if (!userId) return "-";
  const profile = profilesById[userId];
  if (!profile) return "-";

  const name = [profile.first_name, profile.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  return name || "-";
}

function profileEmailLabel(
  userId: string | null,
  profilesById: Record<string, ProfileNameRow>,
): string | null {
  if (!userId) return null;
  const email = profilesById[userId]?.email?.trim();
  return email || null;
}

function sortByProfileName(
  rows: AuthClientRow[],
  profilesById: Record<string, ProfileNameRow>,
  direction: AuthClientSort["direction"],
  column: "created_by_user_id" | "modified_by_user_id",
): AuthClientRow[] {
  const directionFactor = direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const byName =
      profileNameLabel(a[column], profilesById).localeCompare(
        profileNameLabel(b[column], profilesById),
      ) * directionFactor;

    return byName || a.client_id.localeCompare(b.client_id) || a.id - b.id;
  });
}

function sortIconFor(
  column: AuthClientSortColumn,
  sort: AuthClientSort,
): typeof ArrowUpDown {
  if (sort.column !== column) return ArrowUpDown;
  return sort.direction === "asc" ? ArrowUp : ArrowDown;
}

export default function ClientsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AuthClientRow[]>([]);
  const [userProfilesById, setUserProfilesById] = useState<
    Record<string, ProfileNameRow>
  >({});
  const [newDraft, setNewDraft] = useState<NewClientDraft>({
    clientId: "",
    clientSecret: "",
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<AuthClientSort>(defaultSort);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenInstructionsOpen, setTokenInstructionsOpen] = useState(false);
  const [copiedTokenEndpoint, setCopiedTokenEndpoint] = useState<string | null>(
    null,
  );
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [resetSecretForId, setResetSecretForId] = useState<number | null>(null);
  const [resetSecret, setResetSecret] = useState("");
  const [savedFlash, setSavedFlash] = useState<number | null>(null);
  const loadRequestId = useRef(0);

  const activeResetSecretRow =
    resetSecretForId !== null
      ? rows.find((row) => row.id === resetSecretForId) ?? null
      : null;
  const activeResetSecretError = activeResetSecretRow
    ? rowErrors[String(activeResetSecretRow.id)]
    : null;

  const loadClients = useCallback(async () => {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;

    setLoading(true);
    setLoadError(null);

    const res = await AuthClientsService.list({ sort });
    if (requestId !== loadRequestId.current) return;

    if (res.error) {
      setLoadError(res.error.message);
      setRows([]);
      setUserProfilesById({});
      setLoading(false);
      return;
    }

    const userIds = res.data
      .flatMap((row) => [row.created_by_user_id, row.modified_by_user_id])
      .filter((id): id is string => id !== null);
    const profileRes = await AuthClientsService.listProfileNamesByIds(userIds);
    if (requestId !== loadRequestId.current) return;

    if (profileRes.error) {
      setLoadError(profileRes.error.message);
      setRows([]);
      setUserProfilesById({});
      setLoading(false);
      return;
    }

    const profilesById = Object.fromEntries(
      profileRes.data.map((profile) => [profile.id, profile]),
    );

    setUserProfilesById(profilesById);
    setRows(
      sort.column === "created_by_user_id" ||
        sort.column === "modified_by_user_id"
        ? sortByProfileName(res.data, profilesById, sort.direction, sort.column)
        : res.data,
    );
    setRowErrors({});
    setResetSecretForId(null);
    setResetSecret("");
    setLoading(false);
  }, [sort]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!copiedTokenEndpoint) return;

    const timeout = window.setTimeout(() => setCopiedTokenEndpoint(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [copiedTokenEndpoint]);

  const filteredRows = useMemo(() => {
    const needle = normalizeSearch(debouncedSearch);
    if (!needle) return rows;

    return rows.filter((row) => {
      const createdBy = profileNameLabel(row.created_by_user_id, userProfilesById);
      const modifiedBy = profileNameLabel(row.modified_by_user_id, userProfilesById);

      return [
        String(row.id),
        row.client_id,
        createdBy,
        modifiedBy,
        profileEmailLabel(row.created_by_user_id, userProfilesById) ?? "",
        profileEmailLabel(row.modified_by_user_id, userProfilesById) ?? "",
      ].some((value) => normalizeSearch(value).includes(needle));
    });
  }, [debouncedSearch, rows, userProfilesById]);

  function ariaSortFor(
    column: AuthClientSortColumn,
  ): "ascending" | "descending" | "none" {
    if (sort.column !== column) return "none";
    return sort.direction === "asc" ? "ascending" : "descending";
  }

  function nextSortLabel(column: AuthClientSortColumn): string {
    if (sort.column !== column) return "ascending";
    return sort.direction === "asc" ? "descending" : "ascending";
  }

  function sortClientsBy(column: AuthClientSortColumn) {
    setSort((prev) => {
      if (prev.column !== column) {
        return { column, direction: "asc" };
      }

      return {
        column,
        direction: prev.direction === "asc" ? "desc" : "asc",
      };
    });
  }

  function renderSortHeader(
    column: AuthClientSortColumn,
    label: string,
    align: "left" | "right" = "left",
  ) {
    const SortIcon = sortIconFor(column, sort);
    const active = sort.column === column;

    return (
      <button
        type="button"
        onClick={() => sortClientsBy(column)}
        disabled={loading}
        aria-label={`Sort clients by ${label} ${nextSortLabel(column)}`}
        className={cn(
          "inline-flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
          align === "right" ? "justify-end text-right" : "justify-start text-left",
        )}
      >
        <span>{label}</span>
        <SortIcon
          aria-hidden="true"
          className={cn("h-3.5 w-3.5", active && "text-primary")}
        />
      </button>
    );
  }

  function openCreateModal() {
    setResetSecretForId(null);
    setResetSecret("");
    setCreateError(null);
    setNewDraft({ clientId: "", clientSecret: "" });
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    if (creating) return;
    setCreateModalOpen(false);
    setCreateError(null);
    setNewDraft({ clientId: "", clientSecret: "" });
  }

  function closeResetSecretModal() {
    if (actingId !== null) return;

    if (resetSecretForId !== null) {
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[String(resetSecretForId)];
        return next;
      });
    }

    setResetSecretForId(null);
    setResetSecret("");
  }

  async function copyTokenEndpoint(environmentName: string, endpointUrl: string) {
    try {
      await navigator.clipboard.writeText(endpointUrl);
      setCopiedTokenEndpoint(environmentName);
    } catch {
      setCopiedTokenEndpoint(null);
    }
  }

  async function createClientRow() {
    if (creating || actingId !== null) return;

    const clientId = newDraft.clientId.trim();
    if (!clientId) {
      setCreateError("Client ID is required.");
      return;
    }
    if (!newDraft.clientSecret.length) {
      setCreateError("Client secret is required.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    const res = await AuthClientsService.create({
      client_id: clientId,
      client_secret: newDraft.clientSecret,
    });

    if (res.error) {
      setCreateError(res.error.message);
    } else if (res.data) {
      const savedId = res.data.id;
      setNewDraft({ clientId: "", clientSecret: "" });
      setCreateModalOpen(false);
      await loadClients();
      setSavedFlash(savedId);
      toast({
        title: "Client created",
        description: `Created "${res.data.client_id}".`,
      });
      window.setTimeout(() => {
        setSavedFlash((current) => (current === savedId ? null : current));
      }, 2500);
    }

    setCreating(false);
  }

  function openResetSecret(row: AuthClientRow) {
    setCreateModalOpen(false);
    setResetSecretForId(row.id);
    setResetSecret("");
    setSavedFlash(null);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[String(row.id)];
      return next;
    });
  }

  async function saveSecretReset(row: AuthClientRow) {
    if (actingId !== null || creating) return;

    if (!resetSecret.length) {
      setRowErrors((prev) => ({
        ...prev,
        [row.id]: "New client secret is required.",
      }));
      return;
    }

    setActingId(row.id);
    setSavedFlash(null);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[String(row.id)];
      return next;
    });

    const res = await AuthClientsService.update(row.id, {
      client_secret: resetSecret,
    });

    if (res.error) {
      setRowErrors((prev) => ({
        ...prev,
        [row.id]: res.error?.message ?? "Secret reset failed.",
      }));
    } else if (res.data) {
      const savedId = res.data.id;
      setResetSecretForId(null);
      setResetSecret("");
      await loadClients();
      setSavedFlash(savedId);
      toast({
        title: "Secret reset",
        description: `Updated "${res.data.client_id}".`,
      });
      window.setTimeout(() => {
        setSavedFlash((current) => (current === savedId ? null : current));
      }, 2500);
    }

    setActingId(null);
  }

  async function deleteRow(row: AuthClientRow) {
    if (actingId !== null || creating) return;
    const confirmed = window.confirm(`Delete client "${rowLabel(row)}"?`);
    if (!confirmed) return;

    setActingId(row.id);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[String(row.id)];
      return next;
    });

    const res = await AuthClientsService.remove(row.id);

    if (res.error) {
      setRowErrors((prev) => ({
        ...prev,
        [row.id]: res.error?.message ?? "Delete failed.",
      }));
      toast({
        title: "Delete failed",
        description: res.error.message,
        variant: "destructive",
      });
    } else {
      await loadClients();
      toast({
        title: "Client deleted",
        description: `Deleted "${rowLabel(row)}".`,
      });
    }

    setActingId(null);
  }

  return (
    <div className="page-shell">
      <div className="page-header gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">
            Create and maintain OAuth clients for Crackd API integrations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setTokenInstructionsOpen(true)}
          >
            <KeyRound className="h-4 w-4" />
            Token Instructions
          </Button>
          <Button
            type="button"
            onClick={openCreateModal}
            disabled={creating || actingId !== null}
          >
            <Plus className="h-4 w-4" />
            New Client
          </Button>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="font-medium">Unable to load clients</div>
          <div className="mt-1">{loadError}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void loadClients()}
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      ) : null}

      {!loadError ? (
        <section className="table-shell">
          <div className="border-b border-border/70 p-4">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Search clients
              </span>
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Id, client ID, or profile"
                aria-label="Search clients"
              />
              {!loading && rows.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  Showing{" "}
                  <span className="font-medium text-foreground">
                    {filteredRows.length}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-foreground">
                    {rows.length}
                  </span>{" "}
                  clients
                </span>
              ) : null}
            </label>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="h-10 animate-pulse rounded-md bg-muted"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">
              No rows were returned from public.auth_clients.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">
              No matching clients.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base w-full min-w-[1080px]">
                <thead className="table-head">
                  <tr>
                    <th aria-sort={ariaSortFor("id")}>
                      {renderSortHeader("id", "Id")}
                    </th>
                    <th aria-sort={ariaSortFor("client_id")}>
                      {renderSortHeader("client_id", "Client ID")}
                    </th>
                    <th aria-sort={ariaSortFor("token_count")}>
                      {renderSortHeader("token_count", "Tokens")}
                    </th>
                    <th aria-sort={ariaSortFor("created_by_user_id")}>
                      {renderSortHeader("created_by_user_id", "Created By")}
                    </th>
                    <th aria-sort={ariaSortFor("modified_by_user_id")}>
                      {renderSortHeader("modified_by_user_id", "Modified By")}
                    </th>
                    <th className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const busy = actingId === row.id;
                    const rowError = rowErrors[String(row.id)];
                    const createdByEmail = profileEmailLabel(
                      row.created_by_user_id,
                      userProfilesById,
                    );
                    const modifiedByEmail = profileEmailLabel(
                      row.modified_by_user_id,
                      userProfilesById,
                    );

                    return (
                      <tr key={row.id}>
                        <td>
                          <span className="font-mono text-xs tabular-nums">
                            {row.id}
                          </span>
                        </td>
                        <td>
                          <div className="break-all text-sm text-foreground">
                            {row.client_id}
                          </div>
                        </td>
                        <td>
                          <Badge variant="secondary">
                            {row.token_count.toLocaleString()}
                          </Badge>
                        </td>
                        <td>
                          <div className="grid gap-0.5 text-sm">
                            <span>
                              {profileNameLabel(
                                row.created_by_user_id,
                                userProfilesById,
                              )}
                            </span>
                            {createdByEmail ? (
                              <span className="break-all text-xs text-muted-foreground">
                                {createdByEmail}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className="grid gap-0.5 text-sm">
                            <span>
                              {profileNameLabel(
                                row.modified_by_user_id,
                                userProfilesById,
                              )}
                            </span>
                            {modifiedByEmail ? (
                              <span className="break-all text-xs text-muted-foreground">
                                {modifiedByEmail}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center justify-end gap-2">
                              {savedFlash === row.id ? (
                                <span
                                  className="text-sm font-medium text-emerald-600"
                                  role="status"
                                >
                                  Saved
                                </span>
                              ) : null}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label={`Actions for ${rowLabel(row)}`}
                                    disabled={busy || actingId !== null || creating}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openResetSecret(row)}>
                                    <RotateCcw className="h-4 w-4" />
                                    Reset Secret
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => void deleteRow(row)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            {rowError && resetSecretForId !== row.id ? (
                              <p
                                className="max-w-[17rem] text-right text-xs text-destructive"
                                role="alert"
                              >
                                {rowError}
                              </p>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <Dialog open={tokenInstructionsOpen} onOpenChange={setTokenInstructionsOpen}>
        <DialogContent className="max-h-[calc(100vh-3rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Token Instructions</DialogTitle>
            <DialogDescription>
              Use the one-time client secret with the client ID to request an OAuth
              2.0 client credentials token.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="grid content-start gap-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Token endpoint
                </h3>
                <div className="mt-2 grid gap-2">
                  {apiEnvironments.map((environment) => {
                    const endpointUrl = tokenEndpointUrl(environment.baseUrl);
                    const copied = copiedTokenEndpoint === environment.name;

                    return (
                      <div key={environment.name} className="grid gap-1 text-sm">
                        <span className="font-medium">{environment.name}</span>
                        <div className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2">
                          <code className="break-all rounded-md bg-muted px-2 py-1 text-muted-foreground">
                            POST {endpointUrl}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              void copyTokenEndpoint(environment.name, endpointUrl)
                            }
                            aria-label={`Copy ${environment.name} token endpoint URL to clipboard`}
                            title="Copy to clipboard"
                          >
                            {copied ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-2 text-sm text-muted-foreground">
                <p>Send JSON with a client ID and the raw client secret.</p>
                <p>Use the returned access token as an opaque bearer token.</p>
                <code className="break-all rounded-md bg-muted px-2 py-1">
                  Authorization: Bearer {"<access-token>"}
                </code>
              </div>
            </div>
            <div className="grid content-start gap-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Request
                </h3>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-5 text-zinc-50">
                  <code>{tokenRequestExample}</code>
                </pre>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Response
                </h3>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-5 text-zinc-50">
                  <code>{tokenResponseExample}</code>
                </pre>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(activeResetSecretRow)}
        onOpenChange={(open) => {
          if (!open) closeResetSecretModal();
        }}
      >
        <DialogContent className="max-w-lg">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (activeResetSecretRow) void saveSecretReset(activeResetSecretRow);
            }}
          >
            <DialogHeader>
              <DialogTitle>Reset Secret</DialogTitle>
              <DialogDescription>
                The new raw client secret is hashed before it is saved.
              </DialogDescription>
            </DialogHeader>
            {activeResetSecretRow ? (
              <div className="grid gap-4">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Client ID
                  </span>
                  <Input
                    value={activeResetSecretRow.client_id}
                    readOnly
                    aria-label="Client ID"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    New client secret
                  </span>
                  <Input
                    type="password"
                    autoComplete="off"
                    data-1p-ignore="true"
                    value={resetSecret}
                    onChange={(event) => setResetSecret(event.target.value)}
                    aria-label={`New client secret for ${rowLabel(
                      activeResetSecretRow,
                    )}`}
                    autoFocus
                  />
                </label>
                {activeResetSecretError ? (
                  <p
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    role="alert"
                  >
                    {activeResetSecretError}
                  </p>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeResetSecretModal}
                disabled={actingId !== null}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={actingId !== null || creating}>
                {actingId === activeResetSecretRow?.id ? "Saving..." : "Save Secret"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createModalOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateModal();
          else setCreateModalOpen(true);
        }}
      >
        <DialogContent className="max-w-lg">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createClientRow();
            }}
          >
            <DialogHeader>
              <DialogTitle>New Client</DialogTitle>
              <DialogDescription>
                Save the raw client secret before closing this form.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Client ID
                </span>
                <Input
                  value={newDraft.clientId}
                  onChange={(event) =>
                    setNewDraft((prev) => ({
                      ...prev,
                      clientId: event.target.value,
                    }))
                  }
                  aria-label="New client ID"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Client secret
                </span>
                <Input
                  type="password"
                  autoComplete="off"
                  data-1p-ignore="true"
                  value={newDraft.clientSecret}
                  onChange={(event) =>
                    setNewDraft((prev) => ({
                      ...prev,
                      clientSecret: event.target.value,
                    }))
                  }
                  aria-label="New client secret"
                />
              </label>
              {createError ? (
                <p
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  role="alert"
                >
                  {createError}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateModal}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || actingId !== null}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
