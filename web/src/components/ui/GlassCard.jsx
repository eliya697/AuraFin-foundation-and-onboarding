import { motion } from 'framer-motion';

export default function GlassCard({ className = '', padding = 'p-5 sm:p-6', children, glow, ...props }) {
  return (
    <motion.div
      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl ${padding} ${className}`}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-white/[0.06] to-transparent" />
      {glow && (
        <div
          className={`pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full blur-3xl ${glow}`}
        />
      )}
      <div className="relative">{children}</div>
    </motion.div>
  );
}
