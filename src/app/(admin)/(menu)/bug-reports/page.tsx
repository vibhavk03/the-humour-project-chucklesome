"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { fetchBugReportsWithProfiles } from "@/app/actions/fetch-bug-reports";
import { Search, X } from "lucide-react";
import { useTimeZone } from "@/components/TimeZoneContext";

type ProgressStatus = "Not Started" | "In Progress" | "Completed" | "Blocked";

interface BugReport {
  id: number;
  created_datetime_utc: string;
  modified_datetime_utc: string | null;
  subject: string | null;
  message: string | null;
  profile_id: string | null;
  progress: ProgressStatus;
  first_name: string | null;
  last_name: string | null;
}

export default function BugReports() {
  const { timeZone } = useTimeZone();
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [progressFilter, setProgressFilter] = useState<"all" | ProgressStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const { toast } = useToast();

  // Memoized date formatting functions
  const formatDateTime = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString("en-US", { timeZone }),
      time: date.toLocaleTimeString("en-US", { timeZone, timeZoneName: "short" }),
      full: date.toLocaleString("en-US", { timeZone, timeZoneName: "short" })
    };
  }, [timeZone]);

  // Load progress from localStorage
  const loadProgressFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem('bug-reports-progress');
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error("Error loading progress from storage:", error);
      return {};
    }
  }, []);

  // Save progress to localStorage
  const saveProgressToStorage = useCallback((reportId: number, progress: ProgressStatus) => {
    if (typeof window === 'undefined') return;
    try {
      const current = loadProgressFromStorage();
      current[reportId] = progress;
      localStorage.setItem('bug-reports-progress', JSON.stringify(current));
    } catch (error) {
      console.error("Error saving progress to storage:", error);
    }
  }, [loadProgressFromStorage]);

  // Memoized fetch function using server action
  const fetchBugReports = useCallback(async () => {
    try {
      const { data, error } = await fetchBugReportsWithProfiles();
      
      if (error) {
        console.error("Error fetching bug reports:", error);
        return;
      }
      
      // Load progress from localStorage and merge with fetched data
      const progressMap = loadProgressFromStorage();
      const reportsWithProgress = (data || []).map((report) => ({
        ...report,
        progress: progressMap[report.id] || "Not Started"
      }));
      
      setBugReports(reportsWithProgress);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [loadProgressFromStorage]);

  useEffect(() => {
    fetchBugReports();
  }, [fetchBugReports]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Filter bug reports based on progress and search query
  const filteredBugReports = useMemo(() => {
    let filtered = bugReports;

    // Filter by progress
    if (progressFilter !== "all") {
      filtered = filtered.filter(report => report.progress === progressFilter);
    }

    // Filter by subject search
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(report => 
        report.subject?.toLowerCase().includes(query) ?? false
      );
    }

    return filtered;
  }, [bugReports, progressFilter, debouncedSearchQuery]);

  // Handle row click to open dialog
  const handleRowClick = useCallback((report: BugReport) => {
    setSelectedReport(report);
    setIsDialogOpen(true);
  }, []);

  // Handle progress change - save to localStorage instead of Supabase
  const handleProgressChange = useCallback((reportId: number, newProgress: ProgressStatus) => {
    // Save to localStorage
    saveProgressToStorage(reportId, newProgress);
    
    // Update local state immediately
    setBugReports(prev => prev.map(report => 
      report.id === reportId 
        ? { ...report, progress: newProgress }
        : report
    ));
    
    toast({
      title: "Progress updated",
      description: `Bug report progress changed to ${newProgress}`,
    });
  }, [saveProgressToStorage, toast]);

  // Progress status configuration
  const progressOptions: { value: ProgressStatus; label: string; color: string }[] = [
    { value: "Not Started", label: "Not Started", color: "bg-blue-500" },
    { value: "In Progress", label: "In Progress", color: "bg-yellow-500" },
    { value: "Completed", label: "Completed", color: "bg-green-500" },
    { value: "Blocked", label: "Blocked", color: "bg-red-500" },
  ];

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Bug Reports</h1>
        <p className="page-subtitle">
          View and manage bug reports from users.
        </p>
      </div>

      {/* Filter and Search Controls */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          <Select value={progressFilter} onValueChange={(value: any) => setProgressFilter(value)}>
            <SelectTrigger className="w-[180px] bg-background border-border">
              <SelectValue placeholder="All Progress" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Progress</SelectItem>
              {progressOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${option.color}`} />
                    <span>{option.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search by subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20"
              disabled={loading}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="table-shell">
        <div>
          <table className="w-full table-base table-fixed">
            <thead className="table-head">
              <tr>
                <th className="w-16">
                  id
                </th>
                <th className="w-40">
                  progress
                </th>
                <th className="w-32">
                  first_name
                </th>
                <th className="w-32">
                  last_name
                </th>
                <th className="w-44">
                  created
                </th>
                <th className="w-32">
                  subject
                </th>
                <th className="w-48">
                  message
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : filteredBugReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground">
                    {bugReports.length === 0 
                      ? "No bug reports found" 
                      : "No bug reports match the current filters"}
                  </td>
                </tr>
              ) : (
                filteredBugReports.map((report) => {
                  const createdDateTime = formatDateTime(report.created_datetime_utc);
                  const modifiedDateTime = report.modified_datetime_utc ? formatDateTime(report.modified_datetime_utc) : null;
                  
                  return (
                    <tr 
                      key={report.id} 
                      className="h-16 cursor-pointer hover:bg-muted/60 transition-colors"
                      onClick={() => handleRowClick(report)}
                    >
                      <td className="whitespace-nowrap font-sans h-16">
                        {report.id}
                      </td>
                      <td className="h-16">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={report.progress}
                            onValueChange={(value) => handleProgressChange(report.id, value as ProgressStatus)}
                          >
                            <SelectTrigger className="w-full h-8 text-xs">
                              <div className="flex items-center gap-2 w-full">
                                <div className={`w-2 h-2 rounded-full ${
                                  progressOptions.find(opt => opt.value === report.progress)?.color || "bg-muted-foreground"
                                }`} />
                                <span className="flex-1 text-left">
                                  {progressOptions.find(opt => opt.value === report.progress)?.label || report.progress}
                                </span>
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              {progressOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${option.color}`} />
                                    <span>{option.label}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="h-16 overflow-hidden">
                        <div className="truncate" title={report.first_name || "NULL"}>
                          {report.first_name || "NULL"}
                        </div>
                      </td>
                      <td className="h-16 overflow-hidden">
                        <div className="truncate" title={report.last_name || "NULL"}>
                          {report.last_name || "NULL"}
                        </div>
                      </td>
                      <td className="h-16 overflow-hidden">
                        <div className="truncate" title={createdDateTime.full}>
                          {createdDateTime.date} {createdDateTime.time}
                        </div>
                      </td>
                      <td className="h-16 overflow-hidden">
                        <div className="truncate" title={report.subject || ""}>
                          {report.subject || ""}
                        </div>
                      </td>
                      <td className="h-16 overflow-hidden">
                        <div className="truncate" title={report.message || ""}>
                          {report.message || ""}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Dialog */}
      {selectedReport && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Bug Report Details - ID: {selectedReport.id}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">ID:</label>
                <p className="text-sm font-sans">{selectedReport.id}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Progress:</label>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full ${
                    progressOptions.find(opt => opt.value === selectedReport.progress)?.color || "bg-muted-foreground"
                  }`} />
                  <p className="text-sm">{selectedReport.progress}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Profile ID:</label>
                <p className="text-sm font-sans">{selectedReport.profile_id || "NULL"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">First name:</label>
                <p className="text-sm">{selectedReport.first_name || "NULL"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Last name:</label>
                <p className="text-sm">{selectedReport.last_name || "NULL"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Created:</label>
                <p className="text-sm">{formatDateTime(selectedReport.created_datetime_utc).full}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Modified:</label>
                <p className="text-sm">
                  {selectedReport.modified_datetime_utc 
                    ? formatDateTime(selectedReport.modified_datetime_utc).full 
                    : "NULL"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Subject:</label>
                <p className="text-sm">{selectedReport.subject || "No subject"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Message:</label>
                <p className="text-sm whitespace-pre-wrap">{selectedReport.message || "No message"}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
