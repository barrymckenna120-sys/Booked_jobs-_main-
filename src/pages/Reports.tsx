import { lazy, Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, BarChart2, Users } from "lucide-react";

const BusinessInsightsDashboard = lazy(() => import("./BusinessInsightsDashboard"));
const EngineerPerformance = lazy(() => import("@/components/reports/EngineerPerformance"));

const Fallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

/**
 * Reports shell. Tab 1 renders the existing Business Insights screen untouched;
 * Tab 2 is the new Engineer Performance report.
 */
const Reports = () => {
  const [tab, setTab] = useState("insights");

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <div className="px-4 pt-4 md:px-6">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="insights" className="flex-1 gap-1.5 sm:flex-none">
            <BarChart2 className="h-4 w-4" /> Business Insights
          </TabsTrigger>
          <TabsTrigger value="engineers" className="flex-1 gap-1.5 sm:flex-none">
            <Users className="h-4 w-4" /> Engineer Performance
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="insights" className="mt-0">
        <Suspense fallback={<Fallback />}>
          <BusinessInsightsDashboard />
        </Suspense>
      </TabsContent>

      <TabsContent value="engineers" className="mt-0">
        <div className="p-4 md:p-6">
          <Suspense fallback={<Fallback />}>
            <EngineerPerformance />
          </Suspense>
        </div>
      </TabsContent>
    </Tabs>
  );
};

export default Reports;
