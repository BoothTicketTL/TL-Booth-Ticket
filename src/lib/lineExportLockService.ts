import { getSimulatedDate, advanceSimulatedDate } from './firebase';

export interface LineExportLock {
  id: string; // e.g. "cycle_2026-10-09_2026-10-15"
  cycleRange: string; // e.g. "9-15 ต.ค. 2569"
  startDate: string; // "2026-10-09"
  endDate: string; // "2026-10-15"
  exportedAt: string; // ISO string
  exportedBy: string; // User or Admin name/email
  lineGroupName: string;
  locked: boolean;
}

const LOCAL_LOCKS_KEY = 'thaileague_line_export_locks_v1';

let memoryLocks: Record<string, LineExportLock> = loadStoredLocks();
const lockListeners: Set<(locks: Record<string, LineExportLock>) => void> = new Set();

function loadStoredLocks(): Record<string, LineExportLock> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_LOCKS_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading Line export locks from localStorage:', e);
  }
  return {};
}

function persistLocks(map: Record<string, LineExportLock>): void {
  memoryLocks = { ...map };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_LOCKS_KEY, JSON.stringify(map));
    }
  } catch (e) {
    console.error('Error saving Line export locks to localStorage:', e);
  }
  notifyListeners();
}

function notifyListeners(): void {
  lockListeners.forEach(cb => {
    try {
      cb({ ...memoryLocks });
    } catch (e) {
      console.error('Error in Line export lock listener:', e);
    }
  });
}

// Cross-tab sync support
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LOCAL_LOCKS_KEY) {
      memoryLocks = loadStoredLocks();
      notifyListeners();
    }
  });
}

/**
 * Compute Friday-to-Thursday week bounds for any reference date
 */
export function getFridayToThursdayBounds(dateStr: string): { friday: string; thursday: string } {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { friday: dateStr, thursday: dateStr };
    const day = d.getDay(); // 0: Sun, 1: Mon, ... 5: Fri, 6: Sat
    const diffToFriday = (day >= 5) ? (day - 5) : (day + 2);
    const fri = new Date(d);
    fri.setDate(d.getDate() - diffToFriday);
    const thu = new Date(fri);
    thu.setDate(fri.getDate() + 6);
    return {
      friday: fri.toISOString().slice(0, 10),
      thursday: thu.toISOString().slice(0, 10)
    };
  } catch {
    return { friday: dateStr, thursday: dateStr };
  }
}

/**
 * Generate cycle key from start and end dates
 */
export function getCycleLockKey(startDate: string, endDate: string): string {
  return `cycle_${startDate}_${endDate}`;
}

/**
 * Lock a match week cycle after exporting to LINE Group
 * "ในหน้าลงทะเบียน หาก Admin กด Export ส่ง Line Group ของคำขอสัปดาห์นั้นแล้ว เราต้องการให้หน้าลงทะเบียนล็อคไม่ให้แก้ไขทุก League ในช่วงสัปดาห์นั้น แม้ League นั้นจะไม่มีคำขอลงทะเบียนก็ตาม"
 */
export function lockCycleAfterLineExport(params: {
  startDate: string;
  endDate: string;
  cycleRange: string;
  lineGroupName?: string;
  exportedBy?: string;
  autoAdvanceDays?: number;
}): LineExportLock {
  const {
    startDate,
    endDate,
    cycleRange,
    lineGroupName = 'LINE Group สรุปคำขอออกบูธและรับบัตร',
    exportedBy = 'Admin',
    autoAdvanceDays = 0,
  } = params;

  // Ensure effective lock period encompasses the full Friday-to-Thursday cycle
  const bounds = getFridayToThursdayBounds(startDate);
  const effectiveStart = bounds.friday < startDate ? bounds.friday : startDate;
  const effectiveEnd = bounds.thursday > endDate ? bounds.thursday : endDate;

  const key = getCycleLockKey(effectiveStart, effectiveEnd);
  const lockItem: LineExportLock = {
    id: key,
    cycleRange,
    startDate: effectiveStart,
    endDate: effectiveEnd,
    exportedAt: new Date().toISOString(),
    exportedBy,
    lineGroupName,
    locked: true,
  };

  const updated = {
    ...memoryLocks,
    [key]: lockItem,
  };
  persistLocks(updated);

  // If autoAdvanceDays is specifically requested
  if (autoAdvanceDays > 0) {
    advanceSimulatedDate(autoAdvanceDays);
  }

  return lockItem;
}

/**
 * Check if a specific cycle (start/end date) is locked by LINE Export
 * Matches any active lock that overlaps with the given [startDate, endDate] window
 */
export function isCycleLockedByLineExport(startDate: string, endDate: string): boolean {
  if (!startDate || !endDate) return false;
  return Object.values(memoryLocks).some(lock => {
    if (!lock.locked) return false;
    // Overlap condition: lock.startDate <= endDate AND lock.endDate >= startDate
    return lock.startDate <= endDate && lock.endDate >= startDate;
  });
}

/**
 * Check if an individual match date falls within any week locked by LINE Export
 */
export function isMatchDateLockedByLineExport(matchDate: string): boolean {
  if (!matchDate) return false;
  return Object.values(memoryLocks).some(lock => {
    if (!lock.locked) return false;
    return matchDate >= lock.startDate && matchDate <= lock.endDate;
  });
}

/**
 * Get lock info for a given date or cycle if locked
 */
export function getLockInfoForDate(matchDate: string): LineExportLock | undefined {
  if (!matchDate) return undefined;
  return Object.values(memoryLocks).find(lock => {
    if (!lock.locked) return false;
    return matchDate >= lock.startDate && matchDate <= lock.endDate;
  });
}

/**
 * Admin option to unlock a cycle if needed
 */
export function unlockCycle(startDate: string, endDate: string): void {
  const updated = { ...memoryLocks };
  Object.keys(updated).forEach(key => {
    const lock = updated[key];
    // Unlock any lock overlapping with [startDate, endDate]
    if (lock.startDate <= endDate && lock.endDate >= startDate) {
      updated[key] = { ...lock, locked: false };
    }
  });
  persistLocks(updated);
}

/**
 * Get all export locks
 */
export function getLineExportLocks(): Record<string, LineExportLock> {
  return { ...memoryLocks };
}

/**
 * Subscribe to changes in Line Export locks
 */
export function subscribeToLineExportLocks(callback: (locks: Record<string, LineExportLock>) => void): () => void {
  lockListeners.add(callback);
  callback({ ...memoryLocks });
  return () => {
    lockListeners.delete(callback);
  };
}
