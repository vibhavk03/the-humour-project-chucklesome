import type { Database } from "@/types/supabase";

type ImageRow = Database["public"]["Tables"]["images"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ReportedImageRow = Database["public"]["Tables"]["reported_images"]["Row"];
type ReportedImageBase = Pick<
  ReportedImageRow,
  "id" | "image_id" | "reason" | "created_datetime_utc" | "profile_id"
>;

export type ReportedImages = ReportedImageBase & {
  images?: Pick<ImageRow, "url"> | null;
  profiles?: Pick<ProfileRow, "first_name" | "last_name"> | null;
};
