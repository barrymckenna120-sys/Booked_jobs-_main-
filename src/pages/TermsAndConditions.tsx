import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageSeo from "@/components/seo/PageSeo";

const TermsAndConditions = () => (
  <main className="min-h-screen bg-background">
    <PageSeo
      title="Terms & Conditions — BookedJobs"
      description="Terms governing use of the BookedJobs platform by plumbing and heating businesses in Ireland."
      path="/terms-and-conditions"
    />
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>
      <h1 className="text-3xl font-bold mb-2">Terms & Conditions</h1>
      <p className="text-sm text-muted-foreground mb-1">Booked Jobs – WebLiveView Ltd</p>
      <p className="text-sm text-muted-foreground mb-1">13 Upper Baggot Street, Dublin 4</p>
      <p className="text-sm text-muted-foreground mb-1">Email: <a href="mailto:info@bookedjobs.ie" className="text-primary hover:underline">info@bookedjobs.ie</a></p>
      <p className="text-sm text-muted-foreground mb-8">Last updated: 28 February 2026</p>

      <div className="prose prose-sm max-w-none space-y-8 text-foreground/80">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Overview</h2>
          <p>Booked Jobs is a SaaS booking and customer management system operated by WebLiveView Ltd.</p>
          <p>These Terms govern the use of the Booked Jobs platform by registered plumbing and heating companies in Ireland.</p>
          <p>By subscribing to Booked Jobs, you agree to these Terms.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Eligibility</h2>
          <p>Booked Jobs is available only to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Registered plumbing and heating businesses</li>
            <li>Sole traders or limited companies operating in Ireland</li>
          </ul>
          <p>The system may not be used for non-plumbing businesses.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. Subscription & Pricing</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Subscription fee: €200 + VAT per month</li>
            <li>Payment is processed via Stripe</li>
            <li>Subscription renews automatically each month</li>
            <li>No refunds are provided once payment is processed</li>
          </ul>
          <p>You may cancel at any time. Cancellation stops future billing but does not refund the current billing period.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. Free Trial</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>14-day free trial</li>
            <li>Full access during trial</li>
            <li>No payment required until trial ends</li>
          </ul>
          <p>If subscription is not activated after trial:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Account access is removed</li>
            <li>Trial data is deleted</li>
          </ul>
          <p>WebLiveView Ltd reserves the right to remove trial access at its discretion.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">5. Payment Terms</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Payments are processed securely via Stripe</li>
            <li>We do not store card details</li>
          </ul>
          <p>If payment fails:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>A retry period of up to 7 days applies</li>
            <li>If payment remains unpaid, account access may be suspended</li>
          </ul>
          <p>We reserve the right to suspend accounts for non-payment.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">6. Acceptable Use</h2>
          <p>You agree that:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>The system will only be used for plumbing and heating services</li>
            <li>You may send service-related and marketing messages to your customers</li>
            <li>You will not store sensitive medical or special category data</li>
            <li>You will not use the system for illegal activity</li>
          </ul>
          <p>WebLiveView Ltd may suspend or terminate accounts for misuse.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">7. Data Ownership</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>The plumbing company owns all customer data submitted through the platform</li>
            <li>WebLiveView Ltd acts as a Data Processor</li>
            <li>We do not use customer data for marketing</li>
            <li>We only access customer data when required for technical support</li>
          </ul>
          <p>Upon account closure:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Data may be deleted after a reasonable retention period</li>
            <li>You may request earlier deletion in writing</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">8. Termination & Suspension</h2>
          <p>We may suspend or terminate access:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>For non-payment</li>
            <li>For breach of these Terms</li>
            <li>For illegal activity</li>
            <li>For misuse of the platform</li>
          </ul>
          <p>Suspension does not remove outstanding payment obligations.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">9. Service Availability</h2>
          <p>Booked Jobs is provided as a business tool.</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Support is provided during business hours only</li>
            <li>No Service Level Agreement (SLA) is provided</li>
            <li>We do not guarantee uninterrupted service</li>
            <li>We are not responsible for outages caused by third-party providers (Stripe, WhatsApp, hosting providers, etc.)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">10. Limitation of Liability</h2>
          <p>Booked Jobs is a software platform.</p>
          <p>We are not liable for:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Missed jobs</li>
            <li>Lost revenue</li>
            <li>Customer disputes</li>
            <li>Message delivery failures</li>
            <li>Third-party system outages</li>
          </ul>
          <p>Total liability is limited to the value of the last three months of subscription fees paid.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">11. Governing Law</h2>
          <p>These Terms are governed by the laws of Ireland.</p>
          <p>Any disputes will be subject to Irish courts.</p>
        </section>
      </div>
    </div>
  </main>
);

export default TermsAndConditions;
