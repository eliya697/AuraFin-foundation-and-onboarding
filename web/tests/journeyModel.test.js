import { describe, expect, test } from 'vitest';
import { chooseJourney, journeyReducer, normalizeJourney, resolveStage } from '../src/state/journeyModel.js';
import { BUDGET, PROFILE, dashboardJourney } from './fixtures.js';

const at = 5000;

describe('resolveStage', () => {
  test('a fresh journey starts at welcome', () => {
    expect(resolveStage(normalizeJourney(null))).toBe('welcome');
  });

  test('complete + unlocked snapshot reaches the dashboard', () => {
    expect(resolveStage(dashboardJourney())).toBe('dashboard');
  });

  test('changing any number after unlocking re-locks the dashboard', () => {
    const state = journeyReducer(dashboardJourney(), { type: 'budget_changed', budget: { ...BUDGET, dining: '900' }, at });
    expect(resolveStage(state)).toBe('gate');
  });
});

describe('editing from the dashboard', () => {
  test('"update data" opens the gate and keeps every value', () => {
    const state = journeyReducer(dashboardJourney(), { type: 'edit_start', kind: 'budget', at });
    expect(resolveStage(state)).toBe('gate');
    expect(state.budget).toEqual(BUDGET);
    expect(state.unlock).not.toBeNull();
    expect(state.updatedAt).toBe(at);
  });

  test('cancel restores the original snapshot and returns to the dashboard', () => {
    let state = journeyReducer(dashboardJourney(), { type: 'edit_start', kind: 'budget', at });
    state = journeyReducer(state, { type: 'budget_changed', budget: { ...BUDGET, income: '' }, at: at + 1 });
    state = journeyReducer(state, { type: 'edit_cancel', at: at + 2 });
    expect(state.budget).toEqual(BUDGET);
    expect(state.editing).toBeNull();
    expect(resolveStage(state)).toBe('dashboard');
  });

  test('re-submitting the gate clears the edit', () => {
    let state = journeyReducer(dashboardJourney(), { type: 'edit_start', kind: 'budget', at });
    const unlock = state.unlock;
    state = journeyReducer(state, { type: 'gate_unlocked', budget: BUDGET, analysis: unlock.analysis, mode: 'server', fingerprint: unlock.fingerprint, at });
    expect(state.editing).toBeNull();
    expect(state.unlock.mode).toBe('server');
    expect(resolveStage(state)).toBe('dashboard');
  });

  test('editing the profile without changes goes straight back to the dashboard', () => {
    let state = journeyReducer(dashboardJourney(), { type: 'edit_start', kind: 'profile', at });
    expect(resolveStage(state)).toBe('quiz');
    state = journeyReducer(state, { type: 'quiz_done', profile: { ...PROFILE }, at });
    expect(resolveStage(state)).toBe('dashboard');
  });

  test('adding children sends the user to the gate with cancel still available', () => {
    let state = journeyReducer(dashboardJourney(), { type: 'edit_start', kind: 'profile', at });
    state = journeyReducer(state, { type: 'quiz_done', profile: { ...PROFILE, hasChildren: true, childrenCount: 2 }, at });
    expect(resolveStage(state)).toBe('gate');
    expect(state.editing.kind).toBe('budget');
    state = journeyReducer(state, { type: 'edit_cancel', at });
    expect(state.profile).toEqual(PROFILE);
    expect(resolveStage(state)).toBe('dashboard');
  });

  test('reopening the quiz from the gate no longer wipes the profile', () => {
    const onGate = { ...dashboardJourney(), unlock: null };
    const state = journeyReducer(onGate, { type: 'quiz_reopen', at });
    expect(state.profile).toEqual(PROFILE);
    expect(resolveStage(state)).toBe('quiz');
  });
});

describe('background verification', () => {
  test('upgrades a locally unlocked snapshot to server-verified', () => {
    const start = dashboardJourney();
    const state = journeyReducer(start, { type: 'gate_verified', fingerprint: start.unlock.fingerprint, analysis: start.unlock.analysis, at });
    expect(state.unlock.mode).toBe('server');
  });

  test('ignores a verification for an outdated snapshot', () => {
    const start = dashboardJourney();
    const state = journeyReducer(start, { type: 'gate_verified', fingerprint: 'stale', analysis: {}, at });
    expect(state).toBe(start);
  });
});

describe('normalizeJourney', () => {
  test('repairs corrupted or partial data instead of crashing', () => {
    const state = normalizeJourney({
      welcomeDone: 'yes',
      profile: 'oops',
      budget: { income: 5000, custom: [{ title: 'gym', amount: 100 }, null, 'x'] },
      unlock: { fingerprint: 1 },
      plan: { fingerprint: 'a', data: null },
      editing: { kind: 'weird' },
    });
    expect(state.welcomeDone).toBe(false);
    expect(state.profile).toBeNull();
    expect(state.budget.income).toBe('5000');
    expect(state.budget.rent).toBe('');
    expect(state.budget.custom).toHaveLength(1);
    expect(state.budget.custom[0]).toMatchObject({ title: 'gym', amount: '100' });
    expect(state.unlock).toBeNull();
    expect(state.plan).toBeNull();
    expect(state.editing).toBeNull();
  });

  test('round-trips a valid journey', () => {
    const journey = dashboardJourney();
    expect(normalizeJourney(JSON.parse(JSON.stringify(journey)))).toEqual(journey);
  });
});

describe('chooseJourney (local ⇄ cloud)', () => {
  test('newer cloud copy wins', () => {
    expect(chooseJourney({ updatedAt: 1 }, { updatedAt: 2 })).toBe('use-remote');
  });
  test('newer local copy is uploaded', () => {
    expect(chooseJourney({ updatedAt: 3 }, { updatedAt: 2 })).toBe('push-local');
  });
  test('empty cloud gets the local copy only if there is one', () => {
    expect(chooseJourney({ updatedAt: 3 }, null)).toBe('push-local');
    expect(chooseJourney({ updatedAt: 0 }, null)).toBe('keep-local');
  });
});
