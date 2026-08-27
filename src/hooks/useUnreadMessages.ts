import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { counterpartRole, type ChatPerspective } from "@/lib/chatUnread";

/**
 * Unread internal-chat count for the chat icon badge.
 *
 * Counts only messages authored by the *other* side (see `counterpartRole`), so
 * a sender never bumps their own badge. Pass `jobId` to scope the count to a
 * single job (engineer job chat); omit it for the global Chat Inbox badge.
 * Row visibility is enforced by RLS on `job_messages`, which keeps the count
 * tenant-scoped.
 */
export function useUnreadMessages(
  perspective: ChatPerspective = "office",
  jobId?: string,
) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from("job_messages")
      .select("*", { count: "exact", head: true })
      .eq("sender_role", counterpartRole(perspective))
      .is("read_at", null);
    if (jobId) query = query.eq("job_id", jobId);
    const { count } = await query;
    setUnreadCount(count || 0);
  }, [user, perspective, jobId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`unread-messages-${perspective}-${jobId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_messages" }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, perspective, jobId, refresh]);

  return unreadCount;
}
