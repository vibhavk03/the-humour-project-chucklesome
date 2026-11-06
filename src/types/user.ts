import type { Database } from "@/types/supabase";

export type UserRow = Database["public"]["Tables"]["profiles"]["Row"];
export type UserInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type UserUpdate = Database["public"]["Tables"]["profiles"]["Update"];
export type User = UserRow;

export default User;
