import { describe, expect, it } from 'vitest';
import { badgeText, combineSyncStatus } from '../src/components/SyncBadge.jsx';

describe('combineSyncStatus', () => {
  it('shows the most important of the journey and outbox statuses', () => {
    expect(combineSyncStatus('synced', 'offline')).toBe('offline');
    expect(combineSyncStatus('error', 'offline')).toBe('error');
    expect(combineSyncStatus('synced', 'pending')).toBe('pending');
    expect(combineSyncStatus('synced', 'local')).toBe('synced');
    expect(combineSyncStatus('local', 'local')).toBe('synced');
  });
});

describe('badgeText', () => {
  it('adds the pending count when changes are stuck on the device', () => {
    expect(badgeText('offline', 3)).toBe('לא מקוון · 3 ממתינים');
    expect(badgeText('offline', 1)).toBe('לא מקוון · שינוי אחד ממתין');
    expect(badgeText('error', 2)).toBe('השמירה נכשלה · נסו שוב · 2 ממתינים');
    expect(badgeText('offline', 0)).toBe('לא מקוון · נשמר במכשיר');
    expect(badgeText('saving', 4)).toBe('שומר…');
  });
});

describe('combineSyncStatus with goals', () => {
  it('takes any number of sources', () => {
    expect(combineSyncStatus('synced', 'synced', 'error')).toBe('error');
    expect(combineSyncStatus('synced', 'local', 'pending')).toBe('pending');
  });
});
