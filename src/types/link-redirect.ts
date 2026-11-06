import type { Database } from "@/types/supabase";

export type LinkRedirectRow =
  Database["public"]["Tables"]["link_redirects"]["Row"];
export type LinkRedirectInsert =
  Database["public"]["Tables"]["link_redirects"]["Insert"];
export type LinkRedirectUpdate =
  Database["public"]["Tables"]["link_redirects"]["Update"];
export type LinkRedirect = LinkRedirectRow;

export default LinkRedirect;
