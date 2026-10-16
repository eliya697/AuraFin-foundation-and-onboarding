import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TransactionsProvider, useTransactionsSync } from '../src/state/TransactionsContext.jsx';
import { createMemoryStore } from '../src/services/sync/localStore.js';
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

function SyncProbe() {
  const { status, pending } = useTransactionsSync();
  return <output data-testid="sync">{`${status}:${pending}`}</output>;
}

const renderPanel = (backend, store = createMemoryStore()) =>
  render(
    <TransactionsProvider userId="u1" backend={backend} store={store}>
      <TransactionsPanel budget={budget} profile={profile} />
      <SyncProbe />
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
    await waitFor(() => expect(backend.upsertTransactions).toHaveBeenCalledTimes(1), { timeout: 3000 });
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
    await waitFor(() => expect(backend.stored[0].deletedAt).toEqual(expect.any(Number)), { timeout: 3000 });
  });

  it('keeps a change on the device and queues it when the backend refuses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = fakeBackend([existing]);
    renderPanel(backend);
    fireEvent.click(await screen.findByText('פיצה'));
    backend.upsertTransactions.mockRejectedValue(new Error('500'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('בית עסק / תיאור'), { target: { value: 'סושי' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'שמירה' }));

    expect(await screen.findByText('סושי')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('error:1'), { timeout: 3000 });
    expect(warn).toHaveBeenCalled();
  });

  it('shows saved transactions from the device store before the cloud answers', async () => {
    const store = createMemoryStore();
    await store.putRows('transactions', 'u1', [{ ...existing, merchant: 'מהמכשיר' }]);
    const backend = fakeBackend();
    backend.listTransactions.mockImplementation(() => new Promise(() => {})); // never answers
    renderPanel(backend, store);
    expect(await screen.findByText('מהמכשיר')).toBeTruthy();
  });
});

describe('CSV import', () => {
  const CSV = ['תאריך עסקה,שם בית העסק,סכום חיוב', '01/10/2026,סופר יודה,"1,200.00"', '02/10/2026,פיצה,42.5', 'xx,שבור,10'].join('\n');

  it('maps, previews (skipping bad rows and earlier imports) and queues the rest', async () => {
    const backend = fakeBackend();
    renderPanel(backend);
    await screen.findByText(/עוד אין תנועות/);

    const importOnce = async () => {
      fireEvent.click(screen.getByRole('button', { name: /ייבוא דף חשבון/ }));
      const dialog = await screen.findByRole('dialog');
      const file = new File([CSV], 'max.csv', { type: 'text/csv' });
      fireEvent.change(within(dialog).getByLabelText('קובץ דף חשבון'), { target: { files: [file] } });
      fireEvent.click(await within(dialog).findByRole('button', { name: 'המשך לתצוגה מקדימה' }));
      return dialog;
    };

    let dialog = await importOnce();
    expect(await within(dialog).findByText('2 ייובאו')).toBeTruthy();
    expect(within(dialog).getByText('1 שורות לא תקינות')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ייבוא 2 תנועות' }));
    expect(await within(dialog).findByText('יובאו 2 תנועות')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'סיום' }));

    expect(await screen.findByText('סופר יודה')).toBeTruthy();
    await waitFor(() => expect(backend.stored).toHaveLength(2), { timeout: 3000 });
    expect(backend.stored[0]).toMatchObject({ source: 'csv', importHash: expect.any(String) });

    // The same file again: everything is already there.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await importOnce();
    expect(await within(dialog).findByText('0 ייובאו')).toBeTruthy();
    expect(within(dialog).getByText('2 כבר קיימות')).toBeTruthy();
  });

  it('auto-categorizes rows and hands a budget built from the import to the gate', async () => {
    const backend = fakeBackend();
    const onApplyBudget = vi.fn();
    render(
      <TransactionsProvider userId="u1" backend={backend} store={createMemoryStore()}>
        <TransactionsPanel budget={budget} profile={profile} onApplyBudget={onApplyBudget} />
      </TransactionsProvider>,
    );
    await screen.findByText(/עוד אין תנועות/);
    fireEvent.click(screen.getByRole('button', { name: /ייבוא דף חשבון/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('קובץ דף חשבון'), { target: { files: [new File([CSV], 'max.csv', { type: 'text/csv' })] } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'המשך לתצוגה מקדימה' }));

    expect(await within(dialog).findByText(/2 סווגו אוטומטית/)).toBeTruthy();
    expect(within(dialog).getByLabelText('סעיף בתקציב לשורה 2').value).toBe('shopping'); // סופר יודה
    expect(within(dialog).getByLabelText('סעיף בתקציב לשורה 3').value).toBe('dining'); // פיצה

    // Fix the broken row (line 4: "xx" date) and import it too.
    fireEvent.click(within(dialog).getByRole('button', { name: 'תיקון שורה 4' }));
    fireEvent.change(within(dialog).getByLabelText('תאריך'), { target: { value: '2026-10-03' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'שמירת התיקון' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'ייבוא 3 תנועות' }));

    expect(await within(dialog).findByText('תקציב חכם לפי ההוצאות בפועל')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /עדכון התקציב/ }));
    expect(onApplyBudget).toHaveBeenCalledTimes(1);
    expect(onApplyBudget.mock.calls[0][0]).toMatchObject({ shopping: '1200', dining: '40' });
  });
});
