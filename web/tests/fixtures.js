import { analyzeBudget } from '../src/lib/analysis.js';
import { CATALOG } from '../src/lib/catalog.js';
import { EMPTY_BUDGET, buildSnapshot } from '../src/lib/budget.js';
import { fingerprintOf } from '../src/state/journeyModel.js';

export const PROFILE = { lifeStage: 'student', goal: 'safety_net', hasChildren: false, childrenCount: 0, trackId: 'student_smart' };

export const BUDGET = {
  ...EMPTY_BUDGET,
  income: '7000',
  rent: '2200',
  electricity: '180',
  water: '60',
  municipal: '150',
  entertainment: '450',
  dining: '1100',
  shopping: '500',
  unexpected: '300',
  custom: [],
};

/** A journey that resolves to the dashboard (unlocked locally). */
export function dashboardJourney(overrides = {}) {
  const analysis = analyzeBudget(buildSnapshot(PROFILE, BUDGET), CATALOG);
  return {
    welcomeDone: true,
    profile: PROFILE,
    budget: BUDGET,
    unlock: { fingerprint: fingerprintOf(PROFILE, BUDGET), analysis, mode: 'offline' },
    plan: null,
    editing: null,
    updatedAt: 1000,
    ...overrides,
  };
}
