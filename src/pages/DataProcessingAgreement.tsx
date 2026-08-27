import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageSeo from "@/components/seo/PageSeo";

const DataProcessingAgreement = () => (
  <main className="min-h-screen bg-background">
    <PageSeo
      title="Data Processing Agreement — BookedJobs"
      description="GDPR Data Processing Agreement between WebLiveView Ltd (BookedJobs) and subscribing plumbing and heating companies."
      path="/data-processing-agreement"
    />
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>
      <h1 className="text-3xl font-bold mb-2">Data Processing Agreement (DPA)</h1>
      <p className="text-sm text-muted-foreground mb-1">Booked Jobs – WebLiveView Ltd</p>
      <p className="text-sm text-muted-foreground mb-1">13 Upper Baggot Street, Dublin 4</p>
      <p className="text-sm text-muted-foreground mb-1">Email: <a href="mailto:info@bookedjobs.ie" className="text-primary hover:underline">info@bookedjobs.ie</a></p>
      <p className="text-sm text-muted-foreground mb-8">Last updated: 28 February 2026</p>

      <div className="prose prose-sm max-w-none space-y-8 text-foreground/80">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Purpose</h2>
          <p>This Data Processing Agreement forms part of the Terms & Conditions between:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>WebLiveView Ltd ("Processor")</li>
            <li>The subscribing plumbing or heating company ("Controller")</li>
          </ul>
          <p>This agreement governs the processing of personal data under the General Data Protection Regulation (GDPR).</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Roles</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>The plumbing company is the <strong>Data Controller</strong>.</li>
            <li>WebLiveView Ltd (Booked Jobs) is the <strong>Data Processor</strong>.</li>
          </ul>
          <p>The Controller determines the purpose and means of processing customer data.</p>
          <p>The Processor acts only on documented instructions from the Controller.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. Nature of Processing</h2>
          <p>The Processor provides:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Online job booking forms</li>
            <li>Customer communication notifications</li>
            <li>Job scheduling tools</li>
            <li>Payment reference notifications</li>
            <li>Customer data storage</li>
          </ul>
          <p>Processing is limited to enabling plumbing service operations.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. Types of Personal Data Processed</h2>
          <p>On behalf of the Controller, the Processor may process:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Name</li>
            <li>Phone number</li>
            <li>Email address</li>
            <li>Property address</li>
            <li>Boiler details</li>
            <li>Job descriptions</li>
            <li>Service dates</li>
            <li>Payment confirmation references</li>
          </ul>
          <p>The Processor does not store full payment card details.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">5. Processor Obligations</h2>
          <p>WebLiveView Ltd agrees to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Process data only for service delivery</li>
            <li>Not use customer data for marketing</li>
            <li>Implement appropriate technical and organisational security measures</li>
            <li>Restrict access to authorised personnel only</li>
            <li>Assist the Controller with data access or deletion requests</li>
            <li>Notify the Controller without undue delay in the event of a data breach</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">6. Sub-Processors</h2>
          <p>The Controller authorises the use of the following sub-processors:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Tally (form collection)</li>
            <li>Supabase (EU-hosted database)</li>
            <li>Stripe (payment processing)</li>
            <li>WhatsApp Business API provider</li>
            <li>Secure hosting providers</li>
          </ul>
          <p>All sub-processors must provide GDPR-compliant safeguards.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">7. Data Retention</h2>
          <p>Customer booking data is retained:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>For up to 6 years (to support tax and service record obligations), unless the Controller requests earlier deletion.</li>
          </ul>
          <p>Upon account termination:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Data may be deleted within a reasonable timeframe.</li>
            <li>The Controller may request written confirmation of deletion.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">8. International Transfers</h2>
          <p>Where data is processed outside the EU, appropriate safeguards such as Standard Contractual Clauses will apply.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">9. Data Subject Rights</h2>
          <p>If a customer submits a GDPR request:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>The Controller remains responsible for responding.</li>
            <li>The Processor will assist where technically possible.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">10. Term & Termination</h2>
          <p>This DPA remains in effect for the duration of the subscription agreement.</p>
          <p>Upon termination of services, processing ceases and data may be deleted in accordance with the retention policy.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">11. Governing Law</h2>
          <p>This agreement is governed by the laws of Ireland.</p>
        </section>
      </div>
    </div>
  </main>
);

export default DataProcessingAgreement;
