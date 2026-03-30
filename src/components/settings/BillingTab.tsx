import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Receipt } from "lucide-react";

const BillingTab = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-foreground mb-1">Billing</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Manage your BookedJobs subscription and billing details.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">Subscription</CardTitle>
          <CardDescription>Your current plan and billing information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Receipt className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-semibold text-muted-foreground">Billing management coming soon</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              You'll be able to view invoices, update payment methods and manage your plan here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingTab;
