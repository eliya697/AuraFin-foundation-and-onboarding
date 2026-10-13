import GlassCard from './GlassCard.jsx';

export default function MetricCard({ icon: Icon, label, children, footnote, tone = 'neutral', delay = 0 }) {
  const toneClass = {
    neutral: 'text-slate-300 bg-white/5',
    growth: 'text-growth bg-growth/10',
    alert: 'text-alert bg-alert/10',
  }[tone];

  return (
    <GlassCard
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 26 }}
      whileHover={{ y: -3 }}
      padding="p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span className={`grid h-8 w-8 place-items-center rounded-xl ${toneClass}`}>
          <Icon size={16} />
        </span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{children}</div>
      {footnote && <p className="mt-1 text-xs text-slate-500">{footnote}</p>}
    </GlassCard>
  );
}
