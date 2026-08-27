import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageSeo from "@/components/seo/PageSeo";

const PrivacyPolicy = () => (
  <main className="min-h-screen bg-background">
    <PageSeo
      title="Privacy Policy — BookedJobs"
      description="How WebLiveView Ltd (BookedJobs) collects, uses and protects personal data under GDPR."
      path="/privacy-policy"
    />
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-1">WebLiveView Ltd – Booked Jobs</p>
      <p className="text-sm text-muted-foreground mb-1">13 Upper Baggot Street, Dublin 4</p>
      <p className="text-sm text-muted-foreground mb-1">Email: <a href="mailto:info@bookedjobs.ie" className="text-primary hover:underline">info@bookedjobs.ie</a></p>
      <p className="text-sm text-muted-foreground mb-8">Last updated: 28 February 2026</p>

      <div className="prose prose-sm max-w-none space-y-8 text-foreground/80">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Who We Are</h2>
          <p>Booked Jobs is a customer booking and service management system operated by WebLiveView Ltd, based in Ireland.</p>
          <p>We provide software to plumbing and boiler service companies to manage job bookings, payments, and customer communication.</p>
          <p>We operate only in Ireland.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Our Role Under GDPR</h2>
          <p>There are two types of data involved:</p>
          <h3 className="text-lg font-medium text-foreground mt-4">A. Plumbing Company Customers</h3>
          <p>If you submit a booking form to a plumbing company using Booked Jobs:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>The plumbing company is the <strong>Data Controller</strong></li>
            <li>WebLiveView Ltd (Booked Jobs) is the <strong>Data Processor</strong></li>
          </ul>
          <p>We process data on behalf of the plumbing company only.</p>
          <p>We do not own that data and we do not use it for marketing.</p>
          <h3 className="text-lg font-medium text-foreground mt-4">B. Plumbing Companies (Our Clients)</h3>
          <p>When plumbing companies sign up to Booked Jobs, WebLiveView Ltd acts as the <strong>Data Controller</strong> for their account and subscription data.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. What Data We Process</h2>
          <h3 className="text-lg font-medium text-foreground mt-4">A. End Customer Booking Data (on behalf of plumbers)</h3>
          <p>This may include:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Name</li>
            <li>Phone number</li>
            <li>Email address</li>
            <li>Property address</li>
            <li>Boiler details</li>
            <li>Job description</li>
            <li>Preferred service time</li>
            <li>Payment confirmation reference (processed via plumber's Stripe account)</li>
          </ul>
          <p>We do not store or access card numbers. All card payments are processed securely through Stripe.</p>

          <h3 className="text-lg font-medium text-foreground mt-4">B. Plumbing Company Account Data</h3>
          <p>We collect:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Contact name</li>
            <li>Business email</li>
            <li>Phone number</li>
            <li>Billing information</li>
            <li>Subscription payment data (processed through Stripe)</li>
          </ul>
          <p>We do not store full card details.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. How We Use Data</h2>
          <p>We use data strictly to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Deliver booking system services</li>
            <li>Send job notifications</li>
            <li>Process subscription payments</li>
            <li>Provide customer support</li>
            <li>Maintain system security</li>
          </ul>
          <p>We do not sell data. We do not send marketing to plumbing customers. We do not run third-party advertising based on booking data.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">5. Data Storage & Security</h2>
          <p>We use the following secure service providers:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Tally (form collection)</li>
            <li>Supabase (EU-hosted database)</li>
            <li>Stripe (payment processing)</li>
            <li>WhatsApp Business API (customer communication)</li>
            <li>Google Analytics (B2B website tracking only)</li>
          </ul>
          <p>All systems use secure authentication and encrypted connections. Access is restricted to authorised personnel only.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">6. Data Retention</h2>
          <p>We apply the following retention policy:</p>
          <h3 className="text-lg font-medium text-foreground mt-4">Booking Data</h3>
          <p>Stored for up to 6 years to support tax, accounting, and service record obligations of plumbing companies.</p>
          <h3 className="text-lg font-medium text-foreground mt-4">Inactive Plumbing Company Accounts</h3>
          <p>Deleted 12 months after account closure unless legally required to retain.</p>
          <h3 className="text-lg font-medium text-foreground mt-4">Trial Accounts</h3>
          <p>Deleted after 90 days if not converted.</p>
          <p>Data may be deleted earlier upon request by the plumbing company (Data Controller).</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">7. Your Rights</h2>
          <p>Under GDPR, individuals have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access their data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion</li>
            <li>Restrict processing</li>
            <li>Lodge a complaint with the Data Protection Commission (Ireland)</li>
          </ul>
          <p>If you are a plumbing customer, please contact the plumbing company directly first.</p>
          <p>If needed, you may contact us at <a href="mailto:info@bookedjobs.ie" className="text-primary hover:underline">info@bookedjobs.ie</a>.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">8. International Transfers</h2>
          <p>All services are configured for EU hosting where possible.</p>
          <p>We do not intentionally transfer data outside the European Union without appropriate safeguards.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">9. Website Tracking</h2>
          <p>Our website uses Google Analytics for business performance monitoring.</p>
          <p>We do not use tracking for plumbing customer booking data.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">10. Changes to This Policy</h2>
          <p>We may update this policy from time to time. The latest version will always be available on our website.</p>
        </section>
      </div>
    </div>
  </main>
);

export default PrivacyPolicy;
