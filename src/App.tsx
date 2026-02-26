import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Auth from "./pages/Auth";
import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Jobs from "./pages/Jobs";
import Quotes from "./pages/Quotes";
import JobDetail from "./pages/JobDetail";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Renewals from "./pages/Renewals";
import Settings from "./pages/Settings";
import ImportCustomers from "./pages/ImportCustomers";
import QuoteAcceptance from "./pages/QuoteAcceptance";
import WhatsApp from "./pages/WhatsApp";
import WhatsAppTemplates from "./pages/WhatsAppTemplates";
import IncomingJobs from "./pages/IncomingJobs";
import EngineerAvailability from "./pages/EngineerAvailability";
import EngineerLayout from "./components/engineer/EngineerLayout";
import EngineerToday from "./pages/engineer/EngineerToday";
import EngineerUpcoming from "./pages/engineer/EngineerUpcoming";
import EngineerCompleted from "./pages/engineer/EngineerCompleted";
import EngineerJobDetail from "./pages/engineer/EngineerJobDetail";
import NotFound from "./pages/NotFound";
import Index from "./pages/Index";
import Finance from "./pages/Finance";
import Schedule from "./pages/Schedule";
import TeamManagement from "./pages/TeamManagement";
import AuditLog from "./pages/AuditLog";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/renewals" element={<Renewals />} />
            <Route path="/whatsapp" element={<WhatsApp />} />
            <Route path="/whatsapp/templates" element={<WhatsAppTemplates />} />
            <Route path="/incoming" element={<IncomingJobs />} />
            <Route path="/engineers" element={<EngineerAvailability />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/import" element={<ImportCustomers />} />
            <Route path="/team" element={<TeamManagement />} />
            <Route path="/audit-log" element={<AuditLog />} />
          </Route>
          {/* Engineer Mode */}
          <Route path="/engineer" element={<EngineerLayout />}>
            <Route index element={<Navigate to="/engineer/today" replace />} />
          <Route path="today" element={<EngineerToday />} />
            <Route path="upcoming" element={<EngineerUpcoming />} />
            <Route path="completed" element={<EngineerCompleted />} />
          </Route>
          {/* Engineer job detail — outside layout (no bottom nav) */}
          <Route path="/engineer/job/:id" element={<EngineerJobDetail />} />
          {/* Legacy route redirect */}
          <Route path="/engineer-app" element={<Navigate to="/engineer/today" replace />} />
          <Route path="/quote/:quoteId" element={<QuoteAcceptance />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
