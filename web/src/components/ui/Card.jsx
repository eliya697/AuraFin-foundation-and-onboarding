import { motion } from 'framer-motion';

// No backdrop-filter: blurring what scrolls underneath is the most expensive paint on mobile GPUs.
const VARIANTS = {
  solid: 'bg-white border border-navy/[0.06] shadow-[var(--shadow-soft)]',
  glass: 'bg-white/95 border border-white/80 shadow-[var(--shadow-soft)]',
  tint: 'bg-mist border border-turquoise/10',
};

export default function Card({ variant = 'solid', className = '', padding = 'p-5 sm:p-7', children, ...props }) {
  return (
    <motion.div className={`rounded-[28px] ${VARIANTS[variant]} ${padding} ${className}`} {...props}>
      {children}
    </motion.div>
  );
}
