import { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Hand } from 'lucide-react';

/**
 * Behavioral friction: the purchase is only logged after a deliberate press-and-hold.
 * Releasing early cancels — a built-in pause between impulse and action.
 */
export default function HoldToConfirm({ durationMs = 2200, onConfirm, disabled, children }) {
  const progress = useMotionValue(0);
  const width = useTransform(progress, (v) => `${v * 100}%`);
  const controlsRef = useRef(null);

  useEffect(() => () => controlsRef.current?.stop(), []);

  const start = (event) => {
    if (disabled) return;
    if (event.pointerId !== undefined) event.currentTarget.setPointerCapture(event.pointerId);
    controlsRef.current?.stop();
    controlsRef.current = animate(progress, 1, {
      duration: (durationMs / 1000) * (1 - progress.get()),
      ease: 'linear',
      onComplete: () => {
        progress.set(0);
        onConfirm();
      },
    });
  };

  const cancel = () => {
    if (progress.get() >= 1) return;
    controlsRef.current?.stop();
    controlsRef.current = animate(progress, 0, { duration: 0.25, ease: 'easeOut' });
  };

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          start(e);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') cancel();
      }}
      whileTap={{ scale: 0.98 }}
      className="relative w-full touch-none select-none overflow-hidden rounded-2xl border border-alert/40 bg-alert/10 px-5 py-3.5 font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <motion.span className="absolute inset-y-0 start-0 bg-alert/40" style={{ width }} />
      <span className="relative flex items-center justify-center gap-2">
        <Hand size={17} />
        {children}
      </span>
    </motion.button>
  );
}
