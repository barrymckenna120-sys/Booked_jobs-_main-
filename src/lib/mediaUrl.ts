import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves a display URL for a media item.
 * - Cloudinary videos: use public_url directly (hosted externally)
 * - Supabase storage: generate a signed URL from storage_path
 */

const SIGNED_URL_EXPIRY = 3600; // 1 hour

const isCloudinaryUrl = (url: string | null): boolean =>
  !!url && url.includes("cloudinary.com");

interface MediaWithPath {
  id: string;
  storage_path: string;
  public_url: string | null;
}

/**
 * Hook that resolves signed URLs for an array of media items.
 * Cloudinary items get their public_url passed through.
 * Supabase storage items get a fresh signed URL.
 * Returns a map of id → resolved URL.
 */
export function useSignedMediaUrls(media: MediaWithPath[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const resolvedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const toResolve: MediaWithPath[] = [];

    const immediateUrls: Record<string, string> = {};

    for (const m of media) {
      if (resolvedIds.current.has(m.id)) continue;

      if (isCloudinaryUrl(m.public_url)) {
        // Cloudinary — use directly
        immediateUrls[m.id] = m.public_url!;
        resolvedIds.current.add(m.id);
      } else if (m.storage_path && !m.storage_path.startsWith("cloudinary/")) {
        toResolve.push(m);
      }
    }

    if (Object.keys(immediateUrls).length > 0) {
      setUrls((prev) => ({ ...prev, ...immediateUrls }));
    }

    if (toResolve.length === 0) return;

    const paths = toResolve.map((m) => m.storage_path);

    supabase.storage
      .from("job-media")
      .createSignedUrls(paths, SIGNED_URL_EXPIRY)
      .then(({ data, error }) => {
        if (error || !data) return;

        const newUrls: Record<string, string> = {};
        data.forEach((item, index) => {
          if (item.signedUrl) {
            const mediaItem = toResolve[index];
            newUrls[mediaItem.id] = item.signedUrl;
            resolvedIds.current.add(mediaItem.id);
          }
        });

        if (Object.keys(newUrls).length > 0) {
          setUrls((prev) => ({ ...prev, ...newUrls }));
        }
      });
  }, [media]);

  return urls;
}

/**
 * Get a single signed URL (for one-off use, e.g. receipts).
 */
export async function getSignedUrl(storagePath: string): Promise<string | null> {
  if (!storagePath || storagePath.startsWith("cloudinary/")) return null;

  const { data } = await supabase.storage
    .from("job-media")
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

  return data?.signedUrl || null;
}
