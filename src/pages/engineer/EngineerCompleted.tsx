import { Loader2, CheckCircle2 } from "lucide-react";
import EngineerJobCard from "@/components/engineer/EngineerJobCard";
import { useEngineerJobs } from "@/hooks/useEngineerJobs";

const EngineerCompleted = () => {
  const { completedJobs, customers, loading, updateJob, jobPhotos } = useEngineerJobs();

  return (
    <>
      <div className="text-lg font-extrabold text-foreground">Completed Jobs</div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : completedJobs.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border/60">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <div className="text-lg font-extrabold text-foreground mb-1.5">No completed jobs yet</div>
        </div>
      ) : (
        completedJobs.map((job: any) => (
          <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={updateJob} photos={jobPhotos[job.id] || []} />
        ))
      )}
    </>
  );
};

export default EngineerCompleted;
