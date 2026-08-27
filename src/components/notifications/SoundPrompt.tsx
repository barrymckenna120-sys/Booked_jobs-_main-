import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { playSoftChime } from "@/utils/audio";
import { Volume2 } from "lucide-react";

interface Props {
  open: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

const SoundPrompt = ({ open, onEnable, onDismiss }: Props) => (
  <AlertDialog open={open}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-primary" /> Enable Sound Alerts?
        </AlertDialogTitle>
        <AlertDialogDescription>
          Get an audio alert when new jobs are assigned or cancelled. You can change this later in Settings.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onDismiss}>No thanks</AlertDialogCancel>
        <AlertDialogAction onClick={() => { playSoftChime(); onEnable(); }}>Enable sounds</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default SoundPrompt;
