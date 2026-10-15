import { motion } from 'framer-motion';

// No backdrop-filter: blurring what scrolls underneath is the most expensive paint on mobile GPUs.
const VARIANTS = {
  solid: 'bg-surface border border-navy/[0.06] shadow-[var(--shadow-soft)]',
  glass: 'bg-surface/95 border border-surface/80 shadow-[var(--shadow-soft)]',
  tint: 'bg-mist border border-turquoise/10',
};

export default function Card({ variant = 'solid', className = '', padding = 'p-5 sm:p-7', children, ...props }) {
  return (
    <motion.div className={`rounded-[28px] ${VARIANTS[variant]} ${padding} ${className}`} {...props}>
      {children}
    </motion.div>
  );
}
