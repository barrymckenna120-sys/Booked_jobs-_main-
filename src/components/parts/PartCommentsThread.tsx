import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatPartTimestamp } from "@/lib/partsDates";
import { addPartComment, deletePartComment, listPartComments } from "@/lib/partsRequests";

/**
 * BJ-0071 — permanent comment log on a parts request.
 *
 * Shared by the office Parts page, Job Detail, the customer record and the
 * engineer app so all four read the same thread. Office and engineers can both
 * post; a comment can be removed by its author (office can remove any, enforced
 * by RLS, not by hiding the button).
 */
interface Props {
  partsRequestId: string;
  organisationId: string | null | undefined;
  authorName?: string | null;
  authorRole?: string | null;
  /** Compact styling for the engineer app / narrow cards. */
  compact?: boolean;
  className?: string;
}

const PartCommentsThread = ({
  partsRequestId,
  organisationId,
  authorName,
  authorRole,
  compact = false,
  className = "",
}: Props) => {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const load = async () => {
    const { comments: rows, error } = await listPartComments(partsRequestId);
    if (error) {
      toast.error("Couldn't load comments", { description: error.message });
    }
    setComments(rows);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data?.user?.id ?? null);
    });
    setLoading(true);
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partsRequestId]);

  // Keep the thread live so office and engineer see each other's comments
  // without a manual refresh, matching the parts_requests realtime pattern.
  useEffect(() => {
    const channel = supabase
      .channel(`part-comments-${partsRequestId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parts_request_comments",
          filter: `parts_request_id=eq.${partsRequestId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partsRequestId]);

  const post = async () => {
    if (!body.trim()) return;
    if (!organisationId) {
      toast.error("Couldn't add comment", { description: "Organisation not ready — try again." });
      return;
    }
    setSaving(true);
    const { error } = await addPartComment({
      partsRequestId,
      organisationId,
      body,
      authorName,
      authorRole,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't add comment", { description: error.message });
      return;
    }
    setBody("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await deletePartComment(id);
    if (error) {
      toast.error("Couldn't delete comment", { description: error.message });
      return;
    }
    load();
  };

  const textSize = compact ? "text-[13px]" : "text-sm";

  return (
    <div className={`space-y-2 ${className}`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <MessageSquare className="w-3.5 h-3.5" strokeWidth={2.5} />
        Comments {comments.length > 0 && `(${comments.length})`}
      </div>

      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : (
        comments.length > 0 && (
          <ul className="space-y-1.5">
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg bg-secondary/60 border border-border/60 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className={`${textSize} text-foreground/90 leading-snug whitespace-pre-wrap break-words`}>
                    {c.body}
                  </p>
                  {c.author_id && userId === c.author_id && (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      onClick={() => remove(c.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  <span className="font-semibold">{c.author_name || "Unknown"}</span>
                  {c.author_role ? ` · ${c.author_role}` : ""} ·{" "}
                  <span className="font-mono">{formatPartTimestamp(c.created_at)}</span>
                </p>
              </li>
            ))}
          </ul>
        )
      )}

      <div className="flex items-end gap-1.5">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={compact ? 2 : 1}
          className={`flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 ${textSize} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none`}
        />
        <button
          type="button"
          onClick={post}
          disabled={saving || !body.trim()}
          aria-label="Post comment"
          className="shrink-0 h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  );
};

export default PartCommentsThread;
