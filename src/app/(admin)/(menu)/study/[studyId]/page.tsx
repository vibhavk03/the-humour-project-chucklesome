"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DedupeReview from "@/components/study/DedupeReview";
import StudyResults from "@/components/study/StudyResults";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyStudyLinkButton } from "@/components/study/CopyStudyLinkButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type {
  Study,
  StudyCaptionMappingWithCaptionDetails,
} from "@/types/study";
import {
  StudiesService,
  StudyCaptionMappingsService,
} from "@/services/studies.service";
import { useTimeZone } from "@/components/TimeZoneContext";
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

const getStudyLabel = (study: Study) =>
  study.slug?.trim() ? study.slug : `Study ${study.id}`;

const getStudyShownStatus = (study: Study, shownStudy: Study | null) => {
  if (shownStudy?.id === study.id) {
    return {
      label: "Shown now",
      description: "This is the highest-id active public study.",
      variant: "secondary" as const,
    };
  }
  if (StudiesService.isStudyActiveAt(study)) {
    return {
      label: "Not shown",
      description: shownStudy
        ? `${getStudyLabel(shownStudy)} has the highest active id.`
        : "No active study is currently selected.",
      variant: "outline" as const,
    };
  }
  if (study.is_private) {
    return {
      label: "Private",
      description: "Make public to make this study eligible.",
      variant: "outline" as const,
    };
  }
  return {
    label: "Inactive",
    description: "This study is outside the current date window.",
    variant: "outline" as const,
  };
};

const parseStudyId = (value: unknown) => {
  const parsed = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const getResponseTime = (value?: string | null) => {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

type CaptionFlavorInfo = {
  flavorId: number | null;
  flavorSlug: string | null;
};

const resolveCaptionFlavor = (
  caption?: StudyCaptionMappingWithCaptionDetails["captions"] | null
): CaptionFlavorInfo => {
  const captionFlavorSlug = caption?.humor_flavors?.slug ?? null;
  const captionFlavorId = caption?.humor_flavor_id ?? null;

  let flavorSlug = captionFlavorSlug;
  let flavorId = captionFlavorId;

  if (!flavorSlug && flavorId == null) {
    const requestRaw = caption?.caption_requests;
    const requests = Array.isArray(requestRaw)
      ? requestRaw
      : requestRaw
        ? [requestRaw]
        : [];
    const responses = requests.flatMap((request) => {
      const rawResponses = request?.llm_model_responses;
      if (!rawResponses) return [];
      return Array.isArray(rawResponses) ? rawResponses : [rawResponses];
    });

    const primaryResponse = responses.reduce<
      (typeof responses)[number] | null
    >((current, response) => {
      if (!response) return current;
      if (!current) return response;
      const responseHasFlavor =
        Boolean(response?.humor_flavors?.slug) ||
        response?.humor_flavor_id != null;
      const currentHasFlavor =
        Boolean(current?.humor_flavors?.slug) ||
        current?.humor_flavor_id != null;
      if (responseHasFlavor && !currentHasFlavor) return response;
      if (!responseHasFlavor && currentHasFlavor) return current;
      return getResponseTime(response?.created_datetime_utc) >
        getResponseTime(current?.created_datetime_utc)
        ? response
        : current;
    }, null);

    flavorSlug = primaryResponse?.humor_flavors?.slug ?? null;
    flavorId = primaryResponse?.humor_flavor_id ?? null;
  }

  return { flavorId, flavorSlug };
};

const ITEMS_PER_PAGE = 10;
type CaptionSortKey = "imageUrl" | "flavorLabel";
type SortDirection = "asc" | "desc";

export default function StudyDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { timeZone } = useTimeZone();

  const studyId = useMemo(() => {
    const raw = params?.studyId;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const paramId = parseStudyId(value);
    if (paramId != null) return paramId;
    if (!pathname) return null;
    const match = pathname.match(/\/study\/([^/]+)/);
    if (!match) return null;
    return parseStudyId(match[1]);
  }, [params, pathname]);

  const [study, setStudy] = useState<Study | null>(null);
  const [studies, setStudies] = useState<Study[]>([]);
  const [isLoadingStudy, setIsLoadingStudy] = useState(true);
  const [mappings, setMappings] = useState<StudyCaptionMappingWithCaptionDetails[]>([]);
  const [isLoadingMappings, setIsLoadingMappings] = useState(true);
  const [captionSearch, setCaptionSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{
    key: CaptionSortKey | null;
    direction: SortDirection;
  }>({
    key: null,
    direction: "desc",
  });
  const [captionsView, setCaptionsView] = useState<"table" | "card">("table");
  const [selectedFlavorLabels, setSelectedFlavorLabels] = useState<string[]>([]);
  const [deletingMapping, setDeletingMapping] =
    useState<StudyCaptionMappingWithCaptionDetails | null>(null);
  const [isDeletingMapping, setIsDeletingMapping] = useState(false);
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [dedupeFinished, setDedupeFinished] = useState(false);
  const [dedupeStarted, setDedupeStarted] = useState(false);

  useEffect(() => {
    setDedupeFinished(false);
    setDedupeStarted(false);
  }, [studyId]);

  useEffect(() => {
    let active = true;
    if (studyId == null) {
      setStudy(null);
      setIsLoadingStudy(false);
      return;
    }

    const loadStudy = async () => {
      setIsLoadingStudy(true);
      const [data, studiesData] = await Promise.all([
        StudiesService.getStudyById(studyId),
        StudiesService.getAllStudies(),
      ]);
      if (!active) return;
      setStudy(data);
      setStudies(studiesData);
      setIsLoadingStudy(false);
      if (!data) {
        toast({
          title: "Study not found",
          description: "We couldn't find details for this study.",
          variant: "destructive",
        });
      }
    };

    void loadStudy();
    return () => {
      active = false;
    };
  }, [studyId, toast]);

  useEffect(() => {
    let active = true;
    if (studyId == null) {
      setMappings([]);
      setIsLoadingMappings(false);
      return;
    }

    const loadMappings = async () => {
      setIsLoadingMappings(true);
      const data = await StudyCaptionMappingsService.getMappingsByStudyId(studyId);
      if (!active) return;
      setMappings(data);
      setIsLoadingMappings(false);
    };

    void loadMappings();
    return () => {
      active = false;
    };
  }, [studyId]);

  const rows = useMemo(() => {
    return mappings.map((mapping) => {
      const caption = mapping.captions;
      const captionId = caption?.id ?? mapping.caption_id ?? "-";
      const imageUrl = caption?.images?.url ?? null;
      const { flavorId, flavorSlug } = resolveCaptionFlavor(caption);
      const flavorLabel = flavorSlug
        ? flavorSlug
        : flavorId != null
          ? `Flavor ${flavorId}`
          : "-";

      return {
        mapping,
        captionId,
        imageUrl,
        captionContent: caption?.content ?? "No caption content",
        flavorLabel,
      };
    });
  }, [mappings]);

  const availableFlavorLabels = useMemo(() => {
    return [...new Set(rows.map((row) => row.flavorLabel))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [rows]);

  useEffect(() => {
    setSelectedFlavorLabels((previous) => {
      if (previous.length === 0) return availableFlavorLabels;
      const previousSet = new Set(previous);
      const next = previous.filter((flavor) =>
        availableFlavorLabels.includes(flavor)
      );
      for (const flavor of availableFlavorLabels) {
        if (!previousSet.has(flavor)) {
          next.push(flavor);
        }
      }
      return next;
    });
  }, [availableFlavorLabels]);

  const selectedFlavorLabelSet = useMemo(
    () => new Set(selectedFlavorLabels),
    [selectedFlavorLabels]
  );

  const flavorFilteredRows = useMemo(
    () => rows.filter((row) => selectedFlavorLabelSet.has(row.flavorLabel)),
    [rows, selectedFlavorLabelSet]
  );

  const isLoadingCaptions = isLoadingMappings;
  const currentlyShownStudy = useMemo(
    () => StudiesService.getCurrentlyShownStudy(studies),
    [studies]
  );
  const shownStatus = study ? getStudyShownStatus(study, currentlyShownStudy) : null;

  const normalizedSearch = captionSearch.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!normalizedSearch) return flavorFilteredRows;
    return flavorFilteredRows.filter((row) => {
      return (
        String(row.mapping.id).includes(normalizedSearch) ||
        row.captionId.toLowerCase().includes(normalizedSearch) ||
        row.captionContent.toLowerCase().includes(normalizedSearch) ||
        row.flavorLabel.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [flavorFilteredRows, normalizedSearch]);

  const toggleSort = (key: CaptionSortKey) => {
    setSortConfig((previous) => {
      if (previous.key === key) {
        return {
          key,
          direction: previous.direction === "desc" ? "asc" : "desc",
        };
      }
      return {
        key,
        direction: "desc",
      };
    });
  };

  const toggleFlavorSelection = (flavorLabel: string, checked: boolean) => {
    setSelectedFlavorLabels((previous) => {
      if (checked === true) {
        if (previous.includes(flavorLabel)) return previous;
        return [...previous, flavorLabel];
      }
      return previous.filter((flavor) => flavor !== flavorLabel);
    });
  };

  const openCaption = (captionId: string) => {
    if (captionId && captionId !== "-") {
      router.push(`/caption/${captionId}`);
    }
  };

  const handleDeleteMapping = async () => {
    if (!deletingMapping) return;

    setIsDeletingMapping(true);
    const mappingId = deletingMapping.id;
    const success = await StudyCaptionMappingsService.deleteMapping(mappingId);

    if (success) {
      setMappings((previous) =>
        previous.filter((mapping) => mapping.id !== mappingId)
      );
      setDeletingMapping(null);
      toast({
        title: "Caption removed",
        description: "Caption removed from this study.",
      });
    } else {
      toast({
        title: "Failed to remove caption",
        description: "Please try again.",
        variant: "destructive",
      });
    }

    setIsDeletingMapping(false);
  };

  const handleToggleStudyPrivacy = async (isPublic: boolean) => {
    if (!study) return;

    setIsUpdatingPrivacy(true);
    const updated = isPublic
      ? await StudiesService.publishStudy(study.id, {})
      : await StudiesService.updateStudy(study.id, { is_private: true });

    if (updated) {
      setStudy(updated);
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

    setIsUpdatingPrivacy(false);
  };

  const sortedRows = useMemo(() => {
    if (sortConfig.key == null) return filteredRows;
    const direction = sortConfig.direction === "asc" ? 1 : -1;

    return [...filteredRows].sort((a, b) => {
      if (sortConfig.key === "flavorLabel") {
        const labelDiff = a.flavorLabel.localeCompare(
          b.flavorLabel,
          undefined,
          { sensitivity: "base" }
        );
        if (labelDiff === 0) {
          return a.captionId.localeCompare(b.captionId);
        }
        return labelDiff * direction;
      }

      if (sortConfig.key === "imageUrl") {
        if (!a.imageUrl && !b.imageUrl) {
          return a.captionId.localeCompare(b.captionId);
        }
        if (!a.imageUrl) return 1;
        if (!b.imageUrl) return -1;
        const imageDiff = a.imageUrl.localeCompare(b.imageUrl, undefined, {
          sensitivity: "base",
        });
        if (imageDiff === 0) {
          return a.captionId.localeCompare(b.captionId);
        }
        return imageDiff * direction;
      }

      return a.captionId.localeCompare(b.captionId);
    });
  }, [filteredRows, sortConfig.direction, sortConfig.key]);

  const renderSortIcon = (key: CaptionSortKey) => {
    if (sortConfig.key !== key) {
      return <ArrowDown className="h-3 w-3 opacity-40" />;
    }
    if (sortConfig.direction === "asc") {
      return <ArrowUp className="h-3 w-3" />;
    }
    return <ArrowDown className="h-3 w-3" />;
  };

  const getSortAriaLabel = (key: CaptionSortKey, label: string) => {
    if (sortConfig.key !== key) {
      return `Sort by ${label} descending`;
    }
    return sortConfig.direction === "desc"
      ? `Sort by ${label} ascending`
      : `Sort by ${label} descending`;
  };

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart =
    sortedRows.length === 0 ? 0 : (safePage - 1) * ITEMS_PER_PAGE + 1;
  const pageEnd = Math.min(safePage * ITEMS_PER_PAGE, sortedRows.length);

  const paginatedRows = useMemo(() => {
    const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
    return sortedRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedRows, safePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [captionSearch, studyId, sortConfig.direction, sortConfig.key, selectedFlavorLabels]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (dedupeFinished && study) {
    const studySiteUrl = getStudySiteUrl(study.id);

    return (
      <Card className="shadow-md">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="text-2xl font-semibold text-foreground">Study deduplicated</p>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {getStudyLabel(study)} retained its original details, {study.is_private ? "private" : "public"}{" "}
            status, and schedule from {formatDateTime(study.start_datetime_utc, timeZone)} to{" "}
            {formatDateTime(study.end_datetime_utc, timeZone)}.
          </p>
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="flex items-center gap-1">
              <a
                href={studySiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 underline underline-offset-4 hover:text-blue-800"
              >
                {STUDY_SITE_HOST}/study/{study.id}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <CopyStudyLinkButton url={studySiteUrl} />
            </div>
            <Button className="bg-gray-700 text-white hover:bg-gray-800" asChild>
              <a href={studySiteUrl} target="_blank" rel="noopener noreferrer">
                Go to study
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDedupeFinished(false);
                setDedupeStarted(false);
              }}
            >
              Back to study details
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="page-header">
          <h1 className="page-title">Study</h1>
          <p className="page-subtitle">
            Review study details and associated captions.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/studies")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Studies
        </Button>
      </div>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-2">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Study Details</CardTitle>
              <CardDescription>Study metadata and timeline.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {study ? (
                <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                  <Switch
                    checked={!study.is_private}
                    disabled={isUpdatingPrivacy}
                    onCheckedChange={(checked) => void handleToggleStudyPrivacy(checked)}
                    aria-label={`${study.is_private ? "Make public" : "Make private"} ${getStudyLabel(study)}`}
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {study.is_private ? "Private" : "Public"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {study.is_private ? "Private for normal users" : "Public for normal users"}
                    </p>
                  </div>
                </div>
              ) : null}
              {shownStatus ? (
                <div className="space-y-1">
                  <Badge variant={shownStatus.variant} className="font-sans">
                    {shownStatus.label}
                  </Badge>
                  <p className="max-w-[260px] text-xs text-muted-foreground">
                    {shownStatus.description}
                  </p>
                </div>
              ) : null}
              <Badge variant="secondary" className="font-sans">
                {study ? getStudyLabel(study) : "Study"}
              </Badge>
            </div>
          </div>
          {isLoadingStudy ? (
            <div className="py-10 text-center">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading study...</p>
            </div>
          ) : !study ? (
            <div className="py-6 text-sm text-muted-foreground">
              No study details available for this id.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Id
                </p>
                <p className="font-sans font-medium">{study.id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Slug
                </p>
                <p className="font-medium">{study.slug || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Public study
                </p>
                <div className="flex items-center gap-1">
                  <a
                    href={getStudySiteUrl(study.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-blue-700 underline underline-offset-4 hover:text-blue-800"
                  >
                    {STUDY_SITE_HOST}/study/{study.id}
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                  <CopyStudyLinkButton url={getStudySiteUrl(study.id)} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Description
                </p>
                <p className="text-muted-foreground">
                  {study.description || "-"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Shown
                </p>
                {shownStatus ? (
                  <div className="space-y-1">
                    <Badge variant={shownStatus.variant} className="font-sans">
                      {shownStatus.label}
                    </Badge>
                    <p className="text-xs text-muted-foreground">{shownStatus.description}</p>
                  </div>
                ) : (
                  "-"
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Created
                </p>
                <p className="text-muted-foreground">
                  {formatDateTime(study.created_datetime_utc, timeZone)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Start
                </p>
                <p className="text-muted-foreground">
                  {formatDateTime(study.start_datetime_utc, timeZone)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  End
                </p>
                <p className="text-muted-foreground">
                  {formatDateTime(study.end_datetime_utc, timeZone)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Study Link
                </p>
                <div className="flex items-center gap-1">
                  <a
                    href={getStudySiteUrl(study.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    {STUDY_SITE_HOST}/study/{study.id}
                  </a>
                  <CopyStudyLinkButton url={getStudySiteUrl(study.id)} />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs key={studyId} defaultValue="captions">
        <TabsList aria-label="Study views">
          <TabsTrigger value="captions">Captions</TabsTrigger>
          <TabsTrigger value="results" disabled={!study || study.id !== studyId}>Results</TabsTrigger>
        </TabsList>
        <TabsContent value="results">
          {study && study.id === studyId && <StudyResults key={study.id} studyId={study.id} />}
        </TabsContent>
        <TabsContent value="captions" className="space-y-6">
      <Card className="animate-in fade-in-0 slide-in-from-bottom-3">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Captions</CardTitle>
              <CardDescription>
                Captions mapped to this study.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search captions..."
                  value={captionSearch}
                  onChange={(e) => setCaptionSearch(e.target.value)}
                  className="pl-9 bg-background"
                />
              </div>
              <Badge variant="secondary" className="font-sans">
                {filteredRows.length} captions
              </Badge>
              <div className="inline-flex items-center rounded-md border border-border bg-background p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={captionsView === "table" ? "secondary" : "ghost"}
                  className="h-8 px-3"
                  onClick={() => setCaptionsView("table")}
                >
                  Table
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={captionsView === "card" ? "secondary" : "ghost"}
                  className="h-8 px-3"
                  onClick={() => setCaptionsView("card")}
                >
                  Card
                </Button>
              </div>
            </div>
          </div>
          {captionsView === "table" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
              {availableFlavorLabels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No humor flavors available.
                </p>
              ) : (
                availableFlavorLabels.map((flavorLabel) => {
                  const isSelected = selectedFlavorLabelSet.has(flavorLabel);
                  return (
                    <label
                      key={flavorLabel}
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1 text-xs font-sans text-foreground"
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          toggleFlavorSelection(flavorLabel, checked === true)
                        }
                        aria-label={`Select flavor ${flavorLabel}`}
                      />
                      <span>{flavorLabel}</span>
                    </label>
                  );
                })
              )}
            </div>
          )}
          {captionsView === "table" ? (
            <div className="table-shell">
              <div className="overflow-x-auto">
                <table className="min-w-full table-base">
                  <thead className="table-head">
                    <tr>
                      <th>Id</th>
                      <th>
                        <button
                          type="button"
                          onClick={() => toggleSort("imageUrl")}
                          className="inline-flex items-center gap-1"
                          aria-label={getSortAriaLabel("imageUrl", "image")}
                        >
                          Image
                          {renderSortIcon("imageUrl")}
                        </button>
                      </th>
                      <th>Caption</th>
                      <th>
                        <button
                          type="button"
                          onClick={() => toggleSort("flavorLabel")}
                          className="inline-flex items-center gap-1"
                          aria-label={getSortAriaLabel("flavorLabel", "humor flavor")}
                        >
                          Humor Flavor
                          {renderSortIcon("flavorLabel")}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {isLoadingCaptions ? (
                      <tr>
                        <td colSpan={4} className="py-10 text-center">
                          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Loading captions...
                          </p>
                        </td>
                      </tr>
                    ) : filteredRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-10 text-center text-sm text-muted-foreground"
                        >
                          No captions mapped to this study yet.
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((row) => (
                        <tr
                          key={row.mapping.id}
                          className={`hover:bg-muted/50 transition-colors animate-in fade-in-0 ${
                            row.captionId && row.captionId !== "-" ? "cursor-pointer" : ""
                          }`}
                          onClick={() => {
                            openCaption(row.captionId);
                          }}
                        >
                          <td className="font-sans text-xs text-muted-foreground">
                            {row.captionId}
                          </td>
                          <td className="w-12">
                            {row.imageUrl ? (
                              <img
                                src={row.imageUrl}
                                alt={`Caption ${row.captionId} image`}
                                className="h-9 w-9 rounded border border-border/60 object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded border border-border/60 bg-muted/40 text-[10px] font-semibold text-muted-foreground">
                                —
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="flex max-w-[460px] items-center gap-2">
                              <div className="min-w-0 flex-1 truncate text-sm text-foreground">
                                {row.captionContent}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive/80"
                                aria-label={`Remove caption ${row.captionId} from study`}
                                title="Remove caption from study"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeletingMapping(row.mapping);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">
                                  Remove caption from study
                                </span>
                              </Button>
                            </div>
                          </td>
                          <td className="text-muted-foreground">
                            {row.flavorLabel}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : isLoadingCaptions ? (
            <div className="rounded-xl border border-border/60 bg-card/70 py-10 text-center">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading captions...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card/70 py-10 text-center text-sm text-muted-foreground">
              No captions mapped to this study yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {paginatedRows.map((row) => (
                <div
                  key={row.mapping.id}
                  role={
                    row.captionId && row.captionId !== "-" ? "button" : undefined
                  }
                  tabIndex={row.captionId && row.captionId !== "-" ? 0 : undefined}
                  onClick={() => {
                    openCaption(row.captionId);
                  }}
                  onKeyDown={(event) => {
                    if (
                      row.captionId &&
                      row.captionId !== "-" &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      openCaption(row.captionId);
                    }
                  }}
                  className={`rounded-xl border border-border/60 bg-card/70 p-3 text-left transition-colors hover:bg-muted/40 ${
                    row.captionId && row.captionId !== "-" ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="h-44 w-full overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                      {row.imageUrl ? (
                        <img
                          src={row.imageUrl}
                          alt={`Caption ${row.captionId} image`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                          —
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
                          {row.captionContent}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive/80"
                          aria-label={`Remove caption ${row.captionId} from study`}
                          title="Remove caption from study"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeletingMapping(row.mapping);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">
                            Remove caption from study
                          </span>
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground font-sans">
                        <p>Id: {row.captionId}</p>
                        <p>Flavor: {row.flavorLabel}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isLoadingCaptions && filteredRows.length > 0 && (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground font-sans sm:flex-row sm:items-center sm:justify-between">
              <div>
                Showing{" "}
                <span className="font-medium text-foreground">{pageStart}</span>{" "}
                -{" "}
                <span className="font-medium text-foreground">{pageEnd}</span>{" "}
                of{" "}
                <span className="font-medium text-foreground">
                  {filteredRows.length}
                </span>{" "}
                captions
              </div>
              {filteredRows.length > ITEMS_PER_PAGE && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={safePage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Page {safePage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    disabled={safePage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="animate-in fade-in-0 slide-in-from-bottom-4">
        <CardContent className="space-y-4 p-4">
          <div>
            <CardTitle>Deduplication</CardTitle>
            <CardDescription>
              Run deduplication manually and review captions without changing this study&apos;s
              properties.
            </CardDescription>
          </div>
          {dedupeStarted ? (
            <DedupeReview
              studyId={study?.id ?? null}
              mappings={mappings}
              loadingBlocked={isLoadingStudy || isLoadingMappings}
              loadingBlockedMessage="Deduplication will run when the study captions finish loading."
              showSaveButton
              onMappingsChanged={setMappings}
              onSaved={(remainingMappings) => {
                setMappings(remainingMappings);
                setDedupeFinished(true);
              }}
            />
          ) : (
            <Button
              type="button"
              size="lg"
              className="bg-gray-700 px-8 text-white hover:bg-gray-800"
              onClick={() => setDedupeStarted(true)}
              disabled={isLoadingStudy || isLoadingMappings || !study}
            >
              Run deduplication
            </Button>
          )}
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>

      <AlertDialog
        open={!!deletingMapping}
        onOpenChange={(open) => {
          if (!open && !isDeletingMapping) setDeletingMapping(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove caption from study?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the caption from this study. The caption record will
              remain available elsewhere.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingMapping}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingMapping}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteMapping();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingMapping ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Removing...
                </span>
              ) : (
                "Remove Caption"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
