import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  getDocs,
  doc, 
  query, 
  orderBy, 
  Firestore 
} from 'firebase/firestore';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged, 
  User, 
  Auth 
} from 'firebase/auth';
import { RegistrationRecord, UserProfile, MatchStadiumContact, LeagueType } from '../types';
import { INITIAL_REGISTRATIONS } from '../data/mockRegistrations';
import { INITIAL_MATCH_CONTACTS } from '../data/stadiumContacts';
import { CURRENT_SIMULATED_DATE } from '../data/fixtures';
import { getSeasonFromDate } from './seasonService';
import { checkUserRoleByEmail } from './userManagementService';

// Local storage key for persistent fallback
const LOCAL_STORAGE_KEY = 'thaileague_2026_27_registrations';
const LOCAL_USER_KEY = 'thaileague_2026_27_current_user';
const FIREBASE_CONFIG_KEY = 'thaileague_2026_27_firebase_config';
const LOCAL_MATCH_CONTACTS_KEY = 'thaileague_2026_27_match_contacts';
const LOCAL_SIM_DATE_KEY = 'thaileague_2026_27_sim_date';
const BACKEND_SHEETS_URL_KEY = 'thaileague_2026_27_backend_sheets_url';

export const DEFAULT_FIREBASE_PROJECT_ID = 'gen-lang-client-0566054495';

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch (e) {}
  return null;
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch (e) {}
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (e) {}
}

import { FIREBASE_APPLET_CONFIG } from './firebaseConfig';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export interface FirebaseConfigType {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}

/**
 * Recursively cleans any object for Firestore:
 * Strips `undefined` values and converts undefined fields to null/empty
 * so Firestore SDK never throws:
 * "FirebaseError: Function ... called with invalid data. Unsupported field value: undefined"
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return '' as any;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item)) as any;
  }
  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

export function getSavedFirebaseConfig(): FirebaseConfigType | null {
  try {
    const raw = safeGetItem(FIREBASE_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading Firebase config from storage', e);
  }
  return null;
}

export function saveFirebaseConfig(config: FirebaseConfigType) {
  try {
    safeSetItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  } catch (e) {
    console.error('Error saving Firebase config', e);
  }
}

// Check if Firebase is configured
export function initFirebaseService() {
  if (app && db) return { app, db, auth };

  const savedConfig = getSavedFirebaseConfig();
  // Ensure valid configuration - prioritize official provisioned FIREBASE_APPLET_CONFIG
  const configToUse: any = (savedConfig?.apiKey && savedConfig?.projectId && savedConfig.projectId !== 'thaileague-2026-27')
    ? { ...FIREBASE_APPLET_CONFIG, ...savedConfig }
    : FIREBASE_APPLET_CONFIG;

  try {
    if (!getApps().length && configToUse?.apiKey) {
      app = initializeApp(configToUse);
      db = configToUse.firestoreDatabaseId 
        ? getFirestore(app, configToUse.firestoreDatabaseId)
        : getFirestore(app);
      auth = getAuth(app);
    } else if (getApps().length) {
      app = getApps()[0];
      db = configToUse?.firestoreDatabaseId 
        ? getFirestore(app, configToUse.firestoreDatabaseId)
        : getFirestore(app);
      auth = getAuth(app);
    }
  } catch (err) {
    console.warn('Firebase initialization with standard credentials deferred to fallback store:', err);
  }

  return { app, db, auth };
}

// Local State Store with event listeners for real-time local updates
type Listener = (records: RegistrationRecord[]) => void;
const listeners: Set<Listener> = new Set();

function getInitialLocalRecords(): RegistrationRecord[] {
  try {
    const data = safeGetItem(LOCAL_STORAGE_KEY);
    if (data !== null) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed; // Valid array, even if empty [] when user deletes all!
      }
    }
  } catch (e) {
    console.error('Failed to parse records from local storage', e);
  }
  // Store default if not initialized yet
  safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_REGISTRATIONS));
  return INITIAL_REGISTRATIONS;
}

const DELETED_REGS_KEY = 'thaileague_deleted_registrations_v2';
function getDeletedRegistrationIds(): Set<string> {
  try {
    const raw = safeGetItem(DELETED_REGS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch (e) {}
  return new Set();
}
let deletedRegistrationIds = getDeletedRegistrationIds();

function markRegistrationDeleted(id: string) {
  deletedRegistrationIds.add(id);
  try {
    safeSetItem(DELETED_REGS_KEY, JSON.stringify(Array.from(deletedRegistrationIds)));
  } catch (e) {}
}

function clearDeletedRegistrations() {
  deletedRegistrationIds = new Set();
  try {
    safeSetItem(DELETED_REGS_KEY, JSON.stringify([]));
  } catch (e) {}
}

let memoryRecords: RegistrationRecord[] = getInitialLocalRecords().filter(r => !deletedRegistrationIds.has(r.id));

function notifyListeners() {
  listeners.forEach(cb => {
    try {
      cb([...memoryRecords]);
    } catch (err) {
      console.error(err);
    }
  });
}

let isFirstFirestoreSyncDone = false;

// Subscribe to registrations (Real-time across all devices via Cloud Firestore)
export function subscribeToRegistrations(callback: (records: RegistrationRecord[]) => void): () => void {
  listeners.add(callback);
  // Send current state immediately
  callback([...memoryRecords]);

  const { db: firestoreDb } = initFirebaseService();

  let unsubscribeFirestore: (() => void) | null = null;

  if (firestoreDb) {
    try {
      const colRef = collection(firestoreDb, 'thaileague_registrations');
      unsubscribeFirestore = onSnapshot(colRef, async (snapshot) => {
        if (!isFirstFirestoreSyncDone && snapshot.empty) {
          isFirstFirestoreSyncDone = true;
          // If Firestore is empty on the very first time the database is initialized,
          // seed the initial mock registrations to Firestore so ALL connected devices have initial data.
          const alreadyInitialized = safeGetItem('thaileague_firestore_seeded_v1');
          if (!alreadyInitialized) {
            safeSetItem('thaileague_firestore_seeded_v1', 'true');
            for (const item of INITIAL_REGISTRATIONS) {
              try {
                await setDoc(doc(firestoreDb, 'thaileague_registrations', item.id), sanitizeForFirestore(item));
              } catch (err) {
                console.error('Error seeding initial record to Firestore:', err);
              }
            }
            return;
          }
        }

        isFirstFirestoreSyncDone = true;
        const list: RegistrationRecord[] = [];
        snapshot.forEach((docSnap) => {
          // If this document was marked as deleted, delete it from Firestore and do not include it
          if (deletedRegistrationIds.has(docSnap.id)) {
            deleteDoc(docSnap.ref).catch(() => {});
            return;
          }
          list.push({ ...docSnap.data(), id: docSnap.id } as RegistrationRecord);
        });

        // Sort descending by timestamp in memory
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        memoryRecords = list;
        safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
        notifyListeners();
      }, (error) => {
        console.warn('Firestore real-time subscription issue, continuing with synchronized local store:', error);
      });
    } catch (e) {
      console.warn('Firestore listener setup skipped:', e);
    }
  }

  return () => {
    listeners.delete(callback);
    if (unsubscribeFirestore) {
      unsubscribeFirestore();
    }
  };
}

// Create new Registration
export async function createRegistration(
  data: Omit<RegistrationRecord, 'id' | 'createdAt' | 'timestamp' | 'status'>
): Promise<RegistrationRecord> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
  const recordId = `reg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const newRecord: RegistrationRecord = {
    ...data,
    id: recordId,
    createdAt: dateStr,
    timestamp: Date.now(),
    status: 'pending',
    season: data.season || getSeasonFromDate(data.matchDate || data.month || dateStr),
  };

  const { db: firestoreDb } = initFirebaseService();
  if (firestoreDb) {
    try {
      const cleanData = sanitizeForFirestore(newRecord);
      await setDoc(doc(firestoreDb, 'thaileague_registrations', recordId), cleanData);
      console.log('✅ Registration successfully saved to Firestore:', recordId);
    } catch (e) {
      console.error('❌ Could not save directly to Firestore, saving to local store:', e);
    }
  }

  memoryRecords = [newRecord, ...memoryRecords.filter(r => r.id !== recordId)];
  safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(memoryRecords));
  notifyListeners();
  return newRecord;
}

// Update Registration (e.g. approve, reject, edit)
export async function updateRegistration(
  id: string, 
  updates: Partial<RegistrationRecord>
): Promise<void> {
  const index = memoryRecords.findIndex(r => r.id === id);
  if (index !== -1) {
    memoryRecords[index] = { ...memoryRecords[index], ...updates };
    safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(memoryRecords));
    notifyListeners();
  }

  const { db: firestoreDb } = initFirebaseService();
  if (firestoreDb) {
    try {
      const cleanUpdates = sanitizeForFirestore(updates);
      const ref = doc(firestoreDb, 'thaileague_registrations', id);
      await setDoc(ref, cleanUpdates, { merge: true });
      console.log('✅ Registration successfully updated in Firestore:', id);
    } catch (e) {
      console.error('❌ Firestore update failed:', e);
    }
  }
}

// Delete Registration
export async function deleteRegistration(id: string): Promise<void> {
  markRegistrationDeleted(id);
  memoryRecords = memoryRecords.filter(r => r.id !== id);
  safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(memoryRecords));
  notifyListeners();

  const { db: firestoreDb } = initFirebaseService();
  if (firestoreDb) {
    try {
      const ref = doc(firestoreDb, 'thaileague_registrations', id);
      await deleteDoc(ref);
      console.log('✅ Registration deleted in Firestore:', id);
    } catch (e) {
      console.error('❌ Firestore delete failed:', e);
    }
  }
}

// Delete All or Filtered Registrations (ลบคำขอทั้งหมด หรือเฉพาะที่เลือก)
export async function deleteAllRegistrations(idsToDelete?: string[]): Promise<void> {
  if (idsToDelete && idsToDelete.length > 0) {
    idsToDelete.forEach(id => markRegistrationDeleted(id));
    const set = new Set(idsToDelete);
    memoryRecords = memoryRecords.filter(r => !set.has(r.id));
  } else {
    memoryRecords.forEach(r => markRegistrationDeleted(r.id));
    memoryRecords = [];
  }
  safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(memoryRecords));
  notifyListeners();

  const { db: firestoreDb } = initFirebaseService();
  if (firestoreDb) {
    try {
      if (idsToDelete && idsToDelete.length > 0) {
        for (const id of idsToDelete) {
          await deleteDoc(doc(firestoreDb, 'thaileague_registrations', id)).catch(() => {});
        }
      } else {
        const snapshot = await getDocs(collection(firestoreDb, 'thaileague_registrations'));
        const batchPromises = snapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.allSettled(batchPromises);
      }
    } catch (e) {
      console.error('❌ Firestore deleteAll error:', e);
    }
  }
}

// Reset data to defaults
export function resetToMockData(): void {
  clearDeletedRegistrations();
  memoryRecords = [...INITIAL_REGISTRATIONS];
  safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(memoryRecords));
  notifyListeners();
}

// =========================================================================
// MATCH STADIUM CONTACTS MANAGEMENT (สำหรับเจ้าหน้าที่บันทึกเบอร์ติดต่อหน้าสนาม)
// =========================================================================
type MatchContactListener = (contacts: MatchStadiumContact[]) => void;
const matchContactListeners: Set<MatchContactListener> = new Set();

function cleanTeamSlug(name?: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/^(สโมสรฟุตบอล|สโมสร|เอฟซี|ยูไนเต็ด|fc|united)/gi, '')
    .replace(/\s+/g, '');
}

export function deduplicateMatchContacts(list: MatchStadiumContact[]): MatchStadiumContact[] {
  const result: MatchStadiumContact[] = [];
  const mapByKey = new Map<string, number>();

  for (const c of list) {
    if (!c) continue;
    const home = cleanTeamSlug(c.homeClub || c.matchTitle?.split(' vs ')[0] || '');
    const away = cleanTeamSlug(c.awayTeam || c.matchTitle?.split(' vs ')[1] || '');
    const date = (c.matchDate || '').slice(0, 10);
    // Fixture ID is primary key if present, otherwise league + home + away + date
    const key = c.fixtureId ? `fix_${c.fixtureId}` : `${c.league}_${home}_${away}_${date}`;

    const existingIdx = mapByKey.get(key);
    if (existingIdx !== undefined) {
      const prev = result[existingIdx];
      const boothPhone = c.boothCoordinatorPhone || prev.boothCoordinatorPhone || '';
      const ticketPhone = c.ticketCoordinatorPhone || prev.ticketCoordinatorPhone || '';
      result[existingIdx] = {
        ...prev,
        ...c,
        id: prev.fixtureId ? prev.id : (c.fixtureId ? c.id : prev.id),
        fixtureId: prev.fixtureId || c.fixtureId,
        boothCoordinatorPhone: boothPhone,
        ticketCoordinatorPhone: ticketPhone,
        boothCoordinatorName: (c.boothCoordinatorName && !c.boothCoordinatorName.includes('รออัปเดต')) 
          ? c.boothCoordinatorName 
          : ((prev.boothCoordinatorName && !prev.boothCoordinatorName.includes('รออัปเดต')) ? prev.boothCoordinatorName : c.boothCoordinatorName),
        ticketCoordinatorName: (c.ticketCoordinatorName && !c.ticketCoordinatorName.includes('รออัปเดต')) 
          ? c.ticketCoordinatorName 
          : ((prev.ticketCoordinatorName && !prev.ticketCoordinatorName.includes('รออัปเดต')) ? prev.ticketCoordinatorName : c.ticketCoordinatorName),
        remark: (c.remark || prev.remark || '').trim(),
        note: c.note || prev.note || '',
        hasUpdatedContact: Boolean(boothPhone || ticketPhone || c.hasUpdatedContact || prev.hasUpdatedContact),
      };
    } else {
      mapByKey.set(key, result.length);
      result.push(c);
    }
  }

  return result;
}

function getInitialMatchContacts(): MatchStadiumContact[] {
  const map = new Map<string, MatchStadiumContact>();
  INITIAL_MATCH_CONTACTS.forEach(c => map.set(c.id, c));

  try {
    const raw = safeGetItem(LOCAL_MATCH_CONTACTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Automatically prune and deduplicate contacts so orphan duplicates are removed
        const cleanList = deduplicateMatchContacts(parsed);
        if (cleanList.length !== parsed.length) {
          safeSetItem(LOCAL_MATCH_CONTACTS_KEY, JSON.stringify(cleanList));
        }
        return cleanList;
      }
    }
  } catch (e) {
    console.error('Error loading match contacts', e);
  }
  return Array.from(map.values());
}

let memoryMatchContacts: MatchStadiumContact[] = getInitialMatchContacts();

function notifyMatchContactListeners() {
  matchContactListeners.forEach(cb => {
    try {
      cb([...memoryMatchContacts]);
    } catch (e) {
      console.error(e);
    }
  });
}

export function subscribeToMatchContacts(callback: (contacts: MatchStadiumContact[]) => void): () => void {
  matchContactListeners.add(callback);
  callback([...memoryMatchContacts]);

  const { db: firestoreDb } = initFirebaseService();
  let unsubscribeFirestore: (() => void) | null = null;

  if (firestoreDb) {
    try {
      const q = query(collection(firestoreDb, 'thaileague_match_contacts'));
      unsubscribeFirestore = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const list: MatchStadiumContact[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ ...docSnap.data(), id: docSnap.id } as MatchStadiumContact);
          });
          memoryMatchContacts = list;
          safeSetItem(LOCAL_MATCH_CONTACTS_KEY, JSON.stringify(list));
          notifyMatchContactListeners();
        }
      }, (error) => {
        console.warn('Firestore match contacts sync issue:', error);
      });
    } catch (e) {
      console.warn('Firestore match contact listener skipped:', e);
    }
  }

  return () => {
    matchContactListeners.delete(callback);
    if (unsubscribeFirestore) unsubscribeFirestore();
  };
}

export async function saveMatchContact(contactData: Omit<MatchStadiumContact, 'id' | 'updatedAt'> & { id?: string }): Promise<MatchStadiumContact> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');

  const contactId = contactData.id || `mc-${contactData.fixtureId || Date.now().toString(36)}`;
  const updatedContact: MatchStadiumContact = {
    ...contactData,
    id: contactId,
    updatedAt: dateStr,
  };

  const existingIndex = memoryMatchContacts.findIndex(
    c => c.id === contactId || (contactData.fixtureId && c.fixtureId === contactData.fixtureId)
  );

  if (existingIndex !== -1) {
    memoryMatchContacts[existingIndex] = updatedContact;
  } else {
    memoryMatchContacts.push(updatedContact);
  }

  safeSetItem(LOCAL_MATCH_CONTACTS_KEY, JSON.stringify(memoryMatchContacts));
  notifyMatchContactListeners();

  const { db: firestoreDb } = initFirebaseService();
  if (firestoreDb) {
    try {
      const ref = doc(firestoreDb, 'thaileague_match_contacts', contactId);
      await setDoc(ref, sanitizeForFirestore(updatedContact), { merge: true });
    } catch (e) {
      console.warn('Firestore match contact save fallback used:', e);
    }
  }

  return updatedContact;
}

export async function saveMultipleMatchContacts(
  contactsList: (Omit<MatchStadiumContact, 'id' | 'updatedAt'> & { id?: string })[],
  options?: { isFullSync?: boolean; replaceLeagues?: LeagueType[] }
): Promise<MatchStadiumContact[]> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');

  // Quick lookup map of existing contacts by ID, fixtureId, and matchKey
  const existingMap = new Map<string, MatchStadiumContact>();
  memoryMatchContacts.forEach(c => {
    if (c.id) existingMap.set(c.id, c);
    if (c.fixtureId) existingMap.set(c.fixtureId, c);
    const h = cleanTeamSlug(c.homeClub || c.matchTitle?.split(' vs ')[0]);
    const a = cleanTeamSlug(c.awayTeam || c.matchTitle?.split(' vs ')[1]);
    const d = (c.matchDate || '').slice(0, 10);
    const key = `${c.league}_${h}_${a}_${d}`;
    if (!existingMap.has(key)) existingMap.set(key, c);
  });

  const updatedResults: MatchStadiumContact[] = [];

  contactsList.forEach(contactData => {
    const contactId = contactData.id || `mc-${contactData.fixtureId || (contactData.stadiumName ? encodeURIComponent(contactData.stadiumName) : Date.now().toString(36))}`;
    const h = cleanTeamSlug(contactData.homeClub || contactData.matchTitle?.split(' vs ')[0]);
    const a = cleanTeamSlug(contactData.awayTeam || contactData.matchTitle?.split(' vs ')[1]);
    const d = (contactData.matchDate || '').slice(0, 10);
    const matchKey = `${contactData.league}_${h}_${a}_${d}`;

    const current = existingMap.get(contactId) 
      || (contactData.fixtureId ? existingMap.get(contactData.fixtureId) : undefined)
      || existingMap.get(matchKey);

    const shouldOverwrite = Boolean(options?.isFullSync || (options?.replaceLeagues && options.replaceLeagues.includes(contactData.league)));

    const boothPhone = shouldOverwrite
      ? (contactData.boothCoordinatorPhone || '')
      : (contactData.boothCoordinatorPhone || current?.boothCoordinatorPhone || '');

    const ticketPhone = shouldOverwrite
      ? (contactData.ticketCoordinatorPhone || '')
      : (contactData.ticketCoordinatorPhone || current?.ticketCoordinatorPhone || '');

    const boothName = contactData.boothCoordinatorName && !contactData.boothCoordinatorName.includes('รออัปเดต')
      ? contactData.boothCoordinatorName
      : (shouldOverwrite ? (contactData.boothCoordinatorName || '') : (current?.boothCoordinatorName && !current.boothCoordinatorName.includes('รออัปเดต') ? current.boothCoordinatorName : contactData.boothCoordinatorName));

    const ticketName = contactData.ticketCoordinatorName && !contactData.ticketCoordinatorName.includes('รออัปเดต')
      ? contactData.ticketCoordinatorName
      : (shouldOverwrite ? (contactData.ticketCoordinatorName || '') : (current?.ticketCoordinatorName && !current.ticketCoordinatorName.includes('รออัปเดต') ? current.ticketCoordinatorName : contactData.ticketCoordinatorName));

    const isValidPhone = (p?: string): boolean => {
      if (!p) return false;
      const digits = p.replace(/\D/g, '');
      return digits.length >= 9 && digits.length <= 11;
    };

    const hasUpdated = Boolean(
      (boothPhone && isValidPhone(boothPhone)) ||
      (ticketPhone && isValidPhone(ticketPhone)) ||
      contactData.hasUpdatedContact ||
      (!shouldOverwrite && current?.hasUpdatedContact)
    );

    const mergedContact: MatchStadiumContact = {
      ...(shouldOverwrite ? {} : (current || {})),
      ...contactData,
      id: contactId,
      updatedAt: dateStr,
      boothCoordinatorPhone: boothPhone,
      ticketCoordinatorPhone: ticketPhone,
      boothCoordinatorName: boothName || (boothPhone ? 'เจ้าหน้าที่ดูแลบูธ' : 'รออัปเดตจาก Google Sheet (Thai League 1 -3 FIXTURES 2026/27_DATA)'),
      ticketCoordinatorName: ticketName || (ticketPhone ? 'เจ้าหน้าที่รับบัตร' : 'รออัปเดตจาก Google Sheet (Thai League 1 -3 FIXTURES 2026/27_DATA)'),
      boothSetupLocation: contactData.boothSetupLocation || (!shouldOverwrite ? current?.boothSetupLocation : '') || '',
      ticketPickupLocation: contactData.ticketPickupLocation || (!shouldOverwrite ? current?.ticketPickupLocation : '') || '',
      operatingHours: contactData.operatingHours || (!shouldOverwrite ? current?.operatingHours : '') || '14:00 - 19:30 น. (วันแข่งขัน)',
      note: contactData.note || (!shouldOverwrite ? current?.note : '') || '',
      remark: (contactData.remark || (!shouldOverwrite ? current?.remark : '') || '').trim(),
      hasUpdatedContact: hasUpdated,
      sourceTab: contactData.sourceTab || (!shouldOverwrite ? current?.sourceTab : undefined),
    };

    updatedResults.push(mergedContact);
  });

  // Strictly deduplicate the updated contacts
  const cleanUpdated = deduplicateMatchContacts(updatedResults);

  // Reconcile with memoryMatchContacts
  if (options?.isFullSync || cleanUpdated.length >= 1000 || (options?.replaceLeagues && options.replaceLeagues.length >= 3)) {
    // Total sync: completely overwrite with clean deduplicated list
    memoryMatchContacts = cleanUpdated;
  } else if (options?.replaceLeagues && options.replaceLeagues.length > 0) {
    const retained = memoryMatchContacts.filter(c => !options.replaceLeagues!.includes(c.league));
    memoryMatchContacts = deduplicateMatchContacts([...retained, ...cleanUpdated]);
  } else {
    memoryMatchContacts = deduplicateMatchContacts([...memoryMatchContacts, ...cleanUpdated]);
  }

  safeSetItem(LOCAL_MATCH_CONTACTS_KEY, JSON.stringify(memoryMatchContacts));
  notifyMatchContactListeners();

  const { db: firestoreDb } = initFirebaseService();
  if (firestoreDb) {
    try {
      for (const item of cleanUpdated) {
        const ref = doc(firestoreDb, 'thaileague_match_contacts', item.id);
        await setDoc(ref, sanitizeForFirestore(item), { merge: true });
      }
    } catch (e) {
      console.warn('Firestore bulk contact save warning:', e);
    }
  }

  return memoryMatchContacts;
}

export function getMatchContacts(): MatchStadiumContact[] {
  return [...memoryMatchContacts];
}

export async function deleteMatchContact(id: string): Promise<void> {
  memoryMatchContacts = memoryMatchContacts.filter(c => c.id !== id);
  safeSetItem(LOCAL_MATCH_CONTACTS_KEY, JSON.stringify(memoryMatchContacts));
  notifyMatchContactListeners();

  const { db: firestoreDb } = initFirebaseService();
  if (firestoreDb) {
    try {
      await deleteDoc(doc(firestoreDb, 'thaileague_match_contacts', id));
    } catch (e) {
      console.warn('Firestore match contact delete fallback used:', e);
    }
  }
}

// Google Sheets Backend URL Integration
export function getBackendSheetsUrl(): string {
  try {
    const saved = safeGetItem(BACKEND_SHEETS_URL_KEY);
    if (saved) return saved;
  } catch (e) {
    console.error(e);
  }
  return 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing';
}

export function saveBackendSheetsUrl(url: string): void {
  safeSetItem(BACKEND_SHEETS_URL_KEY, url.trim());
}

// =========================================================================
// SIMULATED DATE & 1-WEEK ROLLING ADVANCEMENT (การรันข้อมูลแมตช์ 1 สัปดาห์ถัดไป)
// =========================================================================
type DateListener = (date: string) => void;
const dateListeners: Set<DateListener> = new Set();

function getInitialSimDate(): string {
  try {
    const raw = safeGetItem(LOCAL_SIM_DATE_KEY);
    if (raw) return raw;
  } catch (e) {
    console.error(e);
  }
  return CURRENT_SIMULATED_DATE;
}

let currentSimulatedDate: string = getInitialSimDate();

function notifyDateListeners() {
  dateListeners.forEach(cb => {
    try {
      cb(currentSimulatedDate);
    } catch (e) {
      console.error(e);
    }
  });
}

export function subscribeToSimulatedDate(callback: (date: string) => void): () => void {
  dateListeners.add(callback);
  callback(currentSimulatedDate);
  return () => {
    dateListeners.delete(callback);
  };
}

export function getSimulatedDate(): string {
  return currentSimulatedDate;
}

export function advanceSimulatedDate(days: number = 7): string {
  const cur = new Date(currentSimulatedDate);
  cur.setDate(cur.getDate() + days);
  const nextDateStr = cur.toISOString().slice(0, 10);
  currentSimulatedDate = nextDateStr;
  safeSetItem(LOCAL_SIM_DATE_KEY, nextDateStr);
  notifyDateListeners();
  return nextDateStr;
}

export function setSimulatedDate(newDate: string): string {
  currentSimulatedDate = newDate;
  safeSetItem(LOCAL_SIM_DATE_KEY, newDate);
  notifyDateListeners();
  return newDate;
}

export function resetSimulatedDate(): string {
  currentSimulatedDate = CURRENT_SIMULATED_DATE;
  safeSetItem(LOCAL_SIM_DATE_KEY, CURRENT_SIMULATED_DATE);
  notifyDateListeners();
  return CURRENT_SIMULATED_DATE;
}

// Current User State & Gmail Login
let currentUserProfile: UserProfile | null = (() => {
  try {
    const raw = safeGetItem(LOCAL_USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
 return null;
})();

const authListeners: Set<(user: UserProfile | null) => void> = new Set();

export function subscribeToAuth(callback: (user: UserProfile | null) => void): () => void {
  authListeners.add(callback);
  callback(currentUserProfile);
  return () => authListeners.delete(callback);
}

function notifyAuthListeners() {
  authListeners.forEach(cb => cb(currentUserProfile));
}

// Gmail Sign-In handler (Firebase Google Auth + Quick Fallback for direct Google/Gmail login)
export async function signInWithGoogle(customEmail?: string, customName?: string, role?: 'admin' | 'user'): Promise<UserProfile> {
  const { auth: fbAuth } = initFirebaseService();

  if (fbAuth && fbAuth.app.options.apiKey) {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      const result = await signInWithPopup(fbAuth, provider);
      const u: User = result.user;
      const userEmail = u.email || '';
      const roleCheck = checkUserRoleByEmail(userEmail);
      const effectiveRole = role !== undefined ? role : (roleCheck.isKnown ? roleCheck.role : 'user');
      const assignedBrand = roleCheck.isKnown 
        ? roleCheck.assignedBrand 
        : (roleCheck.assignedBrand || (effectiveRole === 'admin' ? 'All' : 'BYD'));
      
      const profile: UserProfile = {
        uid: u.uid,
        displayName: roleCheck.displayName || u.displayName || u.email?.split('@')[0] || 'Gmail User',
        email: userEmail,
        photoURL: u.photoURL || undefined,
        role: effectiveRole,
        organization: roleCheck.organization || (userEmail.includes('planb') ? 'Plan B Media Co., Ltd.' : 'Thai League Sponsor / Partner'),
        assignedBrand,
        assignedBrands: roleCheck.assignedBrands,
      };
      currentUserProfile = profile;
      safeSetItem(LOCAL_USER_KEY, JSON.stringify(profile));
      notifyAuthListeners();
      return profile;
    } catch (e) {
      console.warn('Google Popup blocked or not configured in environment, utilizing direct Gmail authentication mode:', e);
    }
  }

  // Instant Gmail login with supplied or preset Gmail identity
  const emailToUse = customEmail || 'siriprapa.po@planbmedia.co.th';
  const roleCheck = checkUserRoleByEmail(emailToUse);
  const effectiveRole = role !== undefined ? role : (roleCheck.isKnown ? roleCheck.role : 'user');
  const assignedBrand = roleCheck.isKnown 
    ? roleCheck.assignedBrand 
    : (roleCheck.assignedBrand || (effectiveRole === 'admin' ? 'All' : 'BYD'));
  const nameToUse = roleCheck.displayName || customName || emailToUse.split('@')[0];

  const profile: UserProfile = {
    uid: `gmail-${Date.now().toString(36)}`,
    displayName: nameToUse,
    email: emailToUse,
    photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(nameToUse)}&backgroundColor=0284c7,e11d48,059669`,
    role: effectiveRole,
    organization: roleCheck.organization || (effectiveRole === 'admin' ? 'Plan B Media / Thai League Partner' : 'ผู้สนับสนุนและแบรนด์ร่วมกิจกรรม'),
    assignedBrand,
    assignedBrands: roleCheck.assignedBrands,
  };

  currentUserProfile = profile;
  safeSetItem(LOCAL_USER_KEY, JSON.stringify(profile));
  notifyAuthListeners();
  return profile;
}

/**
 * Instantly switch role between Admin and User for testing and previewing
 */
export function switchUserRole(targetRole?: 'admin' | 'user'): UserProfile | null {
  if (!currentUserProfile) {
    // If not logged in, create a default user profile to preview
    const defaultProfile: UserProfile = {
      uid: `user-${Date.now().toString(36)}`,
      displayName: 'ผู้ใช้งานทั่วไป (Client/Brand)',
      email: 'client.sponsor@example.com',
      role: targetRole || 'user',
      organization: 'ผู้สนับสนุนและแบรนด์ร่วมกิจกรรม',
      assignedBrand: 'BYD',
      assignedBrands: ['BYD'],
    };
    currentUserProfile = defaultProfile;
    safeSetItem(LOCAL_USER_KEY, JSON.stringify(defaultProfile));
    notifyAuthListeners();
    return defaultProfile;
  }

  const nextRole = targetRole || (currentUserProfile.role === 'admin' ? 'user' : 'admin');
  currentUserProfile = {
    ...currentUserProfile,
    role: nextRole,
    assignedBrand: nextRole === 'admin' ? 'All' : (currentUserProfile.assignedBrand && currentUserProfile.assignedBrand !== 'All' ? currentUserProfile.assignedBrand : 'BYD'),
    assignedBrands: nextRole === 'admin' ? ['All'] : (currentUserProfile.assignedBrands || ['BYD']),
  };
  safeSetItem(LOCAL_USER_KEY, JSON.stringify(currentUserProfile));
  notifyAuthListeners();
  return currentUserProfile;
}

/**
 * Switch active brand for a user who has multiple assigned brands
 */
export function switchUserActiveBrand(brand: string): UserProfile | null {
  if (!currentUserProfile) return null;
  const allowed = currentUserProfile.assignedBrands || [currentUserProfile.assignedBrand || 'BYD'];
  if (currentUserProfile.role === 'admin' || allowed.includes('All') || allowed.includes(brand)) {
    currentUserProfile = {
      ...currentUserProfile,
      assignedBrand: brand,
    };
    safeSetItem(LOCAL_USER_KEY, JSON.stringify(currentUserProfile));
    notifyAuthListeners();
    return currentUserProfile;
  }
  return currentUserProfile;
}

/**
 * Re-evaluate role and assigned brand for the current active user when admin updates backend
 */
export function refreshCurrentUserRoleAndBrand(): void {
  if (!currentUserProfile?.email) return;
  const roleCheck = checkUserRoleByEmail(currentUserProfile.email);
  if (roleCheck.isKnown) {
    currentUserProfile = {
      ...currentUserProfile,
      role: roleCheck.role,
      assignedBrand: roleCheck.assignedBrand,
      assignedBrands: roleCheck.assignedBrands,
      displayName: roleCheck.displayName || currentUserProfile.displayName,
      organization: roleCheck.organization || currentUserProfile.organization,
    };
    safeSetItem(LOCAL_USER_KEY, JSON.stringify(currentUserProfile));
    notifyAuthListeners();
  }
}

export async function signOutUser(): Promise<void> {
  const { auth: fbAuth } = initFirebaseService();
  if (fbAuth) {
    try {
      await fbSignOut(fbAuth);
    } catch (e) {
      console.warn(e);
    }
  }
  currentUserProfile = null;
  safeRemoveItem(LOCAL_USER_KEY);
  notifyAuthListeners();
}

export function getCurrentUser(): UserProfile | null {
  return currentUserProfile;
}
