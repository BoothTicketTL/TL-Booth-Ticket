import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  Home, 
  Calendar,
  Sparkles,
  ShieldCheck,
  Building2,
  Ticket,
  Clock,
  Link2,
  RefreshCw,
  Calendar as CalendarIcon,
  Settings,
  X,
  Save,
  Check,
  Zap,
  Lock,
  Send
} from 'lucide-react';
import { LeagueType, UserProfile, FixtureItem, RegistrationRecord, BrandType } from '../types';
import { ClubCrest } from './common/ClubCrest';
import { LeagueBadge } from './common/LeagueBadge';
import { SPONSOR_BRANDS } from '../data/fixtures';
import { 
  isCycleLockedByLineExport, 
  isMatchDateLockedByLineExport,
  lockCycleAfterLineExport, 
  unlockCycle, 
  subscribeToLineExportLocks,
  getLineExportLocks 
} from '../lib/lineExportLockService';
import { LineGroupExportModal } from './LineGroupExportModal';
import { 
  getFixtures, 
  subscribeToFixtures,
  getFixturesSheetT1T2Url,
  setFixturesSheetT1T2Url,
  getFixturesSheetT3Url,
  setFixturesSheetT3Url,
  syncFromOfficialDualSheets,
  getAutoSyncConfig,
  setAutoSyncConfig
} from '../lib/fixturesService';
import { getSimulatedDate, subscribeToSimulatedDate, setSimulatedDate, switchUserActiveBrand } from '../lib/firebase';
import { CURRENT_SIMULATED_DATE } from '../data/fixtures';
import { createRegistration, updateRegistration } from '../lib/firebase';
import { isMinusOrPlaceholder } from '../lib/stadiumContactsService';

interface CleanRegistrationViewProps {
  currentUser: UserProfile | null;
  initialLeague?: LeagueType;
  records?: RegistrationRecord[];
  onBackToHub: () => void;
  onOpenAdmin?: () => void;
  onSwitchRole?: () => void;
}

interface MatchFormState {
  dealerName: string;
  dealerPhone: string;
  ticketQuantity: string;
  ticketRequesterPhone: string;
  remark: string;
  isSaved?: boolean;
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

export const CleanRegistrationView: React.FC<CleanRegistrationViewProps> = ({
  currentUser,
  initialLeague = 'League 1',
  records = [],
  onBackToHub,
  onOpenAdmin,
  onSwitchRole,
}) => {
  const [selectedLeague, setSelectedLeague] = useState<LeagueType>(initialLeague);
  const [fixtures, setFixtures] = useState<FixtureItem[]>(() => getFixtures());
  const [simDate, setSimDate] = useState<string>(() => getSimulatedDate() || '2026-10-09');
  
  // Per-brand and per-match form entries state (strictly partitioned by brand e.g. BYD, Molten)
  const [brandFormEntries, setBrandFormEntries] = useState<Record<string, Record<string, MatchFormState>>>({});
  const [submittingMatchId, setSubmittingMatchId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Admin Modals & Controls State
  const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [t1t2UrlInput, setT1t2UrlInput] = useState<string>(() => getFixturesSheetT1T2Url() || '');
  const [t3UrlInput, setT3UrlInput] = useState<string>(() => getFixturesSheetT3Url() || '');
  const [autoSyncConfig, setAutoSyncConfigState] = useState(() => getAutoSyncConfig());

  // LINE Group Export & Lock states (User requirement)
  // "ถ้าข้อมูลมีการ Export ส่ง Line Group เมื่อไหร่ หน้าลงทะเบียนฝั่ง User ให้ล็อคข้อมูลไม่ให้ลงทะเบียนทันทีในทุกๆแมตช์ของสัปดาห์นั้น และเลื่อนข้อมูลแมตช์ 1 สัปดาห์ถัดไปให้อัตโนมัติ"
  const [lineLocks, setLineLocks] = useState(() => getLineExportLocks());
  const [isLineExportModalOpen, setIsLineExportModalOpen] = useState(false);
  const [isQuickExportConfirmOpen, setIsQuickExportConfirmOpen] = useState(false);
  const [advanceWeekOnExport, setAdvanceWeekOnExport] = useState(false);

  // Subscribe to real-time fixtures, simDate, and lineLocks
  useEffect(() => {
    const unsubFixtures = subscribeToFixtures((data) => {
      setFixtures(data);
    });
    const unsubSimDate = subscribeToSimulatedDate((newDate) => {
      setSimDate(newDate);
    });
    const unsubLocks = subscribeToLineExportLocks((locks) => {
      setLineLocks(locks);
    });
    return () => {
      unsubFixtures();
      unsubSimDate();
      unsubLocks();
    };
  }, []);

  // Sync initialLeague if prop changes
  useEffect(() => {
    if (initialLeague) {
      setSelectedLeague(initialLeague);
    }
  }, [initialLeague]);

  // User assigned brands list (supports multiple brands per user e.g. pakawan.pl has BYD & Molten)
  const userAssignedBrands = useMemo<BrandType[]>(() => {
    if (currentUser?.role === 'admin') {
      return SPONSOR_BRANDS.map(b => b.id as BrandType);
    }
    const brands = Array.isArray(currentUser?.assignedBrands) && currentUser.assignedBrands.length > 0
      ? currentUser.assignedBrands
      : [currentUser?.assignedBrand || 'BYD'];
    return brands.filter(b => b !== 'All') as BrandType[];
  }, [currentUser]);

  // Admin Brand Dropdown state (Item 7: "เพิ่ม Drop down ให้แอดมินเลือกแบรนด์ด้วย")
  const [adminBrand, setAdminBrand] = useState<BrandType>(() => {
    return currentUser?.assignedBrand && currentUser.assignedBrand !== 'All'
      ? (currentUser.assignedBrand as BrandType)
      : 'BYD';
  });

  // User selected brand for multi-brand users
  const [userSelectedBrand, setUserSelectedBrand] = useState<BrandType>(() => {
    return (userAssignedBrands[0] || 'BYD') as BrandType;
  });

  useEffect(() => {
    if (currentUser?.assignedBrand && currentUser.assignedBrand !== 'All') {
      setUserSelectedBrand(currentUser.assignedBrand as BrandType);
    }
  }, [currentUser?.assignedBrand]);

  // Active brand: Admin uses selected adminBrand, regular User uses userSelectedBrand (or assigned brand)
  const activeBrand = useMemo<BrandType>(() => {
    if (currentUser?.role === 'admin') {
      return adminBrand;
    }
    if (userAssignedBrands.includes(userSelectedBrand)) {
      return userSelectedBrand;
    }
    return (userAssignedBrands[0] || 'BYD') as BrandType;
  }, [currentUser, adminBrand, userAssignedBrands, userSelectedBrand]);

  // Synchronized Friday-to-Thursday match cycle across all 3 leagues (e.g. 9-15 ต.ค. 2569)
  const cycle = useMemo(() => {
    return getFridayToThursdayCycle(simDate || '2026-10-09');
  }, [simDate]);

  // Header range text: GUARANTEED identical across all 3 leagues (League 1, 2, 3)
  const weekRangeText = useMemo(() => {
    return `แมตช์วันที่ ${cycle.formattedRange}`;
  }, [cycle]);

  // Check if current week cycle is locked by LINE Group Export (User requirement)
  const isCurrentCycleLocked = useMemo(() => {
    return isCycleLockedByLineExport(cycle.fridayStr, cycle.thursdayStr);
  }, [cycle, lineLocks]);

  // Handle Export to LINE Group & Lock all leagues for current cycle
  // "ในหน้าลงทะเบียน หาก Admin กด Export ส่ง Line Group ของคำขอสัปดาห์นั้นแล้ว เราต้องการให้หน้าลงทะเบียนล็อคไม่ให้แก้ไขทุก League ในช่วงสัปดาห์นั้น แม้ League นั้นจะไม่มีคำขอลงทะเบียนก็ตาม"
  const handleConfirmQuickLineExport = () => {
    lockCycleAfterLineExport({
      startDate: cycle.fridayStr,
      endDate: cycle.thursdayStr,
      cycleRange: cycle.formattedRange,
      lineGroupName: 'LINE Group สรุปคำขอออกบูธและรับบัตร',
      exportedBy: currentUser?.email || 'Admin',
      autoAdvanceDays: advanceWeekOnExport ? 7 : 0,
    });
    setIsQuickExportConfirmOpen(false);
    setToastMessage(`✅ Export ส่ง Line Group สำเร็จ! ล็อคไม่ให้แก้ไขทุก League ในรอบ ${cycle.formattedRange} เรียบร้อยแล้ว${advanceWeekOnExport ? ' (เลื่อนสัปดาห์ถัดไป +7 วันแล้ว)' : ''}`);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Handle Admin unlock for current cycle
  const handleAdminUnlockCurrentCycle = () => {
    unlockCycle(cycle.fridayStr, cycle.thursdayStr);
    setToastMessage(`🔓 ปลดล็อครอบการแข่งขัน ${cycle.formattedRange} เรียบร้อยแล้ว (สามารถลงทะเบียนและแก้ไขข้อมูลได้ตามปกติ)`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Filter matches for the selected league for the Friday-to-Thursday match cycle (inclusive)
  // "ถ้า League ไหนไม่มีแข่งขันช่วงนั้น ให้ขึ้นแจ้งว่าไม่มีแมตช์แข่งขันในสัปดาห์นี้ League ไหนมีแมตช์แข่งขันก็ขึ้นตารางแข่งขันตามปกติ"
  const displayedMatches = useMemo(() => {
    const leagueMatches = fixtures.filter(f => f.league === selectedLeague);
    if (leagueMatches.length === 0) return [];

    // Filter strictly to matches within Friday-Thursday cycle (inclusive)
    const weekMatches = leagueMatches.filter(f => {
      const matchDateStr = f.matchDate;
      return matchDateStr >= cycle.fridayStr && matchDateStr <= cycle.thursdayStr;
    });

    // Sort chronologically by date and kickoff time
    return [...weekMatches].sort((a, b) => {
      const dateCompare = (a.matchDate || '').localeCompare(b.matchDate || '');
      if (dateCompare !== 0) return dateCompare;
      return (a.matchTime || '').localeCompare(b.matchTime || '');
    });
  }, [fixtures, selectedLeague, cycle]);

  // Compute number of matches per league in this week cycle for display in league tabs
  const leagueMatchCounts = useMemo(() => {
    const counts: Record<LeagueType, number> = {
      'League 1': 0,
      'League 2': 0,
      'League 3': 0,
    };
    fixtures.forEach(f => {
      if (f.matchDate >= cycle.fridayStr && f.matchDate <= cycle.thursdayStr) {
        if (counts[f.league] !== undefined) {
          counts[f.league] += 1;
        }
      }
    });
    return counts;
  }, [fixtures, cycle]);

  // Helper: Retrieve form state for a specific match under the currently ACTIVE brand (BYD, Molten, etc.)
  // "เมื่อสลับเป็น Molten ควรเห็นเฉพาะข้อมูลของ Molten ส่วนคำขอของ BYD ควรแสดงเฉพาะเมื่ออยู่ในแบรนด์ BYD เท่านั้น"
  const getMatchForm = (fixtureId: string): MatchFormState => {
    // 1. Check in-memory draft / edits for the active brand
    const brandMap = brandFormEntries[activeBrand];
    if (brandMap && brandMap[fixtureId]) {
      return brandMap[fixtureId];
    }

    // 2. Otherwise check saved records strictly for this active brand
    const savedRec = (records || []).find(r => r.fixtureId === fixtureId && r.brand === activeBrand);
    if (savedRec) {
      return {
        dealerName: savedRec.dealerName && savedRec.dealerName !== '-' ? savedRec.dealerName : '',
        dealerPhone: savedRec.dealerPhone && savedRec.dealerPhone !== '-' ? savedRec.dealerPhone : '',
        ticketQuantity: savedRec.ticketQuantity && savedRec.ticketQuantity > 0 ? String(savedRec.ticketQuantity) : '',
        ticketRequesterPhone: savedRec.ticketRequesterPhone && savedRec.ticketRequesterPhone !== '-' ? savedRec.ticketRequesterPhone : '',
        remark: savedRec.remark || '',
        isSaved: true,
      };
    }

    // 3. Otherwise return pristine blank form
    return {
      dealerName: '',
      dealerPhone: '',
      ticketQuantity: '',
      ticketRequesterPhone: '',
      remark: '',
      isSaved: false,
    };
  };

  // Update a single field in a match entry strictly for the active brand
  const updateField = (fixtureId: string, field: keyof MatchFormState, value: string) => {
    setBrandFormEntries(prev => {
      const brandMap = prev[activeBrand] || {};
      const currentForm = brandMap[fixtureId] || getMatchForm(fixtureId);
      return {
        ...prev,
        [activeBrand]: {
          ...brandMap,
          [fixtureId]: {
            ...currentForm,
            [field]: value,
            isSaved: false,
          }
        }
      };
    });
  };

  // Handle saving an individual match (Confirm button clicked for that match)
  const handleConfirmMatch = async (match: FixtureItem) => {
    const entry = getMatchForm(match.id);

    const isMatchLocked = isCurrentCycleLocked || isMatchDateLockedByLineExport(match.matchDate);
    if (isMatchLocked) {
      alert('ไม่สามารถลงทะเบียนหรือแก้ไขได้ เนื่องจากคำขอของสัปดาห์นี้ถูก Admin กด Export ส่ง Line Group เรียบร้อยแล้ว ระบบล็อคไม่ให้แก้ไขทุก League ในช่วงสัปดาห์นี้ แม้ League นั้นจะไม่มีคำขอลงทะเบียนก็ตาม (หาก Admin ต้องการแก้ไข กรุณากดปุ่มปลดล็อคด้านบนก่อน)');
      return;
    }

    const hasDealer = !isMinusOrPlaceholder(entry.dealerName);
    const hasTickets = !isMinusOrPlaceholder(entry.ticketQuantity) && Number(entry.ticketQuantity) > 0;

    const existing = (records || []).find(r => r.fixtureId === match.id && r.brand === activeBrand);

    if (!hasDealer && !hasTickets && !entry.remark.trim() && !existing) {
      alert('กรุณากรอกข้อมูลดีลเลอร์ขอออกบูธ หรือระบุจำนวนบัตรที่ต้องการขอรับ (หากไม่ประสงค์เข้าร่วมแมตช์นี้ ไม่จำเป็นต้องบันทึก)');
      return;
    }

    setSubmittingMatchId(match.id);

    try {
      const applicantEmail = currentUser?.email || 'applicant@planbmedia.co.th';
      const applicantName = currentUser?.displayName || currentUser?.email?.split('@')[0] || activeBrand;
      const applicantPhone = !isMinusOrPlaceholder(entry.dealerPhone) 
        ? entry.dealerPhone.trim() 
        : (!isMinusOrPlaceholder(entry.ticketRequesterPhone) ? entry.ticketRequesterPhone.trim() : '081-234-5678');

      const payload = {
        league: match.league,
        brand: activeBrand,
        fixtureId: match.id,
        matchTitle: `${match.homeTeam} vs ${match.awayTeam}`,
        stadium: match.stadium,
        matchDate: match.matchDate,
        month: match.month || match.matchDate?.slice(0, 7) || '2026-10',
        applicantName,
        applicantEmail,
        applicantPhone,
        organization: currentUser?.organization || `แบรนด์ ${activeBrand}`,
        boothRequired: hasDealer,
        dealerName: hasDealer ? entry.dealerName.trim() : '-',
        dealerPhone: hasDealer && !isMinusOrPlaceholder(entry.dealerPhone) ? entry.dealerPhone.trim() : '-',
        boothQuantity: hasDealer ? 1 : 0,
        ticketRequired: hasTickets,
        ticketQuantity: hasTickets ? (Number(entry.ticketQuantity) || 0) : 0,
        ticketRequesterName: hasTickets ? (!isMinusOrPlaceholder(entry.dealerName) ? entry.dealerName.trim() : applicantName) : '-',
        ticketRequesterPhone: hasTickets && !isMinusOrPlaceholder(entry.ticketRequesterPhone) ? entry.ticketRequesterPhone.trim() : '-',
        remark: entry.remark.trim() || '',
        status: existing ? existing.status : 'pending',
      };

      if (existing) {
        await updateRegistration(existing.id, payload);
      } else {
        await createRegistration(payload);
      }

      setBrandFormEntries(prev => ({
        ...prev,
        [activeBrand]: {
          ...(prev[activeBrand] || {}),
          [match.id]: {
            ...entry,
            isSaved: true,
          }
        }
      }));

      setToastMessage(
        hasDealer || hasTickets
          ? `✅ บันทึกข้อมูลแมตช์ ${match.homeTeam} vs ${match.awayTeam} (แบรนด์ ${activeBrand}) เรียบร้อยแล้ว`
          : `✅ บันทึกสถานะไม่ประสงค์ออกบูธและไม่รับบัตรสำหรับแมตช์ ${match.homeTeam} vs ${match.awayTeam} (แบรนด์ ${activeBrand}) เรียบร้อยแล้ว`
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      alert(`เกิดข้อผิดพลาดในการบันทึก: ${err.message || err}`);
    } finally {
      setSubmittingMatchId(null);
    }
  };

  // Admin: Sync Google Sheets now
  const handleAdminSyncSheets = async () => {
    setIsSyncing(true);
    try {
      setFixturesSheetT1T2Url(t1t2UrlInput);
      setFixturesSheetT3Url(t3UrlInput);
      const res = await syncFromOfficialDualSheets({
        t1t2UrlInput,
        t3UrlInput,
        target: 'all'
      });
      if (res.success) {
        setToastMessage(`✅ ซิงค์ตารางแข่งขันสำเร็จ! พบ ${res.fixtures.length} แมตช์`);
        setIsLinksModalOpen(false);
      } else {
        alert(`การซิงค์พบข้อผิดพลาด: ${res.error}`);
      }
    } catch (e: any) {
      alert(`เกิดข้อผิดพลาด: ${e.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setToastMessage(null), 4500);
    }
  };

  // Admin: Toggle Auto-Sync 30 นาที
  const handleToggleAutoSync = () => {
    const nextEnabled = !autoSyncConfig.enabled;
    const updated = setAutoSyncConfig({
      enabled: nextEnabled,
      intervalMinutes: 30
    });
    setAutoSyncConfigState(updated);
    setToastMessage(nextEnabled ? '⚡ เปิดใช้งาน Auto-Sync ทุก 30 นาทีแล้ว' : '⏸️ ปิดใช้งาน Auto-Sync แล้ว');
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Admin: Change Simulated Date (changes match cycle for all 3 leagues)
  const handleSelectDateCycle = (dateStr: string) => {
    setSimulatedDate(dateStr);
    setIsDateModalOpen(false);
    const newCycle = getFridayToThursdayCycle(dateStr);
    setToastMessage(`📅 สลับตารางเป็นรอบสัปดาห์: ${newCycle.formattedRange} เท่ากันทั้ง 3 ลีก`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden bg-gradient-to-b from-[#e6f7f9] via-white to-[#f0fbf7] text-slate-800 select-none pb-24">
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

      {/* Floating Save Success Toast */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button 
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Bar: "หน้าลงทะเบียน" on left + Hub Back Button */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 flex items-center justify-between gap-4 flex-wrap">
        {/* Left Side: Mockup Title "หน้าลงทะเบียน" */}
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">
            หน้าลงทะเบียน
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
          {/* Admin Specific Controls: Item 1 of User Brief */}
          {currentUser?.role === 'admin' && (
            <>
              {/* 1. ปุ่มตั้งค่าลิงก์/นำเข้าตาราง (แยก League 1-2 และ League 3) */}
              <button
                type="button"
                onClick={() => setIsLinksModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 text-xs font-black shadow-md border border-slate-700 cursor-pointer transition-all hover:scale-105"
                title="ตั้งค่าลิงก์ Google Sheets นำเข้าตาราง (แยก League 1-2 และ League 3)"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>ตั้งค่าลิงก์ตาราง (L1-2 / L3)</span>
              </button>

              {/* 2. ปุ่มเลือกวันที่ตารางการแข่งขัน */}
              <button
                type="button"
                onClick={() => setIsDateModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold shadow-xs border border-slate-300 cursor-pointer transition-all"
                title="เลือกวันที่และรอบสัปดาห์แข่งขัน"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-red-600" />
                <span>รอบ: {cycle.formattedRange.split(' ')[0]}</span>
              </button>

              {/* 3. ปุ่มซิงค์ข้อมูลจาก Sheet */}
              <button
                type="button"
                onClick={handleAdminSyncSheets}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-all disabled:opacity-50"
                title="ดึงข้อมูลอัปเดตจาก Google Sheets ทันที"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'กำลังซิงค์...' : 'ซิงค์จาก Sheet'}</span>
              </button>

              {/* 4. สวิตช์ Auto-Sync 30 นาที */}
              <button
                type="button"
                onClick={handleToggleAutoSync}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  autoSyncConfig.enabled
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                }`}
                title="เปิด/ปิดการซิงค์ข้อมูลอัตโนมัติทุก 30 นาที"
              >
                <Zap className={`w-3.5 h-3.5 ${autoSyncConfig.enabled ? 'text-emerald-600 fill-emerald-600' : 'text-slate-400'}`} />
                <span>Auto-Sync 30 นาที ({autoSyncConfig.enabled ? 'เปิด' : 'ปิด'})</span>
              </button>

              {/* 5. ปุ่ม Export ส่ง Line Group (ล็อคข้อมูลสัปดาห์นี้ & เลื่อนไปสัปดาห์ถัดไปอัตโนมัติ) */}
              <button
                type="button"
                onClick={() => setIsQuickExportConfirmOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md border border-emerald-500 cursor-pointer transition-all hover:scale-105 active:scale-95"
                title="Export ส่ง Line Group, ล็อคไม่ให้ User ลงทะเบียนในทุกแมตช์ของสัปดาห์นี้ทันที และเลื่อนไปสัปดาห์ถัดไปอัตโนมัติ"
              >
                <Send className="w-3.5 h-3.5 text-white" />
                <span>Export ส่ง Line Group</span>
              </button>

              {/* สถานะล็อคทุก League เมื่อ Export ส่ง Line แล้ว */}
              {isCurrentCycleLocked && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-100 border border-rose-300 text-rose-900 text-xs font-black shadow-2xs">
                  <Lock className="w-3.5 h-3.5 text-rose-600" />
                  <span>ล็อคทุก League แล้ว (ส่ง Line แล้ว)</span>
                  <button
                    type="button"
                    onClick={handleAdminUnlockCurrentCycle}
                    className="underline text-[11px] text-rose-700 hover:text-rose-950 font-black ml-1 cursor-pointer"
                    title="ปลดล็อคให้สามารถลงทะเบียนและแก้ไขข้อมูลได้อีกครั้ง"
                  >
                    ปลดล็อค
                  </button>
                </div>
              )}
            </>
          )}

          {/* Switch Role Button (Admin ⇄ User) */}
          {onSwitchRole && (
            <button
              type="button"
              onClick={onSwitchRole}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black shadow-md border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
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
              const matchCount = leagueMatchCounts[lg] || 0;
              const hasMatches = matchCount > 0;
              const colorStyle = 
                lg === 'League 1' 
                  ? (isSelected ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 hover:bg-rose-50')
                  : lg === 'League 2'
                  ? (isSelected ? 'bg-blue-600 text-white shadow-xs' : 'text-blue-700 hover:bg-blue-50')
                  : (isSelected ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50');

              return (
                <button
                  key={lg}
                  id={`tab-clean-${lg.replace(/\s+/g, '-').toLowerCase()}`}
                  type="button"
                  onClick={() => setSelectedLeague(lg)}
                  className={`px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${colorStyle}`}
                >
                  <span>{lg}</span>
                  {!hasMatches ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/90 text-slate-500'
                    }`}>
                      ไม่มีแข่ง
                    </span>
                  ) : (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                      isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {matchCount}
                    </span>
                  )}
                  {isCurrentCycleLocked && (
                    <span className="text-[10px] ml-0.5" title="สัปดาห์นี้ถูกส่ง LINE Group แล้ว ล็อคไม่ให้แก้ไขทุก League">
                      🔒
                    </span>
                  )}
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
                onChange={(e) => setAdminBrand(e.target.value as BrandType)}
                className="text-xs font-black text-emerald-800 bg-transparent border-0 focus:outline-none cursor-pointer"
                title="เลือกแบรนด์ที่ต้องการดูหรือจัดการข้อมูล"
              >
                {SPONSOR_BRANDS.map((b) => (
                  <option key={b.id} value={b.id} className="text-slate-800 font-bold">
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : userAssignedBrands.length > 1 ? (
            /* Multi-brand client dropdown (เช่น pakawan.pl สลับระหว่าง BYD และ Molten) */
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shrink-0"></span>
              <span className="text-xs font-bold text-emerald-900 shrink-0">สลับแบรนด์:</span>
              <select
                value={activeBrand}
                onChange={(e) => {
                  const selected = e.target.value as BrandType;
                  setUserSelectedBrand(selected);
                  switchUserActiveBrand(selected);
                }}
                className="text-xs font-black text-emerald-950 bg-white px-2 py-0.5 rounded-lg border border-emerald-300 focus:outline-none cursor-pointer shadow-2xs"
                title="คุณได้รับสิทธิ์ดูแลหลายแบรนด์ สามารถสลับแบรนด์เพื่อดูข้อมูลและลงทะเบียนได้ที่นี่"
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

          {/* Title: ตารางการแข่งขัน แมตช์วันที่ 9-15 ต.ค.2569 (เป๊ะเท่ากันทั้ง 3 ลีก) */}
          <div className="space-y-1">
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
              ตารางการแข่งขัน {weekRangeText}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-slate-500">
              กรอกข้อมูลในช่องด้านล่างเพื่อยืนยันการลงทะเบียนในแต่ละแมตช์การแข่งขัน
            </p>
          </div>
        </div>

        {/* Week Lock Notice when exported to LINE Group (User requirement) */}
        {isCurrentCycleLocked && (
          <div className="p-4 sm:p-5 rounded-3xl bg-amber-50/90 border-2 border-amber-300 text-amber-950 flex flex-col sm:flex-row items-center justify-between gap-3.5 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-200 text-amber-800 flex items-center justify-center shrink-0 shadow-2xs">
                <Lock className="w-5 h-5 text-amber-900" />
              </div>
              <div className="space-y-0.5 text-left">
                <p className="text-xs sm:text-sm font-black text-amber-950 flex items-center gap-2">
                  <span>🔒 ปิดรับลงทะเบียนและล็อคไม่ให้แก้ไขทุก League ในสัปดาห์นี้ ({cycle.formattedRange})</span>
                </p>
                <p className="text-[11px] sm:text-xs text-amber-800">
                  คำขอในสัปดาห์นี้ถูก Admin กด Export ส่ง Line Group เรียบร้อยแล้ว ระบบล็อคไม่ให้แก้ไขทุก League ในช่วงสัปดาห์นี้ แม้ League นั้นจะไม่มีคำขอลงทะเบียนก็ตาม
                  {currentUser?.role === 'admin' ? ' (แอดมินสามารถกดปุ่มปลดล็อคเพื่อเปิดให้แก้ไขได้)' : ''}
                </p>
              </div>
            </div>
            {currentUser?.role === 'admin' ? (
              <button
                type="button"
                onClick={handleAdminUnlockCurrentCycle}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-amber-950 border border-amber-400 text-xs font-bold shadow-2xs cursor-pointer shrink-0 hover:scale-105 active:scale-95 transition-all"
                title="คลิกเพื่อปลดล็อคให้สามารถลงทะเบียนและแก้ไขข้อมูลได้อีกครั้ง"
              >
                🔓 ปลดล็อคเพื่อแก้ไข
              </button>
            ) : (
              <span className="px-3.5 py-1.5 rounded-xl bg-amber-200 text-amber-950 text-xs font-black shrink-0 border border-amber-300 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" />
                <span>ส่ง Line Group แล้ว 🔒</span>
              </span>
            )}
          </div>
        )}

        {/* Empty State: ถ้า League ไหนไม่มีแข่งขันช่วงนั้น ให้ขึ้นแจ้งว่าไม่มีแมตช์แข่งขันในสัปดาห์นี้ */}
        {displayedMatches.length === 0 && (
          <div className="p-8 sm:p-12 text-center bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm space-y-4 max-w-xl mx-auto my-6 animate-in fade-in">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-2xs">
              <Calendar className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                <span>{selectedLeague}</span>
                <span>•</span>
                <span>{weekRangeText}</span>
              </div>
              <h3 className="text-base sm:text-xl font-black text-slate-900">
                ไม่มีแมตช์แข่งขันในสัปดาห์นี้
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                ในสัปดาห์นี้ไม่มีโปรแกรมการแข่งขันสำหรับรายการ <strong>{selectedLeague}</strong><br className="hidden sm:inline" />
                {isCurrentCycleLocked 
                  ? 'รอบสัปดาห์นี้ถูก Admin ส่ง Line Group และล็อคข้อมูลเรียบร้อยแล้วในทุก League (รวมถึงลีกที่ไม่มีคำขอลงทะเบียน)'
                  : 'ท่านสามารถเลือกแท็บลีกอื่นด้านบนที่มีแมตช์แข่งขันเพื่อดูตารางและลงทะเบียนได้ตามปกติ'}
              </p>
            </div>
          </div>
        )}

        {/* Matches List: Exact Mockup Layout with Input Fields (as per uploaded image) */}
        <div className="space-y-12 sm:space-y-14 pt-4">
          {displayedMatches.map((match) => {
            const form = getMatchForm(match.id);
            const isCurrentSubmitting = submittingMatchId === match.id;
            const isSaved = form.isSaved;
            // Lock inputs if current week is exported to LINE Group (User requirement)
            // "ในหน้าลงทะเบียน หาก Admin กด Export ส่ง Line Group ของคำขอสัปดาห์นั้นแล้ว เราต้องการให้หน้าลงทะเบียนล็อคไม่ให้แก้ไขทุก League ในช่วงสัปดาห์นั้น แม้ League นั้นจะไม่มีคำขอลงทะเบียนก็ตาม"
            const isMatchLocked = isCurrentCycleLocked || isMatchDateLockedByLineExport(match.matchDate);
            const isFormDisabled = isMatchLocked;

            return (
              <div 
                key={match.id}
                id={`clean-match-card-${match.id}`}
                className="relative pt-6 pb-6 border-t-2 border-[#ff0033] space-y-4"
              >
                {/* Time & Date Badges on top-left of the red dividing line */}
                <div className="absolute -top-3.5 left-0 flex items-center gap-1.5 z-10">
                  <span className="bg-[#cc0000] text-white text-xs font-bold px-2.5 py-0.5 rounded shadow-xs tracking-wider">
                    {match.matchTime ? match.matchTime.slice(0, 5) : '18:00'}
                  </span>
                  <span className="bg-slate-900 text-white text-[11px] font-bold px-2 py-0.5 rounded shadow-xs">
                    {formatThaiMatchDate(match.matchDate)}
                  </span>
                </div>

                {/* Top-Right: Status indicator when locked or registered */}
                <div className="absolute -top-3.5 right-0 z-10 flex items-center gap-1.5">
                  {isMatchLocked && (
                    <span className="bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs flex items-center gap-1">
                      <Lock className="w-3 h-3 text-rose-600" />
                      <span>ส่ง LINE แล้ว (ล็อคข้อมูลทุก League)</span>
                    </span>
                  )}
                  {isSaved && (
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      บันทึกข้อมูลแล้ว ({activeBrand})
                    </span>
                  )}
                </div>

                {/* Center Match Banner: Home Team - Crest - [ V ] : [ S ] - Crest - Away Team */}
                <div className="flex items-center justify-center gap-3 sm:gap-6 pt-2">
                  {/* Home Team Name */}
                  <div className="flex-1 text-right">
                    <span 
                      className="text-sm sm:text-base md:text-lg font-bold text-slate-800 leading-snug line-clamp-2"
                      title={match.homeTeam}
                    >
                      {match.homeTeam}
                    </span>
                  </div>

                  {/* Home Team Crest (Large & Prominent) */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0 drop-shadow-md transition-transform hover:scale-105">
                    <ClubCrest clubName={match.homeTeam} league={match.league} size="lg" showTooltip />
                  </div>

                  {/* Red [ V ] : [ S ] Box (Exact Mockup Design) */}
                  <div className="flex items-center gap-1.5 shrink-0 px-1 sm:px-2">
                    <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#cc0000] text-white font-black text-sm sm:text-base flex items-center justify-center shadow-xs">
                      V
                    </span>
                    <span className="text-[#cc0000] font-black text-base sm:text-xl">:</span>
                    <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#cc0000] text-white font-black text-sm sm:text-base flex items-center justify-center shadow-xs">
                      S
                    </span>
                  </div>

                  {/* Away Team Crest (Large & Prominent) */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0 drop-shadow-md transition-transform hover:scale-105">
                    <ClubCrest clubName={match.awayTeam} league={match.league} size="lg" showTooltip />
                  </div>

                  {/* Away Team Name */}
                  <div className="flex-1 text-left">
                    <span 
                      className="text-sm sm:text-base md:text-lg font-bold text-slate-800 leading-snug line-clamp-2"
                      title={match.awayTeam}
                    >
                      {match.awayTeam}
                    </span>
                  </div>
                </div>

                {/* Stadium Name with Stadium Icon (Exact Mockup Design) */}
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-700 font-medium">
                  <span className="inline-block text-xs">🏟️</span>
                  <span>{match.stadium}</span>
                </div>

                {/* Row 1: 4 Rounded Input Boxes (Exact Mockup Design from Image) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl mx-auto w-full pt-1">
                  {/* Box 1: ชื่อดีลเลอร์ */}
                  <input
                    type="text"
                    disabled={isFormDisabled || isCurrentSubmitting}
                    placeholder="ชื่อดีลเลอร์"
                    value={form.dealerName}
                    onChange={(e) => updateField(match.id, 'dealerName', e.target.value)}
                    className={`w-full py-2.5 px-4 text-xs sm:text-sm font-medium placeholder-slate-400 border rounded-xl text-center shadow-2xs focus:outline-none transition-all ${
                      isFormDisabled 
                        ? 'bg-slate-100/90 border-slate-300 text-slate-500 cursor-not-allowed' 
                        : 'bg-white border-slate-700 text-slate-800 focus:ring-2 focus:ring-blue-600'
                    }`}
                  />

                  {/* Box 2: ชื่อ+เบอร์ผู้ขอออกบูธ */}
                  <input
                    type="text"
                    disabled={isFormDisabled || isCurrentSubmitting}
                    placeholder="ชื่อ+เบอร์ผู้ขอออกบูธ"
                    value={form.dealerPhone}
                    onChange={(e) => updateField(match.id, 'dealerPhone', e.target.value)}
                    className={`w-full py-2.5 px-4 text-xs sm:text-sm font-medium placeholder-slate-400 border rounded-xl text-center shadow-2xs focus:outline-none transition-all ${
                      isFormDisabled 
                        ? 'bg-slate-100/90 border-slate-300 text-slate-500 cursor-not-allowed' 
                        : 'bg-white border-slate-700 text-slate-800 focus:ring-2 focus:ring-blue-600'
                    }`}
                  />

                  {/* Box 3: จำนวนบัตร */}
                  <input
                    type="text"
                    disabled={isFormDisabled || isCurrentSubmitting}
                    placeholder="จำนวนบัตร"
                    value={form.ticketQuantity}
                    onChange={(e) => updateField(match.id, 'ticketQuantity', e.target.value)}
                    className={`w-full py-2.5 px-4 text-xs sm:text-sm font-medium placeholder-slate-400 border rounded-xl text-center shadow-2xs focus:outline-none transition-all ${
                      isFormDisabled 
                        ? 'bg-slate-100/90 border-slate-300 text-slate-500 cursor-not-allowed' 
                        : 'bg-white border-slate-700 text-slate-800 focus:ring-2 focus:ring-blue-600'
                    }`}
                  />

                  {/* Box 4: ชื่อ+เบอร์ผู้ขอรับบัตร */}
                  <input
                    type="text"
                    disabled={isFormDisabled || isCurrentSubmitting}
                    placeholder="ชื่อ+เบอร์ผู้ขอรับบัตร"
                    value={form.ticketRequesterPhone}
                    onChange={(e) => updateField(match.id, 'ticketRequesterPhone', e.target.value)}
                    className={`w-full py-2.5 px-4 text-xs sm:text-sm font-medium placeholder-slate-400 border rounded-xl text-center shadow-2xs focus:outline-none transition-all ${
                      isFormDisabled 
                        ? 'bg-slate-100/90 border-slate-300 text-slate-500 cursor-not-allowed' 
                        : 'bg-white border-slate-700 text-slate-800 focus:ring-2 focus:ring-blue-600'
                    }`}
                  />
                </div>

                {/* Row 2: Wide Remark Box + Navy Blue Button "ยืนยัน" (Exact Mockup Design from Image) */}
                <div className="flex flex-col sm:flex-row items-center gap-3 max-w-4xl mx-auto w-full">
                  {/* Remark / หมายเหตุ Wide Box */}
                  <input
                    type="text"
                    disabled={isFormDisabled || isCurrentSubmitting}
                    placeholder="Remark / หมายเหตุ"
                    value={form.remark}
                    onChange={(e) => updateField(match.id, 'remark', e.target.value)}
                    className={`flex-1 w-full py-2.5 px-6 text-xs sm:text-sm font-medium placeholder-slate-400 border rounded-xl text-center shadow-2xs focus:outline-none transition-all ${
                      isFormDisabled 
                        ? 'bg-slate-100/90 border-slate-300 text-slate-500 cursor-not-allowed' 
                        : 'bg-white border-slate-700 text-slate-800 focus:ring-2 focus:ring-blue-600'
                    }`}
                  />

                  {/* Navy Blue Button "ยืนยัน" */}
                  <button
                    type="button"
                    disabled={isFormDisabled || isCurrentSubmitting}
                    onClick={() => handleConfirmMatch(match)}
                    className={`w-full sm:w-auto px-10 sm:px-14 py-2.5 font-bold text-sm sm:text-base rounded-xl shadow-md transition-all shrink-0 ${
                      isFormDisabled 
                        ? 'bg-slate-400 text-slate-200 cursor-not-allowed opacity-80' 
                        : 'bg-[#172554] hover:bg-[#1e3a8a] text-white cursor-pointer hover:scale-102 active:scale-98 disabled:opacity-50'
                    }`}
                  >
                    {isCurrentSubmitting 
                      ? 'กำลังบันทึก...' 
                      : isFormDisabled 
                      ? '🔒 ปิดรับลงทะเบียนแล้ว' 
                      : isSaved 
                      ? 'ยืนยันแล้ว ✅' 
                      : 'ยืนยัน'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Admin Modal 1: ตั้งค่าลิงก์นำเข้าตาราง (แยก League 1-2 และ League 3) */}
      {isLinksModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-xl w-full border border-slate-200 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    ตั้งค่าลิงก์ Google Sheets ตารางแข่งขัน
                  </h3>
                  <p className="text-xs text-slate-500">
                    แยกกรอก 1 ลิงก์สำหรับ League 1-2 และ 1 ลิงก์สำหรับ League 3
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

            <div className="space-y-4">
              {/* L1-2 URL */}
              <div className="space-y-1.5 p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200">
                <label className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                  <span>1. ลิงก์ตารางแข่งขัน League 1 & League 2:</span>
                </label>
                <p className="text-[11px] text-slate-600">
                  ต้องมีแท็บ T1-(THA) และ T2-(THA) สำหรับไทยลีก 1 และ 2
                </p>
                <input
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  value={t1t2UrlInput}
                  onChange={(e) => setT1t2UrlInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                />
              </div>

              {/* L3 URL */}
              <div className="space-y-1.5 p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200">
                <label className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  <span>2. ลิงก์ตารางแข่งขัน League 3 (BYD Dolphin):</span>
                </label>
                <p className="text-[11px] text-slate-600">
                  รองรับแท็บภูมิภาค 6 โซน (NORTH, NORTHEAST, EAST, CENTRAL, WEST, SOUTH)
                </p>
                <input
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  value={t3UrlInput}
                  onChange={(e) => setT3UrlInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
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
                onClick={handleAdminSyncSheets}
                disabled={isSyncing}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'กำลังซิงค์...' : 'บันทึกลิงก์ & ซิงค์ทันที'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Modal 2: เลือกวันที่ตารางการแข่งขัน */}
      {isDateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-red-600" />
                <h3 className="text-base font-black text-slate-900">
                  เลือกวันที่ตารางการแข่งขัน
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              เลือกรอบสัปดาห์แข่งขัน (นับวันศุกร์-พฤหัสบดี) เพื่อแสดงผลแมตช์ให้ตรงกันทั้ง 3 ลีก
            </p>

            {/* Quick Cycle Buttons */}
            <div className="space-y-2">
              {[
                { date: '2026-10-09', label: '9-15 ต.ค. 2569 (สัปดาห์ปัจจุบัน)', isCurrent: true },
                { date: '2026-10-16', label: '16-22 ต.ค. 2569 (สัปดาห์ถัดไป)' },
                { date: '2026-10-23', label: '23-29 ต.ค. 2569' },
                { date: '2026-10-30', label: '30 ต.ค. - 5 พ.ย. 2569' },
                { date: '2026-09-18', label: '18-24 ก.ย. 2569 (นัดเปิดฤดูกาล L3)' },
              ].map((item) => (
                <button
                  key={item.date}
                  type="button"
                  onClick={() => handleSelectDateCycle(item.date)}
                  className={`w-full p-3 rounded-2xl text-xs font-bold text-left flex items-center justify-between border transition-all cursor-pointer ${
                    simDate === item.date
                      ? 'bg-red-50 border-red-300 text-red-900 shadow-xs'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <span>{item.label}</span>
                  {simDate === item.date && (
                    <Check className="w-4 h-4 text-red-600" />
                  )}
                </button>
              ))}
            </div>

            {/* Custom Date Input */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <label className="text-xs font-bold text-slate-700">หรือระบุวันที่เจาะจง (YYYY-MM-DD):</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={simDate}
                  onChange={(e) => {
                    if (e.target.value) handleSelectDateCycle(e.target.value);
                  }}
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Modal 3: ยืนยัน Export ส่ง Line Group (ล็อคข้อมูล & เลื่อนสัปดาห์ถัดไปอัตโนมัติ) */}
      {isQuickExportConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full border border-slate-200 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Export ข้อมูลส่ง LINE Group & ล็อคระบบ
                  </h3>
                  <p className="text-xs text-slate-500">
                    รอบการแข่งขัน: <strong>{cycle.formattedRange}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickExportConfirmOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <p className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  <span>ระบบจะดำเนินการตามข้อกำหนดดังนี้:</span>
                </p>
                <ul className="space-y-1.5 pl-4 text-emerald-900 list-disc font-medium">
                  <li>
                    <strong>ล็อคไม่ให้แก้ไขทุก League ทันที:</strong> ปิดรับการลงทะเบียนและล็อคไม่ให้แก้ไขในทุกแมตช์ของรอบสัปดาห์นี้ ({cycle.formattedRange}) ทั้ง League 1, League 2 และ League 3 แม้ League นั้นจะไม่มีคำขอลงทะเบียนก็ตาม
                  </li>
                  <li>
                    <strong>ส่งข้อมูลสรุปไปยัง LINE Group:</strong> สรุปยอดคำขอออกบูธและรับบัตรส่งตัวแทนแบรนด์และสโมสร
                  </li>
                </ul>
              </div>

              {/* Checkbox option to advance week */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                <input
                  type="checkbox"
                  checked={advanceWeekOnExport}
                  onChange={(e) => setAdvanceWeekOnExport(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 mt-0.5 shrink-0"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-900">เลื่อนตารางการแข่งขันไป 1 สัปดาห์ถัดไป (+7 วัน) ทันทีหลัง Export</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    (หากไม่ติ๊ก ระบบจะคงอยู่ที่สัปดาห์นี้เพื่อให้ตรวจสอบสถานะล็อคทุก League ได้ทันที)
                  </p>
                </div>
              </label>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <span className="font-medium text-slate-600">สถานะปัจจุบันของรอบนี้:</span>
                <span className={`px-2 py-0.5 rounded-lg font-black text-[11px] ${
                  isCurrentCycleLocked 
                    ? 'bg-rose-100 text-rose-800 border border-rose-300' 
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}>
                  {isCurrentCycleLocked ? '🔒 ล็อคแล้ว (เคย Export แล้ว)' : '🟢 กำลังเปิดรับลงทะเบียน'}
                </span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsQuickExportConfirmOpen(false);
                  setIsLineExportModalOpen(true);
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
              >
                เปิดหน้าต่างตั้งค่า LINE ละเอียด...
              </button>
              <button
                type="button"
                onClick={handleConfirmQuickLineExport}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md cursor-pointer transition-transform hover:scale-102"
              >
                <Send className="w-3.5 h-3.5" />
                <span>ยืนยัน Export ส่ง LINE & ล็อครอบนี้</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full LineGroupExportModal */}
      {isLineExportModalOpen && (
        <LineGroupExportModal
          isOpen={isLineExportModalOpen}
          onClose={() => setIsLineExportModalOpen(false)}
          registrations={records || []}
          onDateAdvanced={() => {
            setIsLineExportModalOpen(false);
            setToastMessage(`✅ Export ส่ง Line Group และล็อคข้อมูลเรียบร้อยแล้ว`);
            setTimeout(() => setToastMessage(null), 4000);
          }}
        />
      )}
    </div>
  );
};
