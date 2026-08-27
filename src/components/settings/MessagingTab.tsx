import WhatsAppTab from "./WhatsAppTab";
import QuickRepliesTab from "./QuickRepliesTab";
import MessageStatusPanel from "./MessageStatusPanel";
import { Separator } from "@/components/ui/separator";

interface Props {
  settings: any;
  onSave: (fields: Record<string, any>) => Promise<void>;
  saving: boolean;
  onNavigateToTab?: (tab: string) => void;
}

const MessagingTab = ({ settings, onSave, saving, onNavigateToTab }: Props) => {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-extrabold text-foreground mb-1">Message Status</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Which customer messages are active right now, and what still needs setting up.
        </p>
        <div className="space-y-4">
          <WhatsAppSendLog />
          <MessageStatusPanel onNavigateToTab={onNavigateToTab} />
        </div>
      </div>


      <Separator />

      <div>
        <h2 className="text-lg font-extrabold text-foreground mb-1">Message Templates</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Customise the WhatsApp messages sent to your customers. Use variables to personalise each message.
        </p>
        {/* onSave removed — tab is read-only */}
        <WhatsAppTab settings={settings} />
      </div>

      <Separator />

      <div>
        <h2 className="text-lg font-extrabold text-foreground mb-1">Quick Replies</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Preset messages your engineers can send with one tap from the job screen.
        </p>
        <QuickRepliesTab />
      </div>
    </div>
  );
};

export default MessagingTab;
