import { initFirebaseService } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  assignedBrand?: string; // Specific brand, or 'All'
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
    organization: 'Plan B Media / BYD Client',
    addedAt: '2026-09-01 09:00',
    addedBy: 'siriprapa.po@planbmedia.co.th',
    note: 'ลูกค้าแบรนด์ BYD (ล็อคสิทธิ์เฉพาะข้อมูลและคำขอของ BYD เท่านั้น)',
  },
  {
    id: 'user-client-pakawan-molten',
    email: 'pakawan.pl@planbmedia.co.th',
    name: 'pakawan.pl (Molten Client)',
    role: 'user',
    assignedBrand: 'Molten',
    organization: 'Plan B Media / Molten Client',
    addedAt: '2026-09-01 09:00',
    addedBy: 'siriprapa.po@planbmedia.co.th',
    note: 'ลูกค้าแบรนด์ Molten (ล็อคสิทธิ์เฉพาะข้อมูลและคำขอของ Molten เท่านั้น)',
  },
  {
    id: 'user-client-byd',
    email: 'client.byd@thaileague.com',
    name: 'client.byd (BYD Client)',
    role: 'user',
    assignedBrand: 'BYD',
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
    organization: 'Thai Beverage PLC',
    addedAt: '2026-08-15 10:30',
    addedBy: 'siriprapa.po@planbmedia.co.th',
    note: 'ลูกค้าแบรนด์เครื่องดื่มตราช้าง เข้าถึงเฉพาะข้อมูล Chang',
  },
];

function mergeUsersWithDefaults(existing: AuthorizedUser[]): AuthorizedUser[] {
  const map = new Map<string, AuthorizedUser>();
  existing.forEach(u => map.set(u.email.toLowerCase(), u));
  INITIAL_AUTHORIZED_USERS.forEach(def => {
    const key = def.email.toLowerCase();
    if (!map.has(key)) {
      map.set(key, def);
    } else {
      const curr = map.get(key)!;
      // Clean up previous placeholder Thai names if they matched the previous hardcoded defaults
      let updatedName = curr.name;
      if (
        curr.name.includes('ผกาพรรณ') || 
        curr.name.includes('ผภาพรรณ') || 
        curr.name.includes('ชิติพัทธ์') ||
        curr.name.includes('ศิริประภา โพธิ์ศิริ')
      ) {
        updatedName = def.name;
      }

      let updatedBrand = curr.assignedBrand;
      let updatedRole = curr.role;
      if (key === 'chitipat.ja@planbmedia.co.th' && (!curr.assignedBrand || curr.assignedBrand === 'All')) {
        updatedRole = 'user';
        updatedBrand = 'BYD';
      } else if (key === 'pakawan.pl@planbmedia.co.th' && (!curr.assignedBrand || curr.assignedBrand === 'All')) {
        updatedRole = 'user';
        updatedBrand = 'Molten';
      }
      map.set(key, { ...curr, name: updatedName, role: updatedRole, assignedBrand: updatedBrand });
    }
  });
  return Array.from(map.values());
}

let cachedUsers: AuthorizedUser[] = (() => {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return mergeUsersWithDefaults(parsed);
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

/**
 * Subscribe to user list changes
 */
export function subscribeToAuthorizedUsers(callback: UsersListener): () => void {
  listeners.add(callback);
  callback([...cachedUsers]);

  // Sync with Firestore
  const { db } = initFirebaseService();
  if (db) {
    getDoc(doc(db, 'thaileague_system_config', 'authorized_users'))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.users) && data.users.length > 0) {
            cachedUsers = data.users;
            localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(cachedUsers));
            notifyListeners();
          }
        }
      })
      .catch(err => {
        console.warn('Firestore users fetch issue:', err);
      });
  }

  return () => {
    listeners.delete(callback);
  };
}

/**
 * Save users list to LocalStorage & Firestore
 */
export async function saveAuthorizedUsers(users: AuthorizedUser[]): Promise<void> {
  cachedUsers = [...users];
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(cachedUsers));
  } catch (e) {
    console.error(e);
  }
  notifyListeners();

  const { db } = initFirebaseService();
  if (db) {
    try {
      await setDoc(doc(db, 'thaileague_system_config', 'authorized_users'), {
        users: cachedUsers,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      console.warn('Firestore user save fallback:', e);
    }
  }
}

/**
 * Add a new authorized user by Email & Role
 */
export async function addAuthorizedUser(input: {
  email: string;
  name?: string;
  role: 'admin' | 'user';
  assignedBrand?: string;
  organization?: string;
  note?: string;
  addedBy?: string;
}): Promise<{ success: boolean; message: string; user?: AuthorizedUser }> {
  const cleanEmail = input.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, message: 'กรุณาระบุ E-mail ที่ถูกต้อง' };
  }

  // Check if exists
  const existing = cachedUsers.find(u => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    return { success: false, message: `มีผู้ใช้งานอีเมล "${cleanEmail}" อยู่ในระบบแล้ว (${existing.role === 'admin' ? 'แอดมิน' : 'ลูกค้าแบรนด์'})` };
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');

  const newUser: AuthorizedUser = {
    id: `user-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    email: cleanEmail,
    name: input.name?.trim() || cleanEmail.split('@')[0],
    role: input.role,
    assignedBrand: input.role === 'admin' ? 'All' : (input.assignedBrand || 'BYD'),
    organization: input.organization?.trim() || (input.role === 'admin' ? 'Plan B Media / Thai League' : 'แบรนด์ผู้สนับสนุน'),
    note: input.note?.trim() || undefined,
    addedAt: dateStr,
    addedBy: input.addedBy || 'Admin',
  };

  const updated = [newUser, ...cachedUsers];
  await saveAuthorizedUsers(updated);
  return { 
    success: true, 
    message: `เพิ่มสิทธิ์ ${input.role === 'admin' ? 'แอดมิน (Admin)' : `ลูกค้าแบรนด์ (${input.assignedBrand})`} สำหรับอีเมล "${cleanEmail}" เรียบร้อยแล้ว`,
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

  const updatedUser = {
    ...cachedUsers[index],
    ...updates,
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
 * Check role and permissions by email
 */
export function checkUserRoleByEmail(email: string): {
  isKnown: boolean;
  role: 'admin' | 'user';
  assignedBrand: string;
  displayName?: string;
  organization?: string;
} {
  const cleanEmail = email.trim().toLowerCase();
  const matched = cachedUsers.find(u => u.email.toLowerCase() === cleanEmail);

  if (matched) {
    return {
      isKnown: true,
      role: matched.role,
      assignedBrand: matched.assignedBrand || (matched.role === 'admin' ? 'All' : 'BYD'),
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
      organization: cleanEmail.includes('planb') ? 'Plan B Media Co., Ltd.' : 'Thai League Co., Ltd.',
    };
  }

  // Default guest / regular brand user (Admin can assign brand later)
  return {
    isKnown: false,
    role: 'user',
    assignedBrand: 'BYD',
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

