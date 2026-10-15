import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncEngine } from '../src/services/sync/syncEngine.js';
import { createMemoryStore } from '../src/services/sync/localStore.js';

const USER = 'u1';
const row = (id, updatedAt, over = {}) => ({ id, updatedAt, deletedAt: null, amount: 1, ...over });

/** A server that behaves like Supabase + keep_newest_client_write: LWW by updatedAt, syncedAt clock. */
function fakeRemote() {
  const rows = new Map();
  let clock = 1_000;
  const remote = {
    rows,
    fail: null,
    upsert: vi.fn(async (list) => {
      if (remote.fail) throw remote.fail;
      for (const r of list) {
        const stored = rows.get(r.id);
        if (!stored || r.updatedAt >= stored.updatedAt) rows.set(r.id, { ...r, syncedAt: ++clock });
      }
    }),
    list: vi.fn(async (since) => {
      if (remote.fail) throw remote.fail;
      return [...rows.values()].filter((r) => r.syncedAt > since);
    }),
    /** An edit made on another device. */
    serverEdit(r) {
      rows.set(r.id, { ...r, syncedAt: ++clock });
    },
  };
  return remote;
}

function setup({ online = true, store = createMemoryStore(), remote = fakeRemote() } = {}) {
  const net = { online };
  const engine = createSyncEngine({ entity: 'transactions', userId: USER, store, remote, isOnline: () => net.online, pullOverlapMs: 0 });
  return { engine, store, remote, net };
}

const ids = (engine) => engine.getSnapshot().rows.map((r) => r.id).sort();

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe('syncEngine', () => {
  it('queues a mutation durably and sends it after the debounce', async () => {
    const { engine, store, remote } = setup();
    await engine.start();
    await engine.mutate(row('a', 10));

    expect(engine.getSnapshot()).toMatchObject({ pending: 1, status: 'pending' });
    expect(await store.loadOutbox(USER)).toHaveLength(1);
    expect(await store.loadRows('transactions', USER)).toHaveLength(1);

    await vi.runOnlyPendingTimersAsync();
    expect(remote.upsert).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot()).toMatchObject({ pending: 0, status: 'synced' });
    expect(await store.loadOutbox(USER)).toEqual([]);
  });

  it('collapses repeated edits of one row into a single queued entry', async () => {
    const { engine, remote, net } = setup({ online: false });
    await engine.start();
    await engine.mutate(row('a', 10, { amount: 1 }));
    await engine.mutate(row('a', 11, { amount: 2 }));
    await engine.mutate(row('b', 12));
    expect(engine.getSnapshot()).toMatchObject({ pending: 2, status: 'offline' });

    net.online = true;
    await engine.sync();
    expect(remote.upsert).toHaveBeenCalledTimes(1);
    expect(remote.upsert.mock.calls[0][0].map((r) => [r.id, r.amount])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
    expect(engine.getSnapshot().pending).toBe(0);
  });

  it('replays the outbox left by a previous session on start', async () => {
    const store = createMemoryStore();
    const first = setup({ online: false, store });
    await first.engine.start();
    await first.engine.mutate(row('a', 10));
    first.engine.stop();

    const second = setup({ store, remote: first.remote });
    await second.engine.start();
    expect(first.remote.upsert).toHaveBeenCalledTimes(1);
    expect(first.remote.rows.has('a')).toBe(true);
    expect(second.engine.getSnapshot()).toMatchObject({ pending: 0, status: 'synced' });
  });

  it('keeps the queue and backs off when the server fails, then recovers', async () => {
    const { engine, remote } = setup();
    await engine.start();
    remote.fail = new Error('500');
    await engine.mutate(row('a', 10));
    await vi.advanceTimersByTimeAsync(600);
    expect(engine.getSnapshot()).toMatchObject({ pending: 1, status: 'error' });

    remote.fail = null;
    await vi.advanceTimersByTimeAsync(4_000); // first backoff step
    expect(engine.getSnapshot()).toMatchObject({ pending: 0, status: 'synced' });
    expect(remote.rows.has('a')).toBe(true);
  });

  it('replaying the same entry twice is idempotent', async () => {
    const { engine, remote } = setup();
    await engine.start();
    await engine.mutate(row('a', 10));
    const sent = row('a', 10);
    await remote.upsert([sent]);
    await engine.sync();
    expect(remote.rows.size).toBe(1);
    expect(remote.rows.get('a').updatedAt).toBe(10);
  });

  it('keeps an edit made while its older version was in flight', async () => {
    const { engine, remote } = setup();
    await engine.start();
    let release;
    remote.upsert.mockImplementationOnce(
      (list) =>
        new Promise((resolve) => {
          release = () => {
            for (const r of list) remote.rows.set(r.id, { ...r, syncedAt: 5000 });
            resolve();
          };
        }),
    );
    await engine.mutate(row('a', 10, { amount: 1 }));
    const inFlight = engine.sync();
    await vi.advanceTimersByTimeAsync(0);
    await engine.mutate(row('a', 11, { amount: 2 }));
    release();
    await inFlight;
    expect(engine.getSnapshot().pending).toBe(1);
    await engine.sync();
    expect(remote.rows.get('a').amount).toBe(2);
    expect(engine.getSnapshot().pending).toBe(0);
  });

  it('pulls rows changed on other devices, newest edit wins, and drops a superseded queued edit', async () => {
    const { engine, remote, store, net } = setup();
    remote.serverEdit(row('x', 5));
    await engine.start();
    expect(ids(engine)).toEqual(['x']);

    net.online = false;
    await engine.mutate(row('x', 6, { amount: 7 })); // our offline edit…
    remote.serverEdit(row('x', 9, { amount: 99 })); // …and a later edit elsewhere
    net.online = true;
    await engine.sync();

    expect(engine.getSnapshot().rows[0].amount).toBe(99);
    expect(remote.rows.get('x').amount).toBe(99); // our older replay lost on the server too
    expect(await store.loadOutbox(USER)).toEqual([]);
  });

  it('pulls incrementally from the last seen server time', async () => {
    const { engine, remote } = setup();
    remote.serverEdit(row('a', 1));
    await engine.start();
    remote.serverEdit(row('b', 2));
    await engine.sync();
    const [, secondSince] = remote.list.mock.calls.map((c) => c[0]);
    expect(secondSince).toBeGreaterThan(0);
    expect(ids(engine)).toEqual(['a', 'b']);
  });

  it('lets a tombstone from another device remove the row', async () => {
    const { engine, remote } = setup();
    remote.serverEdit(row('a', 1));
    await engine.start();
    remote.serverEdit(row('a', 2, { deletedAt: 2 }));
    await engine.sync();
    expect(engine.getSnapshot().rows[0].deletedAt).toBe(2);
  });

  it('device-only mode stores rows without an outbox', async () => {
    const store = createMemoryStore();
    const engine = createSyncEngine({ entity: 'transactions', userId: USER, store, remote: null });
    await engine.start();
    await engine.mutate(row('a', 1));
    expect(engine.getSnapshot()).toMatchObject({ status: 'local', pending: 0 });
    expect(await store.loadRows('transactions', USER)).toHaveLength(1);
    expect(await store.loadOutbox(USER)).toEqual([]);
  });

  it('keeps users apart in one store', async () => {
    const store = createMemoryStore();
    await store.putRows('transactions', 'u1', [row('a', 1)]);
    await store.putRows('transactions', 'u2', [row('b', 1)]);
    expect((await store.loadRows('transactions', 'u2')).map((r) => r.id)).toEqual(['b']);
  });
});

describe('mutateMany', () => {
  it('queues a whole import in one store write and one upsert', async () => {
    const { engine, store, remote } = setup();
    await engine.start();
    await engine.mutateMany([row('a', 1), row('b', 1), row('c', 1)]);
    expect(engine.getSnapshot().pending).toBe(3);
    expect(await store.loadOutbox(USER)).toHaveLength(3);
    await vi.runOnlyPendingTimersAsync();
    expect(remote.upsert).toHaveBeenCalledTimes(1);
    expect(remote.upsert.mock.calls[0][0]).toHaveLength(3);
  });
});
