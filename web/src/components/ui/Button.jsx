import { memo } from 'react';
import { motion } from 'framer-motion';

const BASE =
  'group relative inline-flex select-none items-center justify-center gap-2 overflow-hidden rounded-2xl font-bold transition-colors disabled:cursor-not-allowed';

// Every size keeps a 48×48 px minimum touch target.
const SIZES = {
  md: 'min-h-12 px-6 py-3 text-base',
  sm: 'min-h-12 px-4 py-2.5 text-sm',
  lg: 'min-h-14 px-8 py-4 text-lg',
  icon: 'h-12 w-12 shrink-0',
};

const VARIANTS = {
  primary: 'bg-turquoise text-white shadow-[var(--shadow-glow)] disabled:bg-navy/10 disabled:text-navy/35 disabled:shadow-none',
  secondary: 'bg-surface text-navy border border-navy/10 hover:border-turquoise/50 hover:text-turquoise-dark disabled:text-navy/30',
  ghost: 'bg-transparent text-navy-soft hover:bg-mist hover:text-navy disabled:text-navy/30',
  danger: 'bg-danger text-white disabled:bg-navy/10 disabled:text-navy/35',
};

/** Prominent CTA: turquoise base, turquoise→mint gradient on hover, tactile scale on press. */
function Button({ variant = 'primary', size = 'md', className = '', children, disabled, type = 'button', ...props }) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 520, damping: 28 }}
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {variant === 'primary' && !disabled && (
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-l from-turquoise via-turquoise to-mint opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      )}
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </motion.button>
  );
}

export default memo(Button);
