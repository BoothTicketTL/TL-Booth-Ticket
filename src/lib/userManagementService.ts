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
    id: 'user-tleague-admin',
    email: 'admin@thaileague.co.th',
    name: 'admin@thaileague.co.th (Thai League Admin)',
    role: 'admin',
    assignedBrand: 'All',
    assignedBrands: ['All'],
    organization: 'Thai League Co., Ltd.',
    addedAt: '2026-08-01 09:00',
    addedBy: 'System',
    note: 'แอดมินสมาคม / ฝ่ายจัดการแข่งขัน',
  },
  {
    id: 'user-client-chitipat-byd',
    email: 'chitipat.ja@planbmedia.co.th',
    name: 'chitipat.ja (BYD Client)',
    role: 'user',
    assignedBrand: 'BYD',
    assignedBrands: ['BYD'],
    organization: 'Plan B Media / BYD Client',
    addedAt: '2026-09-01 09:00',
    addedBy: 'siriprapa.po@planbmedia.co.th',
    note: 'ลูกค้าแบรนด์ BYD (ล็อคสิทธิ์เฉพาะข้อมูลและคำขอของ BYD เท่านั้น)',
  },
  {
    id: 'user-client-pakawan-molten',
    email: 'pakawan.pl@planbmedia.co.th',
    name: 'pakawan.pl (BYD & Molten Client)',
    role: 'user',
    assignedBrand: 'BYD',
    assignedBrands: ['BYD', 'Molten'],
    organization: 'Plan B Media / Brand Client',
    addedAt: '2026-09-01 09:00',
    addedBy: 'siriprapa.po@planbmedia.co.th',
    note: 'ลูกค้าแบรนด์ BYD และ Molten (ล็อคสิทธิ์เฉพาะข้อมูลและคำขอของ BYD และ Molten)',
  },
  {
    id: 'user-client-byd',
    email: 'client.byd@thaileague.com',
    name: 'client.byd (BYD Client)',
    role: 'user',
    assignedBrand: 'BYD',
    assignedBrands: ['BYD'],
    organization: 'BYD Rever Automotive',
    addedAt: '2026-08-15 10:30',
    addedBy: 'siriprapa.po@planbmedia.co.th',
    note: 'ลูกค้าแบรนด์ BYD เข้าถึงเฉพาะข้อมูล BYD',
  },
  {
    id: 'user-client-chang',
    email: 'client.chang@thaileague.com',
    name: 'client.chang (Chang Client)',
    role: 'user',
    assignedBrand: 'Chang',
    assignedBrands: ['Chang'],
    organization: 'Thai Beverage PLC',
    addedAt: '2026-08-15 10:30',
    addedBy: 'siriprapa.po@planbmedia.co.th',
    note: 'ลูกค้าแบรนด์เครื่องดื่มตราช้าง เข้าถึงเฉพาะข้อมูล Chang',
  },
];

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

function combineUserLists(incoming: AuthorizedUser[], existing: AuthorizedUser[]): AuthorizedUser[] {
  const map = new Map<string, AuthorizedUser>();

  // 1. Put existing cached users first
  existing.forEach(u => {
    if (u?.email) {
      const key = u.email.trim().toLowerCase();
      const brands = Array.isArray(u.assignedBrands) && u.assignedBrands.length > 0
        ? u.assignedBrands
        : [u.assignedBrand || (u.role === 'admin' ? 'All' : 'BYD')];
      map.set(key, {
        ...u,
        assignedBrands: brands,
        assignedBrand: u.assignedBrand || brands[0],
      });
    }
  });

  // 2. Merge incoming (from Firestore or server API)
  incoming.forEach(u => {
    if (u?.email) {
      const key = u.email.trim().toLowerCase();
      const prev = map.get(key);
      const brands = Array.isArray(u.assignedBrands) && u.assignedBrands.length > 0
        ? u.assignedBrands
        : (prev?.assignedBrands || [u.assignedBrand || prev?.assignedBrand || (u.role === 'admin' ? 'All' : 'BYD')]);

      map.set(key, {
        ...(prev || {}),
        ...u,
        assignedBrands: brands,
        assignedBrand: u.assignedBrand || brands[0],
      });
    }
  });

  // 3. Guarantee system initial users exist with clean preset data
  INITIAL_AUTHORIZED_USERS.forEach(def => {
    const key = def.email.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, def);
    } else {
      const curr = map.get(key)!;
      // Guarantee pakawan.pl has both BYD and Molten
      if (key === 'pakawan.pl@planbmedia.co.th') {
        let brands = curr.assignedBrands || ['BYD', 'Molten'];
        if (!brands.includes('BYD')) brands = ['BYD', ...brands];
        if (!brands.includes('Molten')) brands = [...brands, 'Molten'];
        map.set(key, {
          ...curr,
          role: 'user',
          assignedBrands: brands,
          assignedBrand: curr.assignedBrand || 'BYD',
        });
      }
    }
  });

  return Array.from(map.values());
}

function mergeUsersWithDefaults(existing: AuthorizedUser[]): AuthorizedUser[] {
  return combineUserLists(existing, INITIAL_AUTHORIZED_USERS);
}

let cachedUsers: AuthorizedUser[] = (() => {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return combineUserLists(parsed, INITIAL_AUTHORIZED_USERS);
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
            if (Array.isArray(data.users) && data.users.length > 0) {
              const merged = combineUserLists(data.users, cachedUsers);
              cachedUsers = merged;
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
            const merged = combineUserLists(data.users, cachedUsers);
            cachedUsers = merged;
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
 */
export async function saveAuthorizedUsers(users: AuthorizedUser[]): Promise<void> {
  cachedUsers = combineUserLists(users, cachedUsers);
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(cachedUsers));
  } catch (e) {
    console.error(e);
  }
  notifyListeners();

  const sanitized = cachedUsers.map(sanitizeUserForStorage);

  // Firestore save
  const { db } = initFirebaseService();
  if (db) {
    try {
      await setDoc(doc(db, 'thaileague_system_config', 'authorized_users'), {
        users: sanitized,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      console.warn('Firestore user save fallback:', e);
    }
  }

  // Server API backup save
  if (typeof fetch !== 'undefined') {
    try {
      fetch('/api/authorized-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: sanitized }),
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
 * Delete an authorized user
 */
export async function deleteAuthorizedUser(id: string): Promise<{ success: boolean; message: string }> {
  const target = cachedUsers.find(u => u.id === id);
  if (target?.email === 'siriprapa.po@planbmedia.co.th') {
    return { success: false, message: 'ไม่สามารถลบ Super Admin หลักของระบบได้' };
  }

  const updated = cachedUsers.filter(u => u.id !== id);
  await saveAuthorizedUsers(updated);
  return { success: true, message: `ลบสิทธิ์ผู้ใช้งาน "${target?.email || id}" เรียบร้อยแล้ว` };
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
  const matched = cachedUsers.find(u => u.email.toLowerCase() === cleanEmail);

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

  // Super Admin Plan B Media & Thai League
  if (cleanEmail === 'siriprapa.po@planbmedia.co.th' || cleanEmail === 'admin@thaileague.co.th') {
    return {
      isKnown: true,
      role: 'admin',
      assignedBrand: 'All',
      assignedBrands: ['All'],
      organization: cleanEmail.includes('planb') ? 'Plan B Media Co., Ltd.' : 'Thai League Co., Ltd.',
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
  if (cleanEmail === 'siriprapa.po@planbmedia.co.th' || cleanEmail === 'admin@thaileague.co.th') {
    return true;
  }
  return cachedUsers.some(u => u.email.toLowerCase() === cleanEmail);
}

