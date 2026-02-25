import { Loader2 } from "lucide-react";
import EngineerJobCard from "@/components/engineer/EngineerJobCard";
import { useEngineerJobs } from "@/hooks/useEngineerJobs";

const EngineerCompleted = () => {
  const { completedJobs, customers, loading, updateJob } = useEngineerJobs();

  return (
    <>
      <div className="text-[17px] font-extrabold text-foreground">Completed Jobs</div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : completedJobs.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-2xl border border-border">
          <div className="text-5xl mb-2.5">✅</div>
          <div className="text-lg font-extrabold text-foreground mb-1">No completed jobs yet</div>
        </div>
      ) : (
        completedJobs.map((job: any) => (
          <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={updateJob} />
        ))
      )}
    </>
  );
};

export default EngineerCompleted;
