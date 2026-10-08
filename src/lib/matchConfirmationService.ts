import { LeagueType } from '../types';
import { getCurrentWeekInfo } from './stadiumPhonebookService';
import { getSimulatedDate, initFirebaseService } from './firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

export interface MatchContactConfirmation {
  id: string; // Key: fixtureId or `${weekKey}_${cleanTeam(homeClub)}`
  fixtureId?: string;
  matchDate: string;
  weekKey: string;
  homeClub?: string;
  cleanHomeClub?: string;
  stadiumName?: string;
  league?: LeagueType;
  confirmedAt: string; // e.g. "28 ก.ย. 2569 10:30 น."
  confirmedBy: string; // e.g. "Admin"
  status: 'confirmed';
}

const LOCAL_CONFIRMATIONS_KEY = 'thaileague_match_contact_confirmations_v1';
const FIRESTORE_COLLECTION = 'thaileague_match_confirmations';

let memoryConfirmations: Record<string, MatchContactConfirmation> = loadStoredConfirmations();
const confirmationListeners: Set<(map: Record<string, MatchContactConfirmation>) => void> = new Set();
let isFirestoreListening = false;

// Helper to clean club name for flexible matching
export function cleanTeamKey(name?: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/สโมสรฟุตบอล|สโมสร|เอฟซี|ยูไนเต็ด|fc|united/g, '')
    .replace(/[\s\-_]/g, '')
    .trim();
}

function loadStoredConfirmations(): Record<string, MatchContactConfirmation> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_CONFIRMATIONS_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading match confirmations from localStorage:', e);
  }
  return {};
}

function persistConfirmations(map: Record<string, MatchContactConfirmation>): void {
  memoryConfirmations = { ...map };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_CONFIRMATIONS_KEY, JSON.stringify(map));
    }
  } catch (e) {
    console.error('Error saving match confirmations to localStorage:', e);
  }
  notifyListeners();
}

function notifyListeners(): void {
  const copy = { ...memoryConfirmations };
  confirmationListeners.forEach(cb => {
    try {
      cb(copy);
    } catch (e) {
      console.error('Error in confirmation listener:', e);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('match_confirmations_updated', { detail: copy }));
  }
}

// Start Firestore real-time synchronization
function initFirestoreSync(): void {
  if (isFirestoreListening || typeof window === 'undefined') return;
  isFirestoreListening = true;

  try {
    const { db } = initFirebaseService();
    if (db) {
      const colRef = collection(db, FIRESTORE_COLLECTION);
      onSnapshot(colRef, (snapshot) => {
        const remoteMap: Record<string, MatchContactConfirmation> = { ...memoryConfirmations };
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as MatchContactConfirmation;
          if (data && data.id) {
            remoteMap[data.id] = data;
          }
        });
        memoryConfirmations = remoteMap;
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(LOCAL_CONFIRMATIONS_KEY, JSON.stringify(remoteMap));
          }
        } catch {}
        notifyListeners();
      }, (err) => {
        console.warn('Firestore match confirmations listener fallback:', err);
      });
    }
  } catch (e) {
    console.warn('Error initiating Firestore sync for match confirmations:', e);
  }
}

/**
 * Check if the on-site contact for a match is confirmed by Admin for that week
 */
export function isMatchContactConfirmed(params: {
  fixtureId?: string;
  matchDate?: string;
  homeClub?: string;
  stadiumName?: string;
  weekKey?: string;
}): {
  isConfirmed: boolean;
  confirmedAt?: string;
  confirmedBy?: string;
  confirmedWeekKey?: string;
} {
  const { fixtureId, matchDate, homeClub, stadiumName } = params;
  const weekInfo = getCurrentWeekInfo(matchDate);
  const weekKey = params.weekKey || weekInfo.weekKey;

  const map = memoryConfirmations;

  // 1. Check exact fixtureId
  if (fixtureId && map[fixtureId]) {
    const entry = map[fixtureId];
    return {
      isConfirmed: true,
      confirmedAt: entry.confirmedAt,
      confirmedBy: entry.confirmedBy,
      confirmedWeekKey: entry.weekKey,
    };
  }

  // 2. Check weekKey + cleanHomeClub
  const cHome = cleanTeamKey(homeClub);
  if (cHome) {
    const key = `${weekKey}_${cHome}`;
    if (map[key]) {
      const entry = map[key];
      return {
        isConfirmed: true,
        confirmedAt: entry.confirmedAt,
        confirmedBy: entry.confirmedBy,
        confirmedWeekKey: entry.weekKey,
      };
    }
  }

  // 3. Check matchDate + cleanHomeClub
  if (matchDate && cHome) {
    const dateKey = `${matchDate.slice(0, 10)}_${cHome}`;
    if (map[dateKey]) {
      const entry = map[dateKey];
      return {
        isConfirmed: true,
        confirmedAt: entry.confirmedAt,
        confirmedBy: entry.confirmedBy,
        confirmedWeekKey: entry.weekKey,
      };
    }
  }

  // 4. Check weekKey + stadiumName
  const cStadium = cleanTeamKey(stadiumName);
  if (cStadium) {
    const stadKey = `${weekKey}_${cStadium}`;
    if (map[stadKey]) {
      const entry = map[stadKey];
      return {
        isConfirmed: true,
        confirmedAt: entry.confirmedAt,
        confirmedBy: entry.confirmedBy,
        confirmedWeekKey: entry.weekKey,
      };
    }
  }

  // 5. Scan entry records for matching home club and date (fuzzy date/fixture fallback)
  if (cHome) {
    for (const k of Object.keys(map)) {
      const entry = map[k];
      if (entry && entry.status === 'confirmed' && entry.cleanHomeClub === cHome) {
        if (!matchDate || !entry.matchDate || entry.matchDate.slice(0, 10) === matchDate.slice(0, 10)) {
          return {
            isConfirmed: true,
            confirmedAt: entry.confirmedAt,
            confirmedBy: entry.confirmedBy,
            confirmedWeekKey: entry.weekKey,
          };
        }
      }
    }
  }

  return { isConfirmed: false };
}

/**
 * Admin confirms match contact phone numbers for a match/week
 */
export async function confirmMatchContact(params: {
  fixtureId?: string;
  matchDate: string;
  homeClub?: string;
  stadiumName?: string;
  league?: LeagueType;
  adminName: string;
}): Promise<MatchContactConfirmation> {
  initFirestoreSync();
  const weekInfo = getCurrentWeekInfo(params.matchDate);
  const now = new Date();
  const confirmedAt = now.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const cHome = cleanTeamKey(params.homeClub);
  const primaryId = params.fixtureId || `${weekInfo.weekKey}_${cHome || cleanTeamKey(params.stadiumName)}`;

  const confirmation: MatchContactConfirmation = {
    id: primaryId,
    fixtureId: params.fixtureId,
    matchDate: params.matchDate.slice(0, 10),
    weekKey: weekInfo.weekKey,
    homeClub: params.homeClub,
    cleanHomeClub: cHome,
    stadiumName: params.stadiumName,
    league: params.league,
    confirmedAt,
    confirmedBy: params.adminName || 'Admin',
    status: 'confirmed',
  };

  const updated = { ...memoryConfirmations };
  // Store primary ID
  updated[primaryId] = confirmation;
  // Also store cross-lookup keys for guaranteed instantaneous lookup
  if (params.fixtureId) updated[params.fixtureId] = confirmation;
  if (cHome) updated[`${weekInfo.weekKey}_${cHome}`] = confirmation;
  if (params.matchDate && cHome) updated[`${params.matchDate.slice(0, 10)}_${cHome}`] = confirmation;
  if (params.stadiumName) updated[`${weekInfo.weekKey}_${cleanTeamKey(params.stadiumName)}`] = confirmation;

  persistConfirmations(updated);

  // Background Firestore save
  try {
    const { db } = initFirebaseService();
    if (db) {
      const docRef = doc(db, FIRESTORE_COLLECTION, primaryId);
      await setDoc(docRef, confirmation, { merge: true }).catch(() => {});
    }
  } catch (e) {
    console.warn('Firestore confirmation save fallback:', e);
  }

  return confirmation;
}

/**
 * Admin revokes confirmation for a match
 */
export async function unconfirmMatchContact(params: {
  fixtureId?: string;
  matchDate?: string;
  homeClub?: string;
  stadiumName?: string;
}): Promise<void> {
  initFirestoreSync();
  const weekInfo = getCurrentWeekInfo(params.matchDate);
  const cHome = cleanTeamKey(params.homeClub);
  const primaryId = params.fixtureId || `${weekInfo.weekKey}_${cHome || cleanTeamKey(params.stadiumName)}`;

  const updated = { ...memoryConfirmations };
  delete updated[primaryId];
  if (params.fixtureId) delete updated[params.fixtureId];
  if (cHome) delete updated[`${weekInfo.weekKey}_${cHome}`];
  if (params.matchDate && cHome) delete updated[`${params.matchDate.slice(0, 10)}_${cHome}`];
  if (params.stadiumName) delete updated[`${weekInfo.weekKey}_${cleanTeamKey(params.stadiumName)}`];

  persistConfirmations(updated);

  // Background Firestore delete
  try {
    const { db } = initFirebaseService();
    if (db) {
      const docRef = doc(db, FIRESTORE_COLLECTION, primaryId);
      await deleteDoc(docRef).catch(() => {});
    }
  } catch (e) {
    console.warn('Firestore unconfirm delete fallback:', e);
  }
}

/**
 * Bulk confirm all matches for a week
 */
export async function bulkConfirmMatchesForWeek(params: {
  weekKey: string;
  fixtures: Array<{
    fixtureId?: string;
    matchDate: string;
    homeClub?: string;
    stadiumName?: string;
    league?: LeagueType;
  }>;
  adminName: string;
}): Promise<{ count: number }> {
  initFirestoreSync();
  let count = 0;
  for (const f of params.fixtures) {
    await confirmMatchContact({
      fixtureId: f.fixtureId,
      matchDate: f.matchDate,
      homeClub: f.homeClub,
      stadiumName: f.stadiumName,
      league: f.league,
      adminName: params.adminName,
    });
    count++;
  }
  return { count };
}

/**
 * Subscribe to confirmation changes
 */
export function subscribeToMatchConfirmations(
  callback: (map: Record<string, MatchContactConfirmation>) => void
): () => void {
  initFirestoreSync();
  confirmationListeners.add(callback);
  callback({ ...memoryConfirmations });

  return () => {
    confirmationListeners.delete(callback);
  };
}

/**
 * Check if the match day has ended (เมื่อหมดวันแมตช์แข่งขันแล้วให้แมตช์การแข่งขันนั้นหายไปจากหน้าเบอร์ติดต่อ)
 * Compares current simulated date or real date with match date
 * If today > matchDay => return true (match day is finished)
 */
export function isMatchDayFinished(matchDateStr?: string, currentSimDateStr?: string): boolean {
  if (!matchDateStr) return false;
  const currentDay = (currentSimDateStr || getSimulatedDate() || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const matchDay = matchDateStr.slice(0, 10);
  return currentDay > matchDay;
}
