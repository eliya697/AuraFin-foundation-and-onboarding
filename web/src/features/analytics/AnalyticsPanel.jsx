import { memo, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import { formatCurrency, formatPercent } from '../../lib/budget.js';
import { budgetLines } from '../../lib/transactions.js';
import { availableMonths, categoryBreakdown, currentMonth, foldForChart, formatMonth, monthlyTrend } from '../../lib/analytics.js';
import { useTransactions } from '../../state/TransactionsContext.jsx';

/*
 * Chart colours, validated with the dataviz palette checker (light on #ffffff, dark on the theme
 * branch's #13213a surface): expenses royal / income turquoise-dark; the planned-budget tick is a
 * muted slate. Scoped here as CSS variables so a data-theme='dark' page re-points them.
 */
const VIZ_STYLE = `
.viz-analytics { --viz-expense: #1f4fd1; --viz-income: #00a3aa; --viz-plan: #7c8db5; --viz-grid: rgba(0, 33, 71, 0.08); --viz-axis: #3d5a80; }
:root[data-theme='dark'] .viz-analytics { --viz-expense: #5b82f0; --viz-income: #00a3aa; --viz-plan: #8a9ab8; --viz-grid: rgba(232, 238, 247, 0.1); --viz-axis: #a9bad1; }
`;

const SERIES = [
  { key: 'income', label: 'הכנסות', color: 'var(--viz-income)' },
  { key: 'expenses', label: 'הוצאות', color: 'var(--viz-expense)' },
];
const AXIS_TICK = { fill: 'var(--viz-axis)', fontSize: 12 };
const compact = new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 1 });

function TooltipCard({ title, children }) {
  return (
    <div dir="rtl" className="rounded-2xl border border-navy/[0.06] bg-surface px-4 py-3 text-start shadow-[var(--shadow-lift)]">
      <p className="text-sm font-bold text-navy">{title}</p>
      {children}
    </div>
  );
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <TooltipCard title={formatMonth(row.month, 'long')}>
      {SERIES.map((s) => (
        <p key={s.key} className="mt-1 flex items-center gap-2 text-sm text-navy-soft">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
          {s.label}
          <span className="ms-auto font-bold tabular-nums text-navy">{formatCurrency(row[s.key])}</span>
        </p>
      ))}
      <p className="mt-1.5 border-t border-navy/[0.06] pt-1.5 text-sm font-semibold text-navy">
        נטו <span className="tabular-nums">{formatCurrency(row.net)}</span>
      </p>
    </TooltipCard>
  );
}

function LineTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <TooltipCard title={row.label}>
      <p className="mt-1 text-lg font-extrabold tabular-nums text-navy">{formatCurrency(row.actual)}</p>
      <p className="text-sm text-navy-soft">{formatPercent(row.share)} מההוצאות</p>
      {row.planned > 0 && <p className="text-sm text-navy-soft">תכנון: {formatCurrency(row.planned)}</p>}
    </TooltipCard>
  );
}

/**
 * Horizontal bar (growing right-to-left from the labels, so the baseline is its right edge) with a
 * thin tick at the planned amount, placed on the bar's own pixels-per-shekel scale.
 */
function BarWithPlan({ x, y, width: rawWidth, height, payload }) {
  // On a reversed axis Recharts reports the box from the baseline with a negative width.
  const left = Math.min(x, x + rawWidth);
  const right = Math.max(x, x + rawWidth);
  const width = right - left;
  const radius = Math.min(4, height / 2, width);
  const path =
    width > 0
      ? `M${right},${y} H${left + radius} Q${left},${y} ${left},${y + radius} V${y + height - radius} Q${left},${y + height} ${left + radius},${y + height} H${right} Z`
      : '';
  const planX = payload.planned > 0 && payload.actual > 0 ? right - payload.planned * (width / payload.actual) : null;
  return (
    <g>
      {path && <path d={path} fill="var(--viz-expense)" />}
      {planX !== null && <rect x={planX - 1} y={y - 3} width={2} height={height + 6} rx={1} fill="var(--viz-plan)" />}
    </g>
  );
}

const MARGIN = { top: 4, right: 4, bottom: 4, left: 4 };
const LABEL_WIDTH = 108;

function LinesChart({ rows }) {
  const domainMax = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.planned))) * 1.05;
  const height = rows.length * 40 + 12;
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={MARGIN} barCategoryGap={10}>
          <XAxis type="number" domain={[0, domainMax]} reversed hide />
          <YAxis
            type="category"
            dataKey="label"
            orientation="right"
            width={LABEL_WIDTH}
            tickLine={false}
            axisLine={false}
            tick={{ ...AXIS_TICK, fill: 'var(--color-navy)', fontWeight: 600 }}
            tickFormatter={(label) => (label.length > 16 ? `${label.slice(0, 15)}…` : label)}
          />
          <Tooltip content={<LineTooltip />} cursor={{ fill: 'var(--viz-grid)' }} />
          <Bar
            dataKey="actual"
            isAnimationActive={false}
            shape={BarWithPlan}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendChart({ data }) {
  return (
    <div dir="ltr" className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          {/* Right-to-left time: the newest month sits on the left end, as Hebrew is read. */}
          <XAxis dataKey="month" reversed tickLine={false} axisLine={{ stroke: 'var(--viz-grid)' }} tick={AXIS_TICK} tickFormatter={(m) => formatMonth(m)} />
          <YAxis orientation="right" width={44} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(v) => compact.format(v)} />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--viz-grid)' }} />
          {/* Drawn in reverse so, on the right-to-left axis, income sits on the right as in the legend. */}
          {[...SERIES].reverse().map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Stat({ label, value, tone = 'text-navy' }) {
  return (
    <div className="rounded-2xl bg-mist px-3 py-2.5">
      <p className="text-xs font-semibold text-navy-soft">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-extrabold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

/** Monthly trend + planned-vs-actual per budget line. Loaded lazily with Recharts. */
function AnalyticsPanel({ budget, profile }) {
  const { transactions } = useTransactions();
  const lines = useMemo(() => budgetLines(budget, profile), [budget, profile]);
  const months = useMemo(() => availableMonths(transactions), [transactions]);
  const [picked, setPicked] = useState(null);
  const month = picked && months.includes(picked) ? picked : months[0] ?? currentMonth();

  const trend = useMemo(() => monthlyTrend(transactions, { endMonth: month, count: 6 }), [transactions, month]);
  const breakdown = useMemo(() => categoryBreakdown(transactions, month, lines, budget), [transactions, month, lines, budget]);
  const chartRows = useMemo(() => foldForChart(breakdown.rows), [breakdown.rows]);
  const hasTrend = trend.some((m) => m.income || m.expenses);
  const net = breakdown.totalIncome - breakdown.totalExpenses;

  return (
    <Card padding="p-4 sm:p-6" className="viz-analytics">
      <style>{VIZ_STYLE}</style>
      <div className="mb-3">
        <h2 className="text-lg font-extrabold text-navy sm:text-xl">ניתוח</h2>
        <p className="text-sm text-navy-soft">לאן הלך הכסף בפועל, מול מה שתכננתם.</p>
      </div>

      {transactions.length === 0 ? (
        <p className="rounded-2xl bg-mist p-4 text-center text-sm text-navy-soft">הוסיפו או ייבאו תנועות כדי לראות כאן מגמות וחלוקה לפי סעיפים.</p>
      ) : (
        <>
          {/* Filter row above the charts: the month drives the stats, the breakdown and the trend window. */}
          <div role="radiogroup" aria-label="חודש" className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {months.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={m === month}
                onClick={() => setPicked(m)}
                className={`min-h-10 shrink-0 rounded-full px-3.5 text-sm font-bold transition-colors ${
                  m === month ? 'bg-navy text-white' : 'bg-mist text-navy-soft hover:text-navy'
                }`}
              >
                {formatMonth(m, 'long')}
              </button>
            ))}
          </div>

          <div className="mb-5 grid grid-cols-3 gap-2">
            <Stat label="הכנסות" value={formatCurrency(breakdown.totalIncome)} />
            <Stat label="הוצאות" value={formatCurrency(breakdown.totalExpenses)} />
            <Stat label="נטו" value={formatCurrency(net)} tone={net < 0 ? 'text-danger' : 'text-turquoise-dark'} />
          </div>

          <section aria-labelledby="trend-title" className="mb-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 id="trend-title" className="text-sm font-bold text-navy">
                מגמה חודשית
              </h3>
              <ul className="flex gap-3 text-xs font-semibold text-navy-soft" aria-label="מקרא">
                {SERIES.map((s) => (
                  <li key={s.key} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                    {s.label}
                  </li>
                ))}
              </ul>
            </div>
            {hasTrend ? (
              <>
                <TrendChart data={trend} />
                <table className="sr-only">
                  <caption>הכנסות והוצאות לפי חודש</caption>
                  <thead>
                    <tr>
                      <th scope="col">חודש</th>
                      <th scope="col">הכנסות</th>
                      <th scope="col">הוצאות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((row) => (
                      <tr key={row.month}>
                        <th scope="row">{formatMonth(row.month, 'long')}</th>
                        <td>{formatCurrency(row.income)}</td>
                        <td>{formatCurrency(row.expenses)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="rounded-2xl bg-mist p-3 text-sm text-navy-soft">אין תנועות בחצי השנה שנגמרת ב{formatMonth(month, 'long')}.</p>
            )}
          </section>

          <section aria-labelledby="lines-title">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 id="lines-title" className="text-sm font-bold text-navy">
                לפי סעיף · {formatMonth(month, 'long')}
              </h3>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-soft">
                <span className="inline-block h-3 w-0.5 rounded-full" style={{ background: 'var(--viz-plan)' }} aria-hidden="true" />
                התכנון החודשי
              </p>
            </div>
            {chartRows.length > 0 ? (
              <LinesChart rows={chartRows} />
            ) : (
              <p className="rounded-2xl bg-mist p-3 text-sm text-navy-soft">אין הוצאות בחודש הזה.</p>
            )}

            {breakdown.rows.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <caption className="sr-only">תכנון מול בפועל לפי סעיף</caption>
                <thead>
                  <tr className="text-xs text-navy-soft">
                    <th scope="col" className="pb-1.5 text-start font-semibold">
                      סעיף
                    </th>
                    <th scope="col" className="pb-1.5 ps-3 text-end font-semibold">
                      בפועל
                    </th>
                    <th scope="col" className="pb-1.5 ps-3 text-end font-semibold">
                      תכנון
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy/[0.06]">
                  {breakdown.rows.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="py-2 text-start font-semibold text-navy">
                        {row.label}
                        {row.over && (
                          <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                            <AlertTriangle size={12} aria-hidden="true" /> מעל התכנון
                          </span>
                        )}
                      </th>
                      <td className="whitespace-nowrap py-2 ps-3 text-end font-bold tabular-nums text-navy">{formatCurrency(row.actual)}</td>
                      <td className="whitespace-nowrap py-2 ps-3 text-end tabular-nums text-navy-soft">{row.planned > 0 ? formatCurrency(row.planned) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </Card>
  );
}

export default memo(AnalyticsPanel);
