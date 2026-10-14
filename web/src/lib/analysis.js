/**
 * Client-side port of api/app/analysis.py, used only by the offline fallback when the API is
 * unreachable. Pure (no imports) so it runs in Node for the parity test against
 * shared/fixtures/analysis_cases.json. Keep both implementations in lockstep.
 */

/** Rounds .5 away from zero, matching Python's Decimal ROUND_HALF_UP. */
export function roundHalfUp(value, digits = 0) {
  const factor = 10 ** digits;
  // toPrecision(15) strips float artefacts (1.005 * 100 = 100.49999999999999) before rounding.
  const scaled = Number((Math.abs(value) * factor).toPrecision(15));
  return (Math.sign(value) * Math.round(scaled)) / factor || 0;
}

export function analyzeBudget(snapshot, catalog) {
  const track = catalog.tracks.find((t) => t.id === snapshot.profile.track_id);
  if (!track) throw new Error(`Unknown track: ${snapshot.profile.track_id}`);
  const label = (key) => catalog.fields[key].label;
  const { income, fixed, variable } = snapshot;
  const childrenCount = snapshot.profile.has_children ? snapshot.profile.children_count : 0;

  const breakdown = {
    fixed: fixed.rent + fixed.electricity + fixed.water + fixed.municipal,
    variable: variable.dining + variable.shopping,
    entertainment: variable.entertainment,
    unexpected: snapshot.unexpected,
    children: snapshot.children_expenses,
    custom: snapshot.custom_expenses.reduce((sum, item) => sum + item.amount, 0),
  };
  const total =
    breakdown.fixed + breakdown.variable + breakdown.entertainment + breakdown.unexpected + breakdown.children + breakdown.custom;
  const projected = income - total;
  const goal = roundHalfUp(income * track.savingsRate);

  const leaks = [];
  for (const category of ['dining', 'shopping', 'entertainment']) {
    const amount = variable[category];
    const benchmark = track.benchmarks[category];
    if (amount > income * benchmark) {
      leaks.push({
        category,
        label: label(category),
        amount,
        share_of_income: roundHalfUp(amount / income, 4),
        benchmark_share: benchmark,
        excess_amount: roundHalfUp(amount - income * benchmark),
        kind: 'overspend',
      });
    }
  }

  // Every child raises the minimum unexpected-costs reserve, up to a cap.
  const { reserveBoostPerChild, reserveBoostMax } = catalog.children;
  const reserveShare = roundHalfUp(track.minUnexpectedShare + Math.min(childrenCount * reserveBoostPerChild, reserveBoostMax), 4);
  const reserveTarget = roundHalfUp(income * reserveShare);
  if (snapshot.unexpected < income * reserveShare) {
    leaks.push({
      category: 'unexpected',
      label: label('unexpected'),
      amount: snapshot.unexpected,
      share_of_income: roundHalfUp(snapshot.unexpected / income, 4),
      benchmark_share: reserveShare,
      excess_amount: roundHalfUp(income * reserveShare - snapshot.unexpected),
      kind: 'under_reserved',
    });
  }

  leaks.sort((a, b) => b.excess_amount - a.excess_amount);

  return {
    track_id: track.id,
    track_name: track.name,
    total_expenses: roundHalfUp(total),
    projected_savings: roundHalfUp(projected),
    savings_rate: roundHalfUp(projected / income, 4),
    savings_goal: goal,
    savings_gap: roundHalfUp(projected - goal),
    on_track: projected >= goal,
    children_count: childrenCount,
    reserve_target: reserveTarget,
    breakdown,
    leaks,
  };
}
