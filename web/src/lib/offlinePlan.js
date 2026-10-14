/**
 * Offline savings plan, built in the browser from the deterministic analysis when the API is
 * unreachable. Mirrors build_mock_plan() in api/app/coach.py.
 */

const money = (value) => `₪${Math.round(value).toLocaleString('en-US')}`;

const SKIP_IDEAS = {
  dining: [
    ['משלוח באמצע השבוע', 'ארוחה מהבית עולה כשליש', 0.3],
    ['קפה ומאפה בדרך לעבודה', 'תרמוס מהבית עושה את העבודה', 0.15],
  ],
  shopping: [
    ["קנייה ב'מבצע' שלא תכננתם", 'מבצע הוא סיבה לקנות, לא צורך', 0.35],
    ['עוד פריט אופנה החודש', 'הארון לא יברח', 0.2],
  ],
  entertainment: [
    ['מנוי סטרימינג נוסף', 'בחרו אחד ובטלו את השאר החודש', 0.15],
    ['יציאה ספונטנית שנייה בשבוע', 'יציאה אחת מתוכננת שווה יותר', 0.3],
  ],
};

export function buildOfflinePlan(snapshot, analysis, catalog) {
  const track = catalog.tracks.find((t) => t.id === snapshot.profile.track_id);
  const label = (key) => catalog.fields[key].label;
  const { variable } = snapshot;
  const variableKeys = ['dining', 'shopping', 'entertainment'];

  const overspends = analysis.leaks.filter((leak) => leak.kind === 'overspend');
  const focusKey = overspends[0]?.category ?? variableKeys.reduce((a, b) => (variable[b] > variable[a] ? b : a));
  const focusLabel = label(focusKey);
  const focusAmount = variable[focusKey];
  const weekly = Math.round(Math.min(focusAmount, snapshot.income * track.benchmarks[focusKey]) / 4.3);

  let picture;
  if (analysis.projected_savings < 0) {
    picture = `ההוצאות המתוכננות (${money(analysis.total_expenses)}) גבוהות מההכנסה ב־${money(-analysis.projected_savings)}. לפני שמדברים על חיסכון — מייצבים את החודש.`;
  } else if (analysis.on_track) {
    picture = `מעולה: צפויים להישאר לכם ${money(analysis.projected_savings)} בסוף החודש, מעל היעד של ${track.name} (${money(analysis.savings_goal)}). נשמור על זה.`;
  } else {
    picture = `בסוף החודש צפויים להישאר ${money(analysis.projected_savings)}, ויעד המסלול הוא ${money(analysis.savings_goal)} — חסרים ${money(-analysis.savings_gap)}.`;
  }
  if (analysis.children_count) {
    picture += ` עם ${analysis.children_count} ילדים, כרית הבלת"מים המומלצת היא לפחות ${money(analysis.reserve_target)} בחודש.`;
  }

  const savingsPlanMarkdown = `## התמונה הכוללת
${picture}

## התוכנית לחודש הקרוב
- תקציב שבועי ל${focusLabel}: **${money(weekly)}** (במקום כ־${money(focusAmount / 4.3)}).
- ביום קבלת המשכורת מעבירים **${money(Math.max(analysis.savings_goal, 0))}** לחשבון חיסכון נפרד — לפני שמתחילים להוציא.
- שומרים את ${money(snapshot.unexpected)} של הבלת"מים בצד, ולא נוגעים בהם לקניות.

## ההרגל שמשנה הכול
כשמתחשק לכם ${focusLabel} — אז מחכים 10 דקות ובודקים כמה נשאר מהתקציב השבועי.`;

  const leaks = analysis.leaks.slice(0, 4).map((leak) => ({
    category: leak.category,
    title: leak.kind === 'overspend' ? `${leak.label} מעל הרף של המסלול` : 'רשת הבלת"מים דקה מדי',
    explanation: `${money(leak.amount)} בחודש הם ${Math.round(leak.share_of_income * 100)}% מההכנסה, כשהרף ב${track.name} הוא ${Math.round(
      leak.benchmark_share * 100,
    )}%.`,
    monthly_saving: Math.round(leak.excess_amount),
  }));
  if (!leaks.length) {
    leaks.push({
      category: focusKey,
      title: `לשים עין על ${focusLabel}`,
      explanation: `זו ההוצאה המשתנה הגדולה שלכם (${money(focusAmount)}). כרגע בתוך הרף — שווה לשמור.`,
      monthly_saving: 0,
    });
  }

  const ordered = [focusKey, ...variableKeys.filter((key) => key !== focusKey)];
  const doNotBuy = ordered
    .flatMap((key) =>
      SKIP_IDEAS[key].map(([item, reason, share]) => ({ item, reason, estimated_saving: Math.round(variable[key] * share) })),
    )
    .slice(0, 5);

  return {
    headline: `החודש: תקציב שבועי של ${money(weekly)} ל${focusLabel}`,
    savings_plan_markdown: savingsPlanMarkdown,
    leaks,
    do_not_buy: doNotBuy,
  };
}
