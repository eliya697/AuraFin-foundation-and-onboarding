import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Bot, Droplets, PiggyBank } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';

const HEADLINE = [
  { text: 'שולטים', accent: false },
  { text: 'בעתיד,', accent: false },
  { text: 'שעה', accent: true },
  { text: 'אחרי', accent: true },
  { text: 'שעה', accent: true },
];

const SLIDES = [
  {
    icon: Droplets,
    eyebrow: '01 · מעקב דליפות',
    title: 'רואים לאן הכסף בורח',
    body: 'משלוח פה, מנוי שם. AuraFin משווה כל קטגוריה לרף של המסלול שלכם ומסמנת בדיוק איפה דולף.',
    tint: 'from-turquoise/15 to-turquoise/0',
    iconBg: 'bg-turquoise',
  },
  {
    icon: Bot,
    eyebrow: '02 · אימון AI',
    title: 'מאמן אישי שמכיר את המספרים',
    body: 'תוכנית חיסכון חודשית, רשימת "לא לקנות" והרגל אחד לשבוע — כתובים במיוחד עבורכם.',
    tint: 'from-royal/12 to-royal/0',
    iconBg: 'bg-royal',
  },
  {
    icon: PiggyBank,
    eyebrow: '03 · חיסכון אמיתי',
    title: 'חוסכים, לא רק מתכננים',
    body: 'בסוף כל חודש רואים כמה באמת נחסך מול היעד — ומה נשאר לעשות כדי להגיע אליו.',
    tint: 'from-mint/20 to-mint/0',
    iconBg: 'bg-mint',
  },
];

const AUTO_ADVANCE_MS = 4500;
const SWIPE_THRESHOLD = 60;

export default function WelcomeScreen({ onStart }) {
  const [[index, direction], setSlide] = useState([0, 1]);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback(
    (next) => setSlide(([current]) => [(next + SLIDES.length) % SLIDES.length, next >= current ? 1 : -1]),
    [],
  );

  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => goTo(index + 1), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [index, paused, goTo]);

  const slide = SLIDES[index];
  const Icon = slide.icon;

  return (
    <div className="relative isolate min-h-[calc(100dvh-var(--topbar-h))] overflow-hidden">
      {/* Soft glows as radial gradients: same look as blurred blobs without a costly filter layer. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(28rem 28rem at 50% -6rem, rgb(0 196 204 / 0.12), transparent 70%), radial-gradient(20rem 20rem at 0% 100%, rgb(0 242 153 / 0.1), transparent 70%)',
        }}
      />
    <div className="mx-auto flex min-h-[calc(100dvh-var(--topbar-h))] w-full max-w-5xl flex-col px-4 py-4 sm:px-8 sm:py-8">

      <div className="grid flex-1 items-center gap-10 py-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full bg-mist px-4 py-1.5 text-sm font-semibold text-turquoise-dark"
          >
            <span className="h-2 w-2 rounded-full bg-mint motion-safe:animate-pulse" />
            מאמן פיננסי מבוסס AI
          </motion.p>

          <h1 className="text-[2.6rem] font-extrabold leading-[1.1] tracking-tight text-navy sm:text-6xl">
            {HEADLINE.map((word, i) => (
              <motion.span
                key={`${word.text}-${i}`}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                className={`me-3 inline-block ${word.accent ? 'text-gradient' : ''}`}
              >
                {word.text}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.5 }}
            className="mt-5 max-w-md text-lg leading-relaxed text-navy-soft"
          >
            שלוש דקות של שאלות, תמונה מלאה של החודש שלכם, ותוכנית חיסכון שבאמת אפשר לעמוד בה.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.05, duration: 0.5 }}
            className="mt-8"
          >
            <Button size="lg" onClick={onStart} className="w-full sm:w-auto">
              מתחילים את המסע
              <motion.span animate={{ x: [0, -5, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}>
                <ArrowLeft size={20} />
              </motion.span>
            </Button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          aria-roledescription="carousel"
          aria-label="איך AuraFin עוזרת"
        >
          <div className="relative h-[22rem] sm:h-80">
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.article
                key={index}
                custom={direction}
                variants={{
                  enter: (dir) => ({ opacity: 0, x: dir > 0 ? -60 : 60, scale: 0.96 }),
                  center: { opacity: 1, x: 0, scale: 1 },
                  exit: (dir) => ({ opacity: 0, x: dir > 0 ? 60 : -60, scale: 0.96 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.3}
                onDragEnd={(_, info) => {
                  // RTL: swiping left reveals the next card.
                  if (info.offset.x < -SWIPE_THRESHOLD) goTo(index + 1);
                  else if (info.offset.x > SWIPE_THRESHOLD) goTo(index - 1);
                }}
                aria-roledescription="slide"
                aria-label={`${index + 1} מתוך ${SLIDES.length}`}
                className={`absolute inset-0 cursor-grab touch-pan-y overflow-hidden rounded-[32px] border border-navy/[0.06] bg-gradient-to-b ${slide.tint} bg-surface p-7 shadow-[var(--shadow-lift)] active:cursor-grabbing sm:p-9`}
              >
                <span className={`grid h-14 w-14 place-items-center rounded-2xl ${slide.iconBg} text-white shadow-lg`}>
                  <Icon size={26} />
                </span>
                <p className="mt-6 text-sm font-bold tracking-wide text-turquoise-dark">{slide.eyebrow}</p>
                <h2 className="mt-2 text-2xl font-extrabold text-navy sm:text-3xl">{slide.title}</h2>
                <p className="mt-3 text-base leading-relaxed text-navy-soft">{slide.body}</p>
              </motion.article>
            </AnimatePresence>
          </div>

          <div className="mt-3 flex items-center justify-center">
            {SLIDES.map((s, i) => (
              <button
                key={s.eyebrow}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`מעבר לשקופית ${i + 1}`}
                aria-current={i === index}
                className="grid h-12 min-w-12 place-items-center px-1"
              >
                <span
                  className="relative block h-2.5 overflow-hidden rounded-full bg-navy/10 transition-[width] duration-300"
                  style={{ width: i === index ? 36 : 10 }}
                >
                {i === index && (
                  <motion.span
                    key={`${index}-${paused}`}
                    className="absolute inset-0 origin-right rounded-full bg-turquoise"
                    initial={{ scaleX: paused ? 1 : 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: paused ? 0 : AUTO_ADVANCE_MS / 1000, ease: 'linear' }}
                  />
                )}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
    </div>
  );
}
