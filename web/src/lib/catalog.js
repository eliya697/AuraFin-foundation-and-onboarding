import {
  Bike,
  ShoppingBag,
  Smartphone,
  Coffee,
  Shirt,
  Gamepad2,
  Wine,
  Plane,
  Sparkles,
  Repeat,
  HeartHandshake,
  Flame,
  LineChart,
  Home,
  ShieldCheck,
  Car,
  Palmtree,
  Rocket,
} from 'lucide-react';

/** Impulse "leaks" with typical ticket size (ILS) and monthly frequency, used for onboarding and sample data. */
export const IMPULSE_LEAKS = [
  { key: 'food_delivery', label: 'משלוחי אוכל', hint: 'וולט, תן ביס', icon: Bike, typicalAmount: 85, perMonth: 9, merchants: ['וולט', 'תן ביס', 'משלוח סושי'] },
  { key: 'online_shopping', label: 'קניות אונליין', hint: 'עלי, אמזון, שיין', icon: ShoppingBag, typicalAmount: 140, perMonth: 4, merchants: ['AliExpress', 'Amazon', 'SHEIN'] },
  { key: 'gadgets', label: "גאדג'טים", hint: 'אוזניות, אביזרים', icon: Smartphone, typicalAmount: 320, perMonth: 1, merchants: ['KSP', 'באג', 'iDigital'] },
  { key: 'coffee', label: 'קפה בדרך', hint: 'הפוך + מאפה', icon: Coffee, typicalAmount: 32, perMonth: 14, merchants: ['ארומה', 'קפה קפה', 'רולדין'] },
  { key: 'fashion', label: 'אופנה', hint: 'סייל שאי אפשר לפספס', icon: Shirt, typicalAmount: 220, perMonth: 2, merchants: ['זארה', 'H&M', 'קסטרו'] },
  { key: 'gaming', label: 'גיימינג ואפליקציות', hint: 'רכישות בתוך המשחק', icon: Gamepad2, typicalAmount: 60, perMonth: 3, merchants: ['PlayStation Store', 'Steam', 'App Store'] },
  { key: 'nightlife', label: 'בילויים ויציאות', hint: 'עוד סיבוב על הבר', icon: Wine, typicalAmount: 180, perMonth: 3, merchants: ['בר שכונתי', 'מועדון', 'פאב'] },
  { key: 'spontaneous_travel', label: 'חופשות ספונטניות', hint: 'דיל של רגע אחרון', icon: Plane, typicalAmount: 650, perMonth: 0.5, merchants: ['Booking', 'Airbnb', 'Last Minute'] },
  { key: 'beauty', label: 'טיפוח ויופי', hint: 'עוד קרם, עוד טיפול', icon: Sparkles, typicalAmount: 150, perMonth: 2, merchants: ['סופר-פארם', 'Sephora', 'קוסמטיקאית'] },
  { key: 'subscriptions', label: 'מנויים נשכחים', hint: 'סטרימינג שלא צופים בו', icon: Repeat, typicalAmount: 45, perMonth: 3, merchants: ['Netflix', 'Spotify', 'Disney+'] },
];

export const LEAKS_BY_KEY = Object.fromEntries(IMPULSE_LEAKS.map((leak) => [leak.key, leak]));

export const MAX_LEAKS = 4;

export const GOAL_PRESETS = [
  { key: 'home', label: 'הון עצמי לדירה', icon: Home, suggestedAmount: 400000 },
  { key: 'emergency', label: 'קרן חירום', icon: ShieldCheck, suggestedAmount: 30000 },
  { key: 'car', label: 'רכב', icon: Car, suggestedAmount: 90000 },
  { key: 'travel', label: 'טיול גדול', icon: Palmtree, suggestedAmount: 25000 },
  { key: 'freedom', label: 'חופש כלכלי', icon: Rocket, suggestedAmount: 1000000 },
];

export const COACH_PERSONAS = [
  {
    key: 'gentle',
    title: 'המדריך העדין',
    subtitle: 'Gentle Guide',
    description: 'אמפתי, בלי שיפוטיות. בונה הרגלים בצעדים קטנים ומחזק כל הצלחה.',
    icon: HeartHandshake,
    accent: 'from-emerald-400/30 to-teal-500/10',
    ring: 'ring-emerald-400/60',
    text: 'text-emerald-300',
  },
  {
    key: 'tough_love',
    title: 'אהבה קשוחה',
    subtitle: 'Tough Love · No-BS',
    description: 'ישיר, חד ובלי תירוצים. אומר לך את מה שאף אחד אחר לא יגיד.',
    icon: Flame,
    accent: 'from-amber-400/30 to-rose-500/10',
    ring: 'ring-amber-400/60',
    text: 'text-amber-300',
  },
  {
    key: 'analytical',
    title: 'הכלכלן האנליטי',
    subtitle: 'Analytical Financier',
    description: 'מספרים, יחסים ותרחישים. החלטות על בסיס נתונים, לא תחושות.',
    icon: LineChart,
    accent: 'from-sky-400/30 to-indigo-500/10',
    ring: 'ring-sky-400/60',
    text: 'text-sky-300',
  },
];

export const PERSONAS_BY_KEY = Object.fromEntries(COACH_PERSONAS.map((p) => [p.key, p]));

export const CATEGORY_META = {
  must: { label: 'חובה', dot: 'bg-slate-400', text: 'text-slate-300' },
  fun: { label: 'הנאה', dot: 'bg-sky-400', text: 'text-sky-300' },
  impulse: { label: 'אימפולס', dot: 'bg-amber-400', text: 'text-amber-300' },
};
