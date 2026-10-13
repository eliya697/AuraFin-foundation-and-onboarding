import { motion } from 'framer-motion';

/** Standard entry animation: subtle slide-up + fade-in. */
export default function Reveal({ delay = 0, y = 18, className = '', as = 'div', children, ...props }) {
  const Component = motion[as];
  return (
    <Component
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      {...props}
    >
      {children}
    </Component>
  );
}
