import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { repository } from '../services/repository.js';
import { buildSampleTransactions } from '../lib/sampleData.js';

const AppStateContext = createContext(null);

const initialState = {
  status: 'booting', // booting | onboarding | ready | error
  mode: repository.mode,
  userId: null,
  profile: null,
  transactions: [],
  error: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'booted':
      return {
        ...state,
        userId: action.userId,
        profile: action.profile,
        transactions: action.transactions,
        status: action.profile?.onboarding_completed_at ? 'ready' : 'onboarding',
        error: null,
      };
    case 'onboarded':
      return { ...state, profile: action.profile, transactions: action.transactions, status: 'ready', error: null };
    case 'transactions_added':
      return {
        ...state,
        transactions: [...action.transactions, ...state.transactions].sort(
          (a, b) => new Date(b.occurred_at) - new Date(a.occurred_at),
        ),
      };
    case 'sample_cleared':
      return { ...state, transactions: state.transactions.filter((tx) => !tx.flags?.includes('sample')) };
    case 'reset':
      return { ...state, profile: null, transactions: [], status: 'onboarding', error: null };
    case 'failed':
      return { ...state, status: state.status === 'booting' ? 'error' : state.status, error: action.error };
    case 'error_cleared':
      return { ...state, error: null };
    default:
      return state;
  }
}

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId = await repository.ensureUser();
        const profile = await repository.loadProfile(userId);
        const transactions = profile ? await repository.listTransactions(userId) : [];
        if (!cancelled) dispatch({ type: 'booted', userId, profile, transactions });
      } catch (error) {
        if (!cancelled) dispatch({ type: 'failed', error: error.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeOnboarding = useCallback(
    async (draft) => {
      const profile = await repository.saveProfile(state.userId, {
        ...draft,
        currency: 'ILS',
        onboarding_completed_at: new Date().toISOString(),
      });
      const existing = await repository.listTransactions(state.userId);
      const transactions = existing.length
        ? existing
        : await repository.addTransactions(state.userId, buildSampleTransactions(profile));
      dispatch({ type: 'onboarded', profile, transactions });
    },
    [state.userId],
  );

  const addTransaction = useCallback(
    async (transaction) => {
      try {
        const created = await repository.addTransactions(state.userId, [transaction]);
        dispatch({ type: 'transactions_added', transactions: created });
        return created[0];
      } catch (error) {
        dispatch({ type: 'failed', error: error.message });
        throw error;
      }
    },
    [state.userId],
  );

  const clearSampleData = useCallback(async () => {
    try {
      await repository.deleteSampleTransactions(state.userId);
      dispatch({ type: 'sample_cleared' });
    } catch (error) {
      dispatch({ type: 'failed', error: error.message });
    }
  }, [state.userId]);

  const resetProfile = useCallback(async () => {
    try {
      await repository.resetAll(state.userId);
      dispatch({ type: 'reset' });
    } catch (error) {
      dispatch({ type: 'failed', error: error.message });
    }
  }, [state.userId]);

  const saveInsight = useCallback(
    async (insight) => {
      try {
        await repository.saveInsight(state.userId, insight);
      } catch (error) {
        dispatch({ type: 'failed', error: error.message });
      }
    },
    [state.userId],
  );

  const getAccessToken = useCallback(() => repository.getAccessToken(), []);
  const clearError = useCallback(() => dispatch({ type: 'error_cleared' }), []);

  const value = useMemo(
    () => ({
      ...state,
      completeOnboarding,
      addTransaction,
      clearSampleData,
      resetProfile,
      saveInsight,
      getAccessToken,
      clearError,
    }),
    [state, completeOnboarding, addTransaction, clearSampleData, resetProfile, saveInsight, getAccessToken, clearError],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>');
  return ctx;
}
