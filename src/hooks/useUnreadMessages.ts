import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetch = async () => {
    if (!user) return;
    // Count unread engineer messages across all jobs belonging to this user
    const { count } = await supabase
      .from("job_messages")
      .select("*", { count: "exact", head: true })
      .eq("sender_role", "engineer")
      .is("read_at", null);
    setUnreadCount(count || 0);
  };

  useEffect(() => {
    fetch();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("unread-messages-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "job_messages" }, () => {
        fetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return unreadCount;
}
