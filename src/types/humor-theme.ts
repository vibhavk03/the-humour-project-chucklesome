import type { Database } from "@/types/supabase";

export type HumorThemeRow = Database["public"]["Tables"]["humor_themes"]["Row"];
export type HumorThemeInsert =
  Database["public"]["Tables"]["humor_themes"]["Insert"];
export type HumorThemeUpdate =
  Database["public"]["Tables"]["humor_themes"]["Update"];
export type HumorTheme = HumorThemeRow;

export default HumorTheme;
