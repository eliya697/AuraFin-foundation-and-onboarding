import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const TONES = {
  error: { icon: AlertCircle, className: 'border-danger/30 text-danger', role: 'alert' },
  success: { icon: CheckCircle2, className: 'border-turquoise/40 text-turquoise-dark', role: 'status' },
  info: { icon: Info, className: 'border-navy/10 text-navy-soft', role: 'status' },
};

const DURATION = { error: 7000, success: 4500, info: 4500 };

/** Local toast queue: `push({ tone, title, body })` shows one; identical messages are not stacked. */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    ({ tone = 'info', title, body }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((list) => [...list.filter((toast) => toast.title !== title || toast.body !== body), { id, tone, title, body }].slice(-3));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION[tone] ?? DURATION.info),
      );
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return { toasts, push, dismiss };
}

/** Top-centred stack, clear of the notch; each toast is announced to screen readers. */
export function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const tone = TONES[toast.tone] ?? TONES.info;
          const Icon = tone.icon;
          return (
            <motion.div
              key={toast.id}
              layout
              role={tone.role}
              initial={{ opacity: 0, y: -16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border bg-surface p-4 shadow-[var(--shadow-lift)] ${tone.className}`}
            >
              <Icon size={20} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-navy">{toast.title}</p>
                {toast.body && <p className="mt-0.5 text-sm leading-relaxed text-navy-soft">{toast.body}</p>}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="סגירה"
                className="-m-2 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-navy/40 hover:bg-mist hover:text-navy"
              >
                <X size={16} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
