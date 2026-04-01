import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

type OutstandingJob = {
  id: string;
  revenue: number;
  deposit_amount: number;
};

const eur = (n: number) => `€${n.toFixed(2)}`;

const EngineerOutstandingBalances = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<OutstandingJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      const { data: eng } = await supabase
        .from("engineers")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!eng) { setLoading(false); return; }

      const { data: rows } = await supabase
        .from("service_calls")
        .select("id, revenue, deposit_amount, deposit_paid, payment_status")
        .eq("assigned_engineer_id", eng.id)
        .eq("deposit_paid", true)
        .neq("payment_status", "paid")
        .not("status", "eq", "Cancelled");

      if (rows) {
        setJobs(
          rows
            .filter((r: any) => {
              const rev = r.revenue || 0;
              const dep = r.deposit_amount || 0;
              return rev > dep && dep > 0;
            })
            .map((r: any) => ({
              id: r.id,
              revenue: r.revenue || 0,
              deposit_amount: r.deposit_amount || 0,
            }))
        );
      }
      setLoading(false);
    })();
  }, [user]);

  if (loading) return null;
  if (jobs.length === 0) return null;

  const totalBalance = jobs.reduce((sum, j) => sum + (j.revenue - j.deposit_amount), 0);

  return (
    <button
      onClick={() => navigate("/finance?tab=balances")}
      className="w-full flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors"
      style={{
        background: "#FFFBEB",
        borderColor: "#FDE68A",
      }}
    >
      <span className="text-sm font-bold" style={{ color: "#92400E" }}>
        ⚠️ {jobs.length} outstanding balance{jobs.length !== 1 ? "s" : ""} · {eur(totalBalance)}
      </span>
      <ChevronRight className="w-4 h-4 ml-auto shrink-0" style={{ color: "#92400E" }} />
    </button>
  );
};

export default EngineerOutstandingBalances;
