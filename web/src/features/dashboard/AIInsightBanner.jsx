import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard.jsx';
import Button from '../../components/ui/Button.jsx';
import { PERSONAS_BY_KEY } from '../../lib/catalog.js';
import { buildCoachPayload, coachMode, streamCoachInsight } from '../../services/coachService.js';
import { useAppState } from '../../state/AppStateContext.jsx';

export default function AIInsightBanner({ profile, summary }) {
  const { getAccessToken, saveInsight } = useAppState();
  const [status, setStatus] = useState('idle'); // idle | streaming | done | error
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const persona = PERSONAS_BY_KEY[profile.coach_persona];
  const PersonaIcon = persona.icon;

  useEffect(() => () => abortRef.current?.abort(), []);

  const generate = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('streaming');
    setText('');
    setError(null);

    const payload = buildCoachPayload(profile, summary);
    try {
      const accessToken = await getAccessToken();
      const result = await streamCoachInsight({
        payload,
        accessToken,
        signal: controller.signal,
        onDelta: setText,
      });
      setStatus('done');
      await saveInsight({
        persona: profile.coach_persona,
        model: result.model ?? 'unknown',
        content: result.text,
        context: payload.spending,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'משהו השתבש בחיבור למאמן.');
      setStatus('error');
    }
  };

  const streaming = status === 'streaming';

  return (
    <GlassCard
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-growth/20"
      glow="bg-growth/20"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative shrink-0">
          <motion.div
            className="absolute inset-0 rounded-2xl bg-growth/40 blur-md"
            animate={streaming ? { opacity: [0.3, 0.9, 0.3], scale: [1, 1.15, 1] } : { opacity: 0.25, scale: 1 }}
            transition={streaming ? { duration: 1.6, repeat: Infinity } : { duration: 0.3 }}
          />
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl border border-growth/30 bg-ink-soft text-growth">
            <Bot size={22} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-white">תובנת המאמן</h2>
            <span className={`flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-xs ${persona.text}`}>
              <PersonaIcon size={12} />
              {persona.title}
            </span>
            {coachMode === 'mock' && (
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-slate-500">מצב הדגמה</span>
            )}
          </div>

          <div aria-live="polite" className="mt-2 min-h-[3.5rem] text-[15px] leading-relaxed text-slate-200">
            <AnimatePresence mode="wait">
              {status === 'idle' && (
                <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-slate-400">
                  המאמן ניתח את 30 הימים האחרונים שלך ומוכן לתת לך פידבק אחד חד שיכול לשנות את השבוע.
                </motion.p>
              )}
              {(status === 'streaming' || status === 'done') && (
                <motion.p key="text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="whitespace-pre-line">
                  {text}
                  {streaming && (
                    <motion.span
                      className="ms-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-growth"
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                    />
                  )}
                </motion.p>
              )}
              {status === 'error' && (
                <motion.p key="error" role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-rose-300">
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        <Button
          variant={status === 'idle' ? 'primary' : 'ghost'}
          onClick={generate}
          disabled={streaming}
          className="shrink-0 sm:self-center"
        >
          {streaming ? (
            <>
              <Loader2 size={17} className="animate-spin" /> חושב…
            </>
          ) : status === 'idle' ? (
            <>
              <Sparkles size={17} /> קבל תובנה
            </>
          ) : (
            <>
              <RefreshCw size={17} /> תובנה חדשה
            </>
          )}
        </Button>
      </div>
    </GlassCard>
  );
}
