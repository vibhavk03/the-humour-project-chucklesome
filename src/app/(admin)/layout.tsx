import Menu from "./(menu)";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { ProfileAdminFlag } from "@/types/profile";

export default async function AdminLayout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .single<ProfileAdminFlag>();

  if (!profile?.is_superadmin) {
    await supabase.auth.signOut({ scope: "local" });
    return redirect(
      "/?error=Access%20denied.%20Superadmin%20privileges%20required.",
    );
  }

  return (
    <div className="mt-6">
      <Menu />
    </div>
  );
}
