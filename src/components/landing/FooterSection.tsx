import { Phone, Mail, MapPin, Facebook, Linkedin } from "lucide-react";

export const FooterSection = () => {
  return (
    <footer className="section-container bg-[#2b3a52] text-white py-12">
      <div className="text-center">
        <h3 className="font-bold text-xl mb-4 text-primary-foreground">WebLiveView Ltd</h3>
        
        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-center gap-2 text-sm opacity-80">
            <MapPin className="w-4 h-4" />
            <span>13 Upper Baggot Street, Ballsbridge, Dublin 4</span>
          </div>
          
          <a href="tel:+35314412618" className="flex items-center justify-center gap-2 text-sm opacity-80 hover:opacity-100">
            <Phone className="w-4 h-4" />
            <span>00353 1 441 2618</span>
          </a>
          
          <a href="mailto:sales@webliveview.com" className="flex items-center justify-center gap-2 text-sm opacity-80 hover:opacity-100">
            <Mail className="w-4 h-4" />
            <span>sales@webliveview.com</span>
          </a>
        </div>

        <div className="flex items-center justify-center gap-4 mb-6">
          <a 
            href="https://www.facebook.com/webliveview" 
            target="_blank" 
            rel="noopener noreferrer"
            className="opacity-80 hover:opacity-100 transition-opacity"
            aria-label="Follow us on Facebook"
          >
            <Facebook className="w-6 h-6" />
          </a>
          <a 
            href="https://www.linkedin.com/company/webliveview" 
            target="_blank" 
            rel="noopener noreferrer"
            className="opacity-80 hover:opacity-100 transition-opacity"
            aria-label="Follow us on LinkedIn"
          >
            <Linkedin className="w-6 h-6" />
          </a>
        </div>
        
        <p className="text-sm opacity-60 mb-4 text-primary-foreground">
          Helping plumbers get found and booked online.
        </p>
        
        <p className="text-xs opacity-40 text-primary-foreground">
          © 2025 WebLiveView Ltd. All rights reserved.
        </p>
      </div>
    </footer>
  );
};