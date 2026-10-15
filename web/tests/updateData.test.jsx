import { describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AppShell from '../src/app/AppShell.jsx';
import { AuthProvider } from '../src/state/AuthContext.jsx';
import { JourneyProvider } from '../src/state/JourneyContext.jsx';
import { TransactionsProvider } from '../src/state/TransactionsContext.jsx';
import { dashboardJourney } from './fixtures.js';

const USER = { id: 'user-1', email: 'user@example.com', role: 'user', suspended: false, emailConfirmed: true };

function fakeBackend() {
  return {
    kind: 'local',
    getUser: async () => USER,
    onAuthChange(cb) {
      setTimeout(() => cb('INITIAL_SESSION', USER), 0);
      return () => {};
    },
    getAccessToken: async () => null,
  };
}

function renderApp() {
  window.localStorage.setItem(`aurafin:v3:journey:${USER.id}`, JSON.stringify({ state: dashboardJourney(), dirty: false }));
  const backend = fakeBackend();
  return render(
    <AuthProvider backendLoader={async () => backend}>
      {/* No cloud backend: exercises local persistence only. */}
      <JourneyProvider userId={USER.id} backend={null}>
        <TransactionsProvider userId={USER.id} backend={null}>
          <AppShell />
        </TransactionsProvider>
      </JourneyProvider>
    </AuthProvider>,
  );
}

describe('"עדכון נתונים" (update data) from the dashboard', { timeout: 30000 }, () => {
  test('opens the gate with the saved values instead of crashing to a white screen', async () => {
    // Server unreachable: the dashboard stays in locally verified mode.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'מסלול סטודנט חכם' }, { timeout: 15000 })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'עדכון נתונים' })[0]);
    });

    expect(await screen.findByText(/עריכת נתונים/, {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText('משהו השתבש בתצוגה הזו')).toBeNull();
    expect(screen.getByDisplayValue('7000')).toBeTruthy();
    const crashes = errors.mock.calls.filter(([message]) => String(message).includes('crashed'));
    expect(crashes).toEqual([]);

    // Cancel returns to the dashboard with the data intact.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ביטול העריכה וחזרה לדשבורד' }));
    });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'מסלול סטודנט חכם' })).toBeTruthy(), { timeout: 4000 });
  });

  test('edits persist to this device', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'מסלול סטודנט חכם' }, { timeout: 15000 });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'עדכון נתונים' })[0]);
    });
    const income = await screen.findByDisplayValue('7000', {}, { timeout: 4000 });
    await act(async () => {
      fireEvent.change(income, { target: { value: '8500' } });
    });
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(`aurafin:v3:journey:${USER.id}`));
      expect(saved.state.budget.income).toBe('8500');
    });
  });
});
