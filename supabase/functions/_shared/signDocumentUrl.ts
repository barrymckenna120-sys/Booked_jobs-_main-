// Shared helper: mint a short-lived signed URL for a private storage object.
// Used by the resolve-document-link function to redirect callers to a fresh
// URL on every tap. Falls back to null on any failure so callers can render
// a clean "not found" state instead of exposing a raw error.

import { createClient } from "npm:@supabase/supabase-js@2";

export async function signDocumentUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey || !bucket || !path) return null;

  try {
    const sb = createClient(supabaseUrl, serviceKey);
    const { data, error } = await sb.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch (_e) {
    return null;
  }
}

// Extracts the object path from a stored value that may be either a raw
// storage object path (`<org_id>/<file>.pdf`) OR a legacy full public URL
// (`https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>`).
// Returns just the object path within the bucket; the leading bucket segment
// is stripped when present.
export function extractStoragePath(bucket: string, stored: string | null | undefined): string | null {
  if (!stored) return null;
  const s = String(stored).trim();
  if (!s) return null;

  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const signMarker = `/storage/v1/object/sign/${bucket}/`;
  const idxPublic = s.indexOf(publicMarker);
  if (idxPublic !== -1) {
    const rest = s.slice(idxPublic + publicMarker.length);
    // strip any query string that may have been appended to the URL
    return rest.split("?")[0];
  }
  const idxSign = s.indexOf(signMarker);
  if (idxSign !== -1) {
    return s.slice(idxSign + signMarker.length).split("?")[0];
  }
  // Otherwise assume this is already an object path within the bucket
  return s.replace(/^\/+/, "");
}
