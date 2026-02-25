import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "lucide-react";

const Schedule = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-extrabold">Schedule</h1>
      <Card className="shadow-sm">
        <CardContent className="pt-6 flex flex-col items-center justify-center py-16 text-center">
          <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-lg font-semibold text-muted-foreground">Schedule view coming soon</p>
          <p className="text-sm text-muted-foreground mt-1">Engineer scheduling and calendar will appear here.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Schedule;
