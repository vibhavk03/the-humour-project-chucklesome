"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  ExternalLink,
  Plus,
  Search,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Study } from "@/types/study";
import { StudiesService } from "@/services/studies.service";
import { StudyResultsService } from "@/services/study-results.service";
import { filterStudiesByRatingCount, STUDY_RATING_FILTERS } from "@/utils/study-rating-filter";
import { useTimeZone } from "@/components/TimeZoneContext";
import { CopyStudyLinkButton } from "@/components/study/CopyStudyLinkButton";
import { getStudySiteUrl, STUDY_SITE_HOST } from "@/utils/study-site";

const formatDateTime = (value: string | null | undefined, timeZone: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
};

const getDateTimeParts = (value: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
};

const toLocalInputValue = (value: string | null | undefined, timeZone: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = getDateTimeParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

const toIsoOrNull = (value: string, timeZone: string) => {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const guessParts = getDateTimeParts(utcGuess, timeZone);
  const guessDate = new Date(
    Date.UTC(
      Number(guessParts.year),
      Number(guessParts.month) - 1,
      Number(guessParts.day),
      Number(guessParts.hour),
      Number(guessParts.minute)
    )
  );
  const desiredDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const diffMs = desiredDate.getTime() - guessDate.getTime();
  return new Date(utcGuess.getTime() + diffMs).toISOString();
};

const getStudyLabel = (study: Study) =>
  study.slug?.trim() ? study.slug : `Study ${study.id}`;

export default function StudiesPage() {
  const { toast } = useToast();
  const { timeZone } = useTimeZone();
  const router = useRouter();
  const [studies, setStudies] = useState<Study[]>([]);
  const [isLoadingStudies, setIsLoadingStudies] = useState(true);
  const [studySearch, setStudySearch] = useState("");
  const [minimumRatingEvents, setMinimumRatingEvents] = useState(0);
  const [ratingCounts, setRatingCounts] = useState<Record<number, number>>({});
  const [ratingCountsLoading, setRatingCountsLoading] = useState(true);
  const [ratingCountsError, setRatingCountsError] = useState<string | null>(null);
  const [ratingCountsRefresh, setRatingCountsRefresh] = useState(0);

  const [isCreateStudyOpen, setIsCreateStudyOpen] = useState(false);
  const [editingStudy, setEditingStudy] = useState<Study | null>(null);
  const [deletingStudy, setDeletingStudy] = useState<Study | null>(null);
  const [updatingPrivacyStudyIds, setUpdatingPrivacyStudyIds] = useState<Set<number>>(
    new Set()
  );

  const [newStudySlug, setNewStudySlug] = useState("");
  const [newStudyDescription, setNewStudyDescription] = useState("");
  const [newStudyStart, setNewStudyStart] = useState("");
  const [newStudyEnd, setNewStudyEnd] = useState("");
  const [newStudyIsPrivate, setNewStudyIsPrivate] = useState(false);
  const [isSavingStudy, setIsSavingStudy] = useState(false);

  const [editStudySlug, setEditStudySlug] = useState("");
  const [editStudyDescription, setEditStudyDescription] = useState("");
  const [editStudyStart, setEditStudyStart] = useState("");
  const [editStudyEnd, setEditStudyEnd] = useState("");
  const [isUpdatingStudy, setIsUpdatingStudy] = useState(false);

  const loadStudies = async () => {
    setIsLoadingStudies(true);
    const data = await StudiesService.getAllStudies();
    setStudies(data);
    setIsLoadingStudies(false);
  };

  useEffect(() => {
    void loadStudies();
  }, []);

  // Depend on IDs, so editing study metadata doesn't refetch every count.
  const studyIdsKey = studies.map(study => study.id).sort((a, b) => a - b).join(',');
  useEffect(() => {
    const controller = new AbortController();
    const ids = studyIdsKey ? studyIdsKey.split(',').map(Number) : [];
    void StudyResultsService.getEventCounts(ids, controller.signal).then(counts => {
      if (!controller.signal.aborted) {
        setRatingCounts(counts);
        setRatingCountsError(null);
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        setRatingCountsError(cause instanceof Error ? cause.message : 'Could not load rating counts.');
        setMinimumRatingEvents(0);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setRatingCountsLoading(false);
    });
    return () => controller.abort();
  }, [studyIdsKey, ratingCountsRefresh]);

  // A newly created study may not have a count yet; keep it accessible.
  const countsReady = !isLoadingStudies && !ratingCountsLoading && !ratingCountsError &&
    studies.every(study => ratingCounts[study.id] !== undefined);

  const refreshRatingCounts = () => {
    setRatingCountsLoading(true);
    setRatingCountsError(null);
    setRatingCountsRefresh(value => value + 1);
  };

  const normalizedStudySearch = studySearch.trim().toLowerCase();
  const filteredStudies = useMemo(() => {
    const eligible = countsReady
      ? filterStudiesByRatingCount(studies, ratingCounts, minimumRatingEvents)
      : studies;
    if (!normalizedStudySearch) return eligible;
    return eligible.filter((study) => {
      return (
        String(study.id).includes(normalizedStudySearch) ||
        (study.slug ?? "").toLowerCase().includes(normalizedStudySearch) ||
        (study.description ?? "").toLowerCase().includes(normalizedStudySearch)
      );
    });
  }, [normalizedStudySearch, studies, ratingCounts, minimumRatingEvents, countsReady]);
  const currentlyShownStudy = useMemo(
    () => StudiesService.getCurrentlyShownStudy(studies),
    [studies]
  );

  const resetNewStudyForm = () => {
    setNewStudySlug("");
    setNewStudyDescription("");
    setNewStudyStart("");
    setNewStudyEnd("");
    setNewStudyIsPrivate(false);
  };

  const handleCreateStudy = async () => {
    if (!newStudySlug.trim()) {
      toast({
        title: "Missing slug",
        description: "Please provide a slug for this study.",
        variant: "destructive",
      });
      return;
    }

    const startIso = toIsoOrNull(newStudyStart, timeZone);
    const endIso = toIsoOrNull(newStudyEnd, timeZone);
    if (startIso && endIso && new Date(endIso) < new Date(startIso)) {
      toast({
        title: "Invalid date range",
        description: "The end time must be after the start time.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingStudy(true);
    const created = await StudiesService.createStudy({
      slug: newStudySlug.trim(),
      description: newStudyDescription.trim() || null,
      start_datetime_utc: startIso,
      end_datetime_utc: endIso,
      is_private: newStudyIsPrivate,
    });

    if (created) {
      toast({
        title: "Study created",
        description: `Created ${getStudyLabel(created)}.`,
      });
      resetNewStudyForm();
      setIsCreateStudyOpen(false);
      await loadStudies();
    } else {
      toast({
        title: "Failed to create study",
        description: "Please try again.",
        variant: "destructive",
      });
    }
    setIsSavingStudy(false);
  };

  const openEditStudy = (study: Study) => {
    setEditingStudy(study);
    setEditStudySlug(study.slug ?? "");
    setEditStudyDescription(study.description ?? "");
    setEditStudyStart(toLocalInputValue(study.start_datetime_utc, timeZone));
    setEditStudyEnd(toLocalInputValue(study.end_datetime_utc, timeZone));
  };

  const handleUpdateStudy = async () => {
    if (!editingStudy) return;
    if (!editStudySlug.trim()) {
      toast({
        title: "Missing slug",
        description: "Please provide a slug for this study.",
        variant: "destructive",
      });
      return;
    }

    const startIso = toIsoOrNull(editStudyStart, timeZone);
    const endIso = toIsoOrNull(editStudyEnd, timeZone);
    if (startIso && endIso && new Date(endIso) < new Date(startIso)) {
      toast({
        title: "Invalid date range",
        description: "The end time must be after the start time.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingStudy(true);
    const updated = await StudiesService.updateStudy(editingStudy.id, {
      slug: editStudySlug.trim(),
      description: editStudyDescription.trim() || null,
      start_datetime_utc: startIso,
      end_datetime_utc: endIso,
    });

    if (updated) {
      toast({
        title: "Study updated",
        description: `Updated ${getStudyLabel(updated)}.`,
      });
      setEditingStudy(null);
      await loadStudies();
    } else {
      toast({
        title: "Failed to update study",
        description: "Please try again.",
        variant: "destructive",
      });
    }
    setIsUpdatingStudy(false);
  };

  const handleDeleteStudy = async () => {
    if (!deletingStudy) return;
    const success = await StudiesService.deleteStudy(deletingStudy.id);
    if (success) {
      toast({
        title: "Study deleted",
        description: `${getStudyLabel(deletingStudy)} removed.`,
      });
      setDeletingStudy(null);
      await loadStudies();
    } else {
      toast({
        title: "Failed to delete study",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleToggleStudyPrivacy = async (study: Study, isPublic: boolean) => {
    setUpdatingPrivacyStudyIds((previous) => new Set(previous).add(study.id));
    const updated = isPublic
      ? await StudiesService.publishStudy(study.id, {})
      : await StudiesService.updateStudy(study.id, { is_private: true });

    if (updated) {
      setStudies((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      toast({
        title: isPublic ? "Study made public" : "Study made private",
        description: `${getStudyLabel(updated)} is now ${isPublic ? "public" : "private"}.`,
      });
    } else {
      toast({
        title: "Failed to update privacy",
        description: "Please try again.",
        variant: "destructive",
      });
    }

    setUpdatingPrivacyStudyIds((previous) => {
      const next = new Set(previous);
      next.delete(study.id);
      return next;
    });
  };

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="page-header">
          <h1 className="page-title">Studies</h1>
          <p className="page-subtitle">
            Manage study windows and caption assignments.
          </p>
        </div>
        <Button onClick={() => setIsCreateStudyOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Study
        </Button>
      </div>

      <section aria-labelledby="current-study-heading">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id="current-study-heading" className="text-xl font-semibold tracking-tight">
            Current study active
          </h2>
        </div>

        {isLoadingStudies ? (
          <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
            <CardContent className="flex min-h-32 items-center justify-center p-6">
              <div className="text-center">
                <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading active study...</p>
              </div>
            </CardContent>
          </Card>
        ) : currentlyShownStudy ? (
          <Card
            role="link"
            tabIndex={0}
            aria-label={`View ${getStudyLabel(currentlyShownStudy)}`}
            onClick={() => router.push(`/study/${currentlyShownStudy.id}`)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                router.push(`/study/${currentlyShownStudy.id}`);
              }
            }}
            className="group cursor-pointer overflow-hidden border-2 border-emerald-500 bg-emerald-50/60 shadow-sm transition-all hover:border-emerald-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-in fade-in-0 slide-in-from-bottom-2 dark:border-emerald-600 dark:bg-emerald-950/20 dark:hover:border-emerald-500"
          >
            <CardContent className="p-0">
              <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <Badge className="bg-emerald-600 font-sans text-white hover:bg-emerald-600">
                    THIS IS THE ACTIVE STUDY
                  </Badge>
                  <div>
                    <h3 className="text-left text-2xl font-semibold tracking-tight group-hover:underline group-hover:underline-offset-4">
                      {getStudyLabel(currentlyShownStudy)}
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      {currentlyShownStudy.description || "No description provided."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <p>
                      <span className="font-medium">Id:</span>{" "}
                      <span className="text-muted-foreground">{currentlyShownStudy.id}</span>
                    </p>
                    <p>
                      <span className="font-medium">Start:</span>{" "}
                      <span className="text-muted-foreground">
                        {formatDateTime(currentlyShownStudy.start_datetime_utc, timeZone)}
                      </span>
                    </p>
                    <p>
                      <span className="font-medium">End:</span>{" "}
                      <span className="text-muted-foreground">
                        {formatDateTime(currentlyShownStudy.end_datetime_utc, timeZone)}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" asChild>
                    <a
                      href={getStudySiteUrl(currentlyShownStudy.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Open public study
                      <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
                    </a>
                  </Button>
                  <CopyStudyLinkButton url={getStudySiteUrl(currentlyShownStudy.id)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed animate-in fade-in-0 slide-in-from-bottom-2">
            <CardContent className="flex min-h-32 items-center justify-center p-6 text-center">
              <div>
                <p className="text-lg font-medium">No study active.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Make a study public and set its schedule to include the current time.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">All studies</h2>
          <p className="text-sm text-muted-foreground">
            Browse and manage every study.
          </p>
        </div>
      </div>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search studies..."
                value={studySearch}
                onChange={(e) => setStudySearch(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="study-rating-filter">Rating data</Label>
                <select
                  id="study-rating-filter"
                  value={minimumRatingEvents}
                  onChange={event => setMinimumRatingEvents(Number(event.target.value))}
                  disabled={!countsReady}
                  aria-describedby="study-rating-help"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                >
                  {STUDY_RATING_FILTERS.map(option => (
                    <option key={option.minimum} value={option.minimum}>{option.label}</option>
                  ))}
                </select>
              </div>
              <Button variant="outline" disabled={isLoadingStudies || (!countsReady && !ratingCountsError)} onClick={refreshRatingCounts}>
                Refresh counts
              </Button>
              <Badge variant="secondary" className="mb-2 font-sans" role="status">
                {filteredStudies.length} of {studies.length} studies
              </Badge>
            </div>
          </div>
          <p id="study-rating-help" className="text-sm text-muted-foreground">
            Filter by recorded rating events to find studies with more feedback. Events can include repeat votes;
            the Results tab counts each participant’s latest rating per caption. These thresholds are browsing aids.
            Studies with few or no ratings can still be opened using All studies.
          </p>
          {!countsReady && !ratingCountsError && !isLoadingStudies && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading rating counts. All studies remain available.
            </p>
          )}
          {ratingCountsError && (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
              <p>{ratingCountsError} Showing all studies without a rating filter.</p>
              <Button variant="outline" size="sm" onClick={refreshRatingCounts}>Retry counts</Button>
            </div>
          )}
          <div className="table-shell">
            <div className="overflow-x-auto">
              <table className="min-w-full table-base">
                <thead className="table-head">
                  <tr>
                    <th>Id</th>
                    <th>Slug</th>
                    <th className="text-right">Rating events</th>
                    <th>Public study</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Privacy</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {isLoadingStudies ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center">
                        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Loading studies...
                        </p>
                      </td>
                    </tr>
                  ) : filteredStudies.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                        <p>No studies match your search and rating filter.</p>
                        {minimumRatingEvents > 0 && (
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => setMinimumRatingEvents(0)}>
                            Show all rating levels
                          </Button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredStudies.map((study) => (
                        <tr
                          key={study.id}
                          className="hover:bg-muted/50 transition-colors animate-in fade-in-0 cursor-pointer"
                          onClick={() => router.push(`/study/${study.id}`)}
                        >
                          <td className="font-sans text-muted-foreground">
                            {study.id}
                          </td>
                          <td className="font-medium">{study.slug || "-"}</td>
                          <td className="text-right tabular-nums">
                            {countsReady ? ratingCounts[study.id].toLocaleString() : ratingCountsError ? 'Unavailable' : 'Loading…'}
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <a
                                href={getStudySiteUrl(study.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-blue-700 underline underline-offset-4 hover:text-blue-800"
                              >
                                {STUDY_SITE_HOST}/study/{study.id}
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              </a>
                              <CopyStudyLinkButton url={getStudySiteUrl(study.id)} />
                            </div>
                          </td>
                          <td className="text-muted-foreground">
                            {formatDateTime(study.start_datetime_utc, timeZone)}
                          </td>
                          <td className="text-muted-foreground">
                            {formatDateTime(study.end_datetime_utc, timeZone)}
                          </td>
                          <td>
                            <div
                              className="flex items-center gap-3"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Switch
                                checked={!study.is_private}
                                disabled={updatingPrivacyStudyIds.has(study.id)}
                                className="data-[state=checked]:bg-gray-600 data-[state=unchecked]:bg-gray-300 dark:data-[state=checked]:bg-gray-500 dark:data-[state=unchecked]:bg-gray-700"
                                onCheckedChange={(checked) =>
                                  void handleToggleStudyPrivacy(study, checked)
                                }
                                aria-label={`${study.is_private ? "Make public" : "Make private"} ${getStudyLabel(study)}`}
                              />
                              <Badge
                                variant={study.is_private ? "outline" : "secondary"}
                                className="font-sans"
                              >
                                {study.is_private ? "Private" : "Public"}
                              </Badge>
                            </div>
                          </td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  router.push(`/study/${study.id}`);
                                }}
                                aria-label={`View ${getStudyLabel(study)} details`}
                                title="View study details"
                              >
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditStudy(study);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeletingStudy(study);
                                }}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isCreateStudyOpen}
        onOpenChange={(open) => {
          setIsCreateStudyOpen(open);
          if (!open) resetNewStudyForm();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Study</DialogTitle>
            <DialogDescription>
              Add a new study window and description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                placeholder="e.g., fall-2024"
                value={newStudySlug}
                onChange={(e) => setNewStudySlug(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional details for this study..."
                value={newStudyDescription}
                onChange={(e) => setNewStudyDescription(e.target.value)}
                className="min-h-[90px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-study-is-private">Private</Label>
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
                <Checkbox
                  id="create-study-is-private"
                  checked={newStudyIsPrivate}
                  onCheckedChange={(checked) => setNewStudyIsPrivate(checked === true)}
                />
                <Label
                  htmlFor="create-study-is-private"
                  className="text-sm font-normal text-muted-foreground"
                >
                  Keep this study private until you make it public
                </Label>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start (optional)</Label>
                <Input
                  type="datetime-local"
                  value={newStudyStart}
                  onChange={(e) => setNewStudyStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End (optional)</Label>
                <Input
                  type="datetime-local"
                  value={newStudyEnd}
                  onChange={(e) => setNewStudyEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsCreateStudyOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateStudy} disabled={isSavingStudy}>
              {isSavingStudy ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                "Create Study"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingStudy}
        onOpenChange={(open) => {
          if (!open) setEditingStudy(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Study</DialogTitle>
            <DialogDescription>
              Update study details and timing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={editStudySlug}
                onChange={(e) => setEditStudySlug(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional details for this study..."
                value={editStudyDescription}
                onChange={(e) => setEditStudyDescription(e.target.value)}
                className="min-h-[90px]"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start (optional)</Label>
                <Input
                  type="datetime-local"
                  value={editStudyStart}
                  onChange={(e) => setEditStudyStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End (optional)</Label>
                <Input
                  type="datetime-local"
                  value={editStudyEnd}
                  onChange={(e) => setEditStudyEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingStudy(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateStudy} disabled={isUpdatingStudy}>
              {isUpdatingStudy ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingStudy}
        onOpenChange={(open) => {
          if (!open) setDeletingStudy(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete study?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deletingStudy ? getStudyLabel(deletingStudy) : "this study"}?
              This removes the study and any related caption mappings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStudy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
