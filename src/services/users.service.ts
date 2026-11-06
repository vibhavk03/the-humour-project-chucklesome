import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/supabase";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export class UserService {
  static async getAllUsers() {
    if (!supabase) return [];

    try {
      const response = await supabase.from("profiles").select("*");
      return response && "data" in response ? response.data || [] : [];
    } catch (error) {
      console.error("Error fetching users:", error);
      return [];
    }
  }

  // Return the subset of the given profile ids that exist. Used to safely map a
  // caller-provided user_id onto captions.profile_id without risking a
  // foreign-key error when the profile isn't present in this env.
  static async filterExistingProfileIds(ids: string[]): Promise<string[]> {
    if (!supabase || ids.length === 0) return [];
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .in("id", ids);
      if (error) {
        console.error("Error validating profile ids:", error);
        return [];
      }
      return (data || []).map((row) => row.id as string);
    } catch (error) {
      console.error("Error validating profile ids:", error);
      return [];
    }
  }

  static async searchUsers({
    searchQuery = "",
    isSuperAdminFilter = null,
    offset = 0,
    limit = 50
  }: {
    searchQuery?: string;
    isSuperAdminFilter?: boolean | null;
    offset?: number;
    limit?: number;
  }): Promise<{ users: ProfileRow[]; totalCount: number }> {
    if (!supabase) return { users: [], totalCount: 0 };

    try {
      let query = supabase
        .from("profiles")
        .select("*", { count: "exact" });

      // Apply search filter - use individual filters for better compatibility
      if (searchQuery && searchQuery.trim()) {
        const searchTerm = `%${searchQuery.trim()}%`;
        
        // Use proper Supabase or filter syntax
        query = query.or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},id.ilike.${searchTerm}`);
      }

      // Apply super admin filter
      if (isSuperAdminFilter !== null) {
        query = query.eq("is_superadmin", isSuperAdminFilter);
      }

      // Apply pagination and ordering
      query = query
        .order('created_datetime_utc', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error("Supabase query error in searchUsers:", error);
        return { users: [], totalCount: 0 };
      }

      return { users: data || [], totalCount: count || 0 };
    } catch (error) {
      console.error("Unexpected error in searchUsers:", error);
      return { users: [], totalCount: 0 };
    }
  }

  static async searchUsersEnhanced({
    searchQuery = "",
    isSuperAdminFilter = null,
    offset = 0,
    limit = 50,
    searchType = "all"
  }: {
    searchQuery?: string;
    isSuperAdminFilter?: boolean | null;
    offset?: number;
    limit?: number;
    searchType?: "all" | "name" | "email" | "id";
  }): Promise<{
    users: ProfileRow[];
    totalCount: number;
    userActivityCounts: Record<string, { images: number; captions: number }>;
  }> {
    const client = supabase;
    if (!client) return { users: [], totalCount: 0, userActivityCounts: {} };

    try {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      let query = client
        .from("profiles")
        .select("*", { count: "exact" });

      // Apply type-specific search filter
      if (searchQuery && searchQuery.trim()) {
        const searchTerm = searchQuery.trim();
        const searchPattern = `%${searchTerm}%`;
        const isUuid = uuidRegex.test(searchTerm);
        
        switch (searchType) {
          case "name":
            // Search only in name fields
            query = query.or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern}`);
            break;
            
          case "email":
            // Search only in email field
            query = query.ilike("email", searchPattern);
            break;
            
          case "id":
            // Search only in id field  
            if (!isUuid) {
              return { users: [], totalCount: 0, userActivityCounts: {} };
            }
            query = query.eq("id", searchTerm);
            break;
            
          case "all":
          default:
            const filters = [
              `first_name.ilike.${searchPattern}`,
              `last_name.ilike.${searchPattern}`,
              `email.ilike.${searchPattern}`,
            ];
            if (isUuid) {
              filters.push(`id.eq.${searchTerm}`);
            }
            query = query.or(filters.join(","));
            break;
        }
      }

      // Apply super admin filter
      if (isSuperAdminFilter !== null) {
        query = query.eq("is_superadmin", isSuperAdminFilter);
      }

      // Apply pagination and ordering
      query = query
        .order('created_datetime_utc', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error("Error in searchUsersEnhanced:", error);
        throw error;
      }

      // Fetch activity counts for all users in parallel
      const userActivityCounts: Record<string, { images: number; captions: number }> = {};
      
      if (data && data.length > 0) {
        const userIds = data.map((user) => user.id).filter(Boolean);

        const formatCountError = (error: unknown) => {
          if (!error) return "Unknown error";
          if (error instanceof Error) return error.message;
          if (typeof error === "object") {
            const err = error as { message?: string; code?: string; status?: number };
            return err.message || err.code || `Status ${err.status ?? "unknown"}`;
          }
          return String(error);
        };

        const fetchCountsForUser = async (userId: string) => {
          const [imageResult, captionResult] = await Promise.all([
            client
              .from("images")
              .select("id", { count: "exact", head: true })
              .eq("profile_id", userId),
            client
              .from("captions")
              .select("id", { count: "exact", head: true })
              .eq("profile_id", userId),
          ]);

          return {
            userId,
            images: imageResult.error ? 0 : imageResult.count ?? 0,
            captions: captionResult.error ? 0 : captionResult.count ?? 0,
            imageError: imageResult.error,
            captionError: captionResult.error,
          };
        };

        const results: Array<{
          userId: string;
          images: number;
          captions: number;
          imageError: unknown;
          captionError: unknown;
        }> = [];

        const chunkSize = 6;
        for (let i = 0; i < userIds.length; i += chunkSize) {
          const chunk = userIds.slice(i, i + chunkSize);
          const chunkResults = await Promise.all(chunk.map(fetchCountsForUser));
          results.push(...chunkResults);
        }

        const countErrors = results.filter(
          (result) => result.imageError || result.captionError
        );
        if (countErrors.length > 0 && process.env.NODE_ENV !== "production") {
          const sample = countErrors[0];
          console.warn("Some activity counts failed", {
            total: countErrors.length,
            sample: {
              userId: sample.userId,
              imageError: formatCountError(sample.imageError),
              captionError: formatCountError(sample.captionError),
            },
          });
        }

        results.forEach(({ userId, images, captions }) => {
          userActivityCounts[userId] = { images, captions };
        });
      }

      return { 
        users: data || [], 
        totalCount: count || 0,
        userActivityCounts
      };
    } catch (error) {
      console.error("Error in searchUsersEnhanced:", error);
      return { users: [], totalCount: 0, userActivityCounts: {} };
    }
  }
  
  static async getSignupsByPeriod(startDate: Date, endDate: Date, groupBy: 'day' | 'week' | 'month') {
    if (!supabase) return {};

    try {
      const signupsByPeriod: { [key: string]: number } = {};
      
      // Generate all the periods we need to check
      const periods: string[] = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        let periodKey: string;
        
        switch (groupBy) {
          case 'day':
            periodKey = currentDate.toISOString().split('T')[0];
            currentDate.setDate(currentDate.getDate() + 1);
            break;
          case 'week':
            const weekStart = new Date(currentDate);
            weekStart.setDate(currentDate.getDate() - currentDate.getDay());
            periodKey = weekStart.toISOString().split('T')[0];
            currentDate.setDate(currentDate.getDate() + 7);
            break;
          case 'month':
            periodKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            currentDate.setMonth(currentDate.getMonth() + 1);
            break;
          default:
            periodKey = currentDate.toISOString().split('T')[0];
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        periods.push(periodKey);
      }
      
      // Create promises for all count queries
      const countPromises = periods.map(async (period) => {
        if (!supabase) return { period, count: 0 };
        
        let startPeriod: string;
        let endPeriod: string;
        
        switch (groupBy) {
          case 'day':
            startPeriod = `${period}T00:00:00.000Z`;
            endPeriod = `${period}T23:59:59.999Z`;
            break;
          case 'week':
            const weekStartDate = new Date(period);
            const weekEndDate = new Date(weekStartDate);
            weekEndDate.setDate(weekStartDate.getDate() + 6);
            startPeriod = `${weekStartDate.toISOString().split('T')[0]}T00:00:00.000Z`;
            endPeriod = `${weekEndDate.toISOString().split('T')[0]}T23:59:59.999Z`;
            break;
          case 'month':
            const [year, month] = period.split('-');
            const monthStart = new Date(parseInt(year), parseInt(month) - 1, 1);
            const monthEnd = new Date(parseInt(year), parseInt(month), 0);
            startPeriod = `${monthStart.toISOString().split('T')[0]}T00:00:00.000Z`;
            endPeriod = `${monthEnd.toISOString().split('T')[0]}T23:59:59.999Z`;
            break;
          default:
            startPeriod = `${period}T00:00:00.000Z`;
            endPeriod = `${period}T23:59:59.999Z`;
        }
        
        const { count, error } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("created_datetime_utc", startPeriod)
          .lte("created_datetime_utc", endPeriod);
        
        if (error) {
          console.error(`Error counting for period ${period}:`, error);
          return { period, count: 0 };
        }
        
        return { period, count: count || 0 };
      });
      
      // Execute all count queries in parallel
      const results = await Promise.all(countPromises);
      
      // Build the final result object
      results.forEach(({ period, count }) => {
        signupsByPeriod[period] = count;
      });
      
      return signupsByPeriod;
    } catch (error) {
      console.error("Error getting signups by period:", error);
      return {};
    }
  }

  static async getSignupsByDayOfWeekBatch(startDate: Date, endDate: Date) {
    if (!supabase) return {};

    try {
      const dayOfWeekStats: { [key: string]: number } = {};
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      
      // Initialize all days to 0
      dayNames.forEach(day => {
        dayOfWeekStats[day] = 0;
      });
      
      // Create promises for all count queries
      const countPromises: Promise<{dayName: string, count: number}>[] = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        const dayName = dayNames[dayOfWeek];
        
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);
        
        // Create a promise for this day's count
        const countPromise = (async () => {
          if (!supabase) return { dayName, count: 0 }; // Add null check here
          
          const { count, error } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .gte("created_datetime_utc", dayStart.toISOString())
            .lte("created_datetime_utc", dayEnd.toISOString());
          
          if (error) {
            console.error(`Error counting for ${dayStart.toDateString()}:`, error);
            return { dayName, count: 0 };
          }
          return { dayName, count: count || 0 };
        })();
        
        countPromises.push(countPromise);
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Execute all count queries in parallel
      const results = await Promise.all(countPromises);
      
      // Aggregate results by day of week
      results.forEach(({ dayName, count }) => {
        dayOfWeekStats[dayName] += count;
      });
      
      return dayOfWeekStats;
    } catch (error) {
      console.error("Error getting signups by day of week:", error);
      return {};
    }
  }

  static async getSuperAdminCount(): Promise<number> {
    if (!supabase) return 0;

    try {
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_superadmin", true);

      if (error) {
        console.error("Error counting super admins:", error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error("Error getting super admin count:", error);
      return 0;
    }
  }

  static async getRegularUserCount(): Promise<number> {
    if (!supabase) return 0;

    try {
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_superadmin", false);

      if (error) {
        console.error("Error counting regular users:", error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error("Error getting regular user count:", error);
      return 0;
    }
  }

  static async getAllUsersCount(): Promise<number> {
    if (!supabase) return 0;

    try {
      await supabase.auth.getSession();

      const { data, count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact" })
        .range(0, 0);

      if (error) {
        console.error("Error counting users:", error);
        return 0;
      }

      return count ?? data?.length ?? 0;
    } catch (error) {
      console.error("Error getting user count:", error);
      return 0;
    }
  }

  static async getActiveUsers() {
    if (!supabase) return [];

    try {
      const response = await supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true);

      return response && "data" in response ? response.data || [] : [];
    } catch (error) {
      console.error("Error fetching active users:", error);
      return [];
    }
  }

  static async getNameById(
    id: ProfileRow["id"]
  ): Promise<Pick<ProfileRow, "first_name" | "last_name">[]> {
    if (!supabase || !id) return [];

    try {
      const response = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", id);

      return response && "data" in response ? response.data || [] : [];
    } catch (error) {
      console.error("Error fetching user's name:", error);
      return [];
    }
  }

  static async getUserEmailsById(user_id: string) {
    if (!supabase) return [];

    try {
      const response = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user_id);

      return response && "data" in response ? response.data || [] : [];
    } catch (error) {
      console.error("Error fetching user's email:", error);
      return [];
    }
  }

  static async getUserImagesById(user_id: string) {
    if (!supabase) return [];

    try {
      const response = await supabase
        .from("images")
        .select("*")
        .eq("profile_id", user_id);

      return response && "data" in response ? response.data || [] : [];
    } catch (error) {
      console.error("Error fetching user's images:", error);
      return [];
    }
  }

  static async getUserRoleById(user_id: string) {
    if (!supabase) return [];

    try {
      const response = await supabase
        .from("profiles")
        .select("is_superadmin")
        .eq("id", user_id);

      return response && "data" in response ? response.data || [] : [];
    } catch (error) {
      console.error("Error fetching user's role:", error);
      return [];
    }
  }

  static async updateUserRole(userId: string, isSuperadmin: boolean) {
    try {
      const response = await fetch("/api/admin/users/role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ userId, isSuperadmin }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error || `Failed to update user role (${response.status})`;
        const details = payload?.details ? ` ${payload.details}` : "";
        throw new Error(`${message}${details}`.trim());
      }

      return true;
    } catch (error) {
      console.error("Error updating user role:", error);
      throw error;
    }
  }

  static async setUserAsAdmin(user_id: string) {
    return UserService.updateUserRole(user_id, true);
  }

  static async setUserAsUser(user_id: string) {
    return UserService.updateUserRole(user_id, false);
  }

  static async updateUserMatrixAdmin(userId: string, isMatrixAdmin: boolean) {
    try {
      const response = await fetch("/api/admin/users/matrix-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ userId, isMatrixAdmin }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error || `Failed to update matrix admin (${response.status})`;
        const details = payload?.details ? ` ${payload.details}` : "";
        throw new Error(`${message}${details}`.trim());
      }

      return true;
    } catch (error) {
      console.error("Error updating matrix admin:", error);
      throw error;
    }
  }

  static async setUserAsMatrixAdmin(user_id: string) {
    return UserService.updateUserMatrixAdmin(user_id, true);
  }

  static async setUserAsMatrixUser(user_id: string) {
    return UserService.updateUserMatrixAdmin(user_id, false);
  }

  static async bulkUpdatePermissions(
    emails: string[],
    updates: {
      is_superadmin?: boolean;
      is_matrix_admin?: boolean;
    },
  ): Promise<{
    updatedCount: number;
    missingEmails: string[];
    updated: Array<{
      id: string;
      email: string | null;
      is_superadmin: boolean;
      is_matrix_admin: boolean;
    }>;
  }> {
    try {
      const response = await fetch("/api/admin/users/bulk-permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ emails, updates }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error ||
          `Failed to update bulk permissions (${response.status})`;
        const details = payload?.details ? ` ${payload.details}` : "";
        throw new Error(`${message}${details}`.trim());
      }

      const payload = await response.json();
      return {
        updatedCount: payload?.updatedCount ?? 0,
        missingEmails: payload?.missingEmails ?? [],
        updated: payload?.updated ?? [],
      };
    } catch (error) {
      console.error("Error updating bulk permissions:", error);
      throw error;
    }
  }

  static async getUserDetailsById(user_id: string) {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("email, is_superadmin")
        .eq("id", user_id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error fetching user details:", error);
      return null;
    }
  }

  static async getAllUserDetails() {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, is_superadmin, created_datetime_utc, modified_datetime_utc");

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching all user details:", error);
      return [];
    }
  }

  static async getUserCaptions(userId: string) {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from("captions")
        .select("*")
        .eq("profile_id", userId)
        .order("created_datetime_utc", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching user captions:", error);
      return [];
    }
  }
}
