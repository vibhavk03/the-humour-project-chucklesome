"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import User from "@/types/user";
import { UserService } from "@/services/users.service";
import UserCard from "@/components/card/UserCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Shield, 
  Filter,
  X,
  Mail,
  Hash,
  UserCircle
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/components/TimeZoneContext";

export default function Users() {
  const { timeZone } = useTimeZone();
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"all" | "name" | "email" | "id">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "superadmin" | "regular">("all");
  const [sortBy, setSortBy] = useState<"name" | "created" | "email" | "lastLogin">("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc"); // NEW
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalSuperAdmins, setTotalSuperAdmins] = useState(0);
  const [showQuickFilters, setShowQuickFilters] = useState(false);
  const [userActivityCounts, setUserActivityCounts] = useState<Record<string, { images: number; captions: number }>>({});
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchFocusedRef = useRef(false);
  const lastSelectionRef = useRef<{ start: number | null; end: number | null }>({ start: null, end: null });

  // Fetch total superadmins count
  useEffect(() => {
    const fetchSuperAdminCount = async () => {
      const count = await UserService.getSuperAdminCount();
      setTotalSuperAdmins(count);
    };
    fetchSuperAdminCount();
  }, []);

  // Memoized user data maps for better performance
  const userMaps = useMemo(() => {
    const emailMap: Record<string, string> = {};
    const roleMap: Record<string, boolean> = {};
    const matrixAdminMap: Record<string, boolean> = {};
    const signupMap: Record<string, string> = {};
    const lastLoginMap: Record<string, string | null> = {};
    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const getMidnightUtc = (value: Date) => {
      const parts = dayFormatter.formatToParts(value);
      const year = Number(parts.find(part => part.type === "year")?.value ?? 0);
      const month = Number(parts.find(part => part.type === "month")?.value ?? 1);
      const day = Number(parts.find(part => part.type === "day")?.value ?? 1);
      return Date.UTC(year, month - 1, day);
    };
    
    users.forEach(user => {
      emailMap[user.id] = user.email || '';
      roleMap[user.id] = user.is_superadmin || false;
      matrixAdminMap[user.id] = user.is_matrix_admin || false;
      
      // Enhanced date formatting
      if (user.created_datetime_utc) {
        const date = new Date(user.created_datetime_utc);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.ceil(Math.abs(getMidnightUtc(now) - getMidnightUtc(date)) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
          signupMap[user.id] = 'Today';
        } else if (diffDays === 1) {
          signupMap[user.id] = 'Yesterday';
        } else if (diffDays < 7) {
          signupMap[user.id] = `${diffDays} days ago`;
        } else if (diffDays < 30) {
          signupMap[user.id] = `${Math.floor(diffDays / 7)} weeks ago`;
        } else {
          signupMap[user.id] = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            timeZone,
          });
        }
      } else {
        signupMap[user.id] = '—';
      }
      
      if (user.modified_datetime_utc) {
        const date = new Date(user.modified_datetime_utc);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.ceil(Math.abs(getMidnightUtc(now) - getMidnightUtc(date)) / (1000 * 60 * 60 * 24));
        const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
        
        if (diffHours < 1) {
          lastLoginMap[user.id] = 'Just now';
        } else if (diffHours < 24) {
          lastLoginMap[user.id] = `${diffHours}h ago`;
        } else if (diffDays === 1) {
          lastLoginMap[user.id] = 'Yesterday';
        } else if (diffDays < 7) {
          lastLoginMap[user.id] = `${diffDays}d ago`;
        } else if (diffDays < 30) {
          lastLoginMap[user.id] = `${Math.floor(diffDays / 7)}w ago`;
        } else if (diffDays < 365) {
          lastLoginMap[user.id] = `${Math.floor(diffDays / 30)}mo ago`;
        } else {
          lastLoginMap[user.id] = date.toLocaleDateString('en-US', { 
            month: 'short', 
            year: 'numeric',
            timeZone,
          });
        }
      } else {
        lastLoginMap[user.id] = null;
      }
    });
    
    return { emailMap, roleMap, matrixAdminMap, signupMap, lastLoginMap };
  }, [users, timeZone]);

  // Debounced search effect with reduced delay
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1);
    }, 200); // Reduced from 300ms for faster response
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    lastSelectionRef.current = {
      start: e.target.selectionStart,
      end: e.target.selectionEnd,
    };
    setSearchQuery(value);
  };

  useEffect(() => {
    if (!searchFocusedRef.current) return;
    const input = searchInputRef.current;
    if (!input || document.activeElement === input) return;
    input.focus({ preventScroll: true });
    const { start, end } = lastSelectionRef.current;
    if (start !== null && end !== null) {
      input.setSelectionRange(start, end);
    }
  }, [debouncedSearchQuery, isLoading, users, roleFilter, searchType, currentPage, itemsPerPage]);

  // Build search query based on search type
  const buildSearchQuery = useCallback(() => {
    if (!debouncedSearchQuery) return "";
    
    // For targeted search, modify the query
    if (searchType !== "all") {
      return debouncedSearchQuery;
    }
    
    return debouncedSearchQuery;
  }, [debouncedSearchQuery, searchType]);

  // Fetch users with enhanced search
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const isSuperAdminFilter = 
        roleFilter === "superadmin" ? true : 
        roleFilter === "regular" ? false : 
        null;

      // Build the search parameters based on search type
      const searchParams = {
        searchQuery: buildSearchQuery(),
        isSuperAdminFilter,
        offset: (currentPage - 1) * itemsPerPage,
        limit: itemsPerPage,
        searchType: searchType // Pass search type to service
      };

      const { users: searchResults, totalCount, userActivityCounts: activityCounts } = await UserService.searchUsersEnhanced(searchParams);
      
      setUsers(searchResults);
      console.log("Fetched users:", searchResults);
      setTotalUsers(totalCount);
      setUserActivityCounts(activityCounts || {});
    } catch (error) {
      console.error("Error fetching users:", error);
      setUsers([]);
      setTotalUsers(0);
    } finally {
      setIsLoading(false);
    }
  }, [buildSearchQuery, roleFilter, currentPage, searchType, itemsPerPage]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

// Memoized sorted users for better performance
const sortedUsers = useMemo(() => {
  const compare = (aVal: string | number | null, bVal: string | number | null) => {
    // Treat null/undefined as largest value
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  };

  return [...users].sort((a, b) => {
    switch (sortBy) {
      case "name":
        const aName = `${a?.first_name || ''} ${a?.last_name || ''}`.trim() || 'Anonymous';
        const bName = `${b?.first_name || ''} ${b?.last_name || ''}`.trim() || 'Anonymous';
        return compare(aName, bName);

      case "email":
        const aEmail = userMaps.emailMap[a.id] || '';
        const bEmail = userMaps.emailMap[b.id] || '';
        return compare(aEmail, bEmail);

      case "created":
        const aDate = a?.created_datetime_utc ? new Date(a.created_datetime_utc).getTime() : null;
        const bDate = b?.created_datetime_utc ? new Date(b.created_datetime_utc).getTime() : null;
        return compare(aDate, bDate);

      case "lastLogin":
        const aLogin = a?.modified_datetime_utc ? new Date(a.modified_datetime_utc).getTime() : null;
        const bLogin = b?.modified_datetime_utc ? new Date(b.modified_datetime_utc).getTime() : null;
        return compare(aLogin, bLogin);

      default:
        return 0;
    }
  });
}, [users, sortBy, sortOrder, userMaps.emailMap]);

  const totalPages = Math.ceil(totalUsers / itemsPerPage);

  const recentlyActiveCount = users.filter(user => {
    if (!user.modified_datetime_utc) return false;
    const lastLogin = new Date(user.modified_datetime_utc);
    const daysSinceLogin = (Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLogin <= 7;
  }).length;

  // Quick filter functions
  const applyQuickFilter = (filter: string) => {
    switch(filter) {
      case 'superadmins':
        setRoleFilter('superadmin');
        break;
      case 'recent':
        setSortBy('lastLogin');
        break;
      case 'new':
        setSortBy('created');
        break;
    }
    setCurrentPage(1);
    setShowQuickFilters(false);
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">User Management</h1>
        <p className="page-subtitle">Search, filter, and manage account activity.</p>
      </div>

      {/* Enhanced Search and Filter Controls */}
      <div className="space-y-3">
          {/* Search Bar with Type Selector */}
          <div className="flex gap-2">
            <Select value={searchType} onValueChange={(value: any) => {
              setSearchType(value);
              setCurrentPage(1);
            }}>
              <SelectTrigger className="w-[140px] bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <Search className="h-3 w-3" />
                    <span>All Fields</span>
                  </div>
                </SelectItem>
                <SelectItem value="name">
                  <div className="flex items-center gap-2">
                    <UserCircle className="h-3 w-3" />
                    <span>Name</span>
                  </div>
                </SelectItem>
                <SelectItem value="email">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3 w-3" />
                    <span>Email</span>
                  </div>
                </SelectItem>
                <SelectItem value="id">
                  <div className="flex items-center gap-2">
                    <Hash className="h-3 w-3" />
                    <span>ID</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                ref={searchInputRef}
                placeholder={
                  searchType === "name" ? "Search by name..." :
                  searchType === "email" ? "Search by email..." :
                  searchType === "id" ? "Search by ID..." :
                  "Search users..."
                }
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => {
                  searchFocusedRef.current = true;
                }}
                onBlur={() => {
                  searchFocusedRef.current = false;
                }}
                onSelect={(event) => {
                  const input = event.target as HTMLInputElement;
                  lastSelectionRef.current = {
                    start: input.selectionStart,
                    end: input.selectionEnd,
                  };
                }}
                className="pl-10 pr-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20"
              />
              {isLoading && searchQuery && (
                <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {searchQuery && !isLoading && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          
          {/* Filter Controls Row */}
          <div className="flex gap-3 items-center justify-between">
            <div className="flex gap-2">
              {/* Quick Filters */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQuickFilters(!showQuickFilters)}
                className="bg-background"
              >
                <Filter className="h-4 w-4 mr-1" />
                Quick Filters
              </Button>
              
              {showQuickFilters && (
                <div className="flex gap-2">
                  <Badge 
                    variant="secondary" 
                    className="cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30"
                    onClick={() => applyQuickFilter('superadmins')}
                  >
                    Superadmins Only
                  </Badge>
                  <Badge 
                    variant="secondary" 
                    className="cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30"
                    onClick={() => applyQuickFilter('recent')}
                  >
                    Recently Active
                  </Badge>
                  <Badge 
                    variant="secondary" 
                    className="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    onClick={() => applyQuickFilter('new')}
                  >
                    New Users
                  </Badge>
                </div>
              )}
              
              <Select value={roleFilter} onValueChange={(value: any) => {
                setRoleFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[180px] bg-background border-border">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="superadmin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3 w-3 text-orange-500" />
                      <span>Superadmins Only</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="regular">Regular Users</SelectItem>
                </SelectContent>
              </Select>
              
              <Select
                onValueChange={(value: string) => {
                  const [field, order] = value.split(":");
                  setSortBy(field as "name" | "created" | "email" | "lastLogin");
                  setSortOrder(order as "asc" | "desc");
                }}
                value={`${sortBy}:${sortOrder}`}
              >
                <SelectTrigger className="w-[180px] bg-background border-border">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name:asc">Name (A-Z)</SelectItem>
                  <SelectItem value="name:desc">Name (Z-A)</SelectItem>
                  <SelectItem value="created:desc">Date Created (Newest)</SelectItem>
                  <SelectItem value="created:asc">Date Created (Oldest)</SelectItem>
                  <SelectItem value="lastLogin:desc">Recently Active</SelectItem>
                  <SelectItem value="email:asc">Email (A-Z)</SelectItem>
                  <SelectItem value="email:desc">Email (Z-A)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Items per page selector */}
              <Select value={String(itemsPerPage)} onValueChange={(value) => {
                setItemsPerPage(Number(value));
                setCurrentPage(1); // Reset to first page when changing items per page
              }}>
                <SelectTrigger className="w-[140px] bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 per page</SelectItem>
                  <SelectItem value="100">100 per page</SelectItem>
                  <SelectItem value="200">200 per page</SelectItem>
                  <SelectItem value="500">500 per page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
      </div>

      {/* Enhanced User List Section */}
      <Card>
        <CardContent className="p-0">
          {/* Enhanced Table Header */}
          <div className="grid grid-cols-12 gap-4 items-center px-4 py-3 font-semibold text-sm text-muted-foreground bg-muted/30 border-b">
            <div className="col-span-4">User Information</div>
            <div className="col-span-2 text-center">Activity</div>
            <div className="col-span-2 text-center">Signup Date</div>
            <div className="col-span-2 text-center">Roles</div>
            <div className="col-span-2 text-center">Actions</div>
          </div>
          
          {/* User List */}
          <ScrollArea className={itemsPerPage > 100 ? "h-[800px]" : "h-[600px]"}>
            {isLoading ? (
              <div className="divide-y divide-border">
                {/* Loading skeleton rows */}
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="grid grid-cols-12 items-center px-4 py-3 animate-pulse">
                    {/* User Info */}
                    <div className="col-span-4 pr-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-muted rounded w-32" />
                          <div className="h-3 bg-muted rounded w-48" />
                        </div>
                      </div>
                    </div>
                    {/* Activity */}
                    <div className="col-span-2 flex justify-center gap-4">
                      <div className="h-4 bg-muted rounded w-8" />
                      <div className="h-4 bg-muted rounded w-8" />
                    </div>
                    {/* Signup Date */}
                    <div className="col-span-2 flex justify-center">
                      <div className="h-4 bg-muted rounded w-20" />
                    </div>
                    {/* Role */}
                    <div className="col-span-2 flex justify-center">
                      <div className="h-6 bg-muted rounded-full w-12" />
                    </div>
                    {/* Actions */}
                    <div className="col-span-2 flex justify-center gap-2">
                      <div className="h-8 bg-muted rounded w-16" />
                      <div className="h-8 bg-muted rounded w-8" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sortedUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Search className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium text-foreground">No users found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {debouncedSearchQuery ? 
                      `No results for "${debouncedSearchQuery}" in ${searchType === 'all' ? 'any field' : searchType}` : 
                      'Try adjusting your filter criteria'
                    }
                  </p>
                  {roleFilter !== 'all' && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setRoleFilter('all')}
                      className="mt-2"
                    >
                      Clear role filter
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sortedUsers.map((user) => (
                  <UserCard 
                    key={user.id}
                    user={user} 
                    email={userMaps.emailMap[user.id] || ''}
                    isSuperAdmin={userMaps.roleMap[user.id] || false}
                    isMatrixAdmin={userMaps.matrixAdminMap[user.id] || false}
                    signupDate={userMaps.signupMap[user.id] || ''}
                    lastLogin={userMaps.lastLoginMap[user.id] || ''}
                    activityCounts={userActivityCounts[user.id] || { images: 0, captions: 0 }}
                    showId={searchType === 'id'}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Search Summary and Pagination */}
      <Card
        className={cn(
          "border-l-4",
          roleFilter === "superadmin" ? "border-l-orange-500" : "border-l-primary/30"
        )}
      >
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
          <div className="text-sm text-muted-foreground">
            {totalUsers > 0 ? (
              <>
                Showing{" "}
                <span className="font-medium text-foreground">
                  {(currentPage - 1) * itemsPerPage + 1}
                </span>{" "}
                -{" "}
                <span className="font-medium text-foreground">
                  {Math.min(currentPage * itemsPerPage, totalUsers)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">{totalUsers}</span>{" "}
                users
                {debouncedSearchQuery && (
                  <span className="ml-2">
                    matching{" "}
                    <Badge variant="secondary" className="ml-1">
                      {searchType === "all" ? "any field" : searchType}:{" "}
                      {debouncedSearchQuery}
                    </Badge>
                  </span>
                )}
                {roleFilter !== "all" && (
                  <Badge variant="secondary" className="ml-2">
                    {roleFilter === "superadmin" ? "Superadmins" : "Regular Users"}
                  </Badge>
                )}
              </>
            ) : (
              <>No users found</>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || isLoading}
              className="bg-background"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm px-3 py-1 bg-muted/30 rounded border">
              Page {currentPage} of {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || isLoading || totalPages === 0}
              className="bg-background"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
