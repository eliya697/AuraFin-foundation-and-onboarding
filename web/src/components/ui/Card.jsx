import { motion } from 'framer-motion';

const VARIANTS = {
  solid: 'bg-white border border-navy/[0.06] shadow-[var(--shadow-soft)]',
  glass: 'bg-white/70 border border-white/80 shadow-[var(--shadow-soft)] backdrop-blur-xl',
  tint: 'bg-mist border border-turquoise/10',
};

export default function Card({ variant = 'solid', className = '', padding = 'p-5 sm:p-7', children, ...props }) {
  return (
    <motion.div className={`rounded-[28px] ${VARIANTS[variant]} ${padding} ${className}`} {...props}>
      {children}
    </motion.div>
  );
}
