import { createClient } from "@/lib/supabase/client";

const BUCKET = "cvs";
const SIGNED_URL_EXPIRY = 60 * 60; // 1 hour

/**
 * Extract the storage path from a cv_url value.
 * The DB may store either:
 *  - A full Supabase public URL like https://<project>.supabase.co/storage/v1/object/public/cvs/<path>
 *  - Just the storage path like "<userId>/cv-123.pdf"
 * This normalizes to just the path.
 */
function extractStoragePath(cvUrl: string): string | null {
  if (!cvUrl || !cvUrl.trim()) return null;

  // If it's a full Supabase storage URL, extract the path after the bucket name
  const publicMarker = `/storage/v1/object/public/${BUCKET}/`;
  const signedMarker = `/storage/v1/object/sign/${BUCKET}/`;

  for (const marker of [publicMarker, signedMarker]) {
    const idx = cvUrl.indexOf(marker);
    if (idx !== -1) {
      // Get everything after the marker, strip query params
      const pathWithParams = cvUrl.slice(idx + marker.length);
      return pathWithParams.split("?")[0];
    }
  }

  // If it looks like a full URL but doesn't match our patterns, it's invalid
  if (cvUrl.startsWith("http://") || cvUrl.startsWith("https://")) {
    // Try to extract path from any URL format — last resort
    try {
      const url = new URL(cvUrl);
      const parts = url.pathname.split(`/${BUCKET}/`);
      if (parts.length > 1) return parts[1];
    } catch {
      // Not a valid URL
    }
    return null;
  }

  // It's already a storage path
  return cvUrl;
}

/**
 * Get a working preview URL for a resume.
 * Tries signed URL first (works for private buckets),
 * falls back to public URL.
 */
export async function getResumePreviewUrl(
  cvUrl: string
): Promise<{ url: string } | { error: string }> {
  const path = extractStoragePath(cvUrl);

  if (!path) {
    return { error: "No valid resume file found. Please re-upload your resume." };
  }

  const supabase = createClient();

  // Try creating a signed URL (works for both public and private buckets)
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY);

  if (error || !data?.signedUrl) {
    if (process.env.NODE_ENV === "development") {
      console.error("[resume-url] Signed URL error:", error?.message, "path:", path);
    }
    return { error: "Resume preview unavailable. Please re-upload your file." };
  }

  return { url: data.signedUrl };
}
