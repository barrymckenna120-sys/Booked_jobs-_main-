import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plug } from "lucide-react";

const IntegrationsTab = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-foreground mb-1">Integrations</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Connect BookedJobs to your favourite tools and services.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">Connected Services</CardTitle>
          <CardDescription>Manage your third-party integrations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Plug className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-semibold text-muted-foreground">No integrations configured yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Integrations with payment providers, accounting tools and more coming soon.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default IntegrationsTab;
