import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, isToday, parseISO } from "date-fns";
import { ArrowLeft, Briefcase, Loader2, MessageCircle, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { loadEngineerChat, markEngineerThreadRead } from "@/hooks/useEngineerChat";
import {
  ENGINEER_CHAT_CHANGED_EVENT,
  groupEngineerConversations,
  type ChatMessageRow,
  type JobInfo,
} from "@/lib/engineerChat";
import DirectMessageThread from "@/components/messages/DirectMessageThread";
import EngineerJobMessages from "@/components/messages/EngineerJobMessages";
import DataLoadError from "@/components/shared/DataLoadError";

const formatTime = (iso: string) => {
  const d = parseISO(iso);
  return isToday(d) ? format(d, "HH:mm") : format(d, "dd/MM/yy");
};

const EngineerChat = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const [params, setParams] = useSearchParams();
  const withUser = params.get("with");
  const jobParam = params.get("job");

  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [jobs, setJobs] = useState<Map<string, JobInfo>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const [chat, dir] = await Promise.all([
        loadEngineerChat(userId),
        supabase.rpc("get_org_profile_directory"),
      ]);
      setMessages(chat.messages);
      setJobs(chat.assignedJobs);
      const m = new Map<string, string>();
      for (const r of ((dir.data || []) as any[])) {
        if (r.user_id && r.display_name) m.set(r.user_id, r.display_name);
      }
      setNames(m);
    } catch (e: any) {
      setError(e?.message || "Couldn't load messages");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Live updates come from the layout's single chat channel.
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener(ENGINEER_CHAT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ENGINEER_CHAT_CHANGED_EVENT, onChange);
  }, [load]);

  // Opening a job thread clears its unread messages and notifications.
  useEffect(() => {
    if (userId && jobParam) markEngineerThreadRead(userId, { kind: "job", jobId: jobParam });
  }, [userId, jobParam]);

  const conversations = useMemo(
    () => (userId ? groupEngineerConversations(messages, userId, jobs, names) : []),
    [messages, userId, jobs, names],
  );

  const back = () => setParams({});

  if (withUser) {
    return (
      <div className="-mx-4 -my-6 bg-card">
        <DirectMessageThread
          recipientAuthId={withUser}
          engineerName={names.get(withUser) || "Office"}
          onBack={back}
          perspective="engineer"
        />
      </div>
    );
  }

  if (jobParam) {
    const info = jobs.get(jobParam);
    return (
      <div className="space-y-2">
        <button onClick={back} className="flex items-center gap-2 min-h-[44px] text-sm font-semibold text-foreground">
          <ArrowLeft className="w-5 h-5" /> Chat
        </button>
        <div className="text-[15px] font-bold text-foreground">
          {info?.job_reference || "Job"}{info?.customer_name ? ` · ${info.customer_name}` : ""}
        </div>
        <EngineerJobMessages jobId={jobParam} officeUserId="" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold text-foreground">Chat</h1>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <DataLoadError message={error} onRetry={load} />
      ) : conversations.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <MessageCircle className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">No messages yet</p>
          <p className="text-xs text-muted-foreground">Messages from the office will show here.</p>
        </div>
      ) : (
        <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {conversations.map((c) => (
            <li key={c.key}>
              <button
                onClick={() => setParams(c.kind === "direct" ? { with: c.otherUserId } : { job: c.jobId })}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[64px] text-left active:bg-muted"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {c.kind === "direct" ? <User className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`flex-1 truncate text-sm ${c.unread ? "font-bold" : "font-semibold"} text-foreground`}>{c.title}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{formatTime(c.lastAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-xs text-muted-foreground">{c.lastMessage}</span>
                    {c.unread > 0 && <span aria-label="Unread" className="w-2.5 h-2.5 rounded-full bg-destructive shrink-0" />}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EngineerChat;
