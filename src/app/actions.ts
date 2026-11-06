"use server";

import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { classifyImageCategory } from "@/utils/classify-image-category";
import type { ProfileAdminFlag } from "@/types/profile";
import { encodedRedirect } from "@/utils/utils";
import { uploadImageFromUrl } from "@/utils/upload-image-from-url";

// export const signUpAction = async (formData: FormData) => {
//   const email = formData.get("email")?.toString();
//   const password = formData.get("password")?.toString();
//   const supabase = await createClient();
  
//   // Get the host header directly
//   const headersList = await headers();
//   const host = headersList.get("host") || "";
//   const protocol = host.includes("localhost") ? "http" : "https";
//   const origin = `${protocol}://${host}`;

//   if (!email || !password) {
//     return encodedRedirect(
//       "error",
//       "/sign-up",
//       "Email and password are required"
//     );
//   }

//   const { error } = await supabase.auth.signUp({
//     email,
//     password,
//     options: {
//       emailRedirectTo: `${protocol}://${host}/auth/callback`,
//     },
//   });

//   if (error) {
//     console.error(`${error.code} ${error.message}`);
//     return encodedRedirect("error", "/sign-up", error.message);
//   }
//   return encodedRedirect(
//     "success",
//     "/sign-up",
//     "Thanks for signing up! Please check your email for a verification link."
//   );
// };

export const signInAction = async (formData: FormData) => {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const supabase = await createClient();

  // Get the host header directly for correct redirects in preview environments
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const protocol = host.includes("localhost") ? "http" : "https";

  const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    return encodedRedirect("error", "/sign-in", authError.message);
  }

  if (!user) {
    return encodedRedirect("error", "/sign-in", "User not found");
  }

  // Check if user exists in profiles table and is a superadmin
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .single<ProfileAdminFlag>();

  if (profileError || !profile) {
    return encodedRedirect("error", "/sign-in", "User profile not found");
  }

  if (!profile.is_superadmin) {
    // Sign out the user since they don't have superadmin access
    await supabase.auth.signOut({ scope: "local" });
    return encodedRedirect("error", "/sign-in", "Access denied. Superadmin privileges required.");
  }

  return redirect("/overview");
};

export const signInWithGoogleAction = async () => {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  console.log("Starting Google sign-in from origin:", origin);

  try {
    const { error, data } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      console.error("Error initiating Google sign-in:", error);
      return { error: "Failed to sign in with Google: " + error.message };
    }

    return { url: data.url };
  } catch (error) {
    console.error("Unexpected error in signInWithGoogleAction:", error);
    return { error: "An unexpected error occurred during sign in" };
  }
};

export const checkAndHandleSuperadmin = async () => {
  const supabase = await createClient();

  try {
    // Get the current user after OAuth flow is complete
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error("Error getting user:", userError);
      await supabase.auth.signOut({ scope: "local" });
      return redirect("/?error=" + encodeURIComponent("Failed to get user information"));
    }

    // Check if user exists in profiles table and is a superadmin
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_superadmin")
      .eq("id", user.id)
      .single<ProfileAdminFlag>();

    if (profileError) {
      console.error("Error checking profile:", profileError);
      await supabase.auth.signOut({ scope: "local" });
      return redirect("/?error=" + encodeURIComponent("Error checking user profile"));
    }

    if (!profile || !profile.is_superadmin) {
      console.error("User is not a superadmin:", user.id);
      await supabase.auth.signOut({ scope: "local" });
      return redirect("/?error=" + encodeURIComponent("Access denied. Superadmin privileges required."));
    }

    console.log("Successfully authenticated superadmin:", user.id);
    return redirect("/overview");
  } catch (error) {
    console.error("Unexpected error in checkAndHandleSuperadmin:", error);
    await supabase.auth.signOut({ scope: "local" });
    return redirect("/?error=" + encodeURIComponent("An unexpected error occurred during sign in"));
  }
};

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  
  // Get the host header directly
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  
  const callbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) {
    return encodedRedirect("error", "/forgot-password", "Email is required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${protocol}://${host}/auth/callback?redirect_to=/reset-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Could not reset password"
    );
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Check your email for a link to reset your password."
  );
};

export const resetPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    encodedRedirect(
      "error",
      "/reset-password",
      "Password and confirm password are required"
    );
  }

  if (password !== confirmPassword) {
    encodedRedirect(
      "error",
      "/reset-password",
      "Passwords do not match"
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    encodedRedirect(
      "error",
      "/reset-password",
      "Password update failed"
    );
  }

  encodedRedirect("success", "/overview", "Password updated");
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return redirect("/");
};

export const fetchImageContentAction = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch image.");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("URL is not an image.");
  }

  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  const bufferString = Buffer.from(buffer).toString("base64");
  const base64 = `data:${contentType};base64,${bufferString}`;

  return {
    base64,
    contentType,
  };
};

export const insertImageAction = async ({
  base64,
  contentType,
}: {
  base64: string;
  contentType: string;
  isPrivate?: boolean;
}) => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!user || !session) {
    throw new Error("User or session not found.");
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.almostcrackd.ai";
    
    // Step 1: Get a presigned URL from the REST API
    const presignedResp = await fetch(`${baseUrl}/pipeline/generate-presigned-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ 
        contentType,
      }),
    });

    if (!presignedResp.ok) {
      const errorText = await presignedResp.text();
      throw new Error(`Failed to get presigned URL: ${errorText}`);
    }

    const { presignedUrl, cdnUrl } = await presignedResp.json();

    if (!presignedUrl || !cdnUrl) {
      throw new Error("No presigned URL or CDN URL returned from API");
    }

    // Step 2: Convert base64 to buffer and upload to the presigned URL
    const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;
    const buffer = Buffer.from(base64Data, "base64");

    const uploadResp = await fetch(presignedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body: buffer,
    });

    if (!uploadResp.ok) {
      const errorText = await uploadResp.text();
      throw new Error(`Failed to upload image to S3: ${errorText}`);
    }

    // Finalize file uploads, including private Quick Study drafts, into this
    // environment's permanent image CDN. The API creates the private row.
    return await uploadImageFromUrlAction(cdnUrl, false);
  } catch (e: any) {
    throw new Error(e?.message || "Error inserting image.");
  }
};

export const uploadImageFromUrlAction = async (url: string, isCommonUse: boolean = false) => {
  try {
    const { image, supabase, created } = await uploadImageFromUrl(url, isCommonUse);

    // Best-effort: auto-classify the new image into a structural category.
    if (created) await classifyImageCategory(supabase, image.id, image.url);

    return { image, success: true };
  } catch (e: any) {
    throw new Error(e?.message || "Error uploading image from URL.");
  }
};

// Next.js masks errors thrown from server actions in production builds
// ("An error occurred in the Server Components render..."), so Quick Study
// uses these wrappers, which catch server-side and return the real message
// as data instead of throwing. Additive: existing callers of the throwing
// actions are unaffected.
export const uploadImageFromUrlSafeAction = async (
  url: string
): Promise<{ image?: { id?: string; url?: string }; error?: string }> => {
  try {
    return await uploadImageFromUrlAction(url);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error uploading image from URL." };
  }
};

export const insertImageSafeAction = async (input: {
  base64: string;
  contentType: string;
  isPrivate?: boolean;
}): Promise<{ image?: { id?: string; url?: string }; error?: string }> => {
  try {
    return await insertImageAction(input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inserting image." };
  }
};

export const getAuthTokenAction = async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!user || !session) {
    throw new Error("No valid authentication session or token");
  }

  return {
    user: user,
    access_token: session.access_token
  };
};
