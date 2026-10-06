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

/**
 * Generate cycle key from start and end dates
 */
export function getCycleLockKey(startDate: string, endDate: string): string {
  return `cycle_${startDate}_${endDate}`;
}

/**
 * Lock a match week cycle after exporting to LINE Group, and automatically advance date by 7 days
 * "ถ้าข้อมูลมีการ Export ส่ง Line Group เมื่อไหร่ หน้าลงทะเบียนฝั่ง User ให้ล็อคข้อมูลไม่ให้ลงทะเบียนทันทีในทุกๆแมตช์ของสัปดาห์นั้น และเลื่อนข้อมูลแมตช์ 1 สัปดาห์ถัดไปให้อัตโนมัติ"
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
    autoAdvanceDays = 7,
  } = params;

  const key = getCycleLockKey(startDate, endDate);
  const lockItem: LineExportLock = {
    id: key,
    cycleRange,
    startDate,
    endDate,
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

  // Automatically advance match date schedule by 7 days (+1 week)
  if (autoAdvanceDays > 0) {
    advanceSimulatedDate(autoAdvanceDays);
  }

  return lockItem;
}

/**
 * Check if a specific cycle (start/end date) is locked by LINE Export
 */
export function isCycleLockedByLineExport(startDate: string, endDate: string): boolean {
  const key = getCycleLockKey(startDate, endDate);
  const item = memoryLocks[key];
  if (item && item.locked) return true;

  // Also check if any lock overlaps with this date range
  return Object.values(memoryLocks).some(lock => {
    if (!lock.locked) return false;
    return lock.startDate === startDate || (lock.startDate <= startDate && lock.endDate >= endDate);
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
  const key = getCycleLockKey(startDate, endDate);
  const updated = { ...memoryLocks };
  if (updated[key]) {
    updated[key] = { ...updated[key], locked: false };
    persistLocks(updated);
  }
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
