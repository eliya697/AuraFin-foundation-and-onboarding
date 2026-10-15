import { TRACKS } from '../lib/catalog.js';
import { EMPTY_BUDGET, MAX_CHILDREN, SCALAR_FIELDS, buildSnapshot, isBudgetComplete } from '../lib/budget.js';

/**
 * Pure journey state: shape, reducer, the stage guard and sanitising of stored/remote data.
 * React-free so it can be unit-tested (see tests/journeyModel.test.js).
 */

export const initialJourney = Object.freeze({
  welcomeDone: false,
  profile: null, // { lifeStage, goal, hasChildren, childrenCount, trackId }
  budget: EMPTY_BUDGET, // scalar amounts as strings + custom: [{ id, title, amount }]
  unlock: null, // { fingerprint, analysis, mode: 'server' | 'offline' }
  plan: null, // { fingerprint, data }
  // Set while the user edits after reaching the dashboard (or reopens the quiz from the gate).
  // `original` is what "cancel" restores; null when there is nothing to go back to.
  editing: null, // { kind: 'budget' | 'profile', original: { profile, budget, unlock, plan } | null }
  updatedAt: 0, // ms epoch of the last user change; drives local ⇄ cloud conflict resolution
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asAmount = (value) => (value === null || value === undefined ? '' : String(value));

function normalizeBudget(raw) {
  const source = isObject(raw) ? raw : {};
  const budget = { ...EMPTY_BUDGET };
  for (const key of SCALAR_FIELDS) budget[key] = asAmount(source[key]);
  budget.custom = Array.isArray(source.custom)
    ? source.custom.filter(isObject).map((item) => ({
        id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(),
        title: typeof item.title === 'string' ? item.title : '',
        amount: asAmount(item.amount),
      }))
    : [];
  return budget;
}

function normalizeProfile(raw) {
  if (!isObject(raw)) return null;
  return {
    lifeStage: typeof raw.lifeStage === 'string' ? raw.lifeStage : null,
    goal: typeof raw.goal === 'string' ? raw.goal : null,
    hasChildren: typeof raw.hasChildren === 'boolean' ? raw.hasChildren : null,
    childrenCount: Number.isInteger(raw.childrenCount) ? raw.childrenCount : 0,
    trackId: typeof raw.trackId === 'string' ? raw.trackId : null,
  };
}

function normalizeUnlock(raw) {
  if (!isObject(raw) || typeof raw.fingerprint !== 'string' || !isObject(raw.analysis)) return null;
  return { fingerprint: raw.fingerprint, analysis: raw.analysis, mode: raw.mode === 'server' ? 'server' : 'offline' };
}

function normalizePlan(raw) {
  if (!isObject(raw) || typeof raw.fingerprint !== 'string' || !isObject(raw.data) || !isObject(raw.data.plan)) return null;
  return raw;
}

function normalizeSnapshot(raw) {
  if (!isObject(raw)) return null;
  return {
    profile: normalizeProfile(raw.profile),
    budget: normalizeBudget(raw.budget),
    unlock: normalizeUnlock(raw.unlock),
    plan: normalizePlan(raw.plan),
  };
}

/** Accepts anything (old localStorage format, a remote row, garbage) and returns a valid journey. */
export function normalizeJourney(raw) {
  if (!isObject(raw)) return { ...initialJourney };
  const editing =
    isObject(raw.editing) && (raw.editing.kind === 'budget' || raw.editing.kind === 'profile')
      ? { kind: raw.editing.kind, original: normalizeSnapshot(raw.editing.original) }
      : null;
  return {
    welcomeDone: raw.welcomeDone === true,
    profile: normalizeProfile(raw.profile),
    budget: normalizeBudget(raw.budget),
    unlock: normalizeUnlock(raw.unlock),
    plan: normalizePlan(raw.plan),
    editing,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  };
}

export function fingerprintOf(profile, budget) {
  return JSON.stringify(buildSnapshot(profile, budget));
}

export function isProfileComplete(profile) {
  if (!profile?.lifeStage || !profile?.goal || !TRACKS[profile?.trackId]) return false;
  if (typeof profile.hasChildren !== 'boolean') return false;
  return profile.hasChildren
    ? Number.isInteger(profile.childrenCount) && profile.childrenCount >= 1 && profile.childrenCount <= MAX_CHILDREN
    : profile.childrenCount === 0;
}

const sameProfile = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const snapshotOf = (state) => ({ profile: state.profile, budget: state.budget, unlock: state.unlock, plan: state.plan });

export function journeyReducer(state, action) {
  const touched = (next) => ({ ...next, updatedAt: action.at ?? Date.now() });

  switch (action.type) {
    case 'welcome_done':
      return touched({ ...state, welcomeDone: true });

    case 'quiz_done': {
      const original = state.editing?.original ?? null;
      // Unchanged profile while editing from the dashboard → straight back to it.
      if (original && sameProfile(original.profile, action.profile)) {
        return touched({ ...state, profile: action.profile, editing: null });
      }
      return touched({ ...state, profile: action.profile, editing: original ? { kind: 'budget', original } : null });
    }

    case 'quiz_reopen':
      return touched({ ...state, editing: { kind: 'profile', original: state.editing?.original ?? null } });

    case 'edit_start':
      if (state.editing) return { ...state, editing: { ...state.editing, kind: action.kind } };
      return touched({ ...state, editing: { kind: action.kind, original: snapshotOf(state) } });

    case 'edit_cancel': {
      const original = state.editing?.original;
      if (!original) return touched({ ...state, editing: null });
      return touched({ ...state, ...original, editing: null });
    }

    case 'budget_changed':
      return touched({ ...state, budget: action.budget });

    case 'gate_unlocked':
      return touched({
        ...state,
        budget: action.budget,
        unlock: { fingerprint: action.fingerprint, analysis: action.analysis, mode: action.mode },
        editing: null,
      });

    case 'gate_verified':
      // A background re-check upgraded a locally verified snapshot to server-verified.
      if (!state.unlock || state.unlock.fingerprint !== action.fingerprint) return state;
      return touched({ ...state, unlock: { ...state.unlock, analysis: action.analysis, mode: 'server' } });

    case 'plan_loaded':
      return touched({ ...state, plan: { fingerprint: action.fingerprint, data: action.data } });

    case 'restart':
      return touched({ ...initialJourney });

    case 'hydrate':
      return normalizeJourney(action.state);

    default:
      return state;
  }
}

/**
 * The journey guard. The dashboard is reachable only when the welcome was seen, the quiz is
 * complete, the budget passes validation AND the gate unlocked exactly this snapshot (on the
 * server, or locally in offline mode). Editing any number after unlocking re-locks it.
 */
export function resolveStage(state) {
  if (!state.welcomeDone) return 'welcome';
  if (state.editing?.kind === 'profile') return 'quiz';
  if (!isProfileComplete(state.profile)) return 'quiz';
  if (state.editing?.kind === 'budget') return 'gate';
  if (!isBudgetComplete(state.budget, state.profile)) return 'gate';
  if (!state.unlock || state.unlock.fingerprint !== fingerprintOf(state.profile, state.budget)) return 'gate';
  return 'dashboard';
}

/** Which copy wins when both this device and the cloud have a journey. */
export function chooseJourney(local, remote) {
  if (!remote) return local.updatedAt > 0 ? 'push-local' : 'keep-local';
  if (remote.updatedAt > local.updatedAt) return 'use-remote';
  if (remote.updatedAt < local.updatedAt) return 'push-local';
  return 'keep-local';
}
