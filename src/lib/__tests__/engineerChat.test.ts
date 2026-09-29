import { describe, expect, it } from "vitest";
import { countEngineerUnread, groupEngineerConversations, type ChatMessageRow } from "@/lib/engineerChat";

const ME = "eng-1";
const row = (p: Partial<ChatMessageRow>): ChatMessageRow => ({
  id: Math.random().toString(36),
  job_id: null,
  sender_id: "office-1",
  sender_role: "office",
  recipient_id: ME,
  message: "hi",
  read_at: null,
  created_at: "2026-09-29T10:00:00Z",
  ...p,
});

describe("engineer chat unread", () => {
  it("counts direct office messages to me and messages on my assigned jobs only", () => {
    const msgs = [
      row({}),
      row({ recipient_id: "someone-else" }),
      row({ job_id: "job-mine", recipient_id: null }),
      row({ job_id: "job-other", recipient_id: null }),
      row({ sender_role: "engineer", sender_id: ME, recipient_id: "office-1" }),
      row({ read_at: "2026-09-29T10:01:00Z" }),
    ];
    expect(countEngineerUnread(msgs, ME, new Set(["job-mine"]))).toBe(2);
  });

  it("drops a job from the badge once it is reassigned away", () => {
    const msgs = [row({ job_id: "job-1", recipient_id: null })];
    expect(countEngineerUnread(msgs, ME, new Set(["job-1"]))).toBe(1);
    expect(countEngineerUnread(msgs, ME, new Set())).toBe(0);
  });

  it("groups direct threads by the other person and job threads by job, newest first", () => {
    const convs = groupEngineerConversations(
      [
        row({ created_at: "2026-09-29T09:00:00Z", message: "old" }),
        row({ sender_id: ME, sender_role: "engineer", recipient_id: "office-1", created_at: "2026-09-29T09:30:00Z", message: "reply" }),
        row({ job_id: "job-1", recipient_id: null, created_at: "2026-09-29T10:00:00Z", message: "job msg" }),
      ],
      ME,
      new Map([["job-1", { job_reference: "KN-001", customer_name: "Mary" }]]),
      new Map([["office-1", "Nicole"]]),
    );
    expect(convs.map((c) => c.title)).toEqual(["KN-001 · Mary", "Nicole"]);
    expect(convs[1].lastMessage).toBe("reply");
    expect(convs[1].unread).toBe(1);
  });
});
