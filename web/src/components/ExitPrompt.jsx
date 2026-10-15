import { LogOut } from 'lucide-react';
import Dialog from './ui/Dialog.jsx';
import Button from './ui/Button.jsx';
import { cancelExit } from '../lib/backNavigation.js';
import { useExitPrompt } from '../hooks/useBackHandler.js';

/**
 * Shown when back is pressed on the app's root screen. The app cannot close itself, so the prompt
 * explains that one more back press exits; "stay" restores the back-button guard.
 */
export default function ExitPrompt() {
  const open = useExitPrompt();
  return (
    <Dialog
      open={open}
      onClose={cancelExit}
      title="לצאת מ-AuraFin?"
      description="לחצו שוב על כפתור החזרה כדי לצאת. הנתונים שלכם נשמרו."
      actions={
        <Button onClick={cancelExit} data-autofocus>
          <LogOut size={18} className="rotate-180" /> להישאר באפליקציה
        </Button>
      }
    />
  );
}
