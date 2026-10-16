import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import Button from './Button.jsx';
import { BACK_PRIORITY, useBackHandler } from '../../hooks/useBackHandler.js';

// A downward swipe past this distance (px) or speed (px/s) on the grab handle closes the sheet.
const SWIPE_CLOSE_OFFSET = 110;
const SWIPE_CLOSE_VELOCITY = 650;

/**
 * Accessible modal: bottom sheet on phones (respects the home-indicator safe area, swipe the handle
 * down to close), centred card on larger screens. Closes on the back button, Escape and backdrop tap.
 * Rendered into <body> so a transformed or contained ancestor (animated cards, content-visibility
 * sections) can never clip or shift it.
 */
export default function Dialog({ open, onClose, title, description, children, actions, dismissible = true, size = 'md' }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const dragControls = useDragControls();

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

  const onDragEnd = (_event, info) => {
    if (dismissible && (info.offset.y > SWIPE_CLOSE_OFFSET || info.velocity.y > SWIPE_CLOSE_VELOCITY)) onClose?.();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 touch-none bg-scrim/40"
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
            drag={dismissible ? 'y' : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={onDragEnd}
            className={`gpu relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] w-full flex-col ${size === 'lg' ? 'max-w-3xl' : 'max-w-md'} rounded-t-[28px] bg-surface shadow-[var(--shadow-lift)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[28px]`}
          >
            {dismissible && (
              <div
                aria-hidden="true"
                onPointerDown={(event) => dragControls.start(event)}
                className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center sm:hidden"
              >
                <span className="h-1.5 w-10 rounded-full bg-navy/15" />
              </div>
            )}
            <div
              className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 sm:pt-6 ${dismissible ? 'pt-1' : 'pt-6'}`}
            >
              <h2 id={titleId} className="text-xl font-extrabold text-navy">
                {title}
              </h2>
              {description && <p className="mt-1.5 leading-relaxed text-navy-soft">{description}</p>}
              {children}
              {actions && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
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