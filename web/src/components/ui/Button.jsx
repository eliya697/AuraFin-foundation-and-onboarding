import { motion } from 'framer-motion';

const VARIANTS = {
  primary:
    'bg-growth text-ink shadow-[0_8px_30px_-8px_rgba(16,185,129,0.7)] hover:bg-growth-soft disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none',
  ghost: 'bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 disabled:text-slate-600',
  alert:
    'bg-alert text-ink shadow-[0_8px_30px_-8px_rgba(245,158,11,0.7)] hover:bg-amber-400 disabled:bg-white/10 disabled:text-slate-500',
};

export default function Button({ variant = 'primary', className = '', children, disabled, ...props }) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-base font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
