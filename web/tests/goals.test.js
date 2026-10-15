import { describe, expect, it } from 'vitest';
import {
  goalFromDraft,
  goalFromRow,
  goalToRow,
  monthlySavings,
  monthsBetween,
  newGoalDraft,
  normalizeGoal,
  projectGoal,
  validateGoalDraft,
  visibleGoals,
} from '../src/lib/goals.js';

const TODAY = '2026-10-15';
const goal = (over = {}) => ({ id: 'g', name: 'קרן חירום', target: 10000, saved: 4000, deadline: null, updatedAt: 1, deletedAt: null, ...over });
const tx = (occurredOn, amount, kind = 'expense') => ({ occurredOn, amount, kind, deletedAt: null });

describe('validateGoalDraft', () => {
  it('requires a name and a positive target; saved and deadline are optional', () => {
    expect(Object.keys(validateGoalDraft(newGoalDraft(), TODAY)).sort()).toEqual(['name', 'target']);
    expect(validateGoalDraft({ ...newGoalDraft(), name: 'דירה', target: '300000' }, TODAY)).toEqual({});
  });
  it('rejects negative saved amounts and past deadlines', () => {
    const errors = validateGoalDraft({ name: 'x', target: '10', saved: '-1', deadline: '2026-10-15' }, TODAY);
    expect(Object.keys(errors).sort()).toEqual(['deadline', 'saved']);
  });
});

describe('goal mapping', () => {
  it('builds a goal from a draft', () => {
    const g = goalFromDraft({ id: null, name: ' טיול ', target: '5000.555', saved: '', deadline: '' }, { now: 7, newId: () => 'id1' });
    expect(g).toEqual({ id: 'id1', name: 'טיול', target: 5000.56, saved: 0, deadline: null, updatedAt: 7, deletedAt: null });
  });
  it('round-trips through the savings_goals row', () => {
    const g = goal({ deadline: '2027-06-30', updatedAt: Date.parse('2026-10-01T00:00:00Z') });
    const row = goalToRow(g, 'u1');
    expect(row).toMatchObject({ user_id: 'u1', deadline: '2027-06-30', deleted_at: null });
    expect(goalFromRow({ ...row, target: '10000.00', saved: '4000.00', updated_at: '2026-10-01T00:00:05Z' })).toEqual({
      ...g,
      syncedAt: Date.parse('2026-10-01T00:00:05Z'),
    });
  });
  it('drops invalid stored goals and sorts by deadline', () => {
    expect(normalizeGoal({ id: 'x', target: 0 })).toBeNull();
    const list = [goal({ id: 'a', name: 'ב' }), goal({ id: 'b', deadline: '2027-01-01' }), goal({ id: 'c', deletedAt: 3 }), goal({ id: 'd', name: 'א' })];
    expect(visibleGoals(list).map((g) => g.id)).toEqual(['b', 'd', 'a']);
  });
});

describe('monthlySavings', () => {
  const budget = { income: '10000', rent: '3000', electricity: '0', water: '0', municipal: '0', entertainment: '0', dining: '1000', shopping: '0', unexpected: '500', children: '', custom: [] };
  const profile = { hasChildren: false };

  it('averages the net of the last complete months with data', () => {
    const list = [
      tx('2026-06-30', 9000, 'income'), // outside the Jul–Sep window
      tx('2026-08-01', 10000, 'income'),
      tx('2026-08-10', 7000),
      tx('2026-09-01', 10000, 'income'),
      tx('2026-09-12', 8000),
      tx('2026-10-02', 50000, 'income'), // current month, incomplete: ignored
    ];
    expect(monthlySavings(list, { budget, profile, today: TODAY })).toEqual({ amount: 2500, source: 'actual', months: 2 });
  });

  it('falls back to the planned remainder without two months of history', () => {
    expect(monthlySavings([tx('2026-09-01', 100)], { budget, profile, today: TODAY })).toEqual({ amount: 5500, source: 'plan', months: 0 });
  });
});

describe('projectGoal', () => {
  it('projects the completion month at the given pace', () => {
    // 6000 left at 2000/month → deposits in Oct, Nov, Dec → done in December.
    expect(projectGoal(goal(), 2000, { today: TODAY })).toMatchObject({
      progress: 0.4,
      remaining: 6000,
      monthsNeeded: 3,
      projectedMonth: '2026-12',
      status: 'no_deadline',
    });
  });

  it('compares the projection with the deadline and says what is needed', () => {
    expect(projectGoal(goal({ deadline: '2026-12-31' }), 2000, { today: TODAY })).toMatchObject({ status: 'on_track', neededPerMonth: 2000 });
    const behind = projectGoal(goal({ deadline: '2026-11-30' }), 2000, { today: TODAY });
    expect(behind).toMatchObject({ status: 'behind', projectedMonth: '2026-12', neededPerMonth: 3000 });
  });

  it('handles finished goals, no savings pace and passed deadlines', () => {
    expect(projectGoal(goal({ saved: 12000 }), 100, { today: TODAY })).toMatchObject({ status: 'done', progress: 1, remaining: 0 });
    expect(projectGoal(goal(), 0, { today: TODAY })).toMatchObject({ status: 'no_pace', projectedMonth: null });
    expect(projectGoal(goal(), -500, { today: TODAY }).status).toBe('no_pace');
    expect(projectGoal(goal({ deadline: '2026-09-01' }), 2000, { today: TODAY })).toMatchObject({ status: 'overdue', neededPerMonth: null });
  });
});

describe('monthsBetween', () => {
  it('counts calendar months', () => {
    expect(monthsBetween('2026-10', '2027-02')).toBe(4);
    expect(monthsBetween('2026-10', '2026-10')).toBe(0);
    expect(monthsBetween('2026-10', '2026-08')).toBe(-2);
  });
});
