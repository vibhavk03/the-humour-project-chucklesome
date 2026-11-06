import type { Database } from "@/types/supabase";

export type CommonUseCategoryRow =
  Database["public"]["Tables"]["common_use_categories"]["Row"];
export type CommonUseCategoryInsert =
  Database["public"]["Tables"]["common_use_categories"]["Insert"];
export type CommonUseCategoryUpdate =
  Database["public"]["Tables"]["common_use_categories"]["Update"];
export type Category = CommonUseCategoryRow;

export default Category;
