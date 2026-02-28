import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const PrivacyPolicy = () => (
  <main className="min-h-screen bg-background">
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: 28 February 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-foreground/80">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Who We Are</h2>
          <p>BookedJobs ("we", "us", "our") is operated from 13 Upper Baggot Street, Ballsbridge, Dublin 4, Ireland. We provide job management software for plumbing and heating businesses.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Information We Collect</h2>
          <p>We collect information you provide directly, including:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Account details (name, email, password)</li>
            <li>Business information (business name, address, phone number)</li>
            <li>Customer data you enter into the platform</li>
            <li>Job and service records</li>
            <li>Usage data and analytics</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide and maintain our service</li>
            <li>Send service-related communications</li>
            <li>Improve and develop new features</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. Data Sharing</h2>
          <p>We do not sell your personal data. We may share data with service providers who help us operate the platform, subject to appropriate data processing agreements.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">5. Data Retention</h2>
          <p>We retain your data for as long as your account is active or as needed to provide services. You may request deletion of your data at any time by contacting us.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">6. Your Rights</h2>
          <p>Under GDPR, you have the right to access, rectify, erase, restrict processing, data portability, and object to processing of your personal data. Contact us at <a href="mailto:sales@bookedjobs.ie" className="text-primary hover:underline">sales@bookedjobs.ie</a> to exercise these rights.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">7. Contact</h2>
          <p>For privacy-related queries, contact us at <a href="mailto:sales@bookedjobs.ie" className="text-primary hover:underline">sales@bookedjobs.ie</a> or by post at 13 Upper Baggot Street, Ballsbridge, Dublin 4.</p>
        </section>
      </div>
    </div>
  </main>
);

export default PrivacyPolicy;
