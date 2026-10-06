import { BrandType, LeagueType, RegistrationRecord } from '../types';
import { initFirebaseService } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface SponsorBrandItem {
  id: string;
  name: string;
  color: string;
  badgeClass: string;
  logoText: string;
  isCustom?: boolean;

  // League permissions for Booth request
  allowedBoothLeagues: LeagueType[];

  // League permissions for Ticket request
  allowedTicketLeagues: LeagueType[];

  // Season Quotas
  seasonTicketQuotaMatches: number; // โควต้าการรับบัตรทั้งฤดูกาล (จำนวนครั้ง)
  seasonTicketQuotaTotalTickets?: number; // โควต้าจำนวนบัตรรวมทั้งฤดูกาล (ใบ)
  maxTicketsPerMatch?: number; // จำนวนบัตรสูงสุดต่อครั้ง (ใบ)
  maxTicketsPerMatchByLeague?: Partial<Record<LeagueType, number>>; // เพดานรับบัตรแยกตามลีก (เช่น League 1: 50, League 2: 100)
  seasonBoothQuotaMatches?: number; // โควต้าการออกบูธทั้งฤดูกาล (จำนวนครั้ง)
}

export const ALL_LEAGUES: LeagueType[] = ['League 1', 'League 2', 'League 3'];

export const DEFAULT_SPONSOR_BRANDS: SponsorBrandItem[] = [
  {
    id: 'BYD',
    name: 'BYD (บีวายดี รถยนต์พลังงานไฟฟ้า)',
    color: '#0284c7',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    logoText: 'BYD',
    allowedBoothLeagues: ['League 1', 'League 2', 'League 3'],
    allowedTicketLeagues: ['League 1', 'League 2', 'League 3'],
    seasonTicketQuotaMatches: 25,
    seasonTicketQuotaTotalTickets: 500,
    maxTicketsPerMatch: 50,
    seasonBoothQuotaMatches: 15,
  },
  {
    id: 'Chang',
    name: 'Chang (เครื่องดื่มตราช้าง)',
    color: '#059669',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    logoText: 'CHANG',
    allowedBoothLeagues: ['League 1', 'League 2', 'League 3'],
    allowedTicketLeagues: ['League 1', 'League 2', 'League 3'],
    seasonTicketQuotaMatches: 30,
    seasonTicketQuotaTotalTickets: 600,
    maxTicketsPerMatch: 50,
    seasonBoothQuotaMatches: 20,
  },
  {
    id: 'Castrol',
    name: 'Castrol (น้ำมันเครื่องคาสตรอล)',
    color: '#16a34a',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
    logoText: 'CASTROL',
    // Castrol ไม่มีสิทธิ์ออกบูธและรับบัตรใน Thai League 3 ตามข้อกำหนดสัญญา
    allowedBoothLeagues: ['League 1', 'League 2'],
    allowedTicketLeagues: ['League 1', 'League 2'],
    seasonTicketQuotaMatches: 15,
    seasonTicketQuotaTotalTickets: 300,
    maxTicketsPerMatch: 50,
    maxTicketsPerMatchByLeague: {
      'League 1': 50,
      'League 2': 100,
    },
    // โควต้าออกบูธของ Thai League 1 และ Thai League 2 รวมกันได้ 15 ครั้ง
    seasonBoothQuotaMatches: 15,
  },
  {
    id: 'Coke',
    name: 'Coke (โคคา-โคล่า)',
    color: '#dc2626',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    logoText: 'COKE',
    allowedBoothLeagues: ['League 1', 'League 2', 'League 3'],
    allowedTicketLeagues: ['League 1', 'League 2', 'League 3'],
    seasonTicketQuotaMatches: 20,
    seasonTicketQuotaTotalTickets: 400,
    maxTicketsPerMatch: 50,
    seasonBoothQuotaMatches: 12,
  },
  {
    id: 'Molten',
    name: 'Molten (ลูกฟุตบอลมอลเทน)',
    color: '#d97706',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    logoText: 'MOLTEN',
    allowedBoothLeagues: ['League 1', 'League 2', 'League 3'],
    allowedTicketLeagues: ['League 1', 'League 2', 'League 3'],
    seasonTicketQuotaMatches: 20,
    seasonTicketQuotaTotalTickets: 400,
    maxTicketsPerMatch: 30,
    seasonBoothQuotaMatches: 10,
  },
  {
    id: 'เงินให้ใจ',
    name: 'เงินให้ใจ (สินเชื่อเงินให้ใจ)',
    color: '#7c3aed',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    logoText: 'เงินให้ใจ',
    allowedBoothLeagues: ['League 1', 'League 2', 'League 3'],
    allowedTicketLeagues: ['League 1', 'League 2', 'League 3'],
    seasonTicketQuotaMatches: 20,
    seasonTicketQuotaTotalTickets: 400,
    maxTicketsPerMatch: 50,
    seasonBoothQuotaMatches: 12,
  },
];

export function normalizeBrandItem(b: any): SponsorBrandItem {
  const def = DEFAULT_SPONSOR_BRANDS.find(d => d.id.toLowerCase() === (b.id || '').toLowerCase());
  const isCastrol = (b.id || '').toLowerCase() === 'castrol';
  const defaultLeagues: LeagueType[] = isCastrol ? ['League 1', 'League 2'] : ['League 1', 'League 2', 'League 3'];

  return {
    id: b.id,
    name: b.name || def?.name || b.id,
    color: b.color || def?.color || '#0284c7',
    badgeClass: b.badgeClass || def?.badgeClass || 'bg-slate-100 text-slate-800 border-slate-300',
    logoText: b.logoText || def?.logoText || (b.id || '').toUpperCase(),
    isCustom: b.isCustom ?? def?.isCustom ?? false,
    allowedBoothLeagues: Array.isArray(b.allowedBoothLeagues) && b.allowedBoothLeagues.length > 0
      ? (isCastrol ? b.allowedBoothLeagues.filter((l: string) => l !== 'League 3') : b.allowedBoothLeagues)
      : (def?.allowedBoothLeagues || defaultLeagues),
    allowedTicketLeagues: Array.isArray(b.allowedTicketLeagues) && b.allowedTicketLeagues.length > 0
      ? (isCastrol ? b.allowedTicketLeagues.filter((l: string) => l !== 'League 3') : b.allowedTicketLeagues)
      : (def?.allowedTicketLeagues || defaultLeagues),
    seasonTicketQuotaMatches: typeof b.seasonTicketQuotaMatches === 'number' 
      ? b.seasonTicketQuotaMatches 
      : (def?.seasonTicketQuotaMatches ?? (isCastrol ? 15 : 20)),
    seasonTicketQuotaTotalTickets: typeof b.seasonTicketQuotaTotalTickets === 'number'
      ? b.seasonTicketQuotaTotalTickets
      : (def?.seasonTicketQuotaTotalTickets ?? 400),
    maxTicketsPerMatch: typeof b.maxTicketsPerMatch === 'number'
      ? (isCastrol && b.maxTicketsPerMatch === 30 ? 50 : b.maxTicketsPerMatch)
      : (def?.maxTicketsPerMatch ?? 50),
    maxTicketsPerMatchByLeague: (b.maxTicketsPerMatchByLeague && typeof b.maxTicketsPerMatchByLeague === 'object')
      ? {
          'League 1': typeof b.maxTicketsPerMatchByLeague['League 1'] === 'number' ? b.maxTicketsPerMatchByLeague['League 1'] : (def?.maxTicketsPerMatchByLeague?.['League 1']),
          'League 2': typeof b.maxTicketsPerMatchByLeague['League 2'] === 'number' ? b.maxTicketsPerMatchByLeague['League 2'] : (def?.maxTicketsPerMatchByLeague?.['League 2']),
          'League 3': typeof b.maxTicketsPerMatchByLeague['League 3'] === 'number' ? b.maxTicketsPerMatchByLeague['League 3'] : (def?.maxTicketsPerMatchByLeague?.['League 3']),
        }
      : (def?.maxTicketsPerMatchByLeague || (isCastrol ? { 'League 1': 50, 'League 2': 100 } : undefined)),
    seasonBoothQuotaMatches: typeof b.seasonBoothQuotaMatches === 'number'
      ? (isCastrol && b.seasonBoothQuotaMatches === 10 ? 15 : b.seasonBoothQuotaMatches)
      : (def?.seasonBoothQuotaMatches ?? (isCastrol ? 15 : 15)),
  };
}

const LOCAL_BRANDS_KEY = 'thaileague_system_sponsor_brands_v2';

let cachedBrands: SponsorBrandItem[] = (() => {
  try {
    const raw = localStorage.getItem(LOCAL_BRANDS_KEY) || localStorage.getItem('thaileague_system_sponsor_brands_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeBrandItem);
      }
    }
  } catch (e) {
    console.error('Failed to load brands from localStorage:', e);
  }
  return [...DEFAULT_SPONSOR_BRANDS];
})();

type BrandsListener = (brands: SponsorBrandItem[]) => void;
const listeners: Set<BrandsListener> = new Set();

function notifyListeners() {
  listeners.forEach(cb => {
    try {
      cb([...cachedBrands]);
    } catch (e) {
      console.error(e);
    }
  });
}

/**
 * Get current list of sponsor brands
 */
export function getSponsorBrands(): SponsorBrandItem[] {
  return [...cachedBrands];
}

/**
 * Subscribe to sponsor brand changes
 */
export function subscribeToBrands(callback: BrandsListener): () => void {
  listeners.add(callback);
  callback([...cachedBrands]);

  // Lazy sync with Firestore
  const { db } = initFirebaseService();
  if (db) {
    getDoc(doc(db, 'thaileague_system_config', 'brands_config'))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.brands) && data.brands.length > 0) {
            cachedBrands = data.brands;
            localStorage.setItem(LOCAL_BRANDS_KEY, JSON.stringify(cachedBrands));
            notifyListeners();
          }
        }
      })
      .catch(err => {
        console.warn('Firestore brands fetch issue:', err);
      });
  }

  return () => {
    listeners.delete(callback);
  };
}

/**
 * Save and persist sponsor brands
 */
export async function saveSponsorBrands(brands: SponsorBrandItem[]): Promise<void> {
  cachedBrands = [...brands];
  try {
    localStorage.setItem(LOCAL_BRANDS_KEY, JSON.stringify(cachedBrands));
  } catch (e) {
    console.error(e);
  }
  notifyListeners();

  const { db } = initFirebaseService();
  if (db) {
    try {
      await setDoc(doc(db, 'thaileague_system_config', 'brands_config'), {
        brands: cachedBrands,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      console.warn('Firestore brand save fallback:', e);
    }
  }
}

/**
 * Add a new sponsor brand
 */
export async function addSponsorBrand(newBrand: {
  id: string;
  name: string;
  color?: string;
  badgeClass?: string;
  logoText?: string;
}): Promise<{ success: boolean; message: string }> {
  const cleanId = newBrand.id.trim();
  if (!cleanId) {
    return { success: false, message: 'กรุณาระบุรหัสหรือชื่อแบรนด์' };
  }

  // Check duplicate
  const exists = cachedBrands.some(b => b.id.toLowerCase() === cleanId.toLowerCase());
  if (exists) {
    return { success: false, message: `มีแบรนด์ "${cleanId}" ในระบบอยู่แล้ว` };
  }

  const color = newBrand.color || '#0284c7';
  const brandItem: SponsorBrandItem = {
    id: cleanId,
    name: newBrand.name.trim() || cleanId,
    color,
    badgeClass: newBrand.badgeClass || 'bg-slate-100 text-slate-800 border-slate-300',
    logoText: newBrand.logoText?.trim() || cleanId.toUpperCase(),
    isCustom: true,
    allowedBoothLeagues: (newBrand as any).allowedBoothLeagues || ['League 1', 'League 2', 'League 3'],
    allowedTicketLeagues: (newBrand as any).allowedTicketLeagues || ['League 1', 'League 2', 'League 3'],
    seasonTicketQuotaMatches: (newBrand as any).seasonTicketQuotaMatches ?? 20,
    seasonTicketQuotaTotalTickets: (newBrand as any).seasonTicketQuotaTotalTickets ?? 400,
    maxTicketsPerMatch: (newBrand as any).maxTicketsPerMatch ?? 50,
    maxTicketsPerMatchByLeague: (newBrand as any).maxTicketsPerMatchByLeague,
    seasonBoothQuotaMatches: (newBrand as any).seasonBoothQuotaMatches,
  };

  const updated = [...cachedBrands, brandItem];
  await saveSponsorBrands(updated);
  return { success: true, message: `เพิ่มแบรนด์ "${cleanId}" เรียบร้อยแล้ว` };
}

/**
 * Check if a brand is allowed to request Booth for a given league
 */
export function isBrandAllowedForBooth(brandId: string, league: LeagueType): boolean {
  if (!brandId || brandId === 'All') return true;
  const brand = getSponsorBrands().find(b => b.id.toLowerCase() === brandId.toLowerCase());
  if (!brand) return true;
  return brand.allowedBoothLeagues ? brand.allowedBoothLeagues.includes(league) : true;
}

/**
 * Check if a brand is allowed to request Tickets for a given league
 */
export function isBrandAllowedForTickets(brandId: string, league: LeagueType): boolean {
  if (!brandId || brandId === 'All') return true;
  const brand = getSponsorBrands().find(b => b.id.toLowerCase() === brandId.toLowerCase());
  if (!brand) return true;
  return brand.allowedTicketLeagues ? brand.allowedTicketLeagues.includes(league) : true;
}

/**
 * Get maximum tickets per match for a specific league
 */
export function getMaxTicketsPerMatchForLeague(brand: SponsorBrandItem | undefined, league: LeagueType): number {
  if (!brand) return 50;
  if (
    brand.maxTicketsPerMatchByLeague &&
    typeof brand.maxTicketsPerMatchByLeague[league] === 'number' &&
    brand.maxTicketsPerMatchByLeague[league]! > 0
  ) {
    return brand.maxTicketsPerMatchByLeague[league]!;
  }
  return brand.maxTicketsPerMatch ?? 50;
}

/**
 * Format ticket quota ceiling description (handles per-league caps)
 */
export function formatMaxTicketsPerMatch(brand: SponsorBrandItem | undefined): string {
  if (!brand) return '50 ใบ/แมตช์';

  if (brand.maxTicketsPerMatchByLeague) {
    const parts: string[] = [];
    const t1 = brand.maxTicketsPerMatchByLeague['League 1'];
    const t2 = brand.maxTicketsPerMatchByLeague['League 2'];
    const t3 = brand.maxTicketsPerMatchByLeague['League 3'];

    const hasT1 = typeof t1 === 'number' && brand.allowedTicketLeagues.includes('League 1');
    const hasT2 = typeof t2 === 'number' && brand.allowedTicketLeagues.includes('League 2');
    const hasT3 = typeof t3 === 'number' && brand.allowedTicketLeagues.includes('League 3');

    if (hasT1) parts.push(`T1: ${t1} ใบ`);
    if (hasT2) parts.push(`T2: ${t2} ใบ`);
    if (hasT3) parts.push(`T3: ${t3} ใบ`);

    if (parts.length > 0) {
      return parts.join(' | ') + '/นัด';
    }
  }

  return `${brand.maxTicketsPerMatch ?? 50} ใบ/แมตช์`;
}

export interface BrandQuotaUsage {
  brandId: string;
  season: string;
  
  // Ticket quota
  quotaTicketMatches: number; // โควต้าครั้งที่ขอรับบัตรได้ทั้งฤดูกาล
  usedTicketMatches: number;  // ใช้ไปแล้วกี่ครั้ง
  remainingTicketMatches: number; // เหลืออีกกี่ครั้ง
  ticketUsagePercent: number; // เปอร์เซ็นต์การใช้งาน

  quotaTotalTickets: number;  // โควต้าจำนวนใบรวมทั้งฤดูกาล
  usedTotalTickets: number;   // ขอไปแล้วกี่ใบ
  remainingTotalTickets: number; // เหลือกี่ใบ
  excessTotalTickets: number; // ขอเกินโควต้าไปกี่ใบ (ต้องซื้อเพิ่มจากสโมสร)
  hasExcessTickets: boolean;  // มีการขอเกินโควต้าหรือไม่
  totalTicketsUsagePercent: number; // เปอร์เซ็นต์การใช้จำนวนใบจริง

  maxTicketsPerMatch: number;
  maxTicketsPerMatchByLeague?: Partial<Record<LeagueType, number>>;

  // Booth quota
  quotaBoothMatches: number; // โควต้าออกบูธทั้งฤดูกาล (จำนวนครั้ง)
  usedBoothMatches: number;  // ขอออกบูธไปแล้วกี่ครั้ง
  remainingBoothMatches: number; // เหลือกี่ครั้ง
  boothUsagePercent: number; // เปอร์เซ็นต์การใช้โควต้าออกบูธ
  isBoothLimitReached: boolean;
  isBoothNearLimit: boolean; // >= 80%

  // Breakdown by league
  usedBoothMatchesByLeague: Record<LeagueType, number>;
  usedTicketMatchesByLeague: Record<LeagueType, number>;

  // Status
  isLimitReached: boolean;
  isNearLimit: boolean; // >= 80%
}

/**
 * Calculate quota metrics for a brand in a given season
 */
export function calculateBrandQuota(
  brand: SponsorBrandItem,
  records: RegistrationRecord[],
  targetSeason: string = '2026/27'
): BrandQuotaUsage {
  const brandRecords = records.filter(r => {
    const bMatch = r.brand?.toLowerCase() === brand.id.toLowerCase();
    const sMatch = !r.season || r.season === targetSeason;
    const notRejected = r.status !== 'rejected';
    return bMatch && sMatch && notRejected;
  });

  const usedTicketMatches = brandRecords.filter(r => r.ticketRequired && (r.ticketQuantity || 0) > 0).length;
  const usedTotalTickets = brandRecords.reduce((sum, r) => sum + (r.ticketRequired ? (r.ticketQuantity || 0) : 0), 0);
  const usedBoothMatches = brandRecords.filter(r => r.boothRequired && r.dealerName && r.dealerName !== '-').length;

  // Calculate league breakdown
  const usedBoothMatchesByLeague: Record<LeagueType, number> = {
    'League 1': 0,
    'League 2': 0,
    'League 3': 0,
  };
  const usedTicketMatchesByLeague: Record<LeagueType, number> = {
    'League 1': 0,
    'League 2': 0,
    'League 3': 0,
  };

  brandRecords.forEach(r => {
    const lg = r.league as LeagueType;
    if (r.boothRequired && r.dealerName && r.dealerName !== '-') {
      if (usedBoothMatchesByLeague[lg] !== undefined) {
        usedBoothMatchesByLeague[lg]++;
      }
    }
    if (r.ticketRequired && (r.ticketQuantity || 0) > 0) {
      if (usedTicketMatchesByLeague[lg] !== undefined) {
        usedTicketMatchesByLeague[lg]++;
      }
    }
  });

  const quotaTicketMatches = brand.seasonTicketQuotaMatches ?? 20;
  const quotaTotalTickets = brand.seasonTicketQuotaTotalTickets ?? 400;
  const maxTicketsPerMatch = brand.maxTicketsPerMatch ?? 50;

  const remainingTicketMatches = Math.max(0, quotaTicketMatches - usedTicketMatches);
  const remainingTotalTickets = Math.max(0, quotaTotalTickets - usedTotalTickets);
  const excessTotalTickets = Math.max(0, usedTotalTickets - quotaTotalTickets);
  const hasExcessTickets = excessTotalTickets > 0;
  const totalTicketsUsagePercent = quotaTotalTickets > 0
    ? Math.round((usedTotalTickets / quotaTotalTickets) * 100)
    : 0;

  const ticketUsagePercent = quotaTicketMatches > 0 
    ? Math.min(100, Math.round((usedTicketMatches / quotaTicketMatches) * 100))
    : 0;

  const quotaBoothMatches = brand.seasonBoothQuotaMatches ?? 15;
  const remainingBoothMatches = Math.max(0, quotaBoothMatches - usedBoothMatches);
  const boothUsagePercent = quotaBoothMatches > 0
    ? Math.min(100, Math.round((usedBoothMatches / quotaBoothMatches) * 100))
    : 0;

  return {
    brandId: brand.id,
    season: targetSeason,
    quotaTicketMatches,
    usedTicketMatches,
    remainingTicketMatches,
    ticketUsagePercent,
    quotaTotalTickets,
    usedTotalTickets,
    remainingTotalTickets,
    excessTotalTickets,
    hasExcessTickets,
    totalTicketsUsagePercent,
    maxTicketsPerMatch,
    maxTicketsPerMatchByLeague: brand.maxTicketsPerMatchByLeague,
    usedBoothMatches,
    quotaBoothMatches,
    remainingBoothMatches,
    boothUsagePercent,
    isBoothLimitReached: remainingBoothMatches <= 0,
    isBoothNearLimit: boothUsagePercent >= 80 && remainingBoothMatches > 0,
    usedBoothMatchesByLeague,
    usedTicketMatchesByLeague,
    isLimitReached: remainingTicketMatches <= 0,
    isNearLimit: ticketUsagePercent >= 80 && remainingTicketMatches > 0,
  };
}

/**
 * Update an existing sponsor brand
 */
export async function updateSponsorBrand(
  id: string,
  updates: Partial<SponsorBrandItem>
): Promise<{ success: boolean; message: string }> {
  const index = cachedBrands.findIndex(b => b.id === id);
  if (index === -1) {
    return { success: false, message: 'ไม่พบแบรนด์ที่ต้องการแก้ไข' };
  }

  const updatedItem = {
    ...cachedBrands[index],
    ...updates,
  };

  const updatedList = [...cachedBrands];
  updatedList[index] = updatedItem;
  await saveSponsorBrands(updatedList);
  return { success: true, message: `อัปเดตข้อมูลแบรนด์ "${id}" เรียบร้อยแล้ว` };
}

/**
 * Delete a sponsor brand
 */
export async function deleteSponsorBrand(id: string): Promise<{ success: boolean; message: string }> {
  if (cachedBrands.length <= 1) {
    return { success: false, message: 'ไม่สามารถลบได้ เนื่องจากต้องมีแบรนด์ในระบบอย่างน้อย 1 แบรนด์' };
  }

  const updated = cachedBrands.filter(b => b.id !== id);
  await saveSponsorBrands(updated);
  return { success: true, message: `ลบแบรนด์ "${id}" เรียบร้อยแล้ว` };
}

/**
 * Reset brands to default sponsor set
 */
export async function resetBrandsToDefault(): Promise<void> {
  await saveSponsorBrands([...DEFAULT_SPONSOR_BRANDS]);
}
