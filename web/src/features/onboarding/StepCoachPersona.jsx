import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';
import { COACH_PERSONAS, LEAKS_BY_KEY } from '../../lib/catalog.js';
import { calcHourlyRate, formatCurrency, formatHours, hoursOfLife } from '../../lib/finance.js';

function buildPreview(personaKey, draft) {
  const name = draft.full_name.trim().split(' ')[0] || 'חבר';
  const rate = calcHourlyRate(draft.monthly_income, draft.weekly_work_hours) || 60;
  const leak = LEAKS_BY_KEY[draft.impulse_triggers[0]] ?? LEAKS_BY_KEY.food_delivery;
  const price = leak.typicalAmount;
  const hours = formatHours(hoursOfLife(price, rate));
  const goal = draft.dream_goal.trim() || 'המטרה שלך';
  const monthly = price * leak.perMonth;

  switch (personaKey) {
    case 'tough_love':
      return `${name}, ${formatCurrency(price)} על ${leak.label} = ${hours} מהחיים שלך. ככה ${goal} לא קורה. סגור את האפליקציה. עכשיו.`;
    case 'analytical':
      return `${leak.label}: ${formatCurrency(price)} × ${leak.perMonth} בחודש = ${formatCurrency(monthly)}, כלומר ${formatHours(
        hoursOfLife(monthly, rate),
      )}. קיצוץ של 50% מפנה ${formatCurrency(monthly * 6)} לטובת ${goal} בחצי שנה.`;
    default:
      return `${name}, מגיע לך ליהנות 💚 רק שים לב: ${leak.label} עולה לך ${hours} של עבודה. אולי הפעם נחכה 10 דקות ונראה אם זה עדיין מתחשק?`;
  }
}

export default function StepCoachPersona({ draft, update }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">איך תרצו שהמאמן ידבר אליכם? לחצו על כרטיס כדי לראות דוגמה חיה עם הנתונים שלכם.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {COACH_PERSONAS.map((persona, index) => {
          const selected = draft.coach_persona === persona.key;
          const Icon = persona.icon;
          return (
            <motion.button
              key={persona.key}
              type="button"
              aria-pressed={selected}
              onClick={() => update('coach_persona', persona.key)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              whileTap={{ scale: 0.98 }}
              className="text-start [perspective:1200px]"
            >
              <motion.div
                className="grid"
                style={{ transformStyle: 'preserve-3d' }}
                animate={{ rotateY: selected ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 160, damping: 20 }}
              >
                {/* Front */}
                <div
                  className={`[grid-area:1/1] flex min-h-52 flex-col rounded-3xl border border-white/10 bg-gradient-to-br ${persona.accent} p-5 backdrop-blur-xl`}
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                  <span className={`grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ${persona.text}`}>
                    <Icon size={22} />
                  </span>
                  <span className="mt-4 text-lg font-bold text-white">{persona.title}</span>
                  <span className="text-xs uppercase tracking-wider text-slate-400">{persona.subtitle}</span>
                  <span className="mt-3 text-sm leading-relaxed text-slate-300">{persona.description}</span>
                </div>

                {/* Back: live preview */}
                <div
                  className={`[grid-area:1/1] flex min-h-52 flex-col rounded-3xl border border-white/15 bg-ink-soft/90 p-5 ring-2 ${persona.ring}`}
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <div className={`flex items-center gap-2 text-sm font-semibold ${persona.text}`}>
                    <Icon size={16} />
                    {persona.title}
                    <span className="ms-auto rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">נבחר</span>
                  </div>
                  <Quote size={18} className="mt-3 text-slate-600" />
                  <p className="mt-1 text-sm leading-relaxed text-slate-100">{buildPreview(persona.key, draft)}</p>
                </div>
              </motion.div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
