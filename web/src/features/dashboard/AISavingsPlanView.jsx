import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Ban, Bot, Check, CircleDot, Droplets, RefreshCw, Sparkles } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { buildSnapshot } from '../../lib/budget.js';
import { CATALOG } from '../../lib/catalog.js';
import { analyzeBudget } from '../../lib/analysis.js';
import { buildOfflinePlan } from '../../lib/offlinePlan.js';
import { OfflineError, fetchSavingsPlan, hasBackend } from '../../services/api.js';
import { fingerprintOf, useJourney } from '../../state/JourneyContext.jsx';
import { useLastDefined } from '../../hooks/useLastDefined.js';
import { useMaskText, useMoney } from '../../state/privacy.js';

// The Markdown parser only ships once a plan is actually shown.
const Markdown = lazy(() => import('react-markdown'));

const LOADING_STEPS = ['מנתחים את ההכנסות וההוצאות…', 'מזהים דליפות לפי המסלול שלכם…', 'בונים רשימת "לא לקנות" לחודש…', 'מנסחים את התוכנית…'];

const LEAK_LABELS = {
  dining: 'אוכל בחוץ',
  shopping: 'קניות',
  entertainment: 'בילויים',
  fixed: 'קבועות',
  unexpected: 'בלת"מים',
  children: 'ילדים',
  custom: 'אישיות',
};

const SOURCE_BADGES = {
  mock: 'מצב הדגמה',
  offline: 'תוכנית מקומית · ללא שרת',
};

function buildLocalPlan(profile, budget) {
  const snapshot = buildSnapshot(profile, budget);
  const analysis = analyzeBudget(snapshot, CATALOG);
  return { analysis, plan: buildOfflinePlan(snapshot, analysis, CATALOG), source: 'offline', model: null };
}

const markdownComponents = {
  h2: ({ children }) => (
    <h3 className="mb-2 mt-6 flex items-center gap-2 text-lg font-extrabold text-navy first:mt-0">
      <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-turquoise to-mint" />
      {children}
    </h3>
  ),
  h3: ({ children }) => <h4 className="mb-1 mt-4 font-bold text-navy">{children}</h4>,
  p: ({ children }) => <p className="mb-3 leading-relaxed text-navy/85">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 space-y-2">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-2 ps-5 text-navy/85">{children}</ol>,
  li: ({ children }) => (
    <li className="flex gap-2 leading-relaxed text-navy/85">
      <CircleDot size={16} className="mt-1 shrink-0 text-turquoise" />
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => <strong className="font-bold text-navy">{children}</strong>,
  a: ({ children }) => <span className="font-semibold text-turquoise-dark">{children}</span>,
};

function LoadingState() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, LOADING_STEPS.length - 1)), 2200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3">
        <motion.span
          className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-turquoise to-mint text-white"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          <Sparkles size={18} />
        </motion.span>
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="font-semibold text-navy"
          >
            {LOADING_STEPS[index]}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="mt-6 space-y-3">
        {[92, 78, 85, 60].map((w, i) => (
          <div
            key={w}
            className="h-3.5 rounded-full bg-mist motion-safe:animate-pulse"
            style={{ width: `${w}%`, animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

const DoNotBuyList = memo(function DoNotBuyList({ items }) {
  const money = useMoney();
  const mask = useMaskText();
  const [resisted, setResisted] = useState({});
  const saved = items.reduce((sum, item, i) => sum + (resisted[i] ? Number(item.estimated_saving) || 0 : 0), 0);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-extrabold text-navy">
          <Ban size={18} className="text-danger" /> לא קונים החודש
        </h3>
        <AnimatePresence>
          {saved > 0 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-full bg-mint/20 px-3 py-1 text-sm font-bold text-navy"
            >
              ויתרתם על {money(saved)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <ul className="space-y-2.5">
        {items.map((item, i) => {
          const done = Boolean(resisted[i]);
          return (
            <motion.li
              key={`${item.item}-${i}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
            >
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => setResisted((prev) => ({ ...prev, [i]: !prev[i] }))}
                aria-pressed={done}
                className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition-colors ${
                  done ? 'border-mint/50 bg-mint/10' : 'border-navy/[0.07] bg-surface hover:border-turquoise/40'
                }`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                    done ? 'border-mint bg-mint text-navy-deep' : 'border-navy/15 text-transparent'
                  }`}
                >
                  <Check size={14} strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-bold text-navy ${done ? 'line-through decoration-mint decoration-2' : ''}`}>
                    {mask(item.item)}
                  </span>
                  <span className="block text-sm text-navy-soft">{mask(item.reason)}</span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-turquoise-dark">{money(item.estimated_saving)}</span>
              </motion.button>
            </motion.li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-navy-soft">סמנו כל פריט שוויתרתם עליו.</p>
    </div>
  );
});

const PlanMarkdown = memo(function PlanMarkdown({ markdown }) {
  const mask = useMaskText();
  const text = mask(markdown);
  return (
    <Suspense fallback={<p className="whitespace-pre-line leading-relaxed text-navy-soft">{text}</p>}>
      <Markdown components={markdownComponents}>{text}</Markdown>
    </Suspense>
  );
});

export default function AISavingsPlanView() {
  const money = useMoney();
  const mask = useMaskText();
  const { state: liveState, storePlan } = useJourney();
  // Same exit-animation guard as the dashboard: never derive from a profile that was just cleared.
  const state = useLastDefined(liveState.profile ? liveState : null);
  const fingerprint = useMemo(() => fingerprintOf(state.profile, state.budget), [state.profile, state.budget]);
  const cached = state.plan?.fingerprint === fingerprint ? state.plan.data : null;
  const offlineMode = state.unlock?.mode === 'offline' || !hasBackend;
  const [status, setStatus] = useState(cached ? 'done' : 'loading');
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setError(null);
    const applyLocalPlan = () => {
      storePlan(fingerprint, buildLocalPlan(state.profile, state.budget));
      setStatus('done');
    };
    // Unlocked offline, or a static build with no backend: never hit the network.
    if (offlineMode) {
      applyLocalPlan();
      return;
    }
    try {
      const data = await fetchSavingsPlan(buildSnapshot(state.profile, state.budget), controller.signal);
      storePlan(fingerprint, data);
      setStatus('done');
    } catch (err) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      if (err instanceof OfflineError) {
        applyLocalPlan();
        return;
      }
      setError(err?.message ?? 'יצירת התוכנית נכשלה.');
      setStatus('error');
    }
  }, [state.profile, state.budget, fingerprint, storePlan, offlineMode]);

  useEffect(() => {
    if (!cached) load();
    return () => abortRef.current?.abort();
    // Fetch once per snapshot; `cached` flips to truthy after storePlan.
  }, [fingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = cached?.plan;
  const leaks = Array.isArray(plan?.leaks) ? plan.leaks : [];
  const doNotBuy = Array.isArray(plan?.do_not_buy) ? plan.do_not_buy : [];

  return (
    <Card initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }} padding="p-0" className="cv-auto overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy/[0.06] bg-gradient-to-l from-turquoise/[0.08] via-surface to-mint/[0.08] px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-navy text-surface">
            <Bot size={19} />
          </span>
          <div>
            <h2 className="font-extrabold text-navy">תוכנית החיסכון שלכם</h2>
            <p className="text-xs text-navy-soft">נבנתה ע״י המאמן לפי {cached?.analysis?.track_name ?? 'המסלול שלכם'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {SOURCE_BADGES[cached?.source] && (
            <span className="rounded-full bg-navy/[0.05] px-3 py-1 text-xs text-navy-soft">{SOURCE_BADGES[cached.source]}</span>
          )}
          {status !== 'loading' && (
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw size={15} /> תוכנית חדשה
            </Button>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-7">
        {status === 'loading' && <LoadingState />}

        {status === 'error' && (
          <div role="alert" className="text-center">
            <p className="font-semibold text-danger">{error}</p>
            <Button onClick={load} className="mt-4">
              <RefreshCw size={16} /> נסו שוב
            </Button>
          </div>
        )}

        {status === 'done' && plan && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <p className="mb-6 rounded-2xl bg-gradient-to-l from-turquoise to-mint px-5 py-4 text-lg font-extrabold text-white shadow-[var(--shadow-glow)]">
              {mask(plan.headline)}
            </p>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <article>
                <PlanMarkdown markdown={String(plan.savings_plan_markdown ?? '')} />
              </article>

              <div className="space-y-8">
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-navy">
                    <Droplets size={18} className="text-turquoise" /> הדליפות שזיהינו
                  </h3>
                  <ul className="space-y-2.5">
                    {leaks.map((leak, i) => (
                      <motion.li
                        key={`${leak.category}-${leak.title}-${i}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.06 }}
                        className="rounded-2xl bg-mist p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-xs font-bold text-turquoise-dark">{LEAK_LABELS[leak.category]}</span>
                            <p className="font-bold text-navy">{mask(leak.title)}</p>
                          </div>
                          {leak.monthly_saving > 0 && (
                            <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-bold tabular-nums text-navy shadow-sm">
                              +{money(leak.monthly_saving)}/חודש
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-navy-soft">{mask(leak.explanation)}</p>
                      </motion.li>
                    ))}
                  </ul>
                </div>
                {doNotBuy.length > 0 && <DoNotBuyList items={doNotBuy} />}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </Card>
  );
}
