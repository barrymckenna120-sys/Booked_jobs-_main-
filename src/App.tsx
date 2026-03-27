import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { WhatsAppConnectionProvider } from "@/hooks/useWhatsAppConnection";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Auth from "./pages/Auth";
import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import Jobs from "./pages/Jobs";
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
import EngineerCertificates from "./pages/engineer/EngineerCertificates";
import NotFound from "./pages/NotFound";
import Index from "./pages/Index";
import Finance from "./pages/Finance";
import SalesLedger from "./pages/SalesLedger";
import Schedule from "./pages/Schedule";
import TeamManagement from "./pages/TeamManagement";
import AuditLog from "./pages/AuditLog";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsAndConditions from "./pages/TermsAndConditions";
import DataProcessingAgreement from "./pages/DataProcessingAgreement";
import ResetPassword from "./pages/ResetPassword";
import ServiceReceipt from "./pages/ServiceReceipt";
import Messages from "./pages/Messages";
import SystemLogs from "./pages/SystemLogs";
import InstallAppBanner from "./components/pwa/InstallAppBanner";
import Products from "./pages/Products";
import QuotesList from "./pages/QuotesList";
import QuoteNew from "./pages/QuoteNew";
import QuoteEdit from "./pages/QuoteEdit";
import QuoteDetail from "./pages/QuoteDetail";
import MessageLog from "./pages/MessageLog";
import PdfRedirect from "./pages/PdfRedirect";
import CertificateRedirect from "./pages/CertificateRedirect";
import Parts from "./pages/Parts";
const queryClient = new QueryClient();

/**
 * Global guard: if the URL contains a recovery token (hash or query),
 * redirect to /reset-password before any other route renders.
 * Also listens for the PASSWORD_RECOVERY auth event as a fallback.
 */
const RecoveryRedirectGuard = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/reset-password") return;

    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const isRecovery =
      hash.includes("type=recovery") ||
      params.get("type") === "recovery";

    if (isRecovery) {
      navigate("/reset-password" + window.location.hash, { replace: true });
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && location.pathname !== "/reset-password") {
        navigate("/reset-password", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WhatsAppConnectionProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RecoveryRedirectGuard>
          <InstallAppBanner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/quotes" element={<QuotesList />} />
              <Route path="/quotes/new" element={<QuoteNew />} />
              <Route path="/quotes/:id" element={<QuoteDetail />} />
              <Route path="/quotes/:id/edit" element={<QuoteEdit />} />
              <Route path="/products" element={<Products />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/renewals" element={<Renewals />} />
              <Route path="/whatsapp" element={<WhatsApp />} />
              <Route path="/whatsapp/templates" element={<WhatsAppTemplates />} />
              <Route path="/incoming" element={<IncomingJobs />} />
              
              <Route path="/finance" element={<Finance />} />
              <Route path="/sales-ledger" element={<SalesLedger />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/import" element={<ImportCustomers />} />
              <Route path="/system-logs" element={<SystemLogs />} />
              <Route path="/message-log" element={<MessageLog />} />
              <Route path="/parts" element={<Parts />} />
            </Route>
            {/* Engineer Mode */}
            <Route path="/engineer" element={<EngineerLayout />}>
              <Route index element={<Navigate to="/engineer/today" replace />} />
              <Route path="today" element={<EngineerToday />} />
              <Route path="upcoming" element={<EngineerUpcoming />} />
              <Route path="completed" element={<EngineerCompleted />} />
            </Route>
            <Route path="/engineer/job/:id" element={<EngineerJobDetail />} />
            <Route path="/engineer/job/:id/certificates" element={<EngineerCertificates />} />
            <Route path="/receipt/:id" element={<ServiceReceipt />} />
            <Route path="/engineer-app" element={<Navigate to="/engineer/today" replace />} />
            <Route path="/quote/:quoteNumber" element={<QuoteAcceptance />} />
            <Route path="/pdf/:quoteNumber" element={<PdfRedirect />} />
            <Route path="/certificates/:certNumber" element={<CertificateRedirect />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
            <Route path="/data-processing-agreement" element={<DataProcessingAgreement />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </RecoveryRedirectGuard>
      </BrowserRouter>
      </WhatsAppConnectionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;