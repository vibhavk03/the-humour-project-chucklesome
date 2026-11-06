import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// The four structural categories are rows in `common_use_categories`. We look
// them up by name (not id) so this is env-safe — the ids differ between the
// staging and production Supabase projects.
const CATEGORY_NAMES: Record<string, string> = {
  "known meme template": "Known Meme Template",
  "reaction image": "Reaction Image",
  "multi-person scene": "Multi-Person Scene",
  "scene (no people)": "Scene (No People)",
};

const CLASSIFY_PROMPT = `You classify a meme-source image into EXACTLY ONE structural category. Look at the image.
- "known meme template": a widely-recognized, reusable meme format/template that people caption repeatedly.
- "reaction image": a single subject (person/character/animal) with a strong emotional facial expression, used as a "me when..." — and NOT a famous meme template.
- "multi-person scene": two or more people/characters/figures together or interacting.
- "scene (no people)": an environment, place, object, or scene with NO people/characters.
Return ONLY JSON: {"category":"<one of the four exact strings>"}`;

/**
 * Best-effort: classify a freshly-uploaded image into one of the four structural
 * categories (via Gemini vision) and write the `common_use_category_image_mappings`
 * row. NEVER throws — a classification failure must not break the upload flow.
 * Requires `GOOGLE_AI_API_KEY` in the server environment; if it's missing this
 * is a silent no-op.
 */
export async function classifyImageCategory(
  supabase: SupabaseClient<Database>,
  imageId: string,
  imageUrl: string | null | undefined
): Promise<void> {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey || !imageId || !imageUrl) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return;

    // Fetch the image and inline it for the vision model.
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return;
    const mimeType = imgResp.headers.get("content-type") || "image/jpeg";
    const base64 = Buffer.from(await imgResp.arrayBuffer()).toString("base64");

    const visionResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: CLASSIFY_PROMPT },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
          // thinkingBudget 0 makes gemini-2.5 return content reliably (otherwise
          // reasoning tokens can consume the whole budget and leave no text).
          generationConfig: { maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );
    if (!visionResp.ok) return;

    const visionData = await visionResp.json();
    const text: string =
      visionData?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("") ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const label = String(JSON.parse(jsonMatch[0]).category ?? "")
      .trim()
      .toLowerCase();
    const categoryName = CATEGORY_NAMES[label];
    if (!categoryName) return;

    const { data: category } = await supabase
      .from("common_use_categories")
      .select("id")
      .eq("name", categoryName)
      .single();
    if (!category) return;

    // Don't double-map if this image already carries this category.
    const { data: existing } = await supabase
      .from("common_use_category_image_mappings")
      .select("id")
      .eq("image_id", imageId)
      .eq("common_use_category_id", category.id)
      .maybeSingle();
    if (existing) return;

    await supabase.from("common_use_category_image_mappings").insert({
      image_id: imageId,
      common_use_category_id: category.id,
      created_by_user_id: user.id,
      modified_by_user_id: user.id,
    });
  } catch (error) {
    // Non-fatal: log and let the upload succeed regardless.
    console.error("classifyImageCategory failed (non-fatal):", error);
  }
}
