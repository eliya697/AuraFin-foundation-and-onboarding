/**
 * Keyword auto-categorization for imported statement lines (see tests/categorize.test.js).
 *
 * Each rule names a spending category (housing, bills, groceries, dining, transport, entertainment,
 * shopping, children) and the budget lines it can land on, most specific first. Built-in lines are
 * used when the user's budget has them; otherwise a custom expense whose name contains one of the
 * category's `lineWords` (e.g. a custom "רכב" line for fuel); otherwise null, and the caller falls
 * back to "other" (unplanned). Pure data + functions, no imports.
 *
 * Keywords match whole words in order, and a Hebrew word may carry the definite article, so
 * "חברת החשמל" matches חשמל while "מימון" does not match מים.
 */
export const CATEGORY_RULES = [
  {
    id: 'housing',
    label: 'דיור',
    keys: ['rent'],
    lineWords: ['דיור', 'שכירות', 'משכנתא', 'ועד בית'],
    keywords: ['שכר דירה', 'שכירות', 'משכנתא', 'משכנתה', 'ועד בית', 'rent', 'mortgage'],
  },
  { id: 'electricity', label: 'חשבונות', keys: ['electricity'], lineWords: [], keywords: ['חברת החשמל', 'חשמל', 'iec', 'electric'] },
  {
    id: 'water',
    label: 'חשבונות',
    keys: ['water'],
    lineWords: [],
    keywords: ['מי אביבים', 'מי שבע', 'מי רעננה', 'הגיחון', 'מי כרמל', 'תאגיד מים', 'מים', 'water'],
  },
  {
    id: 'municipal',
    label: 'חשבונות',
    keys: ['municipal'],
    lineWords: [],
    keywords: ['ארנונה', 'עיריית', 'עירית', 'עירייה', 'מועצה אזורית', 'מועצה מקומית', 'municipality'],
  },
  {
    id: 'bills',
    label: 'חשבונות',
    keys: [],
    lineWords: ['תקשורת', 'סלולר', 'טלפון', 'אינטרנט', 'חשבונות', 'ביטוח'],
    keywords: ['בזק', 'פרטנר', 'סלקום', 'הוט', 'גולן טלקום', 'פלאפון', 'we4g', 'ביטוח לאומי', 'הראל', 'מגדל', 'הפניקס', 'מנורה', 'כלל ביטוח', 'partner', 'cellcom', 'bezeq'],
  },
  {
    id: 'groceries',
    label: 'אוכל',
    keys: ['shopping'],
    lineWords: ['סופר', 'מכולת', 'אוכל'],
    keywords: [
      'שופרסל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'מגה בעיר', 'אושר עד', 'טיב טעם', 'יינות ביתן', 'חצי חינם', 'קרפור',
      'סופר', 'סופרמרקט', 'מרקט', 'מכולת', 'am pm', 'supermarket', 'grocery', 'carrefour',
    ],
  },
  {
    id: 'dining',
    label: 'אוכל',
    keys: ['dining'],
    lineWords: ['מסעדות', 'אוכל בחוץ'],
    keywords: [
      'מסעדה', 'מסעדת', 'קפה', 'ארומה', 'גרג', 'לנדוור', 'מקדונלדס', 'בורגר', 'פיצה', 'שווארמה', 'פלאפל', 'סושי',
      'וולט', 'תן ביס', 'סיבוס', 'wolt', '10bis', 'cibus', 'mcdonalds', 'burger', 'pizza', 'restaurant', 'cafe', 'coffee',
    ],
  },
  {
    id: 'transport',
    label: 'תחבורה',
    keys: [],
    lineWords: ['תחבורה', 'רכב', 'דלק', 'נסיעות', 'חניה', 'חנייה'],
    keywords: [
      'פז', 'דלק', 'סונול', 'דור אלון', 'תן דלק', 'רב קו', 'רב-קו', 'מוביט', 'יאנגו', 'רכבת ישראל', 'אגד', 'כביש 6',
      'חניה', 'חנייה', 'פנגו', 'סלופארק', 'paz', 'sonol', 'dor alon', 'delek', 'moovit', 'gett', 'yango', 'uber', 'pango', 'cellopark', 'fuel',
    ],
  },
  {
    id: 'entertainment',
    label: 'בילויים',
    keys: ['entertainment'],
    lineWords: ['בילויים', 'פנאי'],
    keywords: [
      'סינמה סיטי', 'יס פלאנט', 'רב חן', 'סינמה', 'נטפליקס', 'ספוטיפיי', 'תיאטרון', 'הופעה', 'פאב',
      'netflix', 'spotify', 'disney', 'steam', 'playstation', 'xbox', 'eventim', 'cinema', 'yes planet',
    ],
  },
  {
    id: 'shopping',
    label: 'קניות',
    keys: ['shopping'],
    lineWords: ['קניות', 'ביגוד'],
    keywords: ['זארה', 'קסטרו', 'פוקס', 'גולף', 'איקאה', 'אמזון', 'עלי אקספרס', 'שיין', 'באג', 'zara', 'h m', 'ikea', 'amazon', 'aliexpress', 'shein', 'ksp'],
  },
  {
    id: 'children',
    label: 'ילדים',
    keys: ['children'],
    lineWords: ['ילדים', 'גן', 'צהרון', 'חוגים'],
    keywords: ['צהרון', 'גן ילדים', 'משחקיית', 'טויס אר אס', 'שילב', 'toys r us'],
  },
];

const words = (value) =>
  String(value ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Whether `phrase` appears in `haystack` (already split into words) as consecutive whole words. */
function containsPhrase(haystack, phrase) {
  const target = words(phrase);
  if (!target.length) return false;
  const same = (word, w) => word === w || word === `ה${w}`;
  return haystack.some((_, i) => target.every((w, j) => haystack[i + j] !== undefined && same(haystack[i + j], w)));
}

/** The first rule with a keyword in the merchant text, or null. */
export function categoryOf(merchant) {
  const haystack = words(merchant);
  if (!haystack.length) return null;
  return CATEGORY_RULES.find((rule) => rule.keywords.some((keyword) => containsPhrase(haystack, keyword))) ?? null;
}

/**
 * Budget line key for a merchant from keywords alone, restricted to the user's `lines`
 * ([{ key, label }]); null when no rule matches or no matching line exists.
 */
export function lineByKeyword(merchant, lines) {
  const rule = categoryOf(merchant);
  if (!rule) return null;
  const available = new Set(lines.map((line) => line.key));
  const builtIn = rule.keys.find((key) => available.has(key));
  if (builtIn) return builtIn;
  const custom = lines.find(
    (line) => line.key.startsWith('custom:') && rule.lineWords.some((word) => containsPhrase(words(line.label), word)),
  );
  return custom?.key ?? null;
}
