import { Loader2 } from 'lucide-react';

export default function Spinner({ fullScreen = false, label = 'טוען' }) {
  return (
    <div className={`grid place-items-center ${fullScreen ? 'min-h-dvh' : 'min-h-[50dvh]'}`}>
      <Loader2 className="animate-spin text-turquoise" size={32} aria-label={label} />
    </div>
  );
}
