import React, { useState, useMemo, useEffect } from 'react';
import { 
  Phone, 
  MapPin, 
  Building2, 
  Ticket, 
  Clock, 
  Search, 
  Copy, 
  Check, 
  Info, 
  ShieldCheck, 
  ChevronRight, 
  Building, 
  Filter, 
  Calendar, 
  PlusCircle, 
  Layers, 
  ExternalLink,
  Sparkles,
  PhoneCall,
  UserCheck,
  Edit3,
  X,
  Save,
  AlertCircle,
  FileSpreadsheet,
  RefreshCw,
  Lock,
  MessageSquare,
  FileText,
  BookOpen,
  ShieldAlert,
  ArrowLeft
} from 'lucide-react';
import { LeagueType, BrandType, RegistrationRecord, UserProfile, StadiumContact, MatchStadiumContact } from '../types';
import { INITIAL_STADIUM_CONTACTS } from '../data/stadiumContacts';
import { LEAGUE_COLOR_MAP, SPONSOR_BRANDS } from '../data/fixtures';
import { subscribeToMatchContacts, saveMatchContact, subscribeToSimulatedDate, getSimulatedDate } from '../lib/firebase';
import { getSponsorBrands, subscribeToBrands, SponsorBrandItem } from '../lib/brandService';
import { AdminClubPhonebookModal } from './AdminClubPhonebookModal';
import { ClubCrest } from './common/ClubCrest';
import { LeagueBadge } from './common/LeagueBadge';
import { subscribeToClubPhonebook, getMasterClubPhonebook } from '../lib/clubPhonebookService';
import { 
  isMatchContactConfirmed,
  confirmMatchContact,
  unconfirmMatchContact,
  bulkConfirmMatchesForWeek,
  subscribeToMatchConfirmations,
  isMatchDayFinished
} from '../lib/matchConfirmationService';
import { getCurrentWeekInfo } from '../lib/stadiumPhonebookService';
import { 
  syncStadiumContactsFromOfficialSheet, 
  getStadiumContactsSyncMeta, 
  getStadiumContactsSheetUrl,
  subscribeToContactsSync, 
  StadiumContactsSyncMeta,
  findContactForStadiumOrMatch,
  findLeagueHomeTeamContact,
  isValidPhoneNumber,
  formatPhoneNumber
} from '../lib/stadiumContactsService';
import { getFixturesSheetT1T2Url } from '../lib/fixturesService';

interface StadiumContactsViewProps {
  records?: RegistrationRecord[];
  currentUser?: UserProfile | null;
  selectedLeagueFilter?: LeagueType | 'All';
  onNavigateToRegister: (brand?: BrandType, league?: LeagueType) => void;
  onOpenSheetsModal?: (tab?: 'fixtures' | 'contacts' | 'export') => void;
  onBackToHub?: () => void;
}

export const StadiumContactsView: React.FC<StadiumContactsViewProps> = ({
  records = [],
  currentUser,
  selectedLeagueFilter = 'All',
  onNavigateToRegister,
  onOpenSheetsModal,
  onBackToHub,
}) => {
  // Dynamic sponsor brands from config/Firestore
  const [dynamicBrands, setDynamicBrands] = useState<SponsorBrandItem[]>(getSponsorBrands());

  useEffect(() => {
    const unsubBrands = subscribeToBrands((list) => {
      setDynamicBrands(list);
    });
    return () => unsubBrands();
  }, []);

  // Real-time club phonebook from Google Sheet sync & admin updates
  const [phonebookClubs, setPhonebookClubs] = useState(getMasterClubPhonebook());
  useEffect(() => {
    const unsub = subscribeToClubPhonebook((list) => {
      setPhonebookClubs(list);
    });
    return () => unsub();
  }, []);

  const isUserAdmin = currentUser?.role === 'admin';
  // If user is brand client (role: user or assignedBrand is set), lock them to their assignedBrand!
  const clientAssignedBrand = currentUser?.assignedBrand && currentUser.assignedBrand !== 'All'
    ? currentUser.assignedBrand
    : (currentUser?.role === 'user' ? (currentUser.organization || 'BYD') : null);

  // Admin client simulation state (allows admin to test client view)
  const [simulateClientBrand, setSimulateClientBrand] = useState<string | null>(null);

  // The active brand restriction
  const activeLockBrand = !isUserAdmin ? clientAssignedBrand : simulateClientBrand;

  // Brand selection tab: default to assigned brand, or matching user organization
  const initialBrand = useMemo<BrandType | 'ALL_STADIUMS'>(() => {
    if (activeLockBrand) {
      return activeLockBrand as BrandType;
    }
    if (currentUser?.organization) {
      const matched = dynamicBrands.find(b => 
        currentUser.organization?.toLowerCase().includes(b.id.toLowerCase())
      );
      if (matched) return matched.id as BrandType;
    }
    return 'BYD';
  }, [activeLockBrand, currentUser, dynamicBrands]);

  const [selectedBrand, setSelectedBrand] = useState<BrandType | 'ALL_STADIUMS'>(initialBrand);

  // Auto-sync selectedBrand when activeLockBrand changes
  useEffect(() => {
    if (activeLockBrand) {
      setSelectedBrand(activeLockBrand as BrandType);
    }
  }, [activeLockBrand]);

  // STRICT DATA ISOLATION:
  // If activeLockBrand is active, any records from other brands are strictly filtered out so no customer can ever see another brand's booth or ticket data!
  const secureRecords = useMemo(() => {
    if (activeLockBrand) {
      return records.filter(r => r.brand === activeLockBrand);
    }
    return records;
  }, [records, activeLockBrand]);

  const [selectedLeague, setSelectedLeague] = useState<LeagueType | 'All'>(selectedLeagueFilter);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Real-time custom match contacts stored in Firebase/local
  const [customContacts, setCustomContacts] = useState<MatchStadiumContact[]>([]);
  
  // Modal state for Add/Update Stadium Contact
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [formContactId, setFormContactId] = useState<string>('');
  const [formStadiumName, setFormStadiumName] = useState('');
  const [formLeague, setFormLeague] = useState<LeagueType>('League 1');
  const [formHomeClub, setFormHomeClub] = useState('');
  const [formProvince, setFormProvince] = useState('');
  const [formBoothName, setFormBoothName] = useState('');
  const [formBoothPhone, setFormBoothPhone] = useState('');
  const [formBoothLocation, setFormBoothLocation] = useState('');
  const [formTicketName, setFormTicketName] = useState('');
  const [formTicketPhone, setFormTicketPhone] = useState('');
  const [formTicketLocation, setFormTicketLocation] = useState('');
  const [formHours, setFormHours] = useState('14:00 - 19:30 น. (วันแข่งขัน)');
  const [formNote, setFormNote] = useState('');
  const [formRemark, setFormRemark] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  // Admin Master Phonebook Directory Modal State
  const [isPhonebookModalOpen, setIsPhonebookModalOpen] = useState(false);
  const [showAdminRequiredNotice, setShowAdminRequiredNotice] = useState(false);

  // Stadium Contacts Sync State & Subscription
  const [contactsSyncMeta, setContactsSyncMeta] = useState<StadiumContactsSyncMeta>(getStadiumContactsSyncMeta());
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);

  // Reference simulated date (for checking finished match days)
  const [simDate, setSimDate] = useState<string>(getSimulatedDate());
  const [, setPhonebookVersion] = useState<number>(0);

  // Match contact confirmation by Admin state
  const [confirmationsVersion, setConfirmationsVersion] = useState<number>(0);
  const [adminConfirmFilter, setAdminConfirmFilter] = useState<'all' | 'pending' | 'confirmed'>('all');
  const [isBulkConfirming, setIsBulkConfirming] = useState<boolean>(false);

  useEffect(() => {
    const unsubContacts = subscribeToMatchContacts((list) => {
      setCustomContacts(list);
    });
    const unsubMeta = subscribeToContactsSync((meta) => {
      setContactsSyncMeta(meta);
    });
    const unsubDate = subscribeToSimulatedDate((newDate) => {
      setSimDate(newDate);
    });
    const unsubPhonebook = subscribeToClubPhonebook(() => {
      setPhonebookVersion(v => v + 1);
    });
    const unsubConfirmations = subscribeToMatchConfirmations(() => {
      setConfirmationsVersion(v => v + 1);
    });

    return () => {
      unsubContacts();
      unsubMeta();
      unsubDate();
      unsubPhonebook();
      unsubConfirmations();
    };
  }, []);

  const handleConfirmMatch = async (record: RegistrationRecord) => {
    try {
      const homeClub = record.matchTitle.split(' vs ')[0]?.trim() || '';
      const adminName = currentUser?.displayName || currentUser?.email || 'Admin';
      await confirmMatchContact({
        fixtureId: record.fixtureId,
        matchDate: record.matchDate,
        homeClub,
        stadiumName: record.stadium,
        league: record.league,
        adminName,
      });
      setConfirmationsVersion(v => v + 1);
      setToastNotification(`✅ ยืนยันเบอร์ติดต่อแมตช์ "${record.matchTitle}" สำหรับสัปดาห์นี้สำเร็จแล้ว ข้อมูลจะแสดงบนเว็บไซต์ทันที`);
      setTimeout(() => setToastNotification(null), 4000);
    } catch (e: any) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการยืนยันเบอร์ติดต่อ');
    }
  };

  const handleUnconfirmMatch = async (record: RegistrationRecord) => {
    try {
      const homeClub = record.matchTitle.split(' vs ')[0]?.trim() || '';
      await unconfirmMatchContact({
        fixtureId: record.fixtureId,
        matchDate: record.matchDate,
        homeClub,
        stadiumName: record.stadium,
      });
      setConfirmationsVersion(v => v + 1);
      setToastNotification(`ยกเลิกการยืนยันเบอร์ติดต่อแมตช์ "${record.matchTitle}" เรียบร้อยแล้ว (ผู้ใช้ทั่วไปจะไม่เห็นเบอร์นี้บนเว็บไซต์)`);
      setTimeout(() => setToastNotification(null), 4000);
    } catch (e: any) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการยกเลิกการยืนยัน');
    }
  };

  const handleBulkConfirmAllMatches = async () => {
    try {
      setIsBulkConfirming(true);
      const weekInfo = getCurrentWeekInfo(simDate);
      const adminName = currentUser?.displayName || currentUser?.email || 'Admin';
      const fixturesToConfirm = brandFilteredRecords.map(r => ({
        fixtureId: r.fixtureId,
        matchDate: r.matchDate,
        homeClub: r.matchTitle.split(' vs ')[0]?.trim() || '',
        stadiumName: r.stadium,
        league: r.league,
      }));

      const res = await bulkConfirmMatchesForWeek({
        weekKey: weekInfo.weekKey,
        fixtures: fixturesToConfirm,
        adminName,
      });

      setConfirmationsVersion(v => v + 1);
      setToastNotification(`⚡ ยืนยันเบอร์ติดต่อหน้าสนามสำเร็จทั้งหมด ${res.count} แมตช์สำหรับสัปดาห์นี้เรียบร้อยแล้ว! ข้อมูลขึ้นแสดงบนเว็บไซต์ให้ลูกค้าทุกท่านใช้งานได้ทันที`);
      setTimeout(() => setToastNotification(null), 5000);
    } catch (e: any) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการยืนยันทั้งหมด');
    } finally {
      setIsBulkConfirming(false);
    }
  };

  // Helper to check if match day is finished (compares YYYY-MM-DD)
  // Per user requirement: "เมื่อจบวันแข่งขันไปแล้วไม่ต้องขึ้นโชว์อีกให้หายไปจากหน้าเบอร์ติดต่อหน้าสนามเลย"
  const isMatchDayFinished = (matchDateStr?: string, currentSimDateStr?: string): boolean => {
    if (!matchDateStr) return false;
    const currentDay = (currentSimDateStr || simDate).slice(0, 10);
    const matchDay = matchDateStr.slice(0, 10);
    return currentDay > matchDay;
  };

  const handleSyncContactsNow = async () => {
    try {
      setIsSyncingContacts(true);
      const res = await syncStadiumContactsFromOfficialSheet();
      if (res.success) {
        setContactsSyncMeta(getStadiumContactsSyncMeta());
        setToastNotification(`ซิงค์ข้อมูลเบอร์ติดต่อออกบูธ+รับบัตร+Remark จากชีต "เบอร์ติดต่อหน้าสนาม" สำเร็จ! พบทั้งหมด ${res.count} รายการ (แท็บ: ${res.syncedTabs?.join(', ') || 'League 1, League 2, League 3'}) โดยจับคู่ตามชื่อทีมเหย้าเรียบร้อยแล้ว`);
      } else {
        setToastNotification(res.error || 'ไม่พบตารางเบอร์ติดต่อใน Google Sheet หรือไม่สามารถเชื่อมต่อได้');
      }
    } catch (err: any) {
      setToastNotification(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets');
    } finally {
      setIsSyncingContacts(false);
    }
  };

  // Helper to match stadium contact for a registration/fixture
  const findContactForStadium = (
    stadiumName?: string, 
    homeClub?: string, 
    league?: LeagueType, 
    fixtureId?: string,
    awayTeam?: string,
    matchDate?: string
  ): StadiumContact => {
    return findContactForStadiumOrMatch({
      stadiumName,
      homeClub,
      awayTeam,
      matchDate,
      league,
      fixtureId,
      customList: customContacts,
    });
  };

  // Open modal with pre-filled or blank data
  const handleOpenContactModal = (existing?: Partial<StadiumContact & MatchStadiumContact>) => {
    if (existing) {
      setFormContactId(existing.id || '');
      setFormStadiumName(existing.stadiumName || '');
      setFormLeague(existing.league || 'League 1');
      setFormHomeClub(existing.homeClub || '');
      setFormProvince(existing.locationProvince || '');
      setFormBoothName(existing.boothCoordinatorName || '');
      setFormBoothPhone(existing.boothCoordinatorPhone || '');
      setFormBoothLocation(existing.boothSetupLocation || '');
      setFormTicketName(existing.ticketCoordinatorName || '');
      setFormTicketPhone(existing.ticketCoordinatorPhone || '');
      setFormTicketLocation(existing.ticketPickupLocation || '');
      setFormHours(existing.operatingHours || '14:00 - 19:30 น. (วันแข่งขัน)');
      setFormNote(existing.note || '');
      setFormRemark((existing as any).remark || '');
    } else {
      // Default blank/new
      const firstSc = INITIAL_STADIUM_CONTACTS[0];
      setFormContactId('');
      setFormStadiumName(firstSc.stadiumName);
      setFormLeague(firstSc.league);
      setFormHomeClub(firstSc.homeClub);
      setFormProvince(firstSc.locationProvince);
      setFormBoothName('');
      setFormBoothPhone('');
      setFormBoothLocation('ลานกิจกรรมหน้าทางเข้าหลัก');
      setFormTicketName('');
      setFormTicketPhone('');
      setFormTicketLocation('ซุ้มตั๋วผู้สนับสนุนและพันธมิตร');
      setFormHours('14:00 - 19:30 น. (วันแข่งขัน)');
      setFormNote('');
      setFormRemark('');
    }
    setIsContactModalOpen(true);
  };

  const handleSelectPresetStadium = (stadiumName: string) => {
    const found = INITIAL_STADIUM_CONTACTS.find(s => s.stadiumName === stadiumName);
    if (found) {
      setFormStadiumName(found.stadiumName);
      setFormLeague(found.league);
      setFormHomeClub(found.homeClub);
      setFormProvince(found.locationProvince);
      if (!formBoothName) setFormBoothName(found.boothCoordinatorName);
      if (!formBoothPhone) setFormBoothPhone(found.boothCoordinatorPhone);
      if (!formBoothLocation) setFormBoothLocation(found.boothSetupLocation);
      if (!formTicketName) setFormTicketName(found.ticketCoordinatorName);
      if (!formTicketPhone) setFormTicketPhone(found.ticketCoordinatorPhone);
      if (!formTicketLocation) setFormTicketLocation(found.ticketPickupLocation);
    } else {
      setFormStadiumName(stadiumName);
    }
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStadiumName.trim()) {
      alert('กรุณากรอกชื่อสนามแข่งขัน');
      return;
    }
    if (!formBoothPhone.trim() && !formTicketPhone.trim()) {
      alert('กรุณากรอกเบอร์โทรติดต่ออย่างน้อย 1 เบอร์ (ฝ่ายบูธ หรือ ฝ่ายตั๋ว)');
      return;
    }

    try {
      setIsSaving(true);
      await saveMatchContact({
        id: formContactId || undefined,
        fixtureId: '',
        matchTitle: `${formHomeClub || formStadiumName} Matchday`,
        matchDate: new Date().toISOString().slice(0, 10),
        stadiumName: formStadiumName.trim(),
        league: formLeague,
        homeClub: formHomeClub.trim(),
        locationProvince: formProvince.trim() || 'ประจำสนามแข่งขัน',
        boothCoordinatorName: formBoothName.trim() || 'เจ้าหน้าที่ฝ่ายสถานที่/บูธ',
        boothCoordinatorPhone: formBoothPhone.trim() || '-',
        boothSetupLocation: formBoothLocation.trim() || 'ลานกิจกรรมหน้าทางเข้าหลัก',
        ticketCoordinatorName: formTicketName.trim() || 'เจ้าหน้าที่ฝ่ายบัตรสปอนเซอร์',
        ticketCoordinatorPhone: formTicketPhone.trim() || '-',
        ticketPickupLocation: formTicketLocation.trim() || 'ซุ้มตั๋วผู้สนับสนุน',
        operatingHours: formHours.trim() || '14:00 - 19:30 น.',
        note: formNote.trim(),
        remark: formRemark.trim() || undefined,
        updatedBy: currentUser?.displayName || currentUser?.email || 'เจ้าหน้าที่ประจำสนาม',
      });

      setIsContactModalOpen(false);
      setToastNotification(`บันทึกข้อมูลเบอร์ติดต่อสนาม "${formStadiumName}" สำเร็จเรียบร้อยแล้ว`);
      setTimeout(() => setToastNotification(null), 4000);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setIsSaving(false);
    }
  };

  // Count registered matches for each brand (Active upcoming matches only - hidden once match day ends)
  const brandMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    dynamicBrands.forEach(b => {
      counts[b.id] = secureRecords.filter(r => r.brand === b.id && !isMatchDayFinished(r.matchDate, simDate)).length;
    });
    return counts;
  }, [dynamicBrands, secureRecords, simDate]);

  // Active week info
  const activeWeekInfo = useMemo(() => getCurrentWeekInfo(simDate), [simDate]);

  // Confirmation stats for matches in the current view
  const matchConfirmStats = useMemo(() => {
    let total = 0;
    let confirmed = 0;
    let pending = 0;

    const currentMatches = secureRecords.filter(r => 
      (selectedBrand === 'ALL_STADIUMS' || r.brand === selectedBrand) &&
      !isMatchDayFinished(r.matchDate, simDate) &&
      (selectedLeague === 'All' || r.league === selectedLeague)
    );

    total = currentMatches.length;
    currentMatches.forEach(r => {
      const home = r.matchTitle.split(' vs ')[0]?.trim() || '';
      const conf = isMatchContactConfirmed({
        fixtureId: r.fixtureId,
        matchDate: r.matchDate,
        homeClub: home,
        stadiumName: r.stadium,
      });
      if (conf.isConfirmed) {
        confirmed++;
      } else {
        pending++;
      }
    });

    return { total, confirmed, pending };
  }, [secureRecords, selectedBrand, selectedLeague, simDate, confirmationsVersion]);

  // Registrations filtered by selectedBrand and selectedLeague (Active upcoming matches only)
  const brandFilteredRecords = useMemo(() => {
    if (selectedBrand === 'ALL_STADIUMS') return [];

    return secureRecords.filter(record => {
      // 1. Must match selected brand
      if (record.brand !== selectedBrand) return false;

      // 2. Hide when match day is finished (Per user instruction: เมื่อจบวันแข่งขันไปแล้วไม่ต้องขึ้นโชว์อีกให้หายไปจากหน้าเบอร์ติดต่อหน้าสนามเลย)
      if (isMatchDayFinished(record.matchDate, simDate)) return false;

      // 3. League filter
      if (selectedLeague !== 'All' && record.league !== selectedLeague) return false;

      // 4. Admin Confirmation status filter (when Admin selects "รอยืนยัน" or "ยืนยันแล้ว")
      if (isUserAdmin && adminConfirmFilter !== 'all') {
        const homeClub = record.matchTitle.split(' vs ')[0]?.trim() || '';
        const conf = isMatchContactConfirmed({
          fixtureId: record.fixtureId,
          matchDate: record.matchDate,
          homeClub,
          stadiumName: record.stadium,
        });
        if (adminConfirmFilter === 'pending' && conf.isConfirmed) return false;
        if (adminConfirmFilter === 'confirmed' && !conf.isConfirmed) return false;
      }

      // 5. Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          record.matchTitle.toLowerCase().includes(term) ||
          record.stadium.toLowerCase().includes(term) ||
          (record.dealerName && record.dealerName.toLowerCase().includes(term)) ||
          (record.dealerPhone && record.dealerPhone.includes(term)) ||
          (record.ticketRequesterPhone && record.ticketRequesterPhone.includes(term)) ||
          record.applicantName.toLowerCase().includes(term);
        if (!match) return false;
      }

      return true;
    });
  }, [secureRecords, selectedBrand, selectedLeague, searchTerm, simDate, isUserAdmin, adminConfirmFilter, confirmationsVersion]);

  // All stadiums filtered (when in "ALL_STADIUMS" mode) - strictly uses authoritative 103 official season clubs
  const allStadiumContacts = useMemo(() => {
    // Club / stadium / province names come from the official club list; ALL contact fields come only from the
    // Google Sheet "เบอร์ติดต่อหน้าสนาม" (matched by league + home club). Empty in the sheet = empty here.
    const list: StadiumContact[] = phonebookClubs.map(c => {
      const row = findLeagueHomeTeamContact(c.league, c.clubName);
      const hasAny = Boolean(row && (row.boothRawText || row.ticketRawText || row.remark));

      return {
        id: c.id,
        stadiumName: c.stadiumName || `สนามเหย้าสโมสร ${c.clubName}`,
        league: c.league,
        homeClub: c.clubName,
        locationProvince: c.province || '',
        boothCoordinatorName: row?.boothCoordinatorName || '',
        boothCoordinatorPhone: row?.boothCoordinatorPhone || '',
        boothSetupLocation: '',
        ticketCoordinatorName: row?.ticketCoordinatorName || '',
        ticketCoordinatorPhone: row?.ticketCoordinatorPhone || '',
        ticketPickupLocation: row?.remark || '',
        operatingHours: '',
        note: row?.remark || '',
        remark: row?.remark || '',
        hasUpdatedContact: hasAny,
        sourceTab: row ? `ชีตเบอร์ติดต่อหน้าสนาม (${row.sourceTab})` : 'ไม่พบสโมสรนี้ในชีต',
      };
    });

    return list.filter(item => {
      if (selectedLeague !== 'All' && item.league !== selectedLeague) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          item.stadiumName.toLowerCase().includes(term) ||
          item.homeClub.toLowerCase().includes(term) ||
          item.locationProvince.toLowerCase().includes(term) ||
          item.boothCoordinatorName.toLowerCase().includes(term) ||
          item.ticketCoordinatorName.toLowerCase().includes(term) ||
          item.remark?.toLowerCase().includes(term);
        if (!match) return false;
      }
      return true;
    });
  }, [selectedLeague, searchTerm, phonebookClubs, contactsSyncMeta]);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // Selected brand object details
  const activeBrandObj = useMemo(() => {
    if (selectedBrand === 'ALL_STADIUMS') return null;
    return dynamicBrands.find(b => b.id === selectedBrand) || SPONSOR_BRANDS.find(b => b.id === selectedBrand) || null;
  }, [selectedBrand, dynamicBrands]);

  // Quick summary numbers for active brand (Active upcoming matches only)
  const activeBrandStats = useMemo(() => {
    if (selectedBrand === 'ALL_STADIUMS') return null;
    const allForBrand = secureRecords.filter(r => r.brand === selectedBrand && !isMatchDayFinished(r.matchDate, simDate));
    const booths = allForBrand.filter(r => r.boothRequired).length;
    const tickets = allForBrand.reduce((sum, r) => sum + (r.ticketRequired ? r.ticketQuantity : 0), 0);
    return {
      totalMatches: allForBrand.length,
      booths,
      tickets,
    };
  }, [secureRecords, selectedBrand, simDate]);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-semibold backdrop-blur-xs mb-3">
              <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
              <span>ศูนย์ข้อมูลเบอร์ติดต่อหน้าสนาม • Matchday On-site Directory</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              เบอร์ติดต่อหน้าสนามสำหรับออกบูธและรับบัตร
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1.5 max-w-2xl leading-relaxed">
              เลือกลูกค้าแบรนด์ของท่านเพื่อดูเบอร์โทรศัพท์เจ้าหน้าที่ประจำสนามเฉพาะแมตช์ที่ได้ขอออกบูธและรับบัตรไว้ โดยแยกข้อมูลตามแบรนด์และตามลีกชัดเจน เพื่อความสะดวกในการประสานงานวันแข่งขัน
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isUserAdmin && (
              <button
                id="btn-open-phonebook-main"
                type="button"
                onClick={() => setIsPhonebookModalOpen(true)}
                className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer border border-emerald-300/60"
                title="เปิดสมุดโทรศัพท์ประจำสโมสรเพื่อจัดการเบอร์ติดต่อออกบูธและรับบัตร (เฉพาะ Admin)"
              >
                <BookOpen className="w-4 h-4 text-slate-950" />
                <span>สมุดโทรศัพท์</span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-900 text-white text-[10px] font-bold">
                  Admin
                </span>
              </button>
            )}

            <button
              id="btn-navigate-to-register-from-contacts"
              onClick={() => onNavigateToRegister(selectedBrand !== 'ALL_STADIUMS' ? selectedBrand : undefined, selectedLeague !== 'All' ? selectedLeague : undefined)}
              className="px-4 py-2.5 rounded-2xl bg-white text-slate-900 font-bold text-xs hover:bg-slate-100 transition-colors shadow-sm flex items-center gap-2 group cursor-pointer"
            >
              <Building2 className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
              <span>ลงทะเบียนออกบูธ & รับบัตรบอล</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Toast Notification */}
      {toastNotification && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastNotification}</span>
          </div>
          <button
            onClick={() => setToastNotification(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Admin Club Phonebook Modal (Master Directory) */}
      <AdminClubPhonebookModal
        isOpen={isPhonebookModalOpen}
        onClose={() => setIsPhonebookModalOpen(false)}
        currentUser={currentUser}
        defaultLeague={selectedLeague !== 'All' ? selectedLeague : 'League 1'}
      />

      {/* Admin Access Restriction Notice Modal */}
      {showAdminRequiredNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl border border-rose-100">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">พื้นที่เฉพาะผู้ดูแลระบบ (Admin Only)</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                ปุ่ม <strong>"สมุดโทรศัพท์"</strong> ถูกจำกัดสิทธิ์ไว้ให้เฉพาะผู้ดูแลระบบ (Admin) เพจเท่านั้น เพื่อจัดการเบอร์ติดต่อประจำสโมสรในไทยลีก 1 - 3
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdminRequiredNotice(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              รับทราบ
            </button>
          </div>
        </div>
      )}

      {/* Brand Data Isolation Security Banner */}
      {activeLockBrand && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 border border-blue-200 text-blue-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span>ระบบรักษาความปลอดภัย: แยกข้อมูลเฉพาะแบรนด์ ({activeLockBrand})</span>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-extrabold shadow-2xs">
                  Data Isolation Active
                </span>
              </div>
              <p className="text-slate-600 text-xs mt-0.5">
                เพื่อความปลอดภัยและความเป็นส่วนตัวของลูกค้า คุณกำลังดูเฉพาะข้อมูลของแบรนด์ <strong>{activeLockBrand}</strong> ข้อมูลการขอออกบูธและรับบัตรของแบรนด์อื่นๆ จะถูกปกป้องและไม่สามารถเข้าถึงได้
              </p>
            </div>
          </div>
          {isUserAdmin && (
            <button
              type="button"
              onClick={() => setSimulateClientBrand(null)}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 shrink-0 cursor-pointer shadow-2xs"
            >
              ออกจากโหมดจำลองลูกค้า (กลับสู่มุมมอง Admin)
            </button>
          )}
        </div>
      )}

      {/* Admin Quick Test Client View Switcher */}
      {isUserAdmin && !simulateClientBrand && (
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-600" />
            <span className="font-bold">สิทธิ์ผู้ดูแลระบบ (Admin View):</span>
            <span className="text-slate-500">คุณสามารถมองเห็นทุกแบรนด์ และทดสอบดูมุมมองของลูกค้าแต่ละแบรนด์ได้ที่นี่:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 font-semibold">ทดสอบมุมมองลูกค้า:</span>
            {dynamicBrands.slice(0, 5).map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSimulateClientBrand(b.id)}
                className="px-2 py-1 rounded-lg bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200 text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
              >
                ดูมุมมอง {b.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Brand Selector Tabs (แท็บแบรนด์ลูกค้า) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-700" />
            <span className="text-sm font-bold text-slate-900">แท็บเลือกแบรนด์ลูกค้า (Customer Brand)</span>
            <span className="text-xs text-slate-500">เลือกแบรนด์เพื่อดูเฉพาะแมตช์ของตัวเอง</span>
          </div>

          {activeBrandObj && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">กำลังดูข้อมูลของ:</span>
              <span className={`px-2.5 py-0.5 rounded-full font-bold border ${activeBrandObj.badgeClass}`}>
                {activeBrandObj.id} ({brandMatchCounts[activeBrandObj.id] || 0} แมตช์)
              </span>
            </div>
          )}
        </div>

        {/* Brand Tabs Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
          {dynamicBrands.map(brand => {
            const count = brandMatchCounts[brand.id] || 0;
            const isSelected = selectedBrand === brand.id;
            const isLocked = Boolean(activeLockBrand && activeLockBrand !== brand.id);

            if (isLocked) {
              return (
                <div
                  key={brand.id}
                  title={`ถูกจำกัดสิทธิ์: คุณสามารถดูข้อมูลได้เฉพาะแบรนด์ ${activeLockBrand} เท่านั้น`}
                  className="p-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 text-slate-400 flex flex-col justify-between cursor-not-allowed opacity-60 select-none"
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border border-slate-200 bg-white text-slate-400 flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5 text-slate-400" />
                      <span>{brand.logoText}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">🔒 ล็อคข้อมูล</span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold truncate text-slate-500">{brand.id}</div>
                    <div className="text-[10px] truncate text-slate-400">ข้อมูลส่วนตัวของแบรนด์นี้</div>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={brand.id}
                id={`tab-brand-contact-${brand.id}`}
                onClick={() => setSelectedBrand(brand.id)}
                className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between group ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold border ${
                    isSelected ? 'bg-white/20 text-white border-white/30' : brand.badgeClass
                  }`}>
                    {brand.logoText}
                  </span>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                    isSelected
                      ? 'bg-emerald-500/20 text-emerald-300 font-extrabold'
                      : count > 0 ? 'bg-slate-100 text-slate-700' : 'text-slate-400'
                  }`}>
                    {count} แมตช์
                  </span>
                </div>

                <div>
                  <div className="text-xs font-bold truncate">
                    {brand.id}
                  </div>
                  <div className={`text-[10px] truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                    {brand.name.split('(')[1]?.replace(')', '') || brand.name}
                  </div>
                </div>

                {isSelected && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-400"></div>
                )}
              </button>
            );
          })}

          {/* Option: View All Stadiums general directory */}
          <button
            id="tab-brand-contact-all-stadiums"
            onClick={() => setSelectedBrand('ALL_STADIUMS')}
            className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between group ${
              selectedBrand === 'ALL_STADIUMS'
                ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold border ${
                selectedBrand === 'ALL_STADIUMS' ? 'bg-white/20 text-white border-white/30' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                สมุดโทรศัพท์
              </span>
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                selectedBrand === 'ALL_STADIUMS' ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-100 text-slate-700'
              }`}>
                {phonebookClubs.length} สโมสร
              </span>
            </div>

            <div>
              <div className="text-xs font-bold truncate">
                ทุกสนามทั่วไป
              </div>
              <div className={`text-[10px] truncate ${selectedBrand === 'ALL_STADIUMS' ? 'text-slate-300' : 'text-slate-500'}`}>
                รวมทุกสโมสร
              </div>
            </div>

            {selectedBrand === 'ALL_STADIUMS' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-400"></div>
            )}
          </button>
        </div>

        {/* Active Brand Information Banner */}
        {activeBrandObj && (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs shrink-0">
                {activeBrandObj.logoText.slice(0, 3)}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>กำลังแสดงเบอร์ติดต่อสนามเฉพาะแมตช์ที่ [{activeBrandObj.name}] ขอออกบูธ / รับบัตรบอล</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                    กรองเฉพาะแบรนด์นี้
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  ระบบจะไม่แสดงข้อมูลของแบรนด์อื่นๆ เพื่อให้ดีลเลอร์และผู้รับบัตรของ {activeBrandObj.id} ทำงานประสานงานได้ง่ายที่สุด
                </div>
              </div>
            </div>

            {activeBrandStats && (
              <div className="flex items-center gap-3 text-xs bg-white px-3 py-1.5 rounded-xl border border-slate-200 self-start sm:self-auto shrink-0">
                <div>
                  <span className="text-slate-400 text-[10px] block">แมตช์ที่ลงทะเบียน</span>
                  <span className="font-bold text-slate-800">{activeBrandStats.totalMatches} แมตช์</span>
                </div>
                <div className="h-6 w-px bg-slate-200"></div>
                <div>
                  <span className="text-slate-400 text-[10px] block">ออกบูธดีลเลอร์</span>
                  <span className="font-bold text-emerald-700">{activeBrandStats.booths} บูธ</span>
                </div>
                <div className="h-6 w-px bg-slate-200"></div>
                <div>
                  <span className="text-slate-400 text-[10px] block">บัตรดูบอลรวม</span>
                  <span className="font-bold text-blue-700">{activeBrandStats.tickets} ใบ</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* League Filter Tabs & Search (แท็บเลือก League: แดง น้ำเงิน เขียว) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* League Filter Tabs: League 1 Red, League 2 Blue, League 3 Green */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-full sm:w-auto overflow-x-auto">
            {/* All Leagues */}
            <button
              id="btn-league-contacts-all"
              onClick={() => setSelectedLeague('All')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedLeague === 'All'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ทุกลีก (All Leagues)
            </button>

            {/* Thai League 1 (แดง / Red) */}
            <button
              id="btn-league-contacts-l1"
              onClick={() => setSelectedLeague('League 1')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedLeague === 'League 1'
                  ? 'bg-rose-600 text-white shadow-xs shadow-rose-500/30'
                  : 'text-rose-700 hover:bg-rose-50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
              <span>Thai League 1</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded ${
                selectedLeague === 'League 1' ? 'bg-rose-700/60 text-white' : 'bg-rose-100 text-rose-800'
              }`}>
                แดง
              </span>
            </button>

            {/* Thai League 2 (น้ำเงิน / Blue) */}
            <button
              id="btn-league-contacts-l2"
              onClick={() => setSelectedLeague('League 2')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedLeague === 'League 2'
                  ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/30'
                  : 'text-blue-700 hover:bg-blue-50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
              <span>Thai League 2</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded ${
                selectedLeague === 'League 2' ? 'bg-blue-700/60 text-white' : 'bg-blue-100 text-blue-800'
              }`}>
                น้ำเงิน
              </span>
            </button>

            {/* Thai League 3 (เขียว / Green) */}
            <button
              id="btn-league-contacts-l3"
              onClick={() => setSelectedLeague('League 3')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedLeague === 'League 3'
                  ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-500/30'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span>Thai League 3</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded ${
                selectedLeague === 'League 3' ? 'bg-emerald-700/60 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}>
                เขียว
              </span>
            </button>
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              id="input-search-contacts"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาคู่แข่ง, สนาม, ดีลเลอร์, ผู้รับบัตร..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>
        </div>

        {/* Results Counter & Info */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <div>
            {selectedBrand !== 'ALL_STADIUMS' ? (
              <span>
                พบ <strong className="text-slate-800 font-bold">{brandFilteredRecords.length}</strong> แมตช์ที่ 
                <strong className="text-slate-800 font-bold ml-1">{selectedBrand}</strong> ขอออกบูธ/รับบัตร
                {selectedLeague !== 'All' ? ` ใน ${selectedLeague}` : ''}
              </span>
            ) : (
              <span>
                พบรายชื่อสนามทั้งหมด <strong className="text-slate-800 font-bold">{allStadiumContacts.length}</strong> แห่ง
                {selectedLeague !== 'All' ? ` ใน ${selectedLeague}` : ''}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            คลิกที่เบอร์โทรศัพท์เพื่อโทรออก หรือกดปุ่มคัดลอกเบอร์เพื่อนำไปส่งไลน์/บันทึก
          </span>
        </div>

        {/* Official League Badge Header Card (Mockup 4 Requirement) */}
        {selectedLeague !== 'All' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-md border border-slate-700/80">
            <div className="flex items-center gap-4">
              <LeagueBadge league={selectedLeague} size="md" />
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                    selectedLeague === 'League 1' ? 'bg-rose-500 text-white' :
                    selectedLeague === 'League 2' ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white'
                  }`}>
                    {selectedLeague}
                  </span>
                  <span className="text-xs text-amber-300 font-bold">โลโก้ทางการประจำลีก</span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white mt-1">
                  {selectedLeague === 'League 1' ? 'BYD SEALION 6 LEAGUE I' :
                   selectedLeague === 'League 2' ? 'BYD SEAL 5 LEAGUE II' :
                   'BYD DOLPHIN LEAGUE III'}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  เบอร์ติดต่อประสานงานหน้าสนามและฝ่ายดูแลบูธดีลเลอร์
                </p>
              </div>
            </div>

            <div className="text-right sm:self-center">
              <span className="text-xs font-semibold text-slate-400 block">ข้อมูลเบอร์ติดต่อ</span>
              <span className="text-xl sm:text-2xl font-black text-white">
                {selectedBrand !== 'ALL_STADIUMS' ? `${brandFilteredRecords.length} แมตช์` : `${allStadiumContacts.length} สนาม`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* CASE 1: BRAND SPECIFIC VIEW (ลูกค้ากดเลือกแบรนด์ตัวเอง) */}
      {/* ========================================================================= */}
      {selectedBrand !== 'ALL_STADIUMS' && (
        <div className="space-y-4">
          {/* Admin Match Verification Control Center */}
          {isUserAdmin && (
            <div className="p-4 sm:p-5 rounded-3xl bg-slate-900 text-white shadow-md border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <span>ระบบยืนยันเบอร์ติดต่อหน้าสนามประจำสัปดาห์ (Admin Match Verification)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-extrabold">
                        Admin Control
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      เบอร์ติดต่อที่ลูกค้ากรอกขอออกบูธ/รับบัตร จะขึ้นแสดงบนเว็บไซต์ได้ก็ต่อเมื่อ Admin กดยืนยันเบอร์ติดต่อก่อน เนื่องจากในแต่ละแมตช์เบอร์อาจมีการเปลี่ยนแปลง
                    </p>
                  </div>
                </div>

                {/* Week Info Badge */}
                <div className="flex items-center gap-2 text-xs bg-slate-800/80 px-3.5 py-1.5 rounded-2xl border border-slate-700 shrink-0">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-300">{activeWeekInfo.weekLabel}:</span>
                  <span className="font-bold text-white">{activeWeekInfo.weekRangeText}</span>
                </div>
              </div>

              {/* Confirmation Status Bar & Action Controls */}
              <div className="pt-3 border-t border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400 mr-1">กรองดู:</span>
                  {/* All */}
                  <button
                    type="button"
                    onClick={() => setAdminConfirmFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      adminConfirmFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    ทั้งหมด ({matchConfirmStats.total})
                  </button>

                  {/* Pending */}
                  <button
                    type="button"
                    onClick={() => setAdminConfirmFilter('pending')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      adminConfirmFilter === 'pending'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                        : 'bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 border border-amber-800/50'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>รอยืนยัน ({matchConfirmStats.pending})</span>
                  </button>

                  {/* Confirmed */}
                  <button
                    type="button"
                    onClick={() => setAdminConfirmFilter('confirmed')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      adminConfirmFilter === 'confirmed'
                        ? 'bg-emerald-500 text-slate-950 font-black shadow-xs'
                        : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 border border-emerald-800/50'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>ยืนยันแล้ว ({matchConfirmStats.confirmed})</span>
                  </button>
                </div>

                {/* Bulk Confirm Button */}
                {matchConfirmStats.pending > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkConfirmAllMatches}
                    disabled={isBulkConfirming}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-300/60"
                  >
                    <Sparkles className="w-4 h-4 text-slate-950" />
                    <span>
                      {isBulkConfirming ? 'กำลังบันทึก...' : `⚡ กดยืนยันเบอร์ติดต่อทุกแมตช์สัปดาห์นี้ทั้งหมด (${matchConfirmStats.pending} คู่)`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Non-Admin User Info Banner */}
          {!isUserAdmin && matchConfirmStats.pending > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 shadow-2xs">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-950">
                  เบอร์ติดต่อหน้าสนามในแมตช์สัปดาห์นี้อยู่ระหว่างการตรวจสอบและยืนยันโดย Admin
                </div>
                <p className="text-amber-800 text-[11px] mt-0.5 leading-relaxed">
                  เนื่องจากในแต่ละแมตช์เบอร์ติดต่อเจ้าหน้าที่หน้าสนามอาจมีการเปลี่ยนแปลง เบอร์โทรศัพท์จะขึ้นแสดงบนเว็บไซต์ทันทีเมื่อ Admin กดยืนยัน และเมื่อสิ้นสุดวันแข่งขันแมตช์นั้นจะหายไปจากหน้านี้อัตโนมัติ
                </p>
              </div>
            </div>
          )}

          {brandFilteredRecords.length === 0 ? (
            /* Empty state for this brand */
            <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center space-y-4 shadow-2xs">
              <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Phone className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-base font-bold text-slate-800">
                  ไม่พบแมตช์ที่ {selectedBrand} ลงทะเบียนออกบูธหรือรับบัตร {selectedLeague !== 'All' ? `ใน ${selectedLeague}` : ''}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedLeague !== 'All'
                    ? `ท่านสามารถเลือกแท็บ "ทุกลีก" ด้านบน หรือกดลงทะเบียนเพื่อขอพื้นที่ออกบูธหรือขอรับบัตรในลีกนี้ได้ทันที`
                    : `ท่านยังไม่ได้ทำการลงทะเบียนขอออกบูธหรือขอรับบัตรสำหรับแบรนด์ ${selectedBrand} สามารถเริ่มลงทะเบียนได้ทันที`}
                </p>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                {selectedLeague !== 'All' && (
                  <button
                    onClick={() => setSelectedLeague('All')}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    ดูทุกลีกของ {selectedBrand}
                  </button>
                )}
                <button
                  onClick={() => onNavigateToRegister(selectedBrand, selectedLeague !== 'All' ? selectedLeague : undefined)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4 text-emerald-400" />
                  <span>ลงทะเบียนขอออกบูธ/รับบัตรสำหรับ {selectedBrand}</span>
                </button>
                <button
                  onClick={() => setSelectedBrand('ALL_STADIUMS')}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  ดูสมุดโทรศัพท์รวมทุกสนาม
                </button>
              </div>
            </div>
          ) : (
            /* Matches List: 1 match per row (หน้าตาเหมือนหน้าลงทะเบียนบูธ&บัตรบอล ที่ 1 แมตช์แจ้งข้อมูลแถวเดียว) */
            <div className="space-y-4">
              {brandFilteredRecords.map((record) => {
                const leagueStyle = LEAGUE_COLOR_MAP[record.league];
                const homeClub = record.matchTitle.split(' vs ')[0]?.trim() || '';
                const awayTeam = record.matchTitle.split(' vs ')[1]?.trim() || '';
                const stadiumContact = findContactForStadium(record.stadium, homeClub, record.league, record.fixtureId, awayTeam, record.matchDate);
                const targetTab = record.league === 'League 1' ? 'T1-(THA)' : record.league === 'League 2' ? 'T2-(THA)' : 'T3-(THA)';
                const displayRemark = stadiumContact.remark || stadiumContact.note || '';

                const confirmStatus = isMatchContactConfirmed({
                  fixtureId: record.fixtureId,
                  matchDate: record.matchDate,
                  homeClub,
                  stadiumName: record.stadium,
                });
                const isContactConfirmed = confirmStatus.isConfirmed;

                return (
                  <div
                    key={record.id}
                    id={`brand-match-card-${record.id}`}
                    className="rounded-3xl border border-slate-200 bg-white shadow-xs hover:border-slate-300 transition-all overflow-hidden"
                  >
                    {/* 1. Header Bar: League, Match Title, Date, Stadium, Status & Edit Button */}
                    <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${leagueStyle.badgeBg}`}>
                            {record.league}
                          </span>
                          <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{record.matchDate}</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                            {record.brand}
                          </span>
                          {record.status === 'approved' ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>อนุมัติแล้ว</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>รอตรวจสอบ</span>
                            </span>
                          )}

                          {/* Admin Confirmation Badge */}
                          {isContactConfirmed ? (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-300 flex items-center gap-1 shadow-2xs">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>Admin ยืนยันเบอร์แล้ว</span>
                            </span>
                          ) : (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300 flex items-center gap-1 animate-pulse">
                              <Clock className="w-3 h-3 text-amber-700" />
                              <span>รอ Admin ยืนยันเบอร์ติดต่อ</span>
                            </span>
                          )}

                          {stadiumContact.hasUpdatedContact && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                              🔗 ซิงค์จาก {stadiumContact.sourceTab || targetTab}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 my-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <ClubCrest clubName={homeClub} league={record.league} size="sm" showTooltip />
                            <span className="text-base sm:text-lg font-bold text-slate-900">{homeClub}</span>
                          </div>
                          <span className="text-xs font-black text-slate-400 bg-slate-200/80 px-2 py-0.5 rounded-md">VS</span>
                          <div className="flex items-center gap-2">
                            <ClubCrest clubName={awayTeam} league={record.league} size="sm" showTooltip />
                            <span className="text-base sm:text-lg font-bold text-slate-900">{awayTeam}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate">สนาม: {record.stadium}</span>
                          <span className="text-slate-300">•</span>
                          <span>{stadiumContact.locationProvince || 'ประจำสนามแข่งขัน'}</span>
                        </div>
                      </div>

                      {/* Header Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isUserAdmin && !isContactConfirmed && (
                          <button
                            type="button"
                            onClick={() => handleConfirmMatch(record)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>⚡ ยืนยันเบอร์</span>
                          </button>
                        )}
                        {isUserAdmin && (
                          <button
                            onClick={() => handleOpenContactModal({
                              stadiumName: record.stadium,
                              league: record.league,
                              homeClub: homeClub,
                              fixtureId: record.fixtureId,
                              boothCoordinatorName: stadiumContact.boothCoordinatorName,
                              boothCoordinatorPhone: stadiumContact.boothCoordinatorPhone,
                              boothSetupLocation: stadiumContact.boothSetupLocation,
                              ticketCoordinatorName: stadiumContact.ticketCoordinatorName,
                              ticketCoordinatorPhone: stadiumContact.ticketCoordinatorPhone,
                              ticketPickupLocation: stadiumContact.ticketPickupLocation,
                              operatingHours: stadiumContact.operatingHours,
                              note: stadiumContact.note,
                              remark: stadiumContact.remark,
                            })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                            <span>แก้ไขเบอร์สนาม</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 2. Content Row: 4 Columns in 1 Clean Horizontal Row */}
                    <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch bg-white">
                      {/* Column 1: รายการที่แบรนด์ลงทะเบียนไว้ */}
                      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2.5 h-full flex flex-col justify-between">
                        <div>
                          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>ข้อมูลที่ {record.brand} ลงทะเบียน</span>
                          </div>

                          {/* Booth request */}
                          <div className="space-y-1 mb-2.5">
                            <div className="flex items-center gap-1 text-xs font-bold text-emerald-900">
                              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>การออกบูธ:</span>
                            </div>
                            {record.boothRequired ? (
                              <div className="text-xs text-slate-700 pl-4 space-y-0.5">
                                <div className="font-semibold text-slate-900">ดีลเลอร์: {record.dealerName || '-'}</div>
                                <div className="text-slate-500 flex items-center gap-1 text-[11px]">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>{record.dealerPhone || '-'}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-400 pl-4 italic">ไม่ออกบูธในแมตช์นี้</div>
                            )}
                          </div>

                          {/* Ticket request */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs font-bold text-blue-900">
                              <Ticket className="w-3.5 h-3.5 text-blue-600" />
                              <span>การรับบัตรดูบอล:</span>
                            </div>
                            {record.ticketRequired ? (
                              <div className="text-xs text-slate-700 pl-4 space-y-0.5">
                                <div className="font-bold text-blue-700">ขอรับ: {record.ticketQuantity} ใบ</div>
                                <div className="text-slate-500 flex items-center gap-1 text-[11px]">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>{record.ticketRequesterPhone || record.applicantPhone || '-'}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-400 pl-4 italic">ไม่รับบัตรในแมตช์นี้</div>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200/60 text-[10px] text-slate-400">
                          รหัสอ้างอิง: #{record.id.slice(-6)}
                        </div>
                      </div>

                      {/* Column 2: เจ้าหน้าที่ดูแลบูธหน้าสนาม */}
                      <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2 h-full flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                              <Building2 className="w-3.5 h-3.5 text-emerald-700" />
                              <span>เจ้าหน้าที่ดูแลบูธดีลเลอร์</span>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                              ฝ่ายบูธ
                            </span>
                          </div>

                          <div className="text-xs font-bold text-slate-900">
                            {stadiumContact.boothCoordinatorName || 'ผู้ประสานงานออกบูธ'}
                          </div>

                          {/* Display Phone Number ONLY if confirmed by Admin OR viewing as Admin */}
                          <div className="flex items-center justify-between gap-2 pt-1.5">
                            {(!isContactConfirmed && !isUserAdmin) ? (
                              <div className="w-full p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>รอ Admin ยืนยันเบอร์ก่อนขึ้นเว็บ</span>
                              </div>
                            ) : stadiumContact.boothCoordinatorPhone && stadiumContact.boothCoordinatorPhone !== '-' ? (
                              <div className="flex items-center justify-between gap-2 w-full">
                                <a
                                  href={`tel:${stadiumContact.boothCoordinatorPhone}`}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                  <span>{stadiumContact.boothCoordinatorPhone}</span>
                                </a>

                                <button
                                  onClick={() => handleCopyPhone(stadiumContact.boothCoordinatorPhone)}
                                  title="คัดลอกเบอร์โทร"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-100 text-emerald-800 text-[11px] font-medium transition-colors cursor-pointer border border-emerald-200"
                                >
                                  {copiedPhone === stadiumContact.boothCoordinatorPhone ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-700" />
                                      <span>คัดลอกแล้ว</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>คัดลอก</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-amber-700 font-medium">รออัปเดตเบอร์ติดต่อ</span>
                            )}
                          </div>
                        </div>

                        {stadiumContact.boothSetupLocation && (
                          <div className="pt-2 border-t border-emerald-200/60 text-[11px] text-emerald-800/90 leading-tight">
                            📍 จุดตั้งบูธ: {stadiumContact.boothSetupLocation}
                          </div>
                        )}
                      </div>

                      {/* Column 3: เจ้าหน้าที่ประจำซุ้มรับตั๋วดูบอล */}
                      <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/80 space-y-2 h-full flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                              <Ticket className="w-3.5 h-3.5 text-blue-700" />
                              <span>เจ้าหน้าที่ประจำซุ้มตั๋วดูบอล</span>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                              ฝ่ายบัตร
                            </span>
                          </div>

                          <div className="text-xs font-bold text-slate-900">
                            {stadiumContact.ticketCoordinatorName || 'ผู้ประสานงานรับบัตร'}
                          </div>

                          {/* Display Phone Number ONLY if confirmed by Admin OR viewing as Admin */}
                          <div className="flex items-center justify-between gap-2 pt-1.5">
                            {(!isContactConfirmed && !isUserAdmin) ? (
                              <div className="w-full p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>รอ Admin ยืนยันเบอร์ก่อนขึ้นเว็บ</span>
                              </div>
                            ) : stadiumContact.ticketCoordinatorPhone && stadiumContact.ticketCoordinatorPhone !== '-' ? (
                              <div className="flex items-center justify-between gap-2 w-full">
                                <a
                                  href={`tel:${stadiumContact.ticketCoordinatorPhone}`}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-colors"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                  <span>{stadiumContact.ticketCoordinatorPhone}</span>
                                </a>

                                <button
                                  onClick={() => handleCopyPhone(stadiumContact.ticketCoordinatorPhone)}
                                  title="คัดลอกเบอร์โทร"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-100 text-blue-800 text-[11px] font-medium transition-colors cursor-pointer border border-blue-200"
                                >
                                  {copiedPhone === stadiumContact.ticketCoordinatorPhone ? (
                                    <>
                                      <Check className="w-3 h-3 text-blue-700" />
                                      <span>คัดลอกแล้ว</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>คัดลอก</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-amber-700 font-medium">รออัปเดตเบอร์ติดต่อ</span>
                            )}
                          </div>
                        </div>

                        {stadiumContact.ticketPickupLocation && (
                          <div className="pt-2 border-t border-blue-200/60 text-[11px] text-blue-800/90 leading-tight">
                            🎟️ จุดรับตั๋ว: {stadiumContact.ticketPickupLocation}
                          </div>
                        )}
                      </div>

                      {/* Column 4: เวลาทำการ & Remark จาก Google Sheet */}
                      <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-2.5 h-full flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                              <MessageSquare className="w-3.5 h-3.5 text-amber-700" />
                              <span>Remark & ข้อมูลเพิ่มเติม</span>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                              จาก Sheet
                            </span>
                          </div>

                          {/* Operating Hours */}
                          <div className="flex items-center gap-1.5 text-xs text-slate-700">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-[11px]">เวลาทำการ:</span>
                            <span className="text-[11px] text-slate-600">{stadiumContact.operatingHours || '14:00 - 19:30 น.'}</span>
                          </div>

                          {/* Remark Box */}
                          {displayRemark ? (
                            <div className="p-2.5 rounded-xl bg-white border border-amber-300/80 text-amber-950 text-xs shadow-2xs space-y-1">
                              <div className="font-bold text-[11px] text-amber-900 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3 text-amber-600 shrink-0" />
                                <span>Remark จากตาราง:</span>
                              </div>
                              <p className="text-slate-800 text-xs leading-relaxed break-words font-medium">
                                {displayRemark}
                              </p>
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-xl bg-white/70 border border-slate-200 text-slate-400 text-[11px] italic">
                              ไม่มีข้อมูล Remark เพิ่มเติมในแมตช์นี้
                            </div>
                          )}
                        </div>

                        <div className="text-[10px] text-slate-400">
                          อัปเดตล่าสุด: {stadiumContact.sourceTab || 'ฐานข้อมูลระบบ'}
                        </div>
                      </div>
                    </div>

                    {/* 3. Interactive Admin Confirmation Action Bar & User Assurance Footer */}
                    {isUserAdmin ? (
                      <div className={`p-3.5 sm:p-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isContactConfirmed ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' : 'bg-amber-50/90 border-amber-300 text-amber-950'
                      }`}>
                        <div className="flex items-start sm:items-center gap-2.5">
                          {isContactConfirmed ? (
                            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                          )}
                          <div>
                            <div className="text-xs font-bold flex flex-wrap items-center gap-2">
                              <span>
                                {isContactConfirmed ? '✅ สถานะ: Admin กดยืนยันเบอร์ติดต่อแล้ว' : '⚠️ สถานะ: ยังไม่ได้กดยืนยันเบอร์ติดต่อสำหรับแมตช์นี้'}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                isContactConfirmed ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-950'
                              }`}>
                                {isContactConfirmed ? 'เปิดให้ลูกค้าเห็นบนเว็บไซต์แล้ว' : 'ลูกค้าทั่วไปยังไม่เห็นเบอร์โทร'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              {isContactConfirmed
                                ? `ยืนยันเมื่อ: ${confirmStatus.confirmedAt || 'วันนี้'} โดย Admin: ${confirmStatus.confirmedBy || currentUser?.displayName || 'Admin'}`
                                : 'เนื่องจากเบอร์ติดต่อหน้าสนามอาจมีการเปลี่ยนแปลงในแต่ละแมตช์ กรุณาตรวจสอบเบอร์ก่อนกดยืนยันเพื่อนำขึ้นเว็บไซต์'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {!isContactConfirmed ? (
                            <button
                              type="button"
                              onClick={() => handleConfirmMatch(record)}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                              <span>⚡ กดยืนยันเบอร์ติดต่อเพื่อขึ้นเว็บไซต์</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUnconfirmMatch(record)}
                              className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 text-xs font-bold border border-rose-200 shadow-2xs transition-colors cursor-pointer"
                            >
                              ยกเลิกการยืนยัน
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={`px-4 py-2.5 border-t text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                        isContactConfirmed ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' : 'bg-amber-50/50 border-amber-100 text-amber-800'
                      }`}>
                        <div className="flex items-center gap-1.5">
                          {isContactConfirmed ? (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="font-semibold">เบอร์ติดต่อผ่านการตรวจสอบและยืนยันโดย Admin แล้ว พร้อมประสานงานหน้าสนาม</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="font-medium">เบอร์ติดต่อหน้าสนามในแต่ละแมตช์อาจมีการเปลี่ยนแปลง เบอร์จะขึ้นแสดงบนเว็บไซต์เมื่อ Admin กดยืนยัน</span>
                            </>
                          )}
                        </div>
                        {isContactConfirmed && confirmStatus.confirmedAt && (
                          <span className="text-[10px] text-emerald-700">
                            ยืนยันเมื่อ: {confirmStatus.confirmedAt}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASE 2: ALL STADIUMS DIRECTORY VIEW (สมุดโทรศัพท์รวมทุกสนาม) */}
      {/* ========================================================================= */}
      {selectedBrand === 'ALL_STADIUMS' && (
        <div className="space-y-3.5">
          {allStadiumContacts.map((item) => {
            const leagueColor = LEAGUE_COLOR_MAP[item.league];
            const displayRemark = item.remark || item.note || '';

            return (
              <div
                key={item.id}
                className="rounded-3xl border border-slate-200 bg-white shadow-xs hover:border-slate-300 transition-all overflow-hidden"
              >
                {/* Header Bar */}
                <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${leagueColor.badgeBg}`}>
                        {item.league}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.locationProvince}</span>
                      </div>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                      {item.stadiumName}
                    </h3>
                    <div className="text-xs text-slate-500 font-medium">
                      สโมสรเจ้าบ้าน: <span className="font-semibold text-slate-800">{item.homeClub}</span>
                    </div>
                  </div>

                  {isUserAdmin && (
                    <div className="shrink-0">
                      <button
                        onClick={() => handleOpenContactModal(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                        title="แก้ไขข้อมูลเบอร์ติดต่อสนามนี้"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                        <span>แก้ไขเบอร์</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 3 Columns in 1 Row */}
                <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch bg-white">
                  {/* BOOTH */}
                  <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2 h-full flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                          <Building2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>เจ้าหน้าที่ดูแลบูธดีลเลอร์</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                          ฝ่ายบูธ
                        </span>
                      </div>

                      <div className="text-xs font-bold text-slate-900">
                        {item.boothCoordinatorName || 'ผู้ประสานงานออกบูธ'}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1.5">
                        {item.boothCoordinatorPhone && item.boothCoordinatorPhone.trim().length >= 9 ? (
                          <a
                            href={`tel:${item.boothCoordinatorPhone}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{item.boothCoordinatorPhone}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-amber-700 font-medium">รออัปเดตจาก Google Sheet</span>
                        )}

                        {item.boothCoordinatorPhone && item.boothCoordinatorPhone.trim().length >= 9 && (
                          <button
                            onClick={() => handleCopyPhone(item.boothCoordinatorPhone)}
                            title="คัดลอกเบอร์โทร"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-100 text-emerald-800 text-[11px] font-medium transition-colors cursor-pointer border border-emerald-200"
                          >
                            {copiedPhone === item.boothCoordinatorPhone ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-700" />
                                <span>คัดลอกแล้ว</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>คัดลอก</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-emerald-200/60 text-[11px] text-emerald-800/90 leading-tight">
                      📍 จุดตั้งบูธ: {item.boothSetupLocation || '-'}
                    </div>
                  </div>

                  {/* TICKET */}
                  <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/80 space-y-2 h-full flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                          <Ticket className="w-3.5 h-3.5 text-blue-700" />
                          <span>เจ้าหน้าที่ประจำซุ้มตั๋วดูบอล</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                          ฝ่ายบัตร
                        </span>
                      </div>

                      <div className="text-xs font-bold text-slate-900">
                        {item.ticketCoordinatorName || 'ผู้ประสานงานรับบัตร'}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1.5">
                        {item.ticketCoordinatorPhone && item.ticketCoordinatorPhone.trim().length >= 9 ? (
                          <a
                            href={`tel:${item.ticketCoordinatorPhone}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{item.ticketCoordinatorPhone}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-amber-700 font-medium">รออัปเดตจาก Google Sheet</span>
                        )}

                        {item.ticketCoordinatorPhone && item.ticketCoordinatorPhone.trim().length >= 9 && (
                          <button
                            onClick={() => handleCopyPhone(item.ticketCoordinatorPhone)}
                            title="คัดลอกเบอร์โทร"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-100 text-blue-800 text-[11px] font-medium transition-colors cursor-pointer border border-blue-200"
                          >
                            {copiedPhone === item.ticketCoordinatorPhone ? (
                              <>
                                <Check className="w-3 h-3 text-blue-700" />
                                <span>คัดลอกแล้ว</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>คัดลอก</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-blue-200/60 text-[11px] text-blue-800/90 leading-tight">
                      🎟️ จุดรับบัตร: {item.ticketPickupLocation || '-'}
                    </div>
                  </div>

                  {/* HOURS & REMARK */}
                  <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-2 h-full flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                          <MessageSquare className="w-3.5 h-3.5 text-amber-700" />
                          <span>เวลาทำการ & Remark</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                          หน้าสนาม
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-[11px]">เวลาทำการ:</span>
                        <span className="text-[11px] text-slate-600">{item.operatingHours || '14:00 - 19:30 น.'}</span>
                      </div>

                      {displayRemark ? (
                        <div className="p-2.5 rounded-xl bg-white border border-amber-300/80 text-amber-950 text-xs shadow-2xs space-y-1">
                          <div className="font-bold text-[11px] text-amber-900 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Remark:</span>
                          </div>
                          <p className="text-slate-800 text-xs leading-relaxed break-words font-medium">
                            {displayRemark}
                          </p>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-white/70 border border-slate-200 text-slate-400 text-[11px] italic">
                          ไม่มี Remark เพิ่มเติม
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-slate-400">
                      ข้อมูลประจำสนาม: {item.stadiumName}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Advice Notice */}
      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold">ข้อแนะนำในการประสานงานวันแข่งขัน:</span>
          <p className="text-amber-800 text-[11px] leading-relaxed">
            กรุณาติดต่อเจ้าหน้าที่หน้าสนามล่วงหน้าอย่างน้อย 2 ชั่วโมงก่อนเวลาคิกออฟ สำหรับทีมงานออกบูธดีลเลอร์ควรเตรียมเอกสารยืนยันจากแบรนด์ และสำหรับผู้มารับบัตรดูบอลโปรดเตรียมอีเมลยืนยันการลงทะเบียนเพื่อความสะดวกและรวดเร็ว
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: ADD / UPDATE STADIUM CONTACT (เพิ่ม/อัปเดตเบอร์ติดต่อหน้าสนาม) */}
      {/* ========================================================================= */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-5 animate-fadeIn">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-700">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    {formContactId ? 'แก้ไขเบอร์ติดต่อหน้าสนาม' : '+ เพิ่ม/อัปเดตเบอร์ติดต่อหน้าสนาม'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    บันทึกข้อมูลเจ้าหน้าที่ประสานงานออกบูธและรับบัตรดูบอลประจำสนามแข่งขัน
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsContactModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-5">
              {/* Top Section: Stadium & League */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-600" />
                  <span>ข้อมูลสนามแข่งขันและสโมสร</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Preset Stadium Select */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      เลือกจากรายชื่อสนามสโมสรหลัก
                    </label>
                    <select
                      value={formStadiumName}
                      onChange={(e) => handleSelectPresetStadium(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      <option value="">-- เลือกสนาม หรือพิมพ์ระบุด้านล่าง --</option>
                      {INITIAL_STADIUM_CONTACTS.map((s) => (
                        <option key={s.id} value={s.stadiumName}>
                          [{s.league}] {s.stadiumName} ({s.homeClub})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* League */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ระดับลีก (League)
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['League 1', 'League 2', 'League 3'] as LeagueType[]).map((lg) => (
                        <button
                          key={lg}
                          type="button"
                          onClick={() => setFormLeague(lg)}
                          className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all border ${
                            formLeague === lg
                              ? `${LEAGUE_COLOR_MAP[lg].badgeBg} ring-2 ring-slate-900/10 shadow-xs`
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {lg}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ชื่อสนามแข่งขัน *
                    </label>
                    <input
                      type="text"
                      required
                      value={formStadiumName}
                      onChange={(e) => setFormStadiumName(e.target.value)}
                      placeholder="เช่น ช้าง อารีนา"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      สโมสรเจ้าบ้าน
                    </label>
                    <input
                      type="text"
                      value={formHomeClub}
                      onChange={(e) => setFormHomeClub(e.target.value)}
                      placeholder="เช่น บุรีรัมย์ ยูไนเต็ด"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      จังหวัดที่ตั้ง
                    </label>
                    <input
                      type="text"
                      value={formProvince}
                      onChange={(e) => setFormProvince(e.target.value)}
                      placeholder="เช่น จ.บุรีรัมย์"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Section 1: Booth Coordinator */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <Building2 className="w-4 h-4 text-emerald-700" />
                    <span>1. เจ้าหน้าที่ดูแลการออกบูธดีลเลอร์หน้าสนาม (Booth Coordinator)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    ฝ่ายออกบูธ
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ชื่อ-นามสกุล เจ้าหน้าที่ดูแลบูธ
                    </label>
                    <input
                      type="text"
                      value={formBoothName}
                      onChange={(e) => setFormBoothName(e.target.value)}
                      placeholder="เช่น คุณชัยยันต์ ประจำสนาม"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      เบอร์โทรศัพท์ติดต่อ (สายตรง) *
                    </label>
                    <input
                      type="tel"
                      value={formBoothPhone}
                      onChange={(e) => setFormBoothPhone(e.target.value)}
                      placeholder="เช่น 081-456-7890"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    พิกัดจุดตั้งบูธ / ประตูทางเข้าสำหรับดีลเลอร์
                  </label>
                  <input
                    type="text"
                    value={formBoothLocation}
                    onChange={(e) => setFormBoothLocation(e.target.value)}
                    placeholder="เช่น ลานกิจกรรมหน้าทางเข้าประตู Gate 1 (ใกล้ช้างพลาซ่า)"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Section 2: Ticket Coordinator */}
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                    <Ticket className="w-4 h-4 text-blue-700" />
                    <span>2. เจ้าหน้าที่ฝ่ายแจกบัตรดูบอลสปอนเซอร์ (Ticket Coordinator)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">
                    ฝ่ายรับบัตร (คนละท่านกับบูธ)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ชื่อ-นามสกุล เจ้าหน้าที่ฝ่ายบัตร
                    </label>
                    <input
                      type="text"
                      value={formTicketName}
                      onChange={(e) => setFormTicketName(e.target.value)}
                      placeholder="เช่น คุณวรรณา เจ้าหน้าที่ฝ่ายตั๋ว"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      เบอร์โทรศัพท์ติดต่อ (สายตรง) *
                    </label>
                    <input
                      type="tel"
                      value={formTicketPhone}
                      onChange={(e) => setFormTicketPhone(e.target.value)}
                      placeholder="เช่น 089-112-3344"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    จุดรับบัตรดูบอลหน้าสนาม
                  </label>
                  <input
                    type="text"
                    value={formTicketLocation}
                    onChange={(e) => setFormTicketLocation(e.target.value)}
                    placeholder="เช่น ซุ้ม Sponsor & Partner Ticket Box หน้าตึกสโมสร"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Section 3: Operating Hours, Notes & Remark */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    เวลาทำการเจ้าหน้าที่หน้าสนาม
                  </label>
                  <input
                    type="text"
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    placeholder="เช่น 14:00 - 19:30 น. (วันแข่งขัน)"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    หมายเหตุทั่วไป
                  </label>
                  <input
                    type="text"
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                    placeholder="เช่น แสดงหลักฐานหรืออีเมลยืนยันเพื่อรับบัตร"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-800 mb-1">
                    Remark (แจ้งเพิ่มเติมจาก Google Sheet)
                  </label>
                  <input
                    type="text"
                    value={formRemark}
                    onChange={(e) => setFormRemark(e.target.value)}
                    placeholder="เช่น ดึงจากช่อง Remark ใน Sheet..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-amber-300 bg-amber-50/50 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsContactModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลเบอร์ติดต่อ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
