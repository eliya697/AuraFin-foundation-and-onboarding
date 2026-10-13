import { motion } from 'framer-motion';

const BASE =
  'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl font-bold transition-colors disabled:cursor-not-allowed';

const SIZES = {
  md: 'px-6 py-3.5 text-base',
  sm: 'px-4 py-2.5 text-sm',
  lg: 'px-8 py-4 text-lg',
  icon: 'p-2.5',
};

const VARIANTS = {
  primary: 'bg-turquoise text-white shadow-[var(--shadow-glow)] disabled:bg-navy/10 disabled:text-navy/35 disabled:shadow-none',
  secondary: 'bg-white text-navy border border-navy/10 hover:border-turquoise/50 hover:text-turquoise-dark disabled:text-navy/30',
  ghost: 'bg-transparent text-navy-soft hover:bg-mist hover:text-navy',
};

/** Prominent CTA: turquoise base, turquoise→mint gradient on hover, tactile scale on press. */
export default function Button({ variant = 'primary', size = 'md', className = '', children, disabled, type = 'button', ...props }) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
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
