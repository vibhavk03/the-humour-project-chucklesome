"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Server action to get a presigned URL for image upload.
 * This only generates the presigned URL - the actual upload happens on the client.
 */
export async function getPresignedUrlAction(
  contentType: string
): Promise<{ presignedUrl: string; cdnUrl: string }> {
  const supabase = await createClient();

  // Get session on server side - more reliable
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    console.error("No session found on server:", sessionError);
    throw new Error("Authentication required. Please log in.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.almostcrackd.ai";
  
  try {
    // Get presigned URL from REST API
    const presignedResponse = await fetch(`${baseUrl}/pipeline/generate-presigned-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        contentType: contentType || 'application/octet-stream',
      })
    });

    if (!presignedResponse.ok) {
      const errorText = await presignedResponse.text();
      throw new Error(`Failed to get presigned URL: ${errorText}`);
    }

    const { presignedUrl, cdnUrl } = await presignedResponse.json();

    if (!presignedUrl || !cdnUrl) {
      throw new Error("No presigned URL or CDN URL returned from API");
    }

    return { presignedUrl, cdnUrl };
  } catch (error) {
    console.error("Get presigned URL error:", error);
    throw error instanceof Error ? error : new Error("Failed to get presigned URL");
  }
}

/**
 * Server action to register an uploaded image in the database.
 * Called after the client has successfully uploaded to S3.
 */
export async function registerUploadedImageAction(
  cdnUrl: string,
  isCommonUse: boolean = true
) {
  const supabase = await createClient();

  // Get session on server side - more reliable
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    console.error("No session found on server:", sessionError);
    throw new Error("Authentication required. Please log in.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.almostcrackd.ai";
  
  try {
    // Register the image using the CDN URL
    const registerResponse = await fetch(`${baseUrl}/pipeline/upload-image-from-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        imageUrl: cdnUrl,
        isCommonUse
      })
    });

    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      throw new Error(`Failed to register image: ${errorText}`);
    }

    const registerData = await registerResponse.json();
    console.log("Full register response data:", JSON.stringify(registerData, null, 2));
    
    // The API returns {imageId: "...", now: ...}
    // We need to create a proper image object with id field
    let image = null;
    
    if (registerData.imageId) {
      // Create proper image object with id field
      image = { 
        id: registerData.imageId,
        url: cdnUrl, // Include the CDN URL from the presigned upload
        created_datetime_utc: new Date().toISOString(),
        is_common_use: isCommonUse
      };
    } else if (registerData.id) {
      // Fallback if API returns id directly
      image = registerData;
      if (!image.url) {
        image.url = cdnUrl;
      }
    } else if (registerData.image) {
      // Another fallback if API returns nested image
      image = registerData.image;
    }
    
    // Final validation
    if (!image || !image.id) {
      throw new Error(`Invalid image data returned from API. Response: ${JSON.stringify(registerData)}`);
    }
    
    console.log("Created image object:", image);

    return { success: true, image };
  } catch (error) {
    console.error("Register image error:", error);
    throw error instanceof Error ? error : new Error("Image registration failed");
  }
}

/**
 * Legacy server action for backwards compatibility.
 * This should not be used for large files as it uploads from the server.
 * @deprecated Use getPresignedUrlAction + client upload + registerUploadedImageAction instead
 */
export async function uploadCommonUseImageAction(
  file: { name: string; type: string; base64: string }
) {
  const supabase = await createClient();

  // Get session on server side - more reliable
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    console.error("No session found on server:", sessionError);
    throw new Error("Authentication required. Please log in.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.almostcrackd.ai";
  
  try {
    // Step 1: Get presigned URL from REST API
    const presignedResponse = await fetch(`${baseUrl}/pipeline/generate-presigned-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        contentType: file.type || 'application/octet-stream',
      })
    });

    if (!presignedResponse.ok) {
      const errorText = await presignedResponse.text();
      throw new Error(`Failed to get presigned URL: ${errorText}`);
    }

    const { presignedUrl, cdnUrl } = await presignedResponse.json();

    if (!presignedUrl || !cdnUrl) {
      throw new Error("No presigned URL or CDN URL returned from API");
    }

    // Step 2: Convert base64 to buffer and upload to the presigned URL
    const base64Data = file.base64.includes(",") ? file.base64.split(",")[1] : file.base64;
    const buffer = Buffer.from(base64Data, "base64");

    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      const responseText = await uploadResponse.text();
      throw new Error(`Upload to S3 failed: ${responseText}`);
    }

    // Step 3: Register the image using the CDN URL
    const registerResponse = await fetch(`${baseUrl}/pipeline/upload-image-from-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        imageUrl: cdnUrl,
        isCommonUse: true
      })
    });

    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      throw new Error(`Failed to register image: ${errorText}`);
    }

    const registerData = await registerResponse.json();
    console.log("Full register response data:", JSON.stringify(registerData, null, 2));
    
    // The API returns {imageId: "...", now: ...}
    // We need to create a proper image object with id field
    let image = null;
    
    if (registerData.imageId) {
      // Create proper image object with id field
      image = { 
        id: registerData.imageId,
        url: cdnUrl, // Include the CDN URL from the presigned upload
        created_datetime_utc: new Date().toISOString(),
        is_common_use: true
      };
    } else if (registerData.id) {
      // Fallback if API returns id directly
      image = registerData;
      if (!image.url) {
        image.url = cdnUrl;
      }
    } else if (registerData.image) {
      // Another fallback if API returns nested image
      image = registerData.image;
    }
    
    // Final validation
    if (!image || !image.id) {
      throw new Error(`Invalid image data returned from API. Response: ${JSON.stringify(registerData)}`);
    }
    
    console.log("Created image object:", image);

    return { success: true, image };
  } catch (error) {
    console.error("Upload error:", error);
    throw error instanceof Error ? error : new Error("Upload failed");
  }
}

export async function checkAuthStatusAction() {
  const supabase = await createClient();
  
  const { data: { session } } = await supabase.auth.getSession();
  const { data: { user } } = await supabase.auth.getUser();
  
  return { 
    isAuthenticated: !!(session?.access_token), 
    hasUser: !!user,
    userEmail: user?.email 
  };
}