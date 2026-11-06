import type { Database } from "@/types/supabase";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileAdminFlag = Pick<ProfileRow, "is_superadmin">;
