/**
 * Engineer-app chat helpers (pure, unit-tested).
 *
 * "Unread for the engineer" = an office-authored message (sender_role is not
 * 'engineer') with no read_at that is either a direct message addressed to the
 * engineer, or a message on a job currently assigned to them. Org-wide office
 * messages on other engineers' jobs never count.
 */
export interface ChatMessageRow {
  id: string;
  job_id: string | null;
  sender_id: string | null;
  sender_role: string;
  recipient_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
}

export interface JobInfo {
  job_reference: string | null;
  customer_name: string | null;
}

export type Conversation =
  | {
      kind: "direct";
      key: string;
      otherUserId: string;
      title: string;
      lastMessage: string;
      lastAt: string;
      unread: number;
    }
  | {
      kind: "job";
      key: string;
      jobId: string;
      title: string;
      lastMessage: string;
      lastAt: string;
      unread: number;
    };

/** Window event: something changed the engineer's messages/notifications read state. */
export const ENGINEER_CHAT_CHANGED_EVENT = "bj:engineer-chat-changed";
export const NOTIFICATIONS_CHANGED_EVENT = "bj:notifications-changed";

export const isUnreadForEngineer = (
  m: ChatMessageRow,
  userId: string,
  assignedJobIds: ReadonlySet<string>,
): boolean => {
  if (m.sender_role === "engineer" || m.read_at) return false;
  if (m.job_id === null) return m.recipient_id === userId;
  return assignedJobIds.has(m.job_id);
};

export const countEngineerUnread = (
  messages: ChatMessageRow[],
  userId: string,
  assignedJobIds: ReadonlySet<string>,
): number => messages.filter((m) => isUnreadForEngineer(m, userId, assignedJobIds)).length;

/** Groups messages into conversations, newest first. */
export const groupEngineerConversations = (
  messages: ChatMessageRow[],
  userId: string,
  assignedJobs: ReadonlyMap<string, JobInfo>,
  officeNames: ReadonlyMap<string, string>,
): Conversation[] => {
  const assignedIds = new Set(assignedJobs.keys());
  const map = new Map<string, Conversation>();

  for (const m of messages) {
    let key: string;
    let base: Conversation;
    if (m.job_id === null) {
      const other =
        m.sender_id === userId ? m.recipient_id : m.recipient_id === userId ? m.sender_id : null;
      if (!other) continue;
      key = `direct:${other}`;
      base = {
        kind: "direct",
        key,
        otherUserId: other,
        title: officeNames.get(other) || "Office",
        lastMessage: "",
        lastAt: "",
        unread: 0,
      };
    } else {
      const info = assignedJobs.get(m.job_id);
      if (!info) continue;
      key = `job:${m.job_id}`;
      const ref = info.job_reference || "Job";
      base = {
        kind: "job",
        key,
        jobId: m.job_id,
        title: info.customer_name ? `${ref} · ${info.customer_name}` : ref,
        lastMessage: "",
        lastAt: "",
        unread: 0,
      };
    }
    const conv = map.get(key) ?? base;
    if (!conv.lastAt || m.created_at > conv.lastAt) {
      conv.lastAt = m.created_at;
      conv.lastMessage = m.message;
    }
    if (isUnreadForEngineer(m, userId, assignedIds)) conv.unread += 1;
    map.set(key, conv);
  }

  return [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
};
