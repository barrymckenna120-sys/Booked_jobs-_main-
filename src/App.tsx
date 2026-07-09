import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { WhatsAppConnectionProvider } from "@/hooks/useWhatsAppConnection";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { resolveLandingPath } from "@/lib/resolveLandingPath";

import { supabase } from "@/integrations/supabase/client";
import Auth from "./pages/Auth";
import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import OfficeRoute from "./components/shared/OfficeRoute";
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
import IncomingJobsDebug from "./pages/IncomingJobsDebug";
import EngineerLayout from "./components/engineer/EngineerLayout";
import EngineerToday from "./pages/engineer/EngineerToday";
import EngineerUpcoming from "./pages/engineer/EngineerUpcoming";
import EngineerCompleted from "./pages/engineer/EngineerCompleted";
import EngineerJobDetail from "./pages/engineer/EngineerJobDetail";
import EngineerCertificates from "./pages/engineer/EngineerCertificates";
import NotFound from "./pages/NotFound";
import Index from "./pages/Index";
import BookingRedirect from "./pages/BookingRedirect";
import Finance from "./pages/Finance";
import FinancePage from "./pages/FinancePage";
import SalesLedger from "./pages/SalesLedger";
import Schedule from "./pages/Schedule";
import Pipeline from "./pages/Pipeline";
import InboxPage from "./pages/Inbox";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsAndConditions from "./pages/TermsAndConditions";
import DataProcessingAgreement from "./pages/DataProcessingAgreement";
import ResetPassword from "./pages/ResetPassword";
import ServiceReceipt from "./pages/ServiceReceipt";
import InvoicePreview from "./pages/InvoicePreview";
import Messages from "./pages/Messages";
import SystemLogs from "./pages/SystemLogs";
import InstallAppBanner from "./components/pwa/InstallAppBanner";
import PWAUpdateBanner from "./components/pwa/PWAUpdateBanner";
import Products from "./pages/Products";
import QuotesList from "./pages/QuotesList";
import QuoteNew from "./pages/QuoteNew";
import QuoteEdit from "./pages/QuoteEdit";
import QuoteDetail from "./pages/QuoteDetail";
import MessageLog from "./pages/MessageLog";
import PdfRedirect from "./pages/PdfRedirect";
import CertificateRedirect from "./pages/CertificateRedirect";
import CertificateViewer from "./pages/CertificateViewer";
import Parts from "./pages/Parts";
import WarrantyTracker from "./pages/WarrantyTracker";
import WarrantyDetail from "./pages/WarrantyDetail";
import PublicReceipt from "./pages/PublicReceipt";
import InvoiceRedirect from "./pages/InvoiceRedirect";
import ReceiptRedirect from "./pages/ReceiptRedirect";
import AudioDebug from "./pages/AudioDebug";
import Offline from "./pages/Offline";
import BusinessInsightsDashboard from "./pages/BusinessInsightsDashboard";
import AdminPanel from "./pages/AdminPanel";
import TenantDetail from "./pages/admin/TenantDetail";
import { AdminViewAsProvider } from "@/hooks/useAdminViewAs";
import AdminViewAsBanner from "@/components/admin/AdminViewAsBanner";



const queryClient = new QueryClient();


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

const RootRoute = () => {
  const { user, loading } = useAuth("");
  const [target, setTarget] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    setResolving(true);
    resolveLandingPath(user.id)
      .then(setTarget)
      .finally(() => setResolving(false));
  }, [loading, user]);

  if (loading || (user && (resolving || !target))) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#ffffff",
      }}>
        <img src="/icons/icon-192.png" style={{ width: 80, height: 80 }} />
      </div>
    );
  }

  if (!user) return <Index />;
  return <Navigate to={target!} replace />;
};

function AppContent() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#ffffff"
      }}>
        <img
          src="/icons/icon-192.png"
          style={{ width: 80, height: 80, marginBottom: 16 }}
        />
        <p style={{ color: "#4A86E8", fontSize: 16 }}>Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/parts" element={<Parts />} />
        <Route path="/warranty" element={<OfficeRoute><WarrantyTracker /></OfficeRoute>} />
        <Route path="/insights" element={<OfficeRoute><BusinessInsightsDashboard /></OfficeRoute>} />
        <Route path="/warranty/:id" element={<OfficeRoute><WarrantyDetail /></OfficeRoute>} />
        <Route path="/products" element={<Products />} />
        <Route path="/settings" element={<OfficeRoute><Settings /></OfficeRoute>} />
        <Route path="/settings/import" element={<ImportCustomers />} />

        {/* Legacy routes — redirect to new locations */}
        <Route path="/renewals" element={<Navigate to="/pipeline" replace />} />
        <Route path="/incoming" element={<Navigate to="/pipeline" replace />} />
        <Route path="/quotes" element={<Navigate to="/pipeline" replace />} />
        <Route path="/sales-ledger" element={<Navigate to="/finance" replace />} />
        <Route path="/message-log" element={<MessageLog />} />
        <Route path="/messages" element={<Navigate to="/inbox" replace />} />
        <Route path="/system-logs" element={<SystemLogs />} />
        <Route path="/debug/incoming-jobs" element={<IncomingJobsDebug />} />

        {/* Quote detail routes still work directly */}
        <Route path="/quotes/new" element={<QuoteNew />} />
        <Route path="/quotes/:id" element={<QuoteDetail />} />
        <Route path="/quotes/:id/edit" element={<QuoteEdit />} />

        {/* WhatsApp direct routes still work */}
        <Route path="/whatsapp" element={<WhatsApp />} />
        <Route path="/whatsapp/templates" element={<WhatsAppTemplates />} />
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
      <Route path="/receipt-view/:id" element={<ServiceReceipt />} />
      <Route path="/invoice-view/:id" element={<InvoicePreview />} />
      <Route path="/engineer-app" element={<Navigate to="/engineer/today" replace />} />
      <Route path="/quote/:quoteNumber" element={<QuoteAcceptance />} />
      <Route path="/pdf/:quoteNumber" element={<PdfRedirect />} />
      <Route path="/certificates/:certNumber" element={<CertificateRedirect />} />
      <Route path="/certificate/:certNumber" element={<CertificateRedirect />} />
      <Route path="/cert/:certNumber" element={<CertificateViewer />} />
      <Route path="/r/:receiptNumber" element={<PublicReceipt />} />
      <Route path="/invoice/:invoiceNumber" element={<InvoiceRedirect />} />
      <Route path="/receipt/:receiptNumber" element={<ReceiptRedirect />} />
      <Route path="/b/:token" element={<BookingRedirect />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
      <Route path="/data-processing-agreement" element={<DataProcessingAgreement />} />
      <Route path="/debug/audio" element={<AudioDebug />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/admin/tenants/:orgId" element={<TenantDetail />} />
      <Route path="/offline" element={<Offline />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}


const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WhatsAppConnectionProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AdminViewAsProvider>
        <AdminViewAsBanner />
        <RecoveryRedirectGuard>
          <PWAUpdateBanner />
          <InstallAppBanner />

          <AppContent />
          
          </RecoveryRedirectGuard>
        </AdminViewAsProvider>
      </BrowserRouter>
      </WhatsAppConnectionProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
