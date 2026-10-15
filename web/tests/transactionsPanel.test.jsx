import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TransactionsProvider } from '../src/state/TransactionsContext.jsx';
import TransactionsPanel from '../src/features/transactions/TransactionsPanel.jsx';

const profile = { lifeStage: 'employee', goal: 'house', hasChildren: false, childrenCount: 0, trackId: 'first_home' };
const budget = { custom: [] };

function fakeBackend(initial = []) {
  const stored = [...initial];
  return {
    stored,
    listTransactions: vi.fn(async () => stored.map((tx) => ({ ...tx }))),
    upsertTransactions: vi.fn(async (_userId, list) => {
      for (const tx of list) {
        const i = stored.findIndex((s) => s.id === tx.id);
        if (i >= 0) stored[i] = tx;
        else stored.push(tx);
      }
    }),
  };
}

const existing = {
  id: 't1',
  kind: 'expense',
  amount: 42.5,
  budgetKey: 'dining',
  merchant: 'פיצה',
  note: '',
  occurredOn: '2026-10-10',
  source: 'manual',
  importHash: null,
  updatedAt: 1,
  deletedAt: null,
};

const renderPanel = (backend) =>
  render(
    <TransactionsProvider userId="u1" backend={backend}>
      <TransactionsPanel budget={budget} profile={profile} />
    </TransactionsProvider>,
  );

describe('TransactionsPanel', () => {
  it('loads transactions from the backend', async () => {
    renderPanel(fakeBackend([existing]));
    expect(await screen.findByText('פיצה')).toBeTruthy();
    expect(screen.getByText(/42\.5/)).toBeTruthy();
  });

  it('adds a transaction with a client id and saves it', async () => {
    const backend = fakeBackend();
    renderPanel(backend);
    await screen.findByText(/עוד אין תנועות/);

    fireEvent.click(screen.getByRole('button', { name: /הוספה/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('סכום'), { target: { value: '18' } });
    fireEvent.change(within(dialog).getByLabelText('בית עסק / תיאור'), { target: { value: 'קפה' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'שמירה' }));

    expect(await screen.findByText('קפה')).toBeTruthy();
    expect(backend.upsertTransactions).toHaveBeenCalledTimes(1);
    const [, [saved]] = backend.upsertTransactions.mock.calls[0];
    expect(saved).toMatchObject({ amount: 18, merchant: 'קפה', kind: 'expense', budgetKey: 'other' });
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('blocks saving without an amount', async () => {
    const backend = fakeBackend();
    renderPanel(backend);
    await screen.findByText(/עוד אין תנועות/);
    fireEvent.click(screen.getByRole('button', { name: /הוספה/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    expect(await within(dialog).findByText('כמה זה עלה?')).toBeTruthy();
    expect(backend.upsertTransactions).not.toHaveBeenCalled();
  });

  it('deletes as a tombstone after a second confirmation click', async () => {
    const backend = fakeBackend([existing]);
    renderPanel(backend);
    fireEvent.click(await screen.findByText('פיצה'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /מחיקה/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /לחצו שוב למחיקה/ }));
    await waitFor(() => expect(screen.queryByText('פיצה')).toBeNull());
    expect(backend.stored[0].deletedAt).toEqual(expect.any(Number));
  });

  it('rolls back and shows the error when the backend refuses', async () => {
    const backend = fakeBackend([existing]);
    backend.upsertTransactions.mockRejectedValueOnce(new Error('השמירה נכשלה בבדיקה'));
    renderPanel(backend);
    fireEvent.click(await screen.findByText('פיצה'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('בית עסק / תיאור'), { target: { value: 'סושי' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    expect(await within(dialog).findByText('השמירה נכשלה בבדיקה')).toBeTruthy();
    expect(screen.queryByText('סושי')).toBeNull();
    expect(screen.getAllByText('פיצה').length).toBeGreaterThan(0);
  });
});
