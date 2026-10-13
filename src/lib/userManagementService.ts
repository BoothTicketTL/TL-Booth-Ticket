import { initFirebaseService } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  assignedBrand?: string; // Primary/active brand (for backward compatibility)
  assignedBrands?: string[]; // Array of assigned brands, e.g. ['BYD', 'Molten']
  organization?: string;
  addedAt: string;
  addedBy: string;
  note?: string;
}

const LOCAL_USERS_KEY = 'thaileague_system_authorized_users_v1';

export const INITIAL_AUTHORIZED_USERS: AuthorizedUser[] = [
  {
    id: 'user-planb-admin',
    email: 'siriprapa.po@planbmedia.co.th',
    name: 'siriprapa.po (Super Admin)',
    role: 'admin',
    assignedBrand: 'All',
    assignedBrands: ['All'],
    organization: 'Plan B Media Co., Ltd.',
    addedAt: '2026-08-01 09:00',
    addedBy: 'System',
    note: 'ผู้ดูแลระบบสูงสุด (Super Admin Plan B Media)',
  },
  {
    id: 'user-planb-naphaphach',
    email: 'naphaphach.ph@planbmedia.co.th',
    name: 'naphaphach.ph (Chang & เงินให้ใจ)',
    role: 'user',
    assignedBrand: 'Chang',
    assignedBrands: ['Chang', 'เงินให้ใจ'],
    organization: 'Plan B Media Co., Ltd.',
    addedAt: '2026-08-01 09:00',
    addedBy: 'System',
    note: 'ผู้ดูแลแบรนด์ Chang และ เงินให้ใจ',
  },
  {
    id: 'user-planb-pakawan',
    email: 'pakawan.pl@planbmedia.co.th',
    name: 'pakawan.pl (BYD & Molten)',
    role: 'user',
    assignedBrand: 'BYD',
    assignedBrands: ['BYD', 'Molten'],
    organization: 'Plan B Media Co., Ltd.',
    addedAt: '2026-08-01 09:00',
    addedBy: 'System',
    note: 'ผู้ดูแลแบรนด์ BYD และ Molten',
  },
];

/**
 * Filter out any unwanted dummy, mock, or auto-generated emails
 * Only real emails authorized by Admin should exist in the system
 */
export function isUnwantedDummyEmail(email?: string): boolean {
  if (!email) return true;
  const lower = email.toLowerCase().trim();
  return (
    lower.includes('@thaileague.com') ||
    lower.includes('@thaileague.co.th') ||
    lower.startsWith('client.') ||
    lower.includes('client.byd') ||
    lower.includes('client.chang') ||
    lower.includes('client.sponsor') ||
    lower.includes('example.com')
  );
}

/**
 * Strips undefined values so Firestore SDK never rejects setDoc with:
 * "Unsupported field value: undefined"
 */
function sanitizeUserForStorage(u: AuthorizedUser): Record<string, any> {
  const brands = Array.isArray(u.assignedBrands) && u.assignedBrands.length > 0 
    ? u.assignedBrands 
    : [u.assignedBrand || (u.role === 'admin' ? 'All' : 'BYD')];

  const cleaned: Record<string, any> = {
    id: u.id || `user-${Date.now().toString(36)}`,
    email: (u.email || '').trim().toLowerCase(),
    name: u.name || (u.email || '').split('@')[0],
    role: u.role || 'user',
    assignedBrand: u.assignedBrand || brands[0] || (u.role === 'admin' ? 'All' : 'BYD'),
    assignedBrands: brands,
    addedAt: u.addedAt || new Date().toISOString().slice(0, 16).replace('T', ' '),
    addedBy: u.addedBy || 'Admin',
  };
  if (u.organization) cleaned.organization = u.organization;
  if (u.note) cleaned.note = u.note;
  return cleaned;
}

let cachedUsers: AuthorizedUser[] = (() => {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out unwanted dummy accounts from existing storage
        const filtered = parsed.filter((u: any) => !isUnwantedDummyEmail(u?.email));
        // Always guarantee Super Admin is present
        if (!filtered.some((u: any) => u?.email?.toLowerCase() === 'siriprapa.po@planbmedia.co.th')) {
          filtered.unshift(INITIAL_AUTHORIZED_USERS[0]);
        }
        return filtered;
      }
    }
  } catch (e) {
    console.error('Failed to load users from localStorage:', e);
  }
  return [...INITIAL_AUTHORIZED_USERS];
})();

type UsersListener = (users: AuthorizedUser[]) => void;
const listeners: Set<UsersListener> = new Set();

function notifyListeners() {
  listeners.forEach(cb => {
    try {
      cb([...cachedUsers]);
    } catch (e) {
      console.error(e);
    }
  });
}

/**
 * Get all authorized users
 */
export function getAuthorizedUsers(): AuthorizedUser[] {
  return [...cachedUsers];
}

let isUsersListenerInitialized = false;

/**
 * Subscribe to user list changes with real-time Firestore sync
 */
export function subscribeToAuthorizedUsers(callback: UsersListener): () => void {
  listeners.add(callback);
  callback([...cachedUsers]);

  if (!isUsersListenerInitialized && typeof window !== 'undefined') {
    isUsersListenerInitialized = true;
    const { db } = initFirebaseService();
    if (db) {
      try {
        const docRef = doc(db, 'thaileague_system_config', 'authorized_users');
        onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (Array.isArray(data.users)) {
              // Filter out any legacy dummy emails
              const cleaned = data.users.filter((u: any) => !isUnwantedDummyEmail(u?.email));
              // Guarantee Super Admin
              if (!cleaned.some((u: any) => u?.email?.toLowerCase() === 'siriprapa.po@planbmedia.co.th')) {
                cleaned.unshift(INITIAL_AUTHORIZED_USERS[0]);
              }
              // If there were dummy emails in Firestore, scrub them immediately
              if (cleaned.length !== data.users.length) {
                setDoc(docRef, {
                  users: cleaned.map(sanitizeUserForStorage),
                  updatedAt: new Date().toISOString(),
                }).catch(() => {});
              }
              cachedUsers = cleaned;
              try {
                localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(cachedUsers));
              } catch (e) {}
              notifyListeners();
            }
          }
        }, (err) => {
          console.warn('Firestore users onSnapshot issue:', err);
        });
      } catch (e) {
        console.warn('Firestore real-time users setup skipped:', e);
      }
    }

    // Also background fetch from server API
    if (typeof fetch !== 'undefined') {
      fetch('/api/authorized-users')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (Array.isArray(data?.users) && data.users.length > 0) {
            const cleaned = data.users.filter((u: any) => !isUnwantedDummyEmail(u?.email));
            if (!cleaned.some((u: any) => u?.email?.toLowerCase() === 'siriprapa.po@planbmedia.co.th')) {
              cleaned.unshift(INITIAL_AUTHORIZED_USERS[0]);
            }
            cachedUsers = cleaned;
            try {
              localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(cachedUsers));
            } catch (e) {}
            notifyListeners();
          }
        })
        .catch(() => {});
    }
  }

  return () => {
    listeners.delete(callback);
  };
}

/**
 * Save users list to LocalStorage, Cloud Firestore & Server API
 * Strictly replaces list — never resurrects deleted users!
 */
export async function saveAuthorizedUsers(users: AuthorizedUser[]): Promise<void> {
  // Clean dummy accounts
  const cleaned = users.filter(u => !isUnwantedDummyEmail(u?.email));

  // Guarantee Super Admin siriprapa.po is never lost
  if (!cleaned.some(u => u.email.toLowerCase().trim() === 'siriprapa.po@planbmedia.co.th')) {
    const superAdmin = INITIAL_AUTHORIZED_USERS.find(u => u.email === 'siriprapa.po@planbmedia.co.th');
    if (superAdmin) cleaned.unshift(superAdmin);
  }

  // Set directly to cachedUsers
  cachedUsers = [...cleaned];
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(cachedUsers));
  } catch (e) {
    console.error(e);
  }
  notifyListeners();

  const sanitized = cachedUsers.map(sanitizeUserForStorage);

  // Firestore save - REPLACE document (so deleted users don't remain)
  const { db } = initFirebaseService();
  if (db) {
    try {
      await setDoc(doc(db, 'thaileague_system_config', 'authorized_users'), {
        users: sanitized,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Firestore user save fallback:', e);
    }
  }

  // Server API backup save - REPLACE
  if (typeof fetch !== 'undefined') {
    try {
      fetch('/api/authorized-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: sanitized, replace: true }),
      }).catch(() => {});
    } catch (e) {}
  }
}

/**
 * Add a new authorized user by Email, Role & Brands
 */
export async function addAuthorizedUser(input: {
  email: string;
  name?: string;
  role: 'admin' | 'user';
  assignedBrand?: string;
  assignedBrands?: string[];
  organization?: string;
  note?: string;
  addedBy?: string;
}): Promise<{ success: boolean; message: string; user?: AuthorizedUser }> {
  const cleanEmail = input.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, message: 'กรุณาระบุ E-mail ที่ถูกต้อง' };
  }

  // Determine brands
  let targetBrands: string[] = [];
  if (input.role === 'admin') {
    targetBrands = ['All'];
  } else if (Array.isArray(input.assignedBrands) && input.assignedBrands.length > 0) {
    targetBrands = input.assignedBrands;
  } else if (input.assignedBrand) {
    targetBrands = [input.assignedBrand];
  } else {
    targetBrands = ['BYD'];
  }

  const primaryBrand = targetBrands[0] || 'BYD';
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');

  // Check if user already exists -> update their permissions instead of rejecting
  const existingIndex = cachedUsers.findIndex(u => u.email.toLowerCase() === cleanEmail);
  if (existingIndex >= 0) {
    const existing = cachedUsers[existingIndex];
    const updatedUser: AuthorizedUser = {
      ...existing,
      name: input.name?.trim() || existing.name,
      role: input.role,
      assignedBrand: primaryBrand,
      assignedBrands: targetBrands,
      organization: input.organization?.trim() || existing.organization,
      note: input.note?.trim() || existing.note,
    };
    const updated = [...cachedUsers];
    updated[existingIndex] = updatedUser;
    await saveAuthorizedUsers(updated);
    return {
      success: true,
      message: `อัปเดตสิทธิ์ ${input.role === 'admin' ? 'แอดมิน' : `ลูกค้าแบรนด์ (${targetBrands.join(', ')})`} สำหรับ "${cleanEmail}" เรียบร้อยแล้ว`,
      user: updatedUser,
    };
  }

  const newUser: AuthorizedUser = {
    id: `user-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    email: cleanEmail,
    name: input.name?.trim() || cleanEmail.split('@')[0],
    role: input.role,
    assignedBrand: primaryBrand,
    assignedBrands: targetBrands,
    organization: input.organization?.trim() || (input.role === 'admin' ? 'Plan B Media / Thai League' : `แบรนด์ ${targetBrands.join(', ')}`),
    note: input.note?.trim() || undefined,
    addedAt: dateStr,
    addedBy: input.addedBy || 'Admin',
  };

  const updated = [newUser, ...cachedUsers];
  await saveAuthorizedUsers(updated);
  return { 
    success: true, 
    message: `เพิ่มสิทธิ์ ${input.role === 'admin' ? 'แอดมิน (Admin)' : `ลูกค้าแบรนด์ (${targetBrands.join(', ')})`} สำหรับอีเมล "${cleanEmail}" เรียบร้อยแล้ว`,
    user: newUser
  };
}

/**
 * Update an authorized user
 */
export async function updateAuthorizedUser(
  id: string,
  updates: Partial<AuthorizedUser>
): Promise<{ success: boolean; message: string }> {
  const index = cachedUsers.findIndex(u => u.id === id);
  if (index === -1) {
    return { success: false, message: 'ไม่พบผู้ใช้งานที่ต้องการแก้ไข' };
  }

  const current = cachedUsers[index];
  let updatedBrands = updates.assignedBrands || current.assignedBrands;
  if (!updatedBrands && updates.assignedBrand) {
    updatedBrands = [updates.assignedBrand];
  }

  const updatedUser: AuthorizedUser = {
    ...current,
    ...updates,
    assignedBrands: updatedBrands,
    assignedBrand: updates.assignedBrand || (updatedBrands && updatedBrands[0]) || current.assignedBrand,
  };

  const updatedList = [...cachedUsers];
  updatedList[index] = updatedUser;
  await saveAuthorizedUsers(updatedList);
  return { success: true, message: `อัปเดตข้อมูลสำหรับ "${updatedUser.email}" สำเร็จ` };
}

/**
 * Reset/Sanitize all user display names to clean English (based on email)
 */
export async function resetAllNamesToCleanEnglish(): Promise<{ success: boolean; message: string }> {
  const updated = cachedUsers.map(u => {
    const defaultItem = INITIAL_AUTHORIZED_USERS.find(d => d.email.toLowerCase() === u.email.toLowerCase());
    if (defaultItem) {
      return {
        ...u,
        name: defaultItem.name,
      };
    }
    return {
      ...u,
      name: u.email.split('@')[0],
    };
  });
  await saveAuthorizedUsers(updated);
  return { success: true, message: 'ปรับชื่อผู้ใช้งานทั้งหมดเป็นชื่อภาษาอังกฤษตาม Email เรียบร้อยแล้ว' };
}

/**
 * Delete an authorized user (by id or email)
 * Strictly removes user and syncs to storage & Firestore so user is never restored
 */
export async function deleteAuthorizedUser(idOrEmail: string): Promise<{ success: boolean; message: string }> {
  if (!idOrEmail) {
    return { success: false, message: 'กรุณาระบุผู้ใช้งานที่ต้องการลบ' };
  }
  const cleanKey = idOrEmail.toLowerCase().trim();
  const target = cachedUsers.find(u => u.id === idOrEmail || u.email.toLowerCase().trim() === cleanKey);
  if (!target) {
    return { success: false, message: 'ไม่พบผู้ใช้งานที่ต้องการลบในระบบ' };
  }

  const cleanTargetEmail = target.email.toLowerCase().trim();
  if (cleanTargetEmail === 'siriprapa.po@planbmedia.co.th') {
    return { success: false, message: 'ไม่สามารถลบ Super Admin หลักของระบบ (siriprapa.po@planbmedia.co.th) ได้' };
  }

  // Filter out the target strictly by both ID and Email
  const updated = cachedUsers.filter(u => u.id !== target.id && u.email.toLowerCase().trim() !== cleanTargetEmail);
  await saveAuthorizedUsers(updated);
  return { success: true, message: `ลบสิทธิ์ผู้ใช้งาน "${target.email}" ออกจากระบบเรียบร้อยแล้ว` };
}

/**
 * Check role and permissions by email (supports multiple brands)
 */
export function checkUserRoleByEmail(email: string): {
  isKnown: boolean;
  role: 'admin' | 'user';
  assignedBrand: string;
  assignedBrands: string[];
  displayName?: string;
  organization?: string;
} {
  const cleanEmail = email.trim().toLowerCase();
  const matched = cachedUsers.find(u => u.email.toLowerCase() === cleanEmail) 
    || INITIAL_AUTHORIZED_USERS.find(u => u.email.toLowerCase() === cleanEmail);

  if (matched) {
    const brands = Array.isArray(matched.assignedBrands) && matched.assignedBrands.length > 0
      ? matched.assignedBrands
      : [matched.assignedBrand || (matched.role === 'admin' ? 'All' : 'BYD')];

    return {
      isKnown: true,
      role: matched.role,
      assignedBrand: matched.assignedBrand || brands[0] || 'BYD',
      assignedBrands: matched.role === 'admin' ? ['All'] : brands,
      displayName: matched.name,
      organization: matched.organization,
    };
  }

  // Super Admin Plan B Media
  if (cleanEmail === 'siriprapa.po@planbmedia.co.th') {
    return {
      isKnown: true,
      role: 'admin',
      assignedBrand: 'All',
      assignedBrands: ['All'],
      organization: 'Plan B Media Co., Ltd.',
    };
  }

  // Default guest / regular brand user
  return {
    isKnown: false,
    role: 'user',
    assignedBrand: 'BYD',
    assignedBrands: ['BYD'],
    displayName: cleanEmail.split('@')[0],
    organization: cleanEmail.endsWith('@planbmedia.co.th') ? 'Plan B Media Co., Ltd.' : 'ผู้แทนแบรนด์ผู้สนับสนุน',
  };
}

/**
 * Strict check if an email is registered in user management
 */
export function findAuthorizedUserByEmail(email?: string): AuthorizedUser | null {
  if (!email || !email.trim()) return null;
  const cleanEmail = email.trim().toLowerCase();
  return cachedUsers.find(u => u.email.toLowerCase() === cleanEmail) || null;
}

export function isEmailAuthorized(email?: string): boolean {
  if (!email || !email.trim()) return false;
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail === 'siriprapa.po@planbmedia.co.th') {
    return true;
  }
  return cachedUsers.some(u => u.email.toLowerCase() === cleanEmail);
}

