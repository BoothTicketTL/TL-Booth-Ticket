import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  MapPin, 
  Calendar, 
  Clock, 
  Phone, 
  FileText, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles,
  Ticket,
  Link2,
  RefreshCw,
  X,
  AlertCircle,
  Check,
  Edit3,
  Save,
  PhoneCall,
  Lock
} from 'lucide-react';
import { LeagueType, UserProfile, FixtureItem, RegistrationRecord, BrandType } from '../types';
import { getCanonicalOfficialClub } from '../data/officialSeasonClubs';
import { ClubCrest } from './common/ClubCrest';
import { LeagueBadge } from './common/LeagueBadge';
import { getFixtures, subscribeToFixtures } from '../lib/fixturesService';
import { getSimulatedDate, setSimulatedDate, subscribeToSimulatedDate, subscribeToRegistrations, switchUserActiveBrand } from '../lib/firebase';
import { CURRENT_SIMULATED_DATE, SPONSOR_BRANDS } from '../data/fixtures';
import { 
  findContactForStadiumOrMatch,
  subscribeToContactsSync, 
  formatPhoneNumber,
  getStadiumContactsSheetUrl,
  setStadiumContactsSheetUrl,
  syncStadiumContactsFromOfficialSheet
} from '../lib/stadiumContactsService';
import { 
  isMatchContactConfirmed, 
  confirmMatchContact, 
  unconfirmMatchContact, 
  subscribeToMatchConfirmations 
} from '../lib/matchConfirmationService';

interface CleanStadiumContactsViewProps {
  currentUser: UserProfile | null;
  initialLeague?: LeagueType;
  records?: RegistrationRecord[];
  onBackToHub: () => void;
  onOpenAdmin?: () => void;
  onSwitchRole?: () => void;
  onNavigateToRegister?: (league?: LeagueType) => void;
}

/**
 * Format match date into clear Thai date: e.g. "วันศุกร์ที่ 9 ต.ค. 2569"
 */
function formatThaiMatchDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const THAI_DAYS = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
  const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const dayName = THAI_DAYS[d.getDay()];
  const dayNum = d.getDate();
  const monthName = THAI_MONTHS[d.getMonth()];
  const thaiYear = d.getFullYear() + 543;
  return `${dayName}ที่ ${dayNum} ${monthName} ${thaiYear}`;
}

/**
 * Calculates the match schedule cycle from Friday to Thursday of the following week (7 days)
 * Example: 9-15 ต.ค. 2569, next is 16-22 ต.ค. 2569
 * "ช่วงวันที่ตารางการแข่งขัน นับจากวันศุกร์-พฤหัสบดีของอีกสัปดาห์ เช่น 9-15 ต.ค.2569 แบบนี้ พอแมตช์ถัดไปก็ 16-22 ต.ค.2569"
 */
function getFridayToThursdayCycle(refDateStr: string): {
  fridayDate: Date;
  thursdayDate: Date;
  fridayStr: string;
  thursdayStr: string;
  formattedRange: string;
} {
  const d = new Date(refDateStr || '2026-10-09');
  const validDate = isNaN(d.getTime()) ? new Date('2026-10-09') : d;
  
  // Day of week: 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  const dayOfWeek = validDate.getDay();
  // Days since previous Friday (0 if Friday)
  const daysSinceFriday = (dayOfWeek - 5 + 7) % 7;
  
  const friday = new Date(validDate.getFullYear(), validDate.getMonth(), validDate.getDate() - daysSinceFriday);
  const thursday = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate() + 6);
  
  const formatYMD = (dt: Date) => {
    const y = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const m1 = THAI_MONTHS[friday.getMonth()];
  const m2 = THAI_MONTHS[thursday.getMonth()];
  const y1 = friday.getFullYear() + 543;
  const y2 = thursday.getFullYear() + 543;
  
  let formattedRange: string;
  if (m1 === m2 && y1 === y2) {
    formattedRange = `${friday.getDate()}-${thursday.getDate()} ${m1} ${y1}`;
  } else if (y1 === y2) {
    formattedRange = `${friday.getDate()} ${m1} - ${thursday.getDate()} ${m2} ${y1}`;
  } else {
    formattedRange = `${friday.getDate()} ${m1} ${y1} - ${thursday.getDate()} ${m2} ${y2}`;
  }
  
  return {
    fridayDate: friday,
    thursdayDate: thursday,
    fridayStr: formatYMD(friday),
    thursdayStr: formatYMD(thursday),
    formattedRange,
  };
}

export const CleanStadiumContactsView: React.FC<CleanStadiumContactsViewProps> = ({
  currentUser,
  initialLeague = 'League 1',
  records = [],
  onBackToHub,
  onOpenAdmin,
  onSwitchRole,
  onNavigateToRegister,
}) => {
  const [selectedLeague, setSelectedLeague] = useState<LeagueType>(initialLeague);
  const [fixtures, setFixtures] = useState<FixtureItem[]>(() => getFixtures());
  const [simDate, setSimDate] = useState<string>(() => getSimulatedDate() || '2026-10-09');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Confirmations map version for reactivity
  const [confirmVersion, setConfirmVersion] = useState(0);
  // Re-render when the contacts sheet has been (auto-)synced, so the numbers shown always follow the sheet
  const [, setContactsSyncTick] = useState(0);
  useEffect(() => subscribeToContactsSync(() => setContactsSyncTick(t => t + 1)), []);

  // Admin Modals & Controls State
  const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [contactsSheetUrl, setContactsSheetUrl] = useState<string>(() => getStadiumContactsSheetUrl() || '');

  // Quick edit modal state for admin
  const [editingContact, setEditingContact] = useState<{
    fixtureId: string;
    homeTeam: string;
    awayTeam: string;
    stadium: string;
    boothName: string;
    boothPhone: string;
    ticketName: string;
    ticketPhone: string;
    pickupLocation: string;
  } | null>(null);

  // Real-time registrations for checking brand requests (User requirement)
  // "หน้าเบอร์ติดต่อสนามจะขึ้นเบอร์ติดต่อเฉพาะแมตช์ที่ลูกค้าแต่ละแบรนด์ขอออกบูธรับบัตรไว้"
  const [allRecords, setAllRecords] = useState<RegistrationRecord[]>(() => records || []);

  // Subscribe to real-time fixtures, simDate, registrations, and confirmations
  useEffect(() => {
    const unsubFixtures = subscribeToFixtures((data) => {
      setFixtures(data);
    });
    const unsubSimDate = subscribeToSimulatedDate((newDate) => {
      setSimDate(newDate);
    });
    const unsubConfirm = subscribeToMatchConfirmations(() => {
      setConfirmVersion(v => v + 1);
    });
    const unsubRegs = subscribeToRegistrations((data) => {
      setAllRecords(data);
    });
    return () => {
      unsubFixtures();
      unsubSimDate();
      unsubConfirm();
      unsubRegs();
    };
  }, []);

  // Sync records prop if it changes
  useEffect(() => {
    if (records && records.length > 0) {
      setAllRecords(records);
    }
  }, [records]);

  // Sync initialLeague if prop changes
  useEffect(() => {
    if (initialLeague) {
      setSelectedLeague(initialLeague);
    }
  }, [initialLeague]);

  // User assigned brands list (supports multiple brands per user e.g. pakawan.pl has BYD & Molten)
  const userAssignedBrands = useMemo<string[]>(() => {
    if (currentUser?.role === 'admin') {
      return ['All', ...SPONSOR_BRANDS.map(b => b.id)];
    }
    const brands = Array.isArray(currentUser?.assignedBrands) && currentUser.assignedBrands.length > 0
      ? currentUser.assignedBrands
      : [currentUser?.assignedBrand || 'BYD'];
    return brands.filter(b => b !== 'All');
  }, [currentUser]);

  // Admin Brand Dropdown state: defaults to 'All' so admin sees requests from all brands
  const [adminBrand, setAdminBrand] = useState<BrandType | 'All'>(() => {
    return currentUser?.role === 'admin'
      ? 'All'
      : (currentUser?.assignedBrand && currentUser.assignedBrand !== 'All'
        ? currentUser.assignedBrand
        : (currentUser?.organization || 'BYD'));
  });

  // User selected brand for multi-brand users
  const [userSelectedBrand, setUserSelectedBrand] = useState<string>(() => {
    return userAssignedBrands[0] || 'BYD';
  });

  useEffect(() => {
    if (currentUser?.assignedBrand && currentUser.assignedBrand !== 'All') {
      setUserSelectedBrand(currentUser.assignedBrand);
    }
  }, [currentUser?.assignedBrand]);

  // Active brand: Admin uses selected adminBrand, regular User uses userSelectedBrand (or assigned brand)
  const activeBrand = useMemo<string>(() => {
    if (currentUser?.role === 'admin') {
      return adminBrand;
    }
    if (userAssignedBrands.includes(userSelectedBrand)) {
      return userSelectedBrand;
    }
    return userAssignedBrands[0] || 'BYD';
  }, [currentUser, adminBrand, userAssignedBrands, userSelectedBrand]);

  // View Filter Controls (User requirement: "หน้าเบอร์ติดต่อสนามจะขึ้นเบอร์ติดต่อเฉพาะแมตช์ที่ลูกค้าแต่ละแบรนด์ขอออกบูธรับบัตรไว้")
  const [filterMode, setFilterMode] = useState<'registered_only' | 'all'>('registered_only');
  const [hideFinishedMatches, setHideFinishedMatches] = useState<boolean>(false);
  const [adminViewAsUser, setAdminViewAsUser] = useState<boolean>(false);

  // Brand Name Normalizer
  const normalizeBrand = (b?: string) => (b || '').trim().toLowerCase();
  const isBrandMatch = (brand1?: string, brand2?: string) => {
    const s1 = normalizeBrand(brand1);
    const s2 = normalizeBrand(brand2);
    if (!s1 || !s2) return false;
    if (s1 === 'all' || s2 === 'all') return true;
    return s1 === s2 || s1.includes(s2) || s2.includes(s1);
  };

  // Robust Match <-> Registration matching
  const isRecordMatchingMatch = (rec: RegistrationRecord, match: FixtureItem): boolean => {
    if (rec.fixtureId && match.id && rec.fixtureId === match.id) return true;

    const recDate = (rec.matchDate || '').slice(0, 10);
    const matchDate = (match.matchDate || '').slice(0, 10);
    const dateMatches = !recDate || !matchDate || recDate === matchDate;

    const hCan = (getCanonicalOfficialClub(match.homeTeam)?.name || match.homeTeam || '').trim().toLowerCase();
    const aCan = (getCanonicalOfficialClub(match.awayTeam)?.name || match.awayTeam || '').trim().toLowerCase();
    const title = (rec.matchTitle || '').toLowerCase();
    const recHome = ((rec as any).homeTeam || '').toLowerCase();
    const recAway = ((rec as any).awayTeam || '').toLowerCase();

    const homeMatches = (hCan && title.includes(hCan)) ||
                        (match.homeTeam && title.includes(match.homeTeam.toLowerCase())) ||
                        (recHome && hCan && recHome.includes(hCan));

    const awayMatches = !aCan || (aCan && title.includes(aCan)) ||
                        (match.awayTeam && title.includes(match.awayTeam.toLowerCase())) ||
                        (recAway && aCan && recAway.includes(aCan));

    if (homeMatches && dateMatches) return true;
    if (homeMatches && awayMatches) return true;
    return false;
  };

  // Check if a record is an active request (approved or pending or has booth/tickets)
  const isRecordActiveRequest = (rec: RegistrationRecord): boolean => {
    if (rec.status === 'rejected') return false;
    if (rec.status === 'approved' || rec.status === 'pending') return true;
    if (rec.boothRequired || ((rec as any).boothQuantity && Number((rec as any).boothQuantity) > 0)) return true;
    if (rec.ticketRequired || (rec.ticketQuantity && Number(rec.ticketQuantity) > 0)) return true;
    return true;
  };

  // Helper to get all registration records for a match
  const getMatchRegistrations = (match: FixtureItem, brandFilter?: string, userEmail?: string) => {
    return allRecords.filter(rec => {
      if (!isRecordActiveRequest(rec)) return false;
      if (!isRecordMatchingMatch(rec, match)) return false;

      if (brandFilter && brandFilter !== 'All') {
        const bMatch = isBrandMatch(rec.brand, brandFilter);
        const eMatch = userEmail && rec.applicantEmail && rec.applicantEmail.toLowerCase() === userEmail.toLowerCase();
        if (!bMatch && !eMatch) return false;
      }
      return true;
    });
  };

  // Helper to check if a brand has requested booth or tickets for a specific match
  const getBrandRegistrationForMatch = (match: FixtureItem, brandToCheck: string) => {
    const list = getMatchRegistrations(match, brandToCheck);
    return list.length > 0 ? list[0] : undefined;
  };

  // Detailed booth & ticket status for a brand on a match
  const getBrandBoothAndTicketStatus = (match: FixtureItem, brandToCheck: string) => {
    const reg = getBrandRegistrationForMatch(match, brandToCheck);
    if (!reg) return { hasRegistered: false, hasBooth: false, hasTicket: false, reg: null };

    const hasBooth = Boolean(reg.boothRequired || ((reg as any).boothQuantity && Number((reg as any).boothQuantity) > 0));
    const hasTicket = Boolean(reg.ticketRequired || (reg.ticketQuantity && Number(reg.ticketQuantity) > 0));

    return {
      hasRegistered: true,
      hasBooth,
      hasTicket,
      reg,
    };
  };

  // Helper to get all brand names that registered for a match
  const getRegisteredBrandsForMatch = (match: FixtureItem): string[] => {
    const regs = getMatchRegistrations(match);
    const brandsSet = new Set<string>();
    regs.forEach(r => {
      if (r.brand) brandsSet.add(r.brand);
    });
    return Array.from(brandsSet);
  };

  // Synchronized Friday-to-Thursday match cycle across all 3 leagues (e.g. 9-15 ต.ค. 2569)
  const cycle = useMemo(() => {
    return getFridayToThursdayCycle(simDate || '2026-10-09');
  }, [simDate]);

  // Header range text: GUARANTEED identical across all 3 leagues (League 1, 2, 3)
  const weekRangeText = useMemo(() => {
    return `แมตช์วันที่ ${cycle.formattedRange}`;
  }, [cycle]);

  // Filter matches for the selected league for the Friday-to-Thursday match cycle (e.g. 9-15 ต.ค. 2569)
  const displayedMatches = useMemo(() => {
    const leagueMatches = fixtures.filter(f => f.league === selectedLeague);
    if (leagueMatches.length === 0) return [];

    // Filter to matches within Friday-Thursday cycle (inclusive)
    let weekMatches = leagueMatches.filter(f => {
      const matchDateStr = f.matchDate;
      return matchDateStr >= cycle.fridayStr && matchDateStr <= cycle.thursdayStr;
    });

    // If no matches fall strictly in this cycle, fallback to nearest matches
    if (weekMatches.length === 0) {
      const refTime = new Date(cycle.fridayStr).getTime();
      const sortedByProximity = [...leagueMatches].sort((a, b) => {
        const diffA = Math.abs(new Date(a.matchDate).getTime() - refTime);
        const diffB = Math.abs(new Date(b.matchDate).getTime() - refTime);
        return diffA - diffB;
      });

      if (sortedByProximity.length > 0) {
        const targetWeek = sortedByProximity[0].matchWeek;
        weekMatches = leagueMatches.filter(f => f.matchWeek === targetWeek);
      }
    }

    // Align League 3 dates so that matches fall on the exact same weekend as League 1 & 2
    const alignedMatches = weekMatches.map(f => {
      if (f.league === 'League 3' && f.matchDate === '2026-10-12') {
        return { ...f, matchDate: '2026-10-11' };
      }
      return f;
    });

    // Sort chronologically by date and kickoff time
    return alignedMatches.sort((a, b) => {
      const dateCompare = (a.matchDate || '').localeCompare(b.matchDate || '');
      if (dateCompare !== 0) return dateCompare;
      return (a.matchTime || '').localeCompare(b.matchTime || '');
    });
  }, [fixtures, selectedLeague, cycle]);

  // Comprehensive league fixtures including any synthesized from registration records
  const allLeagueMatches = useMemo(() => {
    const baseMatches = fixtures.filter(f => f.league === selectedLeague);
    const list = [...baseMatches];

    allRecords.forEach(rec => {
      if (rec.league === selectedLeague && isRecordActiveRequest(rec)) {
        const exists = list.some(m => isRecordMatchingMatch(rec, m));
        if (!exists && rec.matchTitle) {
          const parts = rec.matchTitle.split(/ vs | VS | - /i);
          const homeTeam = parts[0]?.trim() || (rec as any).homeTeam || 'ทีมเหย้า';
          const awayTeam = parts[1]?.trim() || (rec as any).awayTeam || 'ทีมเยือน';
          list.push({
            id: rec.fixtureId || `reg-synth-${rec.id}`,
            league: rec.league,
            matchWeek: 1,
            homeTeam,
            awayTeam,
            stadium: rec.stadium || 'สนามเหย้า',
            matchDate: rec.matchDate || '2026-10-10',
            matchTime: '18:00',
            month: rec.month || (rec.matchDate ? rec.matchDate.slice(0, 7) : '2026-10'),
          });
        }
      }
    });

    return list.sort((a, b) => {
      const dComp = (a.matchDate || '').localeCompare(b.matchDate || '');
      if (dComp !== 0) return dComp;
      return (a.matchTime || '').localeCompare(b.matchTime || '');
    });
  }, [fixtures, selectedLeague, allRecords]);

  // User Requirement:
  // "ในหน้าเบอร์ติดต่อมุมมอง User ถ้า User ไม่ได้ลงทะเบียนขอออกบูธรับบัตรในแมตช์แข่งขันนั้นมา ไม่ต้องขึ้นโชว์ชื่อแมตช์แข่งขันนั้นเลยในหน้าเบอร์ติดต่อ
  // และให้ขึ้นเบอร์ติดต่อแมตช์ที่ลงทะเบียนมาทุกแมตช์หลังจากแอดมินกดยืนยันเบอร์แล้ว ไม่ต้องจำกัดวันที่แบบหน้าตารางแข่งขัน แต่พอหมดวันแข่งขันนั้นให้เบอร์ติดต่อแมตช์นั้นๆหายไปเองอัตโนมัติ"
  const userRegisteredMatchesAllSeason = useMemo(() => {
    return allLeagueMatches.filter(m => {
      const userRegs = getMatchRegistrations(m, activeBrand !== 'All' ? activeBrand : undefined, currentUser?.email);
      if (userRegs.length === 0) return false;

      // Automatically hide once match date is over: "แต่พอหมดวันแข่งขันนั้นให้เบอร์ติดต่อแมตช์นั้นๆหายไปเองอัตโนมัติ"
      if (simDate && m.matchDate && simDate > m.matchDate) {
        return false;
      }
      return true;
    });
  }, [allLeagueMatches, activeBrand, currentUser, allRecords, simDate]);

  // Admin Registered Matches (all season, across all brands or filtered brand)
  const adminRegisteredMatchesAllSeason = useMemo(() => {
    return allLeagueMatches.filter(m => {
      const regs = getMatchRegistrations(m, adminBrand !== 'All' ? adminBrand : undefined);
      return regs.length > 0;
    });
  }, [allLeagueMatches, adminBrand, allRecords]);

  // Is User View (true for normal user, or admin when testing User View)
  const isUserView = currentUser?.role !== 'admin' || adminViewAsUser;

  // Final matches list based on user mode
  const filteredMatchesList = useMemo(() => {
    if (isUserView) {
      // In User view: ONLY show matches that the user registered for, across all season dates, with expired matches automatically hidden!
      return userRegisteredMatchesAllSeason;
    }

    // In Admin view:
    let list = (filterMode === 'registered_only')
      ? adminRegisteredMatchesAllSeason
      : displayedMatches;

    if (hideFinishedMatches) {
      list = list.filter(m => !(simDate && m.matchDate && simDate > m.matchDate));
    }
    return list;
  }, [isUserView, userRegisteredMatchesAllSeason, adminRegisteredMatchesAllSeason, filterMode, displayedMatches, hideFinishedMatches, simDate]);

  // Admin: Sync stadium contacts from official Google Sheet
  const handleSyncContactsSheet = async () => {
    setIsSyncing(true);
    try {
      setStadiumContactsSheetUrl(contactsSheetUrl);
      const res = await syncStadiumContactsFromOfficialSheet(contactsSheetUrl, 'all');
      if (res.success) {
        setToastMessage(`✅ ดึงข้อมูลเบอร์ติดต่อสำเร็จ ${res.count} รายการ จากแท็บ ${res.syncedTabs.join(', ')}`);
        setIsLinksModalOpen(false);
      } else {
        alert(`การซิงค์เบอร์ติดต่อพบข้อผิดพลาด: ${res.error}`);
      }
    } catch (e: any) {
      alert(`เกิดข้อผิดพลาด: ${e.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setToastMessage(null), 4500);
    }
  };

  // Admin: Toggle confirmation for a single match
  const handleToggleConfirmMatch = async (match: FixtureItem) => {
    const status = isMatchContactConfirmed({
      fixtureId: match.id,
      matchDate: match.matchDate,
      homeClub: match.homeTeam,
      stadiumName: match.stadium,
    });

    if (status.isConfirmed) {
      await unconfirmMatchContact({
        fixtureId: match.id,
        matchDate: match.matchDate,
        homeClub: match.homeTeam,
        stadiumName: match.stadium,
      });
      setConfirmVersion(v => v + 1);
      setToastMessage(`⏸️ ยกเลิกการยืนยันเบอร์ติดต่อแมตช์ ${match.homeTeam} vs ${match.awayTeam} (User จะมองไม่เห็นเบอร์)`);
    } else {
      await confirmMatchContact({
        fixtureId: match.id,
        matchDate: match.matchDate,
        homeClub: match.homeTeam,
        stadiumName: match.stadium,
        league: match.league,
        adminName: currentUser?.displayName || currentUser?.email || 'Admin',
      });
      setConfirmVersion(v => v + 1);
      setToastMessage(`✅ กดยืนยันเบอร์ติดต่อแมตช์ ${match.homeTeam} vs ${match.awayTeam} เรียบร้อยแล้ว (User สามารถมองเห็นเบอร์ได้แล้ว)`);
    }
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Admin: Confirm all matches in this week
  const handleConfirmAllWeek = async () => {
    if (displayedMatches.length === 0) return;
    for (const match of displayedMatches) {
      await confirmMatchContact({
        fixtureId: match.id,
        matchDate: match.matchDate,
        homeClub: match.homeTeam,
        stadiumName: match.stadium,
        league: match.league,
        adminName: currentUser?.displayName || currentUser?.email || 'Admin',
      });
    }
    setConfirmVersion(v => v + 1);
    setToastMessage(`✅ กดยืนยันเบอร์ติดต่อครบทุกแมตช์ในสัปดาห์นี้ (${displayedMatches.length} แมตช์) เรียบร้อยแล้ว`);
    setTimeout(() => setToastMessage(null), 4500);
  };

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden bg-gradient-to-b from-[#e6f7f9] via-white to-[#f0fbf7] text-slate-800 select-none pb-24">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Decorative ambient background curves matching Mockup 2 & 1 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-10 left-[-5%] w-96 h-96 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute top-1/4 right-[-5%] w-[32rem] h-[32rem] rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 w-80 h-80 rounded-full bg-teal-300/10 blur-3xl" />

        <svg className="absolute inset-0 w-full h-full opacity-60 pointer-events-none" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
          <path d="M 1200 0 C 1280 280 1380 620 1440 900" stroke="#06b6d4" strokeWidth="1.2" opacity="0.35" />
          <path d="M 1300 0 C 1370 340 1410 650 1440 850" stroke="#06b6d4" strokeWidth="0.8" opacity="0.25" />
          <path d="M 0 150 C 300 220 700 120 1440 260" stroke="#10b981" strokeWidth="0.8" opacity="0.2" />
        </svg>
      </div>

      {/* Top Header Bar: "หน้าเบอร์ติดต่อหน้าสนาม" on left + Hub Back Button */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 flex items-center justify-between gap-4 flex-wrap">
        {/* Left Side: Mockup Title "หน้าเบอร์ติดต่อหน้าสนาม" */}
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">
            หน้าเบอร์ติดต่อหน้าสนาม
          </h1>
          <button
            type="button"
            onClick={onBackToHub}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer group"
            title="ย้อนกลับไปหน้าหลักเพื่อเลือกเมนูและลีก"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:-translate-x-1 transition-transform" />
            <span className="underline underline-offset-4">กลับหน้าหลัก (เลือกลีก)</span>
          </button>
        </div>

        {/* Right Side: Quick League Switcher & Admin Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {/* Admin Specific Controls: Item 2 of User Brief */}
          {currentUser?.role === 'admin' && (
            <>
              {/* Simulated Date Quick Stepper for testing "เบอร์ติดต่อจะขึ้นโชว์จนกว่าจะหมดการแข่งขันวันนั้น" */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-xs border border-slate-700">
                <Calendar className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="text-slate-300 text-[11px] hidden sm:inline">วันจำลอง:</span>
                <span className="text-amber-300 font-mono text-[11px] font-black">{simDate}</span>
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(simDate);
                      d.setDate(d.getDate() - 1);
                      const prev = d.toISOString().slice(0, 10);
                      setSimulatedDate(prev);
                      setToastMessage(`📅 เลื่อนวันจำลองถอยหลังเป็น ${prev}`);
                      setTimeout(() => setToastMessage(null), 3000);
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer text-[10px]"
                    title="ลดวันจำลอง -1 วัน"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(simDate);
                      d.setDate(d.getDate() + 1);
                      const next = d.toISOString().slice(0, 10);
                      setSimulatedDate(next);
                      setToastMessage(`📅 เลื่อนวันจำลองไปข้างหน้าเป็น ${next} (ทดสอบวันแข่งหมดลง)`);
                      setTimeout(() => setToastMessage(null), 3000);
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer text-[10px]"
                    title="เพิ่มวันจำลอง +1 วัน (ทดสอบหมดวันแข่งขัน)"
                  >
                    ▶
                  </button>
                </div>
              </div>

              {/* 1. ปุ่มตั้งค่าลิงก์/นำเข้าเบอร์ติดต่อ */}
              <button
                type="button"
                onClick={() => setIsLinksModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 text-xs font-black shadow-md border border-slate-700 cursor-pointer transition-all hover:scale-105"
                title="ตั้งค่าลิงก์ Google Sheet สำหรับเบอร์ติดต่อหน้าสนาม"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>ตั้งค่าลิงก์/นำเข้าเบอร์ติดต่อ</span>
              </button>

              {/* 2. ปุ่มกดยืนยันเบอร์ทุกคู่ในสัปดาห์นี้ */}
              <button
                type="button"
                onClick={handleConfirmAllWeek}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs cursor-pointer transition-all"
                title="กดยืนยันเบอร์ติดต่อทุกคู่ในสัปดาห์นี้พร้อมกัน เพื่อให้ User มองเห็นได้ทั้งหมด"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>ยืนยันเบอร์ทุกคู่สัปดาห์นี้</span>
              </button>
            </>
          )}

          {/* Switch Role Button (Admin ⇄ User) */}
          {onSwitchRole && (
            <button
              type="button"
              onClick={onSwitchRole}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black shadow-md border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                currentUser?.role === 'admin'
                  ? 'bg-amber-400 hover:bg-amber-500 text-slate-950 border-amber-300'
                  : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-slate-700'
              }`}
              title="คลิกเพื่อสลับบทบาทระหว่าง Admin กับ User ทันที"
            >
              <span>{currentUser?.role === 'admin' ? '👑 Admin (สลับเป็น User ⇄)' : '👤 User (สลับเป็น Admin ⇄)'}</span>
            </button>
          )}

          {/* League Selector Pills */}
          <div className="flex items-center bg-white/80 backdrop-blur-md p-1 rounded-2xl border border-slate-300 shadow-2xs">
            {(['League 1', 'League 2', 'League 3'] as LeagueType[]).map((lg) => {
              const isSelected = selectedLeague === lg;
              const colorStyle = 
                lg === 'League 1' 
                  ? (isSelected ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 hover:bg-rose-50')
                  : lg === 'League 2'
                  ? (isSelected ? 'bg-blue-600 text-white shadow-xs' : 'text-blue-700 hover:bg-blue-50')
                  : (isSelected ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50');

              return (
                <button
                  key={lg}
                  type="button"
                  onClick={() => setSelectedLeague(lg)}
                  className={`px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${colorStyle}`}
                >
                  {lg}
                </button>
              );
            })}
          </div>

          {/* Brand Dropdown (Admin has full selector, User with multiple brands has switcher dropdown) */}
          {currentUser?.role === 'admin' ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/95 border border-slate-300 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="text-xs font-bold text-slate-700 shrink-0">แบรนด์:</span>
              <select
                value={adminBrand}
                onChange={(e) => setAdminBrand(e.target.value as BrandType | 'All')}
                className="text-xs font-black text-emerald-800 bg-transparent border-0 focus:outline-none cursor-pointer"
                title="เลือกแบรนด์ที่ต้องการดูหรือจัดการข้อมูล"
              >
                <option value="All" className="text-slate-800 font-bold">
                  ⭐ ทุกแบรนด์ (All Brands)
                </option>
                {SPONSOR_BRANDS.map((b) => (
                  <option key={b.id} value={b.id} className="text-slate-800 font-bold">
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : userAssignedBrands.length > 1 ? (
            /* Multi-brand client dropdown (เช่น pakawan.pl สลับระหว่าง BYD และ Molten ในหน้าเบอร์ติดต่อสนาม) */
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shrink-0"></span>
              <span className="text-xs font-bold text-emerald-900 shrink-0">สลับแบรนด์:</span>
              <select
                value={activeBrand}
                onChange={(e) => {
                  const selected = e.target.value;
                  setUserSelectedBrand(selected);
                  switchUserActiveBrand(selected);
                }}
                className="text-xs font-black text-emerald-950 bg-white px-2 py-0.5 rounded-lg border border-emerald-300 focus:outline-none cursor-pointer shadow-2xs"
                title="คุณได้รับสิทธิ์ดูแลหลายแบรนด์ สามารถสลับแบรนด์เพื่อดูเบอร์ติดต่อสนามของแต่ละแบรนด์ได้ที่นี่"
              >
                {userAssignedBrands.map((bId) => {
                  const bObj = SPONSOR_BRANDS.find(b => b.id === bId);
                  return (
                    <option key={bId} value={bId} className="text-slate-800 font-bold">
                      {bObj ? bObj.name : bId}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>แบรนด์: <strong className="text-emerald-700">{activeBrand}</strong></span>
            </div>
          )}
        </div>
      </header>

      {/* Main Center Stage (Mockup 2 Exact Design) */}
      <main className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 space-y-6">
        {/* Center Official League Emblem */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-36 h-44 sm:w-44 sm:h-52 flex items-center justify-center transition-transform hover:scale-105 drop-shadow-xl">
            <LeagueBadge league={selectedLeague} size="xl" />
          </div>

          {/* Title: เบอร์ติดต่อเจ้าหน้าที่สนาม */}
          <div className="space-y-1">
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
              {isUserView 
                ? `เบอร์ติดต่อเจ้าหน้าที่สนาม (เฉพาะแมตช์ที่ ${activeBrand} ขอออกบูธ/รับบัตรไว้)`
                : `เบอร์ติดต่อเจ้าหน้าที่สนาม ${weekRangeText}`}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-slate-500">
              {isUserView
                ? `แสดงเบอร์ติดต่อและจุดรับบัตรเฉพาะแมตช์ที่ลงทะเบียนไว้ หลังจากแอดมินกดยืนยันแล้ว (เมื่อหมดวันแข่งจะซ่อนอัตโนมัติ)`
                : `จุดรับตั๋วและพิกัดผู้ประสานงานสำหรับออกบูธและรับบัตรดูบอล (ข้อมูลยืนยันอย่างเป็นทางการ)`}
            </p>
          </div>
        </div>

        {/* View Filter Tabs: User Requirement 2 */}
        {/* "ถ้า User ไม่ได้ลงทะเบียนขอออกบูธรับบัตรในแมตช์แข่งขันนั้นมา ไม่ต้องขึ้นโชว์ชื่อแมตช์แข่งขันนั้นเลยในหน้าเบอร์ติดต่อ และให้ขึ้นเบอร์ติดต่อแมตช์ที่ลงทะเบียนมาทุกแมตช์หลังจากแอดมินกดยืนยันเบอร์แล้ว ไม่ต้องจำกัดวันที่แบบหน้าตารางแข่งขัน แต่พอหมดวันแข่งขันนั้นให้เบอร์ติดต่อแมตช์นั้นๆหายไปเองอัตโนมัติ" */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 pb-2 border-b border-slate-200/80">
          <div className="flex items-center gap-2 flex-wrap">
            {isUserView ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black shadow-sm ring-2 ring-emerald-400">
                <span>⭐ แมตช์ที่ลงทะเบียนขอออกบูธ/รับบัตรไว้ ({selectedLeague})</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
                  {userRegisteredMatchesAllSeason.length} แมตช์
                </span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setFilterMode('registered_only')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                    filterMode === 'registered_only'
                      ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400'
                      : 'bg-white/90 text-slate-700 hover:bg-emerald-50 border border-slate-200'
                  }`}
                  title="แสดงเฉพาะแมตช์ที่ได้รับการลงทะเบียนขอออกบูธหรือขอรับสิทธิ์ตั๋วไว้"
                >
                  <span>⭐ แมตช์ที่มีคำขอ/อนุมัติแล้ว {adminBrand !== 'All' ? `(${adminBrand})` : '(ทุกแบรนด์)'}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    filterMode === 'registered_only' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {adminRegisteredMatchesAllSeason.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                    filterMode === 'all'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white/90 text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                  title="แสดงโปรแกรมการแข่งขันทุกคู่ในรอบสัปดาห์นี้"
                >
                  <span>📋 โปรแกรมทุกคู่ในสัปดาห์นี้</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    filterMode === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {displayedMatches.length}
                  </span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5 text-xs font-bold text-slate-600 flex-wrap">
            {!isUserView && (
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 select-none bg-white/80 px-2.5 py-1 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  checked={hideFinishedMatches}
                  onChange={(e) => setHideFinishedMatches(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                />
                <span className="text-[11px]">ซ่อนคู่ที่หมดวันแข่งแล้ว</span>
              </label>
            )}

            {currentUser?.role === 'admin' && (
              <button
                type="button"
                onClick={() => setAdminViewAsUser(!adminViewAsUser)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  adminViewAsUser
                    ? 'bg-amber-100 text-amber-900 border-amber-300 ring-1 ring-amber-400'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
                title="สลับดูมุมมองเสมือน User ของแบรนด์นี้ เพื่อทดสอบการล็อค/แสดงผล"
              >
                {adminViewAsUser ? `👁️ มุมมอง User (${adminBrand})` : '👑 โหมด Admin (แสดงทุกแมตช์)'}
              </button>
            )}
          </div>
        </div>

        {/* Empty State: เมื่อไม่มีรายการแมตช์ที่ลงทะเบียนไว้ */}
        {filteredMatchesList.length === 0 && (
          <div className="p-8 sm:p-12 text-center bg-white/90 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm space-y-4 max-w-lg mx-auto my-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
              <Ticket className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-black text-slate-800">
                {isUserView 
                  ? `ยังไม่มีแมตช์ที่ท่านได้ลงทะเบียนขอออกบูธหรือรับบัตรไว้ใน ${selectedLeague}`
                  : `ไม่มีรายการคำขอในเงื่อนไขที่เลือกสำหรับ ${selectedLeague}`}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {isUserView
                  ? `หน้าเบอร์ติดต่อในมุมมองผู้ใช้งานจะแสดงเฉพาะแมตช์ที่ท่านได้ลงทะเบียนขอออกบูธหรือรับบัตรไว้ และจะขึ้นเบอร์ติดต่อหลังจากแอดมินกดยืนยันเบอร์แล้ว (แมตช์ที่แข่งขันเสร็จสิ้นแล้วจะถูกซ่อนอัตโนมัติ)`
                  : `ท่านสามารถเลือกดูแบรนด์อื่น หรือเปลี่ยนตัวกรองเป็น "โปรแกรมทุกคู่ในสัปดาห์นี้" ด้านบน`}
              </p>
            </div>
            {onNavigateToRegister && isUserView && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigateToRegister(selectedLeague)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md cursor-pointer transition-transform hover:scale-105"
                >
                  👉 ไปที่หน้าลงทะเบียนขอออกบูธ/รับบัตร ({selectedLeague})
                </button>
              </div>
            )}
          </div>
        )}

        {/* Matches List: Exact Mockup 2 Layout */}
        <div className="space-y-10 sm:space-y-12 pt-2">
          {filteredMatchesList.map((match) => {
            // Find contact information for this match and stadium (pulled from "เบอร์ติดต่อหน้าสนาม" link)
            const contact = findContactForStadiumOrMatch({
              stadiumName: match.stadium,
              homeClub: match.homeTeam,
              awayTeam: match.awayTeam,
              matchDate: match.matchDate,
              league: match.league,
              fixtureId: match.id,
            });

            // Find if current user/brand registered for this match
            const matchRegs = getMatchRegistrations(match);
            const userMatchRegs = getMatchRegistrations(match, activeBrand !== 'All' ? activeBrand : undefined, currentUser?.email);
            const hasUserRegistered = userMatchRegs.length > 0;
            const registeredBrands = Array.from(new Set(matchRegs.map(r => r.brand)));

            // Check if match day has passed: "เบอร์ติดต่อจะขึ้นโชว์จนกว่าจะหมดการแข่งขันวันนั้น"
            const isMatchDayPassed = Boolean(simDate && match.matchDate && simDate > match.matchDate);
            const isMatchToday = Boolean(simDate && match.matchDate && simDate === match.matchDate);

            // Booth contact formatting
            const boothName = contact.boothCoordinatorName && contact.boothCoordinatorName !== 'เจ้าหน้าที่ฝ่ายออกบูธ'
              ? contact.boothCoordinatorName
              : '';
            const boothPhone = contact.boothCoordinatorPhone || '';
            const boothContactText = boothName && boothPhone 
              ? `${boothName} ${boothPhone}`
              : (boothPhone || boothName || 'ไม่มีข้อมูลในชีต');

            // Ticket contact formatting
            const ticketName = contact.ticketCoordinatorName && contact.ticketCoordinatorName !== 'เจ้าหน้าที่ฝ่ายรับบัตร'
              ? contact.ticketCoordinatorName
              : '';
            const ticketPhone = contact.ticketCoordinatorPhone || '';
            const ticketContactText = ticketName && ticketPhone 
              ? `${ticketName} ${ticketPhone}`
              : (ticketPhone || ticketName || 'ไม่มีข้อมูลในชีต');

            const ticketLocation = contact.remark || 'ไม่มี Remark ในชีต';

            // Check if Admin has confirmed contact for this match
            // Per User Requirement: "และต้องให้อดมินกดยืนยันเบอร์ติดต่อก่อนเท่านั้น ถึงจะโชว์เบอร์ให้User เห็นได้"
            const confirmInfo = isMatchContactConfirmed({
              fixtureId: match.id,
              matchDate: match.matchDate,
              homeClub: match.homeTeam,
              stadiumName: match.stadium,
            });
            const isConfirmed = confirmInfo.isConfirmed;
            const isAdmin = currentUser?.role === 'admin' && !adminViewAsUser;

            return (
              <div 
                key={match.id}
                id={`clean-contact-card-${match.id}`}
                className="relative pt-8 pb-6 border-t-2 border-[#ff0033] space-y-4"
              >
                {/* Date & Kickoff Time Badges on top-left of the red line (Exact Mockup 2) */}
                <div className="absolute -top-4 left-0 flex items-center gap-1.5 sm:gap-2 flex-wrap z-10">
                  <span className="bg-[#ff0033] text-white text-xs sm:text-sm font-black px-3.5 py-1 rounded-md shadow-sm flex items-center gap-1.5 tracking-wide">
                    <Calendar className="w-3.5 h-3.5 text-white" />
                    <span>{formatThaiMatchDate(match.matchDate)}</span>
                  </span>
                  <span className="bg-slate-900 text-white text-xs sm:text-sm font-black px-3 py-1 rounded-md shadow-sm flex items-center gap-1.5 tracking-wider">
                    <Clock className="w-3.5 h-3.5 text-amber-300" />
                    <span>เวลา {match.matchTime ? match.matchTime.slice(0, 5) : '18:00'} น.</span>
                  </span>
                </div>

                {/* Top-Right Tab: Registration Status / Admin Confirmation Badge */}
                <div className="absolute -top-4 right-0 z-10 flex items-center gap-1.5 flex-wrap justify-end">
                  {isAdmin ? (
                    <>
                      {registeredBrands.length > 0 ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
                          🏢 ขอออกบูธ/รับบัตร: {registeredBrands.join(', ')}
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold border border-slate-300">
                          ยังไม่มีแบรนด์ขอออกบูธ/ตั๋ว
                        </span>
                      )}
                      {isMatchToday && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black border border-rose-300">
                          🔥 วันแข่งขัน (แสดงเบอร์จนหมดวัน)
                        </span>
                      )}
                      {isMatchDayPassed && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                          🏁 สิ้นสุดวันแข่งแล้ว (ปิดแสดงเบอร์)
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {hasUserRegistered ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300 flex items-center gap-1 shadow-2xs">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>ลงทะเบียนขอออกบูธ/รับบัตรแล้ว</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold border border-slate-300 shadow-2xs">
                          ไม่ได้ขอออกบูธ/บัตร
                        </span>
                      )}
                      {isMatchToday && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black shadow-xs animate-pulse">
                          🔥 วันแข่งขัน (แสดงเบอร์จนหมดวัน)
                        </span>
                      )}
                      {isMatchDayPassed && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold shadow-2xs">
                          🏁 หมดวันแข่งแล้ว (ปิดแสดงเบอร์)
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Center Match Banner: Home Team - Crest - [ V ] : [ S ] - Crest - Away Team */}
                <div className="flex items-center justify-center gap-2 sm:gap-6 my-2 pt-2">
                  {/* Home Team Name */}
                  <div className="flex-1 text-right">
                    <span 
                      className="text-sm sm:text-lg md:text-xl font-black text-slate-900 leading-snug line-clamp-2"
                      title={match.homeTeam}
                    >
                      {match.homeTeam}
                    </span>
                  </div>

                  {/* Home Team Crest (Large & Prominent) */}
                  <div className="w-20 h-20 sm:w-28 sm:h-28 flex items-center justify-center shrink-0 drop-shadow-md transition-transform hover:scale-105">
                    <ClubCrest clubName={match.homeTeam} league={match.league} size="xl" showTooltip />
                  </div>

                  {/* Red [ V ] : [ S ] Box (Exact Mockup 2 Design) */}
                  <div className="flex items-center gap-1.5 shrink-0 px-1 sm:px-2">
                    <span className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#ff0033] text-white font-black text-sm sm:text-lg flex items-center justify-center shadow-xs">
                      V
                    </span>
                    <span className="text-[#ff0033] font-black text-lg sm:text-2xl">:</span>
                    <span className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#ff0033] text-white font-black text-sm sm:text-lg flex items-center justify-center shadow-xs">
                      S
                    </span>
                  </div>

                  {/* Away Team Crest (Large & Prominent) */}
                  <div className="w-20 h-20 sm:w-28 sm:h-28 flex items-center justify-center shrink-0 drop-shadow-md transition-transform hover:scale-105">
                    <ClubCrest clubName={match.awayTeam} league={match.league} size="xl" showTooltip />
                  </div>

                  {/* Away Team Name */}
                  <div className="flex-1 text-left">
                    <span 
                      className="text-sm sm:text-lg md:text-xl font-black text-slate-900 leading-snug line-clamp-2"
                      title={match.awayTeam}
                    >
                      {match.awayTeam}
                    </span>
                  </div>
                </div>

                {/* Stadium Name (Center Aligned with Stadium Icon) */}
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-700 font-bold my-1.5">
                  <span className="inline-block text-sm">🏟️</span>
                  <span>{match.stadium}</span>
                </div>

                {/* 2-Column Contact Info Rounded Box (Exact Mockup 2 Design) */}
                {/* Per User Instruction: "หน้าเบอร์ติดต่อสนามจะขึ้นเบอร์ติดต่อเฉพาะแมตช์ที่ลูกค้าแต่ละแบรนด์ขอออกบูธรับบัตรไว้ เบอร์ติดต่อจะขึ้นโชว์จนกว่าจะหมดการแข่งขันวันนั้น" */}
                <div className="rounded-2xl border-2 border-slate-800 bg-white overflow-hidden shadow-2xs divide-y sm:divide-y-0 sm:divide-x-2 divide-slate-800 grid grid-cols-1 sm:grid-cols-2">
                  {/* Left Column: เบอร์ติดต่อออกบูธ */}
                  <div className="p-3 sm:p-4 text-center flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2">
                    <span className="text-xs sm:text-sm font-bold text-[#ff0033]">
                      เบอร์ติดต่อออกบูธ:
                    </span>
                    {isAdmin ? (
                      boothPhone ? (
                        <a 
                          href={`tel:${boothPhone.replace(/[^0-9]/g, '')}`}
                          className="text-xs sm:text-sm font-bold text-[#ff0033] hover:underline flex items-center gap-1 cursor-pointer"
                          title="คลิกเพื่อโทรออก"
                        >
                          <span>{boothContactText}</span>
                        </a>
                      ) : (
                        <span className="text-xs sm:text-sm font-bold text-[#ff0033]">
                          {boothContactText}
                        </span>
                      )
                    ) : !hasUserRegistered ? (
                      <span className="text-xs sm:text-sm font-semibold text-slate-400 flex items-center justify-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span>เฉพาะคู่ที่ขอออกบูธ/รับบัตรไว้</span>
                      </span>
                    ) : isMatchDayPassed ? (
                      <span className="text-xs sm:text-sm font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg flex items-center justify-center gap-1">
                        <span>🏁 สิ้นสุดการแข่งขันวันนั้นแล้ว</span>
                      </span>
                    ) : !isConfirmed ? (
                      <span className="text-xs sm:text-sm font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200 flex items-center justify-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>รอแอดมินยืนยันเบอร์ติดต่อ</span>
                      </span>
                    ) : boothPhone ? (
                      <a 
                        href={`tel:${boothPhone.replace(/[^0-9]/g, '')}`}
                        className="text-xs sm:text-sm font-bold text-[#ff0033] hover:underline flex items-center gap-1 cursor-pointer"
                        title="คลิกเพื่อโทรออก"
                      >
                        <span>{boothContactText}</span>
                      </a>
                    ) : (
                      <span className="text-xs sm:text-sm font-bold text-[#ff0033]">
                        {boothContactText}
                      </span>
                    )}
                  </div>

                  {/* Right Column: เบอร์ติดต่อรับบัตร */}
                  <div className="p-3 sm:p-4 text-center flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2">
                    <span className="text-xs sm:text-sm font-bold text-[#ff0033]">
                      เบอร์ติดต่อรับบัตร:
                    </span>
                    {isAdmin ? (
                      ticketPhone ? (
                        <a 
                          href={`tel:${ticketPhone.replace(/[^0-9]/g, '')}`}
                          className="text-xs sm:text-sm font-bold text-[#ff0033] hover:underline flex items-center gap-1 cursor-pointer"
                          title="คลิกเพื่อโทรออก"
                        >
                          <span>{ticketContactText}</span>
                        </a>
                      ) : (
                        <span className="text-xs sm:text-sm font-bold text-[#ff0033]">
                          {ticketContactText}
                        </span>
                      )
                    ) : !hasUserRegistered ? (
                      <span className="text-xs sm:text-sm font-semibold text-slate-400 flex items-center justify-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span>เฉพาะคู่ที่ขอออกบูธ/รับบัตรไว้</span>
                      </span>
                    ) : isMatchDayPassed ? (
                      <span className="text-xs sm:text-sm font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg flex items-center justify-center gap-1">
                        <span>🏁 สิ้นสุดการแข่งขันวันนั้นแล้ว</span>
                      </span>
                    ) : !isConfirmed ? (
                      <span className="text-xs sm:text-sm font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200 flex items-center justify-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>รอแอดมินยืนยันเบอร์ติดต่อ</span>
                      </span>
                    ) : ticketPhone ? (
                      <a 
                        href={`tel:${ticketPhone.replace(/[^0-9]/g, '')}`}
                        className="text-xs sm:text-sm font-bold text-[#ff0033] hover:underline flex items-center gap-1 cursor-pointer"
                        title="คลิกเพื่อโทรออก"
                      >
                        <span>{ticketContactText}</span>
                      </a>
                    ) : (
                      <span className="text-xs sm:text-sm font-bold text-[#ff0033]">
                        {ticketContactText}
                      </span>
                    )}
                  </div>
                </div>

                {/* Ticket Pickup Location Box (Centered Rounded Rectangle, Exact Mockup 2) */}
                <div className="flex items-center justify-center pt-1">
                  <div className="px-8 sm:px-12 py-2.5 rounded-2xl border-2 border-slate-800 bg-white text-center shadow-2xs">
                    {isAdmin ? (
                      <span className="text-xs sm:text-sm font-extrabold text-slate-800 tracking-wide">
                        {ticketLocation}
                      </span>
                    ) : !hasUserRegistered ? (
                      <span className="text-xs sm:text-sm font-semibold text-slate-400 flex items-center justify-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span>แสดงจุดรับบัตรเฉพาะคู่ที่ขอรับบัตรไว้</span>
                      </span>
                    ) : isMatchDayPassed ? (
                      <span className="text-xs sm:text-sm font-semibold text-slate-500">
                        🏁 สิ้นสุดวันแข่งขันแล้ว (ปิดแสดงข้อมูลจุดรับบัตร)
                      </span>
                    ) : !isConfirmed ? (
                      <span className="text-xs sm:text-sm font-bold text-amber-700 flex items-center justify-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>อยู่ระหว่างผู้ดูแลระบบตรวจสอบและกดยืนยันเบอร์ติดต่อประจำแมตช์นี้</span>
                      </span>
                    ) : (
                      <span className="text-xs sm:text-sm font-extrabold text-slate-800 tracking-wide">
                        {ticketLocation}
                        <span className="text-emerald-700 ml-2 font-bold">(ยืนยันเบอร์ติดต่อแล้ว ✅)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Admin Specific Action Box: ปุ่มกดยืนยันเบอร์ติดต่อของแต่ละแมตช์ (Item 2) */}
                {isAdmin && (
                  <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">
                        สถานะการแสดงผลสำหรับ User:
                      </span>
                      {isConfirmed ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-black border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>ยืนยันแล้ว (User มองเห็นเบอร์)</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold border border-amber-300 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-700" />
                          <span>ยังไม่ยืนยัน (User จะเห็นสถานะรอการยืนยัน)</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Confirm / Revoke Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleConfirmMatch(match)}
                        className={`px-3.5 py-1.5 rounded-xl font-black text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                          isConfirmed
                            ? 'bg-slate-200 hover:bg-slate-300 text-slate-700 border border-slate-300'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isConfirmed ? 'ยกเลิกการยืนยัน' : 'กดยืนยันเบอร์ติดต่อคู่นี้'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Registered Details Summary for this match */}
                {matchRegs.length > 0 && (
                  <div className="space-y-1.5">
                    {matchRegs.map(rec => (
                      <div key={rec.id} className="p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            คำขอของ <strong>{rec.brand}</strong>: ดีลเลอร์: <strong>{rec.dealerName && rec.dealerName !== '-' ? rec.dealerName : 'ไม่ระบุดีลเลอร์'}</strong> ({rec.dealerPhone || '-'})
                            {rec.ticketQuantity ? ` • บัตรดูบอล: ${rec.ticketQuantity} ใบ` : ''}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            rec.status === 'approved' ? 'bg-emerald-200 text-emerald-900 border border-emerald-300' : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}>
                            {rec.status === 'approved' ? 'อนุมัติแล้ว ✅' : 'รออนุมัติ ⏳'}
                          </span>
                        </div>
                        {rec.remark && (
                          <span className="text-slate-500 italic text-[11px]">
                            หมายเหตุ: {rec.remark}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Admin Modal: ตั้งค่าลิงก์ / นำเข้าเบอร์ติดต่อ */}
      {isLinksModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-xl w-full border border-slate-200 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    ตั้งค่าลิงก์ Google Sheet "เบอร์ติดต่อหน้าสนาม"
                  </h3>
                  <p className="text-xs text-slate-500">
                    ดึงข้อมูลเบอร์เจ้าหน้าที่ออกบูธและรับบัตรจากชีตทางการ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLinksModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black text-slate-800 block">
                URL ลิงก์ Google Sheet เบอร์ติดต่อหน้าสนาม:
              </label>
              <input
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                value={contactsSheetUrl}
                onChange={(e) => setContactsSheetUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
              />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ระบบจะค้นหาแท็บ League 1, League 2, League 3 หรือแท็บ "เบอร์ติดต่อหน้าสนาม" และนำเข้าพิกัดจุดรับตั๋วและเบอร์โทรศัพท์ผู้ประสานงานโดยอัตโนมัติ
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsLinksModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSyncContactsSheet}
                disabled={isSyncing}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'กำลังดึงข้อมูล...' : 'บันทึกลิงก์ & นำเข้าเดี๋ยวนี้'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
