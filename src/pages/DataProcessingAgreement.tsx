import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const DataProcessingAgreement = () => (
  <main className="min-h-screen bg-background">
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>
      <h1 className="text-3xl font-bold mb-6">Data Processing Agreement</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: 28 February 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-foreground/80">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Scope & Purpose</h2>
          <p>This Data Processing Agreement ("DPA") forms part of the agreement between BookedJobs ("Processor") and the subscribing business ("Controller") for the provision of job management services. This DPA governs the processing of personal data in accordance with the General Data Protection Regulation (GDPR).</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Definitions</h2>
          <p>"Personal Data", "Processing", "Data Subject", "Controller", and "Processor" shall have the meanings given in the GDPR.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. Data Processing Details</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Subject matter:</strong> Provision of job management software</li>
            <li><strong>Duration:</strong> The term of your subscription</li>
            <li><strong>Nature and purpose:</strong> Storage, organisation, and retrieval of customer and job data</li>
            <li><strong>Categories of data subjects:</strong> Your customers, employees, and engineers</li>
            <li><strong>Types of personal data:</strong> Names, addresses, phone numbers, email addresses, job records</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. Obligations of the Processor</h2>
          <p>BookedJobs shall:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Process personal data only on documented instructions from the Controller</li>
            <li>Ensure persons authorised to process data have committed to confidentiality</li>
            <li>Implement appropriate technical and organisational security measures</li>
            <li>Assist the Controller in responding to data subject requests</li>
            <li>Delete or return all personal data upon termination of the agreement</li>
            <li>Make available all information necessary to demonstrate compliance</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">5. Sub-processors</h2>
          <p>BookedJobs may engage sub-processors to assist in providing the service. We will inform the Controller of any intended changes to sub-processors, providing an opportunity to object.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">6. Data Transfers</h2>
          <p>Any transfer of personal data outside the European Economic Area will be subject to appropriate safeguards as required by the GDPR, including Standard Contractual Clauses where applicable.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">7. Security Measures</h2>
          <p>We implement industry-standard security measures including encryption at rest and in transit, access controls, regular backups, and monitoring.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">8. Breach Notification</h2>
          <p>In the event of a personal data breach, BookedJobs will notify the Controller without undue delay and no later than 72 hours after becoming aware of the breach.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">9. Contact</h2>
          <p>For queries relating to this DPA, contact us at <a href="mailto:sales@bookedjobs.ie" className="text-primary hover:underline">sales@bookedjobs.ie</a>.</p>
        </section>
      </div>
    </div>
  </main>
);

export default DataProcessingAgreement;
