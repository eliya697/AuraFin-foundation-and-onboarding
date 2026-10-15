import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Button from './Button.jsx';
import { BACK_PRIORITY, useBackHandler } from '../../hooks/useBackHandler.js';

/**
 * Accessible modal: bottom sheet on phones (respects the home-indicator safe area), centred card on
 * larger screens. Closes on the back button, Escape and backdrop tap.
 */
export default function Dialog({ open, onClose, title, description, children, actions, dismissible = true, size = 'md' }) {
  const titleId = useId();
  const panelRef = useRef(null);

  useBackHandler(() => dismissible && onClose?.(), { enabled: open, priority: BACK_PRIORITY.dialog });

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (event) => {
      if (event.key === 'Escape' && dismissible) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('scroll-locked');
    requestAnimationFrame(() => panelRef.current?.querySelector('[data-autofocus], button')?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('scroll-locked');
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open, dismissible, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-scrim/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismissible && onClose?.()}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className={`gpu relative w-full ${size === 'lg' ? 'max-w-3xl' : 'max-w-md'} rounded-t-[28px] bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-lift)] sm:rounded-[28px] sm:pb-6`}
          >
            <h2 id={titleId} className="text-xl font-extrabold text-navy">
              {title}
            </h2>
            {description && <p className="mt-1.5 leading-relaxed text-navy-soft">{description}</p>}
            {children}
            {actions && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Yes/no confirmation built on Dialog. */
export function ConfirmDialog({ open, title, description, confirmLabel = 'אישור', cancelLabel = 'ביטול', danger = false, busy = false, onConfirm, onCancel }) {
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      dismissible={!busy}
      title={title}
      description={description}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}