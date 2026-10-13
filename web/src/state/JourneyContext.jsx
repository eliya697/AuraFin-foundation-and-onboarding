import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { TRACKS } from '../lib/catalog.js';
import { EMPTY_BUDGET, buildSnapshot, isBudgetComplete } from '../lib/budget.js';

const STORAGE_KEY = 'aurafin:v2:journey';

const initialState = {
  welcomeDone: false,
  profile: null, // { lifeStage, goal, trackId }
  budget: EMPTY_BUDGET,
  unlock: null, // { fingerprint, analysis } — set only after the server accepted the snapshot
  plan: null, // { fingerprint, data }
};

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw);
    return { ...initialState, ...saved, budget: { ...EMPTY_BUDGET, ...saved.budget } };
  } catch {
    return initialState;
  }
}

function save(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: the journey still works for this session.
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'welcome_done':
      return { ...state, welcomeDone: true };
    case 'quiz_done':
      return { ...state, profile: action.profile, unlock: null, plan: null };
    case 'quiz_reopen':
      return { ...state, profile: null, unlock: null, plan: null };
    case 'budget_changed':
      return { ...state, budget: action.budget };
    case 'gate_unlocked':
      return { ...state, budget: action.budget, unlock: { fingerprint: action.fingerprint, analysis: action.analysis } };
    case 'gate_reopen':
      return { ...state, unlock: null };
    case 'plan_loaded':
      return { ...state, plan: { fingerprint: action.fingerprint, data: action.data } };
    case 'restart':
      return initialState;
    default:
      return state;
  }
}

export function fingerprintOf(profile, budget) {
  return JSON.stringify(buildSnapshot(profile, budget));
}

function isProfileComplete(profile) {
  return Boolean(profile?.lifeStage && profile?.goal && TRACKS[profile?.trackId]);
}

/**
 * The journey guard. The dashboard is reachable only when the welcome was seen, the quiz is
 * complete, the budget passes validation AND the server unlocked exactly this snapshot.
 * Editing any number after unlocking sends the user back to the gate.
 */
export function resolveStage(state) {
  if (!state.welcomeDone) return 'welcome';
  if (!isProfileComplete(state.profile)) return 'quiz';
  if (!isBudgetComplete(state.budget)) return 'gate';
  if (!state.unlock || state.unlock.fingerprint !== fingerprintOf(state.profile, state.budget)) return 'gate';
  return 'dashboard';
}

const JourneyContext = createContext(null);

export function JourneyProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => save(state), [state]);

  const actions = useMemo(
    () => ({
      completeWelcome: () => dispatch({ type: 'welcome_done' }),
      completeQuiz: (profile) => dispatch({ type: 'quiz_done', profile }),
      reopenQuiz: () => dispatch({ type: 'quiz_reopen' }),
      updateBudget: (budget) => dispatch({ type: 'budget_changed', budget }),
      reopenGate: () => dispatch({ type: 'gate_reopen' }),
      restart: () => dispatch({ type: 'restart' }),
    }),
    [],
  );

  const unlockDashboard = useCallback(
    (budget, analysis) =>
      dispatch({ type: 'gate_unlocked', budget, analysis, fingerprint: fingerprintOf(state.profile, budget) }),
    [state.profile],
  );

  const storePlan = useCallback((fingerprint, data) => dispatch({ type: 'plan_loaded', fingerprint, data }), []);

  const value = useMemo(
    () => ({ state, stage: resolveStage(state), ...actions, unlockDashboard, storePlan }),
    [state, actions, unlockDashboard, storePlan],
  );

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney() {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error('useJourney must be used inside <JourneyProvider>');
  return ctx;
}
