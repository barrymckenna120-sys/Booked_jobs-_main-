import { Phone, Mail, MapPin } from "lucide-react";

export const FooterSection = () => {
  return (
    <footer className="section-container bg-foreground text-background py-12">
      <div className="text-center">
        <h3 className="font-bold text-xl mb-4">WebLiveView Ltd</h3>
        
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
        
        <p className="text-sm opacity-60 mb-4">
          Helping plumbers get found and booked online.
        </p>
        
        <p className="text-xs opacity-40">
          © 2025 WebLiveView Ltd. All rights reserved.
        </p>
      </div>
    </footer>
  );
};
