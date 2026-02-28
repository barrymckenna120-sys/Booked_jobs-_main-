import { Phone, Mail, MapPin, Facebook } from "lucide-react";
import { Link } from "react-router-dom";

export const FooterSection = () => {
  return (
    <footer className="bg-[#2b3a52] text-white py-12">
      <div className="section-container">
      <div className="text-center">
        <h3 className="font-bold text-xl mb-4 text-white">BookedJobs</h3>
        
        <div className="space-y-3 mb-6">
          <div className="flex items-start justify-center gap-2 text-sm text-white opacity-80">
            <MapPin className="w-4 h-4 text-white flex-shrink-0 mt-0.5" />
            <span>13 Upper Baggot Street, Ballsbridge, Dublin&nbsp;4</span>
          </div>
          
          <a href="tel:+35314412618" className="flex items-center justify-center gap-2 text-sm text-white opacity-80 hover:opacity-100">
            <Phone className="w-4 h-4 text-white" />
            <span>00353 1 441 2618</span>
          </a>
          
          <a href="mailto:sales@bookedjobs.ie" className="flex items-center justify-center gap-2 text-sm text-white opacity-80 hover:opacity-100">
            <Mail className="w-4 h-4 text-white" />
            <span>sales@bookedjobs.ie</span>
          </a>
        </div>

        <div className="flex items-center justify-center gap-4 mb-6">
          <a 
            href="https://www.facebook.com/profile.php?id=61587567694025" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-white hover:opacity-80 transition-opacity"
            aria-label="Follow us on Facebook"
          >
            <Facebook className="w-6 h-6" />
          </a>
        </div>
        
        <p className="text-sm opacity-60 mb-4 text-white">
          Helping plumbers get found and booked online.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mb-4">
          <Link to="/privacy-policy" className="text-xs text-white opacity-60 hover:opacity-100 transition-opacity">Privacy Policy</Link>
          <span className="text-xs text-white opacity-40">·</span>
          <Link to="/terms-and-conditions" className="text-xs text-white opacity-60 hover:opacity-100 transition-opacity">Terms & Conditions</Link>
          <span className="text-xs text-white opacity-40">·</span>
          <Link to="/data-processing-agreement" className="text-xs text-white opacity-60 hover:opacity-100 transition-opacity">Data Processing Agreement</Link>
        </div>
        
        <p className="text-xs opacity-40 text-white pb-16 md:pb-0">
          © 2025 BookedJobs. All rights reserved.
        </p>
      </div>
      </div>
    </footer>
  );
};
