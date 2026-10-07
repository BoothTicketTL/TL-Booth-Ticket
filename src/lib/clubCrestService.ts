import { LeagueType } from '../types';
import { 
  OFFICIAL_LEAGUE_1_CLUBS, 
  OFFICIAL_LEAGUE_2_CLUBS, 
  OFFICIAL_LEAGUE_3_CLUBS,
  OFFICIAL_CLUBS_BY_LEAGUE,
  getCanonicalOfficialClub
} from '../data/officialSeasonClubs';

export interface ClubCrestItem {
  league: LeagueType;
  clubName: string;
  dataUrl: string; // Base64 data URL
  fileName: string;
  updatedAt: string;
  fileSize?: number;
}

const DB_NAME = 'ThaiLeagueAssetsDB';
const DB_VERSION = 1;
const STORE_NAME = 'club_crests';
const LOCALSTORAGE_BACKUP_KEY = 'thaileague_club_crests_cache';

// In-memory cache for ultra-fast synchronous lookup in React components
const memoryCrestCache = new Map<string, ClubCrestItem>();
let isInitialized = false;
const listeners = new Set<(cache: Map<string, ClubCrestItem>) => void>();

function notifyListeners() {
  const snapshot = new Map(memoryCrestCache);
  listeners.forEach(cb => {
    try {
      cb(snapshot);
    } catch (e) {
      console.error('Error in club crest listener:', e);
    }
  });
}

/**
 * Open or create IndexedDB instance
 */
function openCrestDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

function getCrestId(league: LeagueType, clubName: string): string {
  const can = getCanonicalOfficialClub(clubName, league)?.name || clubName.trim();
  return `${league}_${can}`;
}

/**
 * Initialize and preload crests into memory cache
 */
export async function initClubCrestService(): Promise<void> {
  if (isInitialized) return;

  // 1. Try reading from IndexedDB
  try {
    const db = await openCrestDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const items = req.result as (ClubCrestItem & { id: string })[];
        if (Array.isArray(items)) {
          items.forEach(item => {
            const key = getCrestId(item.league, item.clubName);
            memoryCrestCache.set(key, item);
          });
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB unavailable or failed, checking localStorage fallback:', err);
    // Fallback to localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(LOCALSTORAGE_BACKUP_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: ClubCrestItem) => {
              const key = getCrestId(item.league, item.clubName);
              memoryCrestCache.set(key, item);
            });
          }
        }
      } catch (e) {
        console.warn('Failed to load crests from localStorage:', e);
      }
    }
  }

  isInitialized = true;
  notifyListeners();
}

// Automatically trigger initialization when in browser
if (typeof window !== 'undefined') {
  initClubCrestService().catch(e => console.warn('Crest service init deferred:', e));
}

function getLeagueFolderName(league?: LeagueType): string {
  if (league === 'League 1') return 'สโมสรไทยลีก 1';
  if (league === 'League 2') return 'สโมสรไทยลีก 2';
  if (league === 'League 3') return 'สโมสรไทยลีก 3';
  return '';
}

/**
 * Synchronous crest getter (instant UI rendering from memory cache)
 */
export function getClubCrest(clubName?: string, leagueHint?: LeagueType): string | null {
  if (!clubName || !clubName.trim()) return null;

  const raw = clubName.trim();
  const canonical = getCanonicalOfficialClub(raw, leagueHint);
  const resolvedName = canonical?.name || raw;
  const resolvedLeague = leagueHint || canonical?.league;

  // 1. Exact match with league hint
  if (resolvedLeague) {
    const key = `${resolvedLeague}_${resolvedName}`;
    const item = memoryCrestCache.get(key);
    if (item?.dataUrl) return item.dataUrl;
  }

  // 2. Search across other leagues if not found in hint
  for (const league of ['League 1', 'League 2', 'League 3'] as LeagueType[]) {
    const key = `${league}_${resolvedName}`;
    const item = memoryCrestCache.get(key);
    if (item?.dataUrl) return item.dataUrl;
  }

  // 3. Normalized search in memory cache
  for (const [id, item] of memoryCrestCache.entries()) {
    if (item.clubName === resolvedName || item.clubName.includes(resolvedName) || resolvedName.includes(item.clubName)) {
      if (item.dataUrl) return item.dataUrl;
    }
  }

  // 4. Match with the user's uploaded structure in public/crests/:
  // Priority A: /crests/สโมสรไทยลีก {1|2|3}/{clubName}.jpg
  const folder = getLeagueFolderName(resolvedLeague);
  if (folder) {
    return `/crests/${encodeURIComponent(folder)}/${encodeURIComponent(resolvedName)}.jpg`;
  }

  // Priority B: /crests/{clubName}.jpg
  return `/crests/${encodeURIComponent(resolvedName)}.jpg`;
}

/**
 * Get all saved crests for a specific league
 */
export function getCrestsForLeague(league: LeagueType): Map<string, ClubCrestItem> {
  const result = new Map<string, ClubCrestItem>();
  memoryCrestCache.forEach((item) => {
    if (item.league === league) {
      result.set(item.clubName, item);
    }
  });
  return result;
}

/**
 * Save a single club crest to IndexedDB and cache
 */
export async function saveClubCrest(
  league: LeagueType,
  clubName: string,
  dataUrl: string,
  fileName: string,
  fileSize?: number
): Promise<void> {
  const can = getCanonicalOfficialClub(clubName, league)?.name || clubName.trim();
  const id = getCrestId(league, can);
  const item: ClubCrestItem & { id: string } = {
    id,
    league,
    clubName: can,
    dataUrl,
    fileName,
    updatedAt: new Date().toISOString(),
    fileSize
  };

  memoryCrestCache.set(id, item);
  notifyListeners();

  try {
    const db = await openCrestDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(item);
  } catch (err) {
    console.warn('Failed saving to IndexedDB, backing up to localStorage:', err);
    saveMemoryCacheToLocalStorageBackup();
  }
}

/**
 * Delete a single club crest
 */
export async function deleteClubCrest(league: LeagueType, clubName: string): Promise<void> {
  const can = getCanonicalOfficialClub(clubName, league)?.name || clubName.trim();
  const id = getCrestId(league, can);

  memoryCrestCache.delete(id);
  notifyListeners();

  try {
    const db = await openCrestDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
  } catch (err) {
    console.warn('Failed deleting from IndexedDB:', err);
    saveMemoryCacheToLocalStorageBackup();
  }
}

/**
 * Clear all crests for a specific league
 */
export async function clearLeagueCrests(league: LeagueType): Promise<void> {
  const keysToDelete: string[] = [];
  memoryCrestCache.forEach((item, key) => {
    if (item.league === league) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(k => memoryCrestCache.delete(k));
  notifyListeners();

  try {
    const db = await openCrestDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    keysToDelete.forEach(id => store.delete(id));
  } catch (err) {
    console.warn('Failed clearing league in IndexedDB:', err);
    saveMemoryCacheToLocalStorageBackup();
  }
}

/**
 * Save memory cache to localStorage as a safety net
 */
function saveMemoryCacheToLocalStorageBackup() {
  if (typeof localStorage === 'undefined') return;
  try {
    const items = Array.from(memoryCrestCache.values()).map(item => ({
      league: item.league,
      clubName: item.clubName,
      dataUrl: item.dataUrl,
      fileName: item.fileName,
      updatedAt: item.updatedAt,
      fileSize: item.fileSize
    }));
    localStorage.setItem(LOCALSTORAGE_BACKUP_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('LocalStorage backup quota exceeded or unavailable:', e);
  }
}

/**
 * Subscribe to crest changes
 */
export function subscribeToClubCrests(listener: (cache: Map<string, ClubCrestItem>) => void): () => void {
  listeners.add(listener);
  listener(new Map(memoryCrestCache));
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Smart file matching for a target league
 * Isolates the search strictly to targetLeague clubs if specified.
 */
export interface FileMatchResultItem {
  file: File;
  clubName: string;
  league: LeagueType;
  matchType: 'exact' | 'alias' | 'fuzzy';
}

export interface UnmatchedFileItem {
  file: File;
  cleanName: string;
  reason: string;
}

export function matchFilesToLeagueClubs(
  files: File[],
  targetLeague: LeagueType
): {
  matched: FileMatchResultItem[];
  unmatched: UnmatchedFileItem[];
} {
  const officialClubs = OFFICIAL_CLUBS_BY_LEAGUE[targetLeague];
  const matched: FileMatchResultItem[] = [];
  const unmatched: UnmatchedFileItem[] = [];
  const assignedClubs = new Set<string>();

  files.forEach(file => {
    // Only accept image files
    if (!file.type.startsWith('image/') && !file.name.match(/\.(png|jpe?g|webp|svg|gif)$/i)) {
      return;
    }

    // Strip extension
    const baseName = file.name.replace(/\.[^/.]+$/, '').trim();
    
    // Normalize string for comparison
    const norm = (s: string) => s
      .toLowerCase()
      .replace(/^(สโมสรฟุตบอล|สโมสร|ทีมฟุตบอล|ทีม)\s*/g, '')
      .replace(/\s*(เอฟซี|fc|ยูไนเต็ด|utd|united|ซิตี้|city|ฟุตบอลคลับ)\s*$/gi, '')
      .replace(/[.\-_()/\\]/g, ' ')
      .replace(/\s+/g, '')
      .trim();

    const fileNorm = norm(baseName);

    // 1. Check canonical match specifically in this target league
    let foundClub: string | null = null;
    let matchType: 'exact' | 'alias' | 'fuzzy' = 'exact';

    // Direct match against official clubs in target league
    for (const club of officialClubs) {
      if (club.toLowerCase() === baseName.toLowerCase() || club === baseName) {
        foundClub = club;
        matchType = 'exact';
        break;
      }
    }

    // Alias/Canonical check restricted to target league
    if (!foundClub) {
      const can = getCanonicalOfficialClub(baseName, targetLeague);
      if (can && can.league === targetLeague && officialClubs.includes(can.name)) {
        foundClub = can.name;
        matchType = 'alias';
      }
    }

    // Normalized match in target league
    if (!foundClub) {
      for (const club of officialClubs) {
        const cNorm = norm(club);
        if (cNorm === fileNorm) {
          foundClub = club;
          matchType = 'fuzzy';
          break;
        }
      }
    }

    // Substring match in target league if length is sufficient
    if (!foundClub && fileNorm.length >= 3) {
      for (const club of officialClubs) {
        const cNorm = norm(club);
        if (cNorm.length >= 3 && (cNorm.includes(fileNorm) || fileNorm.includes(cNorm))) {
          foundClub = club;
          matchType = 'fuzzy';
          break;
        }
      }
    }

    if (foundClub) {
      matched.push({
        file,
        clubName: foundClub,
        league: targetLeague,
        matchType
      });
      assignedClubs.add(foundClub);
    } else {
      unmatched.push({
        file,
        cleanName: baseName,
        reason: `ไม่พบชื่อสโมสรนี้ในรายชื่อ ${officialClubs.length} สโมสรทางการของ ${targetLeague}`
      });
    }
  });

  return { matched, unmatched };
}

/**
 * Convert a File to Base64 data URL with optional auto-resizing to protect memory
 */
export function readFileAsDataUrl(file: File, maxDimension = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        reject(new Error('Failed to read file'));
        return;
      }

      // If it's SVG, return dataUrl directly (vector preserves clarity)
      if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
        resolve(dataUrl);
        return;
      }

      // Resize high-res images to maxDimension to keep performance snappy
      const img = new Image();
      img.onload = () => {
        if (img.width <= maxDimension && img.height <= maxDimension) {
          resolve(dataUrl);
          return;
        }

        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Preserve PNG transparency
        const format = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        const resizedUrl = canvas.toDataURL(format, 0.92);
        resolve(resizedUrl);
      };

      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
