import type { Database } from "@/types/supabase";

export type UserImageRow = Database["public"]["Tables"]["images"]["Row"];
export type UserImageInsert = Database["public"]["Tables"]["images"]["Insert"];
export type UserImageUpdate = Database["public"]["Tables"]["images"]["Update"];
export type UserImage = UserImageRow;

export default UserImage;
