import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { WhatsAppConnectionProvider } from "@/hooks/useWhatsAppConnection";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useEffect, useState, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import { resolveLandingPath } from "@/lib/resolveLandingPath";
import { supabase } from "@/integrations/supabase/client";

import Auth from "./pages/Auth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Offline from "./pages/Offline";
import AppLayout from "./components/layout/AppLayout";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import OfficeRoute from "./components/shared/OfficeRoute";
import EngineerLayout from "./components/engineer/EngineerLayout";
import InstallAppBanner from "./components/pwa/InstallAppBanner";
import PWAUpdateBanner from "./components/pwa/PWAUpdateBanner";

import { AdminViewAsProvider } from "@/hooks/useAdminViewAs";
import AdminViewAsBanner from "@/components/admin/AdminViewAsBanner";
import DevConsole from "@/components/dev/DevConsole";

// Lazy: everything behind a navigation. Keeps the landing page and login
// bundle small on first visit (mobile / slow connections).
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Jobs = lazy(() => import("./pages/Jobs"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const ImportCustomers = lazy(() => import("./pages/ImportCustomers"));
const QuoteAcceptance = lazy(() => import("./pages/QuoteAcceptance"));
const WhatsApp = lazy(() => import("./pages/WhatsApp"));
const WhatsAppTemplates = lazy(() => import("./pages/WhatsAppTemplates"));
const IncomingJobsDebug = lazy(() => import("./pages/IncomingJobsDebug"));
const EngineerToday = lazy(() => import("./pages/engineer/EngineerToday"));
const EngineerUpcoming = lazy(() => import("./pages/engineer/EngineerUpcoming"));
const EngineerCompleted = lazy(() => import("./pages/engineer/EngineerCompleted"));
const EngineerParts = lazy(() => import("./pages/engineer/EngineerParts"));
const EngineerJobDetail = lazy(() => import("./pages/engineer/EngineerJobDetail"));
const EngineerCertificates = lazy(() => import("./pages/engineer/EngineerCertificates"));
const BookingRedirect = lazy(() => import("./pages/BookingRedirect"));
const FinancePage = lazy(() => import("./pages/FinancePage"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const InboxPage = lazy(() => import("./pages/Inbox"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const DataProcessingAgreement = lazy(() => import("./pages/DataProcessingAgreement"));
const ServiceReceipt = lazy(() => import("./pages/ServiceReceipt"));
const InvoicePreview = lazy(() => import("./pages/InvoicePreview"));
const SystemLogs = lazy(() => import("./pages/SystemLogs"));
const Products = lazy(() => import("./pages/Products"));
const QuoteNew = lazy(() => import("./pages/QuoteNew"));
const QuoteEdit = lazy(() => import("./pages/QuoteEdit"));
const QuoteDetail = lazy(() => import("./pages/QuoteDetail"));
const MessageLog = lazy(() => import("./pages/MessageLog"));
const WhatsAppDiagnostics = lazy(() => import("./pages/WhatsAppDiagnostics"));
const PdfRedirect = lazy(() => import("./pages/PdfRedirect"));
const CertificateRedirect = lazy(() => import("./pages/CertificateRedirect"));
const HazardRedirect = lazy(() => import("./pages/HazardRedirect"));
const Parts = lazy(() => import("./pages/Parts"));
const WarrantyTracker = lazy(() => import("./pages/WarrantyTracker"));
const WarrantyDetail = lazy(() => import("./pages/WarrantyDetail"));
const PublicReceipt = lazy(() => import("./pages/PublicReceipt"));
const InvoiceRedirect = lazy(() => import("./pages/InvoiceRedirect"));
const ReceiptRedirect = lazy(() => import("./pages/ReceiptRedirect"));
const AudioDebug = lazy(() => import("./pages/AudioDebug"));
const BusinessInsightsDashboard = lazy(
  () => import("./pages/BusinessInsightsDashboard")
);
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const TenantDetail = lazy(() => import("./pages/admin/TenantDetail"));
const ResetAdmin = lazy(() => import("./pages/ResetAdmin"));

const queryClient = new QueryClient();

const RecoveryRedirectGuard = ({
  children,
}: {
  children: React.ReactNode;
}) => {
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "PASSWORD_RECOVERY" &&
        location.pathname !== "/reset-password"
      ) {
        navigate("/reset-password", { replace: true });
      }

      if (
        event === "SIGNED_OUT" &&
        location.pathname !== "/reset-password"
      ) {
        navigate("/auth", { replace: true });
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
    return <RouteFallback />;
  }

  if (!user) {
    return <Index />;
  }

  return <Navigate to={target!} replace />;
};

/** Full-screen brand loader, used only while the session is being restored. */
const RouteFallback = () => (
  <div
    role="status"
    aria-live="polite"
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100dvh",
      minHeight: "100vh",
      backgroundColor: "#ffffff",
    }}
  >
    <img
      src="/icons/icon-192.png"
      alt=""
      width={80}
      height={80}
      style={{
        width: 80,
        height: 80,
        marginBottom: 16,
      }}
    />
    <p style={{ color: "#4A86E8", fontSize: 16 }}>Loading...</p>
  </div>
);

function AppContent() {
  const { loading } = useAuth("");
  const location = useLocation();

  if (loading) {
    return <RouteFallback />;
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      {/* Outer boundary covers the standalone routes that render without a
          layout (auth, password reset, public receipts/redirects). Routes
          inside AppLayout / EngineerLayout have their own nested boundary. */}
      <ErrorBoundary key={location.pathname} name="app-shell" homePath="/">
      <Routes>

        <Route path="/" element={<RootRoute />} />
        <Route path="/auth" element={<Auth />} />
        <Route
          path="/.lovable/oauth/consent"
          element={<OAuthConsent />}
        />
        <Route
          path="/reset-password"
          element={<ResetPassword />}
        />
        <Route path="/reset-admin" element={<ResetAdmin />} />

        <Route element={<AppLayout />}>
          <Route
            path="/dashboard"
            element={
              <ErrorBoundary>
                <Dashboard />
              </ErrorBoundary>
            }
          />

          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/customers" element={<Customers />} />
          <Route
            path="/customers/:id"
            element={<CustomerDetail />}
          />
          <Route path="/schedule" element={<Schedule />} />

          <Route
            path="/finance"
            element={
              <OfficeRoute>
                <FinancePage />
              </OfficeRoute>
            }
          />

          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/parts" element={<Parts />} />

          <Route
            path="/warranty"
            element={
              <OfficeRoute>
                <WarrantyTracker />
              </OfficeRoute>
            }
          />

          <Route
            path="/insights"
            element={
              <OfficeRoute>
                <BusinessInsightsDashboard />
              </OfficeRoute>
            }
          />

          <Route
            path="/warranty/:id"
            element={
              <OfficeRoute>
                <WarrantyDetail />
              </OfficeRoute>
            }
          />

          <Route path="/products" element={<Products />} />

          <Route
            path="/settings"
            element={
              <OfficeRoute>
                <Settings />
              </OfficeRoute>
            }
          />

          <Route
            path="/settings/import"
            element={
              <OfficeRoute>
                <ImportCustomers />
              </OfficeRoute>
            }
          />

          {/* Legacy routes — redirect to new locations */}
          <Route
            path="/renewals"
            element={<Navigate to="/pipeline" replace />}
          />
          <Route
            path="/incoming"
            element={<Navigate to="/pipeline" replace />}
          />
          <Route
            path="/quotes"
            element={<Navigate to="/pipeline" replace />}
          />
          <Route
            path="/sales-ledger"
            element={<Navigate to="/finance" replace />}
          />

          <Route
            path="/message-log"
            element={
              <OfficeRoute>
                <MessageLog />
              </OfficeRoute>
            }
          />

          <Route
            path="/messages"
            element={<Navigate to="/inbox" replace />}
          />

          <Route
            path="/system-logs"
            element={
              <OfficeRoute>
                <SystemLogs />
              </OfficeRoute>
            }
          />

          <Route
            path="/diagnostics/whatsapp"
            element={
              <OfficeRoute>
                <WhatsAppDiagnostics />
              </OfficeRoute>
            }
          />

          <Route
            path="/debug/incoming-jobs"
            element={
              <OfficeRoute>
                <IncomingJobsDebug />
              </OfficeRoute>
            }
          />

          {/* Quote detail routes still work directly */}
          <Route path="/quotes/new" element={<QuoteNew />} />
          <Route path="/quotes/:id" element={<QuoteDetail />} />
          <Route
            path="/quotes/:id/edit"
            element={<QuoteEdit />}
          />

          {/* WhatsApp direct routes still work */}
          <Route
            path="/whatsapp"
            element={
              <OfficeRoute>
                <WhatsApp />
              </OfficeRoute>
            }
          />

          <Route
            path="/whatsapp/templates"
            element={
              <OfficeRoute>
                <WhatsAppTemplates />
              </OfficeRoute>
            }
          />
        </Route>

        {/* Engineer Mode */}
        <Route path="/engineer" element={<EngineerLayout />}>
          <Route
            index
            element={
              <Navigate to="/engineer/today" replace />
            }
          />
          <Route
            path="today"
            element={<EngineerToday />}
          />
          <Route
            path="upcoming"
            element={<EngineerUpcoming />}
          />
          <Route
            path="completed"
            element={<EngineerCompleted />}
          />
          <Route
            path="parts"
            element={<EngineerParts />}
          />
        </Route>

        <Route
          path="/engineer/job/:id"
          element={<EngineerJobDetail />}
        />

        <Route
          path="/engineer/job/:id/certificates"
          element={<EngineerCertificates />}
        />

        <Route
          path="/receipt-view/:id"
          element={<ServiceReceipt />}
        />

        <Route
          path="/invoice-view/:id"
          element={<InvoicePreview />}
        />

        <Route
          path="/engineer-app"
          element={
            <Navigate
              to="/engineer/today"
              replace
            />
          }
        />

        {/* Public document links — routed by unguessable access_token. */}
        <Route
          path="/quote/:token"
          element={<QuoteAcceptance />}
        />
        <Route
          path="/pdf/:token"
          element={<PdfRedirect />}
        />
        <Route
          path="/certificates/:token"
          element={<CertificateRedirect />}
        />
        <Route
          path="/certificate/:token"
          element={<CertificateRedirect />}
        />
        <Route
          path="/cert/:token"
          element={<CertificateRedirect />}
        />
        <Route
          path="/r/:receiptNumber"
          element={<PublicReceipt />}
        />
        <Route
          path="/invoice/:token"
          element={<InvoiceRedirect />}
        />
        <Route
          path="/receipt/:token"
          element={<ReceiptRedirect />}
        />
        <Route
          path="/hazard/:token"
          element={<HazardRedirect />}
        />
        <Route
          path="/b/:token"
          element={<BookingRedirect />}
        />

        <Route
          path="/privacy-policy"
          element={<PrivacyPolicy />}
        />
        <Route
          path="/terms-and-conditions"
          element={<TermsAndConditions />}
        />
        <Route
          path="/data-processing-agreement"
          element={<DataProcessingAgreement />}
        />
        <Route
          path="/debug/audio"
          element={<AudioDebug />}
        />

        <Route
          path="/admin"
          element={<AdminPanel />}
        />

        <Route
          path="/admin/tenants/:orgId"
          element={<TenantDetail />}
        />

        <Route
          path="/offline"
          element={<Offline />}
        />

        <Route
          path="*"
          element={<NotFound />}
        />
      </Routes>
      </ErrorBoundary>

    </Suspense>
  );
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <DevConsole />

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