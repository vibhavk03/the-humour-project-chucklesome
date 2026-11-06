import type { Database } from "@/types/supabase";

export type TermTypeRow = Database["public"]["Tables"]["term_types"]["Row"];
export type TermTypeInsert =
  Database["public"]["Tables"]["term_types"]["Insert"];
export type TermTypeUpdate =
  Database["public"]["Tables"]["term_types"]["Update"];
export type TermType = TermTypeRow;

export type TermRow = Database["public"]["Tables"]["terms"]["Row"];
export type TermInsert = Database["public"]["Tables"]["terms"]["Insert"];
export type TermUpdate = Database["public"]["Tables"]["terms"]["Update"];
export type Term = TermRow & {
  term_types?: TermTypeRow | null;
};
