import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ENGINEER_CHAT_CHANGED_EVENT,
  NOTIFICATIONS_CHANGED_EVENT,
  countEngineerUnread,
  type ChatMessageRow,
  type JobInfo,
} from "@/lib/engineerChat";

export interface EngineerChatData {
  messages: ChatMessageRow[];
  assignedJobs: Map<string, JobInfo>;
}

/**
 * Loads the messages the engineer can chat about: direct messages to/from
 * them, and messages on jobs currently assigned to them. RLS keeps it
 * tenant-scoped; the assignment filter keeps it engineer-scoped.
 */
export async function loadEngineerChat(userId: string): Promise<EngineerChatData> {
  const { data: eng, error: engErr } = await supabase
    .from("engineers")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (engErr) throw engErr;

  const assignedJobs = new Map<string, JobInfo>();
  let jobRows: ChatMessageRow[] = [];
  if (eng?.id) {
    const { data, error } = await supabase
      .from("job_messages")
      .select("id, job_id, sender_id, sender_role, recipient_id, message, read_at, created_at, service_calls!inner(job_reference, assigned_engineer_id, customers(name))")
      .not("job_id", "is", null)
      .eq("service_calls.assigned_engineer_id", eng.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    for (const r of (data || []) as any[]) {
      if (r.job_id && !assignedJobs.has(r.job_id)) {
        assignedJobs.set(r.job_id, {
          job_reference: r.service_calls?.job_reference ?? null,
          customer_name: r.service_calls?.customers?.name ?? null,
        });
      }
    }
    jobRows = (data || []) as unknown as ChatMessageRow[];
  }

  const { data: direct, error: dErr } = await supabase
    .from("job_messages")
    .select("id, job_id, sender_id, sender_role, recipient_id, message, read_at, created_at")
    .is("job_id", null)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (dErr) throw dErr;

  return { messages: [...jobRows, ...((direct || []) as ChatMessageRow[])], assignedJobs };
}

/**
 * Chat tab badge. Owns the single realtime channel for engineer chat and
 * re-broadcasts changes as a window event so the chat page can refresh
 * without opening a second channel.
 */
export function useEngineerChatUnread() {
  const { user } = useAuth();
  const userId = user?.id;
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const { messages, assignedJobs } = await loadEngineerChat(userId);
      setCount(countEngineerUnread(messages, userId, new Set(assignedJobs.keys())));
    } catch (e) {
      console.error("[engineer-chat] unread refresh failed", e);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`engineer-chat-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_messages" }, () => {
        // The window listener below does the refresh (one path, no double fetch).
        window.dispatchEvent(new Event(ENGINEER_CHAT_CHANGED_EVENT));
      })
      .subscribe();
    const onLocal = () => refresh();
    window.addEventListener(ENGINEER_CHAT_CHANGED_EVENT, onLocal);
    window.addEventListener("focus", onLocal);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener(ENGINEER_CHAT_CHANGED_EVENT, onLocal);
      window.removeEventListener("focus", onLocal);
    };
  }, [userId, refresh]);

  return count;
}

/**
 * Marks one thread read for the signed-in engineer: only office-sent messages
 * in that thread, and only this user's own message notifications for it.
 */
export async function markEngineerThreadRead(
  userId: string,
  thread: { kind: "direct"; otherUserId: string } | { kind: "job"; jobId: string },
) {
  const now = new Date().toISOString();
  let msgQ = supabase
    .from("job_messages")
    .update({ read_at: now })
    .neq("sender_role", "engineer")
    .is("read_at", null);
  let notifQ = supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_user_id", userId)
    .eq("notification_type", "message")
    .eq("is_read", false);
  if (thread.kind === "direct") {
    msgQ = msgQ.is("job_id", null).eq("recipient_id", userId).eq("sender_id", thread.otherUserId);
    notifQ = notifQ.is("job_id", null).eq("metadata->>sender_id", thread.otherUserId);
  } else {
    msgQ = msgQ.eq("job_id", thread.jobId);
    notifQ = notifQ.eq("job_id", thread.jobId);
  }
  const [m, n] = await Promise.all([msgQ, notifQ]);
  if (m.error) console.error("[engineer-chat] mark messages read failed", m.error);
  if (n.error) console.error("[engineer-chat] mark notifications read failed", n.error);
  window.dispatchEvent(new Event(ENGINEER_CHAT_CHANGED_EVENT));
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
