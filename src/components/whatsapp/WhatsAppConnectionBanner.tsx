import { X, AlertTriangle } from "lucide-react";
import { useWhatsAppConnection } from "@/hooks/useWhatsAppConnection";

const WhatsAppConnectionBanner = () => {
  const { hasConnectionError, clearConnectionError } = useWhatsAppConnection();

  if (!hasConnectionError) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9998] bg-[hsl(var(--warning))] text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-bold shadow-md">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>⚠️ WhatsApp connection issue — messages may not be sending. Please check 360Messenger.</span>
      <button
        onClick={clearConnectionError}
        className="ml-2 p-0.5 rounded hover:bg-white/20 transition-colors flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default WhatsAppConnectionBanner;
