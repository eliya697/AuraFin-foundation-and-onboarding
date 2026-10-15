import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { buildSnapshot } from '../lib/budget.js';
import { ApiError, OfflineError, hasBackend, validateGate } from '../services/api.js';
import { chooseJourney, fingerprintOf, journeyReducer, normalizeJourney, resolveStage } from './journeyModel.js';

export { fingerprintOf, resolveStage } from './journeyModel.js';

const LEGACY_KEY = 'aurafin:v2:journey';
const storageKey = (userId) => `aurafin:v3:journey:${userId}`;

const LOCAL_SAVE_DEBOUNCE_MS = 300;
const PUSH_DEBOUNCE_MS = 1200;
const RETRY_MIN_MS = 4_000;
const RETRY_MAX_MS = 60_000;

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

function readJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable/full: the cloud copy (when available) still has the data.
  }
}

/** This device's copy for `userId`, adopting the pre-auth (v2) journey once if there is one. */
function loadLocal(userId) {
  const saved = readJSON(storageKey(userId));
  if (saved?.state) return { state: normalizeJourney(saved.state), dirty: Boolean(saved.dirty) };

  const legacy = readJSON(LEGACY_KEY);
  if (legacy) {
    try {
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      // ignore
    }
    // updatedAt = 1: uploaded if the cloud is empty, but any real cloud copy wins.
    return { state: { ...normalizeJourney(legacy), updatedAt: 1 }, dirty: true };
  }
  return { state: normalizeJourney(null), dirty: false };
}

const JourneyContext = createContext(null);
const SyncContext = createContext({ status: 'local', lastSyncedAt: null, retry: () => {} });

/**
 * Journey state for one signed-in user. Mount with key={userId} so switching accounts starts fresh.
 *
 * Persistence: every change is written to localStorage (debounced, flushed when the app is hidden)
 * and pushed to the cloud (debounced). On start the cloud copy is fetched; the newer of the two
 * (by `updatedAt`) wins. Nothing is pushed before that first fetch succeeds, so an outdated device
 * can never overwrite newer cloud data.
 */
export function JourneyProvider({ userId, backend = null, children }) {
  const [boot] = useState(() => loadLocal(userId));
  const [state, rawDispatch] = useReducer(journeyReducer, boot.state);
  const stage = useMemo(() => resolveStage(state), [state]);
  const sync = useJourneySync({ userId, backend, state, dispatch: rawDispatch, initiallyDirty: boot.dirty });

  useBackgroundVerification(state, stage, rawDispatch);

  const actions = useMemo(() => {
    const dispatch = (action) => rawDispatch({ ...action, at: Date.now() });
    return {
      completeWelcome: () => dispatch({ type: 'welcome_done' }),
      completeQuiz: (profile) => dispatch({ type: 'quiz_done', profile }),
      reopenQuiz: () => dispatch({ type: 'quiz_reopen' }),
      updateBudget: (budget) => dispatch({ type: 'budget_changed', budget }),
      startEdit: (kind = 'budget') => dispatch({ type: 'edit_start', kind }),
      reopenGate: () => dispatch({ type: 'edit_start', kind: 'budget' }),
      cancelEdit: () => dispatch({ type: 'edit_cancel' }),
      restart: () => dispatch({ type: 'restart' }),
      storePlan: (fingerprint, data) => dispatch({ type: 'plan_loaded', fingerprint, data }),
    };
  }, []);

  const profile = state.profile;
  const unlockDashboard = useCallback(
    (budget, analysis, mode = 'server') =>
      rawDispatch({ type: 'gate_unlocked', budget, analysis, mode, fingerprint: fingerprintOf(profile, budget), at: Date.now() }),
    [profile],
  );

  const value = useMemo(() => ({ state, stage, ...actions, unlockDashboard }), [state, stage, actions, unlockDashboard]);

  return (
    <JourneyContext.Provider value={value}>
      <SyncContext.Provider value={sync}>{children}</SyncContext.Provider>
    </JourneyContext.Provider>
  );
}

function useJourneySync({ userId, backend, state, dispatch, initiallyDirty }) {
  const [status, setStatus] = useState(backend ? 'loading' : 'local');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const stateRef = useRef(state);
  // updatedAt of the copy known to be in the cloud; -1 = unknown/never.
  const syncedAtRef = useRef(initiallyDirty ? -1 : state.updatedAt);
  const readyRef = useRef(!backend); // first cloud fetch done
  const inFlightRef = useRef(false);
  const loadingRef = useRef(false);
  const timers = useRef({ save: 0, push: 0, load: 0 });
  const retryRef = useRef(RETRY_MIN_MS);
  const pushRef = useRef(() => {});
  const loadRef = useRef(() => {});

  const writeLocal = useCallback(() => {
    clearTimeout(timers.current.save);
    const current = stateRef.current;
    writeJSON(storageKey(userId), { state: current, dirty: current.updatedAt !== syncedAtRef.current });
  }, [userId]);

  const backoff = () => {
    const delay = retryRef.current;
    retryRef.current = Math.min(delay * 2, RETRY_MAX_MS);
    return delay;
  };

  pushRef.current = async () => {
    clearTimeout(timers.current.push);
    const snapshot = stateRef.current;
    if (!backend || !readyRef.current || inFlightRef.current) return;
    if (snapshot.updatedAt === syncedAtRef.current) {
      setStatus('synced');
      return;
    }
    if (!isOnline()) {
      setStatus('offline');
      return; // the 'online' listener resumes
    }
    inFlightRef.current = true;
    setStatus('saving');
    try {
      await backend.saveJourney(userId, { state: snapshot, stage: resolveStage(snapshot), updatedAt: snapshot.updatedAt });
      syncedAtRef.current = snapshot.updatedAt;
      retryRef.current = RETRY_MIN_MS;
      setLastSyncedAt(Date.now());
      writeLocal();
      if (stateRef.current.updatedAt !== snapshot.updatedAt) {
        timers.current.push = setTimeout(() => pushRef.current(), PUSH_DEBOUNCE_MS);
        setStatus('pending');
      } else {
        setStatus('synced');
      }
    } catch (error) {
      console.warn('[AuraFin] Cloud save failed:', error?.message ?? error);
      if (!isOnline()) {
        setStatus('offline');
      } else {
        setStatus('error');
        timers.current.push = setTimeout(() => pushRef.current(), backoff());
      }
    } finally {
      inFlightRef.current = false;
    }
  };

  loadRef.current = async () => {
    clearTimeout(timers.current.load);
    if (!backend || readyRef.current || loadingRef.current) return;
    if (!isOnline()) {
      setStatus('offline');
      return;
    }
    loadingRef.current = true;
    setStatus('loading');
    try {
      const remote = await backend.loadJourney(userId);
      readyRef.current = true;
      retryRef.current = RETRY_MIN_MS;
      const decision = chooseJourney(stateRef.current, remote);
      if (decision === 'use-remote') {
        syncedAtRef.current = remote.updatedAt;
        dispatch({ type: 'hydrate', state: { ...(remote.state ?? {}), updatedAt: remote.updatedAt } });
        setLastSyncedAt(Date.now());
        setStatus('synced');
      } else if (decision === 'push-local' || stateRef.current.updatedAt !== syncedAtRef.current) {
        if (decision === 'push-local') syncedAtRef.current = remote?.updatedAt ?? -1;
        pushRef.current();
      } else {
        syncedAtRef.current = stateRef.current.updatedAt;
        setLastSyncedAt(Date.now());
        setStatus('synced');
      }
    } catch (error) {
      console.warn('[AuraFin] Cloud load failed:', error?.message ?? error);
      setStatus(isOnline() ? 'error' : 'offline');
      if (isOnline()) timers.current.load = setTimeout(() => loadRef.current(), backoff());
    } finally {
      loadingRef.current = false;
    }
  };

  // Every change: remember it locally (debounced) and schedule a cloud push.
  useEffect(() => {
    stateRef.current = state;
    clearTimeout(timers.current.save);
    timers.current.save = setTimeout(writeLocal, LOCAL_SAVE_DEBOUNCE_MS);
    if (!backend || !readyRef.current || state.updatedAt === syncedAtRef.current) return;
    setStatus((prev) => (prev === 'saving' ? prev : 'pending'));
    clearTimeout(timers.current.push);
    timers.current.push = setTimeout(() => pushRef.current(), PUSH_DEBOUNCE_MS);
  }, [state, backend, writeLocal]);

  // First cloud fetch, plus resume on reconnect and flush when the app goes to the background.
  useEffect(() => {
    const pending = timers.current;
    loadRef.current();
    const resume = () => (readyRef.current ? pushRef.current() : loadRef.current());
    const onOffline = () => setStatus('offline');
    const flush = () => {
      writeLocal();
      if (readyRef.current) pushRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('online', resume);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      writeLocal();
      clearTimeout(pending.push);
      clearTimeout(pending.load);
    };
  }, [backend, writeLocal]);

  const retry = useCallback(() => {
    retryRef.current = RETRY_MIN_MS;
    if (readyRef.current) pushRef.current();
    else loadRef.current();
  }, []);

  return useMemo(() => ({ status, lastSyncedAt, retry, cloud: Boolean(backend) }), [status, lastSyncedAt, retry, backend]);
}

/**
 * A snapshot unlocked locally (server asleep/unreachable) is re-checked against the server in the
 * background and upgraded to "verified" — so the badge settles instead of flipping on every visit.
 */
function useBackgroundVerification(state, stage, dispatch) {
  const unlock = state.unlock;
  const needsCheck = hasBackend && stage === 'dashboard' && unlock?.mode === 'offline';
  const fingerprint = unlock?.fingerprint;
  const snapshotRef = useRef(null);
  snapshotRef.current = needsCheck ? buildSnapshot(state.profile, state.budget) : null;

  useEffect(() => {
    if (!needsCheck) return undefined;
    const controller = new AbortController();
    let timer = 0;
    let delay = 15_000;
    const attempt = async () => {
      clearTimeout(timer);
      if (!isOnline() || !snapshotRef.current) return;
      try {
        const result = await validateGate(snapshotRef.current, controller.signal);
        dispatch({ type: 'gate_verified', fingerprint, analysis: result.analysis, at: Date.now() });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof OfflineError) {
          timer = setTimeout(attempt, delay);
          delay = Math.min(delay * 2, 5 * 60_000);
        } else if (error instanceof ApiError) {
          console.warn('[AuraFin] Server did not verify the locally unlocked snapshot:', error.message);
        }
      }
    };
    attempt();
    window.addEventListener('online', attempt);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener('online', attempt);
    };
  }, [needsCheck, fingerprint, dispatch]);
}

export function useJourney() {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error('useJourney must be used inside <JourneyProvider>');
  return ctx;
}

export function useSyncStatus() {
  return useContext(SyncContext);
}
