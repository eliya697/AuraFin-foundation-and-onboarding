import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';

export default function OptionCard({ icon: Icon, title, description, selected, onSelect, badge, delay = 0, children }) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      className={`relative flex w-full flex-col items-start gap-3 rounded-3xl border-2 bg-surface p-5 text-start transition-[border-color,box-shadow] ${
        selected
          ? 'border-turquoise shadow-[var(--shadow-glow)]'
          : 'border-navy/[0.07] shadow-[var(--shadow-soft)] hover:border-turquoise/40'
      }`}
    >
      {badge && (
        <span className="absolute -top-3 start-5 rounded-full bg-gradient-to-l from-turquoise to-mint px-3 py-1 text-xs font-bold text-white shadow-sm">
          {badge}
        </span>
      )}
      <div className="flex w-full items-center justify-between">
        {Icon && (
          <span
            className={`grid h-12 w-12 place-items-center rounded-2xl transition-colors ${
              selected ? 'bg-turquoise text-white' : 'bg-mist text-turquoise-dark'
            }`}
          >
            <Icon size={22} />
          </span>
        )}
        <AnimatePresence>
          {selected && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="grid h-7 w-7 place-items-center rounded-full bg-turquoise text-white"
            >
              <Check size={16} strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div>
        <p className="text-lg font-bold text-navy">{title}</p>
        {description && <p className="mt-0.5 text-sm text-navy-soft">{description}</p>}
      </div>
      {children}
    </motion.button>
  );
}
