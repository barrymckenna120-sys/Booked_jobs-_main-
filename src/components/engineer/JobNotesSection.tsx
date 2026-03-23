import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, FileText, Save, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Props {
  jobId: string;
  customerId: string;
  jobNotes?: string | null;
}

const JobNotesSection = ({ jobId, customerId, jobNotes }: Props) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: callNotes = [], refetch } = useQuery({
    queryKey: ["engineer-job-notes", jobId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_call_notes")
        .select("id, note, created_at, created_by_name")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  const handleSave = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get engineer display name
      const { data: eng } = await supabase
        .from("engineers")
        .select("name")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      const { error } = await supabase.from("customer_call_notes").insert({
        customer_id: customerId,
        user_id: user.id,
        note: note.trim(),
        created_by_name: eng?.name || "Engineer",
        service_call_id: jobId,
      } as any);

      if (error) throw error;

      setNote("");
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
      refetch();
    } catch (err: any) {
      toast({ title: "Error saving note", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Combine job-level notes with call notes
  const allNotes: { id: string; note: string; date: string; author?: string }[] = [];
  if (jobNotes) {
    allNotes.push({ id: "job-notes", note: jobNotes, date: "", author: "Job Notes" });
  }
  callNotes.forEach((n: any) => {
    allNotes.push({
      id: n.id,
      note: n.note,
      date: n.created_at ? format(parseISO(n.created_at), "dd/MM/yyyy HH:mm") : "",
      author: n.created_by_name || "—",
    });
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger className="flex items-center justify-between w-full bg-muted/40 rounded-xl px-4 py-3 text-sm font-bold text-foreground">
        <span className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#4A86E8]" /> Notes
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {allNotes.length === 0 && (
          <div className="text-center text-muted-foreground text-xs py-3">No notes yet</div>
        )}
        {allNotes.map((n) => (
          <div key={n.id} className="bg-card border border-border/60 rounded-xl p-3 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground/70 font-medium">{n.author}</span>
              {n.date && <span className="text-[11px] text-muted-foreground/50">{n.date}</span>}
            </div>
            <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">{n.note}</p>
          </div>
        ))}

        {/* Add note */}
        <div className="pt-1 space-y-2">
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note…"
            className="text-[15px] min-h-[80px] p-3"
          />
          <Button
            className="w-full h-11 text-sm font-extrabold gap-2"
            onClick={handleSave}
            disabled={saving || !note.trim()}
          >
            {showSaved ? (
              <><CheckCircle2 className="w-4 h-4" /> Note saved ✓</>
            ) : (
              <><Save className="w-4 h-4" /> Save Note</>
            )}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default JobNotesSection;
