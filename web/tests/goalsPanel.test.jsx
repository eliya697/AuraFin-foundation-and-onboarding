import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TransactionsProvider } from '../src/state/TransactionsContext.jsx';
import { GoalsProvider } from '../src/state/GoalsContext.jsx';
import { createMemoryStore } from '../src/services/sync/localStore.js';
import GoalsPanel from '../src/features/goals/GoalsPanel.jsx';

const profile = { lifeStage: 'employee', goal: 'house', hasChildren: false, childrenCount: 0, trackId: 'first_home' };
// Planned remainder: 10000 − (3000 + 1000 + 1000) = 5000 a month (no transaction history).
const budget = { income: '10000', rent: '3000', electricity: '0', water: '0', municipal: '0', entertainment: '0', dining: '1000', shopping: '0', unexpected: '1000', custom: [] };

function renderPanel(store = createMemoryStore()) {
  render(
    <TransactionsProvider userId="u1" backend={null} store={createMemoryStore()}>
      <GoalsProvider userId="u1" backend={null} store={store}>
        <GoalsPanel budget={budget} profile={profile} />
      </GoalsProvider>
    </TransactionsProvider>,
  );
  return store;
}

describe('GoalsPanel', () => {
  it('creates a goal, shows progress and a projection from the planned savings', async () => {
    const store = renderPanel();
    expect(await screen.findByText(/עוד אין יעדים/)).toBeTruthy();
    expect(screen.getByText(/לפי התקציב שתכננתם/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /יעד חדש/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('שם היעד'), { target: { value: 'קרן חירום' } });
    fireEvent.change(within(dialog).getByLabelText('סכום היעד'), { target: { value: '20000' } });
    fireEvent.change(within(dialog).getByLabelText('כמה כבר חסכתם'), { target: { value: '5000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'שמירה' }));

    const bar = await screen.findByRole('progressbar', { name: 'התקדמות: קרן חירום' });
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    // 15000 left at 5000/month → 3 months.
    expect(screen.getByText(/בקצב הנוכחי: יושג ב.*בעוד 3 חודשים/)).toBeTruthy();
    await waitFor(async () => expect(await store.loadRows('goals', 'u1')).toHaveLength(1));
  });

  it('adds a deposit to the saved amount and marks a reached goal', async () => {
    const store = createMemoryStore();
    await store.putRows('goals', 'u1', [{ id: 'g1', name: 'טיול', target: 1000, saved: 900, deadline: null, updatedAt: 1, deletedAt: null }]);
    renderPanel(store);
    fireEvent.click(await screen.findByRole('button', { name: /טיול/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('הפקדה חדשה'), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    expect(await screen.findByText('היעד הושג!')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  it('validates the form', async () => {
    renderPanel();
    await screen.findByText(/עוד אין יעדים/);
    fireEvent.click(screen.getByRole('button', { name: /יעד חדש/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    expect(await within(dialog).findByText('כמה צריך לחסוך?')).toBeTruthy();
  });
});
