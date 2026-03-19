import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInMinutes } from "date-fns";
import { RefreshCw, Trash2, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface LogRow {
  id: string;
  function_name: string;
  error_message: string;
  payload: unknown;
  created_at: string;
}

const SystemLogs = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["edge-function-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edge_function_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as LogRow[];
    },
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const ids = logs.map((l) => l.id);
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("edge_function_logs" as any)
        .delete()
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["edge-function-logs"] });
      toast({ title: "Logs cleared", description: "All error logs have been deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear logs.", variant: "destructive" });
    },
  });

  const isRecent = (createdAt: string) => differenceInMinutes(new Date(), new Date(createdAt)) < 60;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">System Logs</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-1.5" disabled={logs.length === 0}>
                <Trash2 className="w-4 h-4" /> Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all logs?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all {logs.length} error log{logs.length !== 1 ? "s" : ""}. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => clearAll.mutate()}>Delete All</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading logs…</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center gap-2">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <p className="text-green-600 font-medium">No errors logged — all systems running</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Time</TableHead>
                <TableHead className="w-[180px]">Function</TableHead>
                <TableHead>Error Message</TableHead>
                <TableHead className="w-[100px]">Payload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {logs.map((log) => {
                const expanded = expandedId === log.id;
                return (
                  <>
                    <TableRow key={log.id} className="align-top">
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {format(new Date(log.created_at), "dd MMM yyyy, HH:mm")}
                          </span>
                          {isRecent(log.created_at) && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Recent</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{log.function_name}</code>
                      </TableCell>
                      <TableCell className="text-sm text-destructive max-w-[300px] break-words">
                        {log.error_message}
                      </TableCell>
                      <TableCell>
                        {log.payload ? (
                          <button
                            onClick={() => setExpandedId(expanded ? null : log.id)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            {expanded ? "Hide" : "View"}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                    {expanded && log.payload && (
                      <TableRow key={`${log.id}-payload`}>
                        <TableCell colSpan={4} className="bg-muted/50 p-0">
                          <pre className="text-xs p-4 overflow-x-auto max-h-60 whitespace-pre-wrap">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default SystemLogs;
