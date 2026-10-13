import { useState } from 'react';
import { motion } from 'framer-motion';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '../../components/ui/Card.jsx';
import { formatCurrency, formatPercent } from '../../lib/budget.js';

const SEGMENTS = [
  { key: 'fixed', label: 'קבועות', detail: 'דיור וחשבונות', from: '#002147', to: '#2D4F7C' },
  { key: 'variable', label: 'משתנות', detail: 'אוכל בחוץ וקניות', from: '#00C4CC', to: '#5BE3E8' },
  { key: 'entertainment', label: 'בילויים', detail: 'פנאי ויציאות', from: '#1F4FD1', to: '#6A8CF0' },
  { key: 'unexpected', label: 'בלת"מים', detail: 'כרית להפתעות', from: '#00D987', to: '#00F299' },
];

function DonutTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const { label, value, detail } = payload[0].payload;
  return (
    <div dir="rtl" className="rounded-2xl border border-navy/[0.06] bg-white px-4 py-3 shadow-[var(--shadow-lift)]">
      <p className="text-sm font-bold text-navy">{label}</p>
      <p className="text-xs text-navy-soft">{detail}</p>
      <p className="mt-1 text-lg font-extrabold tabular-nums text-navy">{formatCurrency(value)}</p>
      <p className="text-sm font-semibold text-turquoise-dark">{formatPercent(total ? value / total : 0)} מההוצאות</p>
    </div>
  );
}

export default function ExpenseDonutChart({ breakdown }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const data = SEGMENTS.map((segment) => ({ ...segment, value: breakdown[segment.key] }));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const active = activeIndex === null ? null : data[activeIndex];

  return (
    <Card initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="h-full">
      <p className="text-sm font-bold text-navy-soft">לאן הולך הכסף</p>
      <div className="mt-2 grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div dir="ltr" className="relative mx-auto aspect-square w-full max-w-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {SEGMENTS.map((s) => (
                  <linearGradient key={s.key} id={`donut-${s.key}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={s.from} />
                    <stop offset="100%" stopColor={s.to} />
                  </linearGradient>
                ))}
              </defs>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius="64%"
                outerRadius="92%"
                paddingAngle={3}
                cornerRadius={10}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                animationDuration={900}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {data.map((d, i) => (
                  <Cell
                    key={d.key}
                    fill={`url(#donut-${d.key})`}
                    opacity={activeIndex === null || activeIndex === i ? 1 : 0.35}
                    style={{ transition: 'opacity 200ms', outline: 'none' }}
                  />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
          <div dir="rtl" className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <motion.div key={active?.key ?? 'total'} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <p className="text-xs text-navy-soft">{active ? active.label : 'סך ההוצאות'}</p>
              <p className="text-xl font-extrabold tabular-nums text-navy">{formatCurrency(active ? active.value : total)}</p>
              {active && <p className="text-xs font-semibold text-turquoise-dark">{formatPercent(active.value / total)}</p>}
            </motion.div>
          </div>
        </div>

        <ul className="space-y-2">
          {data.map((d, i) => (
            <li key={d.key}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(i)}
                onBlur={() => setActiveIndex(null)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition-colors ${
                  activeIndex === i ? 'bg-mist' : 'hover:bg-mist/60'
                }`}
              >
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${d.from}, ${d.to})` }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-navy">{d.label}</span>
                  <span className="block text-xs text-navy-soft">{d.detail}</span>
                </span>
                <span className="text-end">
                  <span className="block text-sm font-bold tabular-nums text-navy">{formatCurrency(d.value)}</span>
                  <span className="block text-xs tabular-nums text-navy-soft">{formatPercent(total ? d.value / total : 0)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
