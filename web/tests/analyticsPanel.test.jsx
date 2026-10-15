import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TransactionsProvider } from '../src/state/TransactionsContext.jsx';
import { createMemoryStore } from '../src/services/sync/localStore.js';
import AnalyticsPanel from '../src/features/analytics/AnalyticsPanel.jsx';
import { currentMonth, shiftMonth } from '../src/lib/analytics.js';

const profile = { lifeStage: 'employee', goal: 'house', hasChildren: false, childrenCount: 0, trackId: 'first_home' };
const budget = { rent: '3000', dining: '500', custom: [] };
const now = currentMonth();
const last = shiftMonth(now, -1);
let n = 0;
const tx = (month, amount, budgetKey, kind = 'expense') => ({
  id: `t${(n += 1)}`,
  kind,
  amount,
  budgetKey,
  merchant: '',
  note: '',
  occurredOn: `${month}-05`,
  source: 'manual',
  importHash: null,
  updatedAt: 1,
  deletedAt: null,
});

async function renderPanel(rows) {
  const store = createMemoryStore();
  await store.putRows('transactions', 'u1', rows);
  render(
    <TransactionsProvider userId="u1" backend={null} store={store}>
      <AnalyticsPanel budget={budget} profile={profile} />
    </TransactionsProvider>,
  );
}

describe('AnalyticsPanel', () => {
  it('shows an empty state without transactions', async () => {
    await renderPanel([]);
    expect(await screen.findByText(/הוסיפו או ייבאו תנועות/)).toBeTruthy();
  });

  it('shows planned vs actual for the selected month and flags lines over plan', async () => {
    await renderPanel([tx(now, 3000, 'rent'), tx(now, 650, 'dining'), tx(now, 9000, 'income', 'income'), tx(last, 100, 'dining')]);
    const table = await screen.findByRole('table', { name: 'תכנון מול בפועל לפי סעיף' });
    const dining = within(table).getByRole('rowheader', { name: /אוכל בחוץ/ });
    expect(dining.textContent).toContain('מעל התכנון');
    expect(within(table).getByRole('rowheader', { name: /שכר דירה/ }).textContent).not.toContain('מעל התכנון');

    // An accessible table mirrors the trend chart.
    expect(screen.getByRole('table', { name: 'הכנסות והוצאות לפי חודש' })).toBeTruthy();

    // Switching month updates the breakdown.
    const months = screen.getByRole('radiogroup', { name: 'חודש' });
    fireEvent.click(within(months).getAllByRole('radio')[1]);
    const lastTable = await screen.findByRole('table', { name: 'תכנון מול בפועל לפי סעיף' });
    expect(within(lastTable).getByRole('rowheader', { name: /אוכל בחוץ/ }).textContent).not.toContain('מעל התכנון');
  });
});
