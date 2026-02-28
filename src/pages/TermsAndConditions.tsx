import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const TermsAndConditions = () => (
  <main className="min-h-screen bg-background">
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>
      <h1 className="text-3xl font-bold mb-6">Terms & Conditions</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: 28 February 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-foreground/80">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Agreement</h2>
          <p>By accessing or using BookedJobs, you agree to be bound by these Terms & Conditions. If you do not agree, you must not use the service.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Service Description</h2>
          <p>BookedJobs provides a cloud-based job management platform for plumbing and heating businesses, including scheduling, customer management, quoting, and communication tools.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. Account Responsibilities</h2>
          <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorised use.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. Acceptable Use</h2>
          <p>You agree not to misuse the service, including but not limited to: sending spam, uploading malicious content, or attempting to access other users' data.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">5. Payments & Billing</h2>
          <p>Subscription fees are billed in accordance with the plan you select. All fees are exclusive of VAT unless otherwise stated. We reserve the right to change pricing with 30 days' notice.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">6. Intellectual Property</h2>
          <p>All content, features, and functionality of BookedJobs are owned by us. You retain ownership of data you input into the platform.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">7. Limitation of Liability</h2>
          <p>To the fullest extent permitted by law, BookedJobs shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">8. Termination</h2>
          <p>Either party may terminate the agreement at any time. Upon termination, your right to use the service ceases immediately. We will make your data available for export for 30 days following termination.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">9. Governing Law</h2>
          <p>These terms are governed by the laws of Ireland. Any disputes shall be subject to the exclusive jurisdiction of the Irish courts.</p>
        </section>
      </div>
    </div>
  </main>
);

export default TermsAndConditions;
