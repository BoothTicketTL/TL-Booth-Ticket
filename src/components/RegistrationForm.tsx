import React, { useState, useMemo, useEffect } from 'react';
import { 
  Building2, 
  Ticket, 
  Calendar, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Send, 
  Sparkles,
  Phone,
  User,
  Mail,
  ChevronDown,
  Check,
  Filter,
  Copy,
  Plus,
  Minus,
  CheckSquare,
  Square,
  X,
  Layers,
  ChevronRight,
  Lock,
  ArrowRight,
  ChevronLeft,
  RotateCcw,
  FileSpreadsheet,
  RefreshCw,
  Settings2,
  MessageSquare,
  FileText,
  PhoneCall,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Store,
  ArrowLeft
} from 'lucide-react';
import { 
  LeagueType, 
  BrandType, 
  FixtureItem, 
  UserProfile,
  RegistrationRecord,
  MatchStadiumContact
} from '../types';
import {
  THAI_LEAGUE_FIXTURES, 
  LEAGUE_COLOR_MAP, 
  SPONSOR_BRANDS,
  CURRENT_SIMULATED_DATE 
} from '../data/fixtures';
import { ClubCrest } from './common/ClubCrest';
import { LeagueBadge } from './common/LeagueBadge';
import {
  getSponsorBrands,
  subscribeToBrands,
  SponsorBrandItem,
  calculateBrandQuota,
  isBrandAllowedForBooth,
  isBrandAllowedForTickets,
  getMaxTicketsPerMatchForLeague,
  formatMaxTicketsPerMatch
} from '../lib/brandService';
import {
  getAuthorizedUsers,
  subscribeToAuthorizedUsers,
  checkUserRoleByEmail,
  AuthorizedUser
} from '../lib/userManagementService';
import { 
  createRegistration, 
  subscribeToSimulatedDate, 
  advanceSimulatedDate, 
  resetSimulatedDate,
  getSimulatedDate,
  subscribeToMatchContacts 
} from '../lib/firebase';
import { 
  findContactForStadiumOrMatch, 
  getStadiumContactsSyncMeta, 
  subscribeToContactsSync 
} from '../lib/stadiumContactsService';
import { 
  confirmStadiumForWeek,
  getCurrentWeekInfo,
  subscribeToStadiumPhonebook 
} from '../lib/stadiumPhonebookService';
import { 
  confirmMatchContact,
  subscribeToMatchConfirmations 
} from '../lib/matchConfirmationService';
import { getN8nConfig, triggerN8nWebhook } from '../lib/n8nService';
import { 
  subscribeToFixtures, 
  fetchFixturesFromGoogleSheet, 
  getFixturesMeta, 
  FixturesSyncMeta, 
  resetFixturesToDefault,
  AutoSyncConfig,
  getAutoSyncConfig,
  subscribeToAutoSync
} from '../lib/fixturesService';
import { 
  getActiveRegistrationSeason, 
  setActiveRegistrationSeason, 
  subscribeToActiveSeason, 
  getSeasonShort, 
  SUPPORTED_SEASONS, 
  getSeasonFromDate 
} from '../lib/seasonService';

interface RegistrationFormProps {
  records?: RegistrationRecord[];
  currentUser: UserProfile | null;
  onOpenLoginModal: () => void;
  onSuccessRegistered: () => void;
  initialLeague?: LeagueType;
  initialBrand?: BrandType;
  onNavigateToContacts?: () => void;
  onOpenSheetsModal?: (tab?: 'fixtures' | 'contacts' | 'export') => void;
  onBackToHub?: () => void;
}

export interface MatchFormEntry {
  fixtureId: string;
  boothRequired: boolean;
  dealerName: string;
  dealerPhone: string;
  ticketRequired: boolean;
  ticketQuantity: number;
  ticketRequesterPhone: string;
  remark: string;
}

// Check if a string signifies '-' / 'no booth' / 'no tickets'
export const isMinusOrNone = (val?: string | null): boolean => {
  if (!val) return false;
  const t = val.trim();
  return t === '-' || t === '--' || t === '—' || t === 'ไม่ออกบูธ' || t === 'ไม่รับบัตร' || t === 'ไม่มี' || t === 'N/A' || t === 'n/a';
};

// Check if a booth request is actively wanted (not disabled and not marked as '-')
export const isBoothActive = (entry?: MatchFormEntry): boolean => {
  if (!entry) return false;
  if (!entry.boothRequired) return false;
  if (isMinusOrNone(entry.dealerName) || isMinusOrNone(entry.dealerPhone)) return false;
  return Boolean(entry.dealerName?.trim() && entry.dealerPhone?.trim());
};

// Check if a ticket request is actively wanted (not disabled, quantity > 0, and not marked as '-')
export const isTicketActive = (entry?: MatchFormEntry): boolean => {
  if (!entry) return false;
  if (!entry.ticketRequired) return false;
  const qty = Number(entry.ticketQuantity);
  if (isNaN(qty) || qty <= 0) return false;
  if (isMinusOrNone(entry.ticketRequesterPhone)) return false;
  return Boolean(entry.ticketRequesterPhone?.trim());
};

export const RegistrationForm: React.FC<RegistrationFormProps> = ({
  records = [],
  currentUser,
  onOpenLoginModal,
  onSuccessRegistered,
  initialLeague = 'League 1',
  initialBrand,
  onNavigateToContacts,
  onOpenSheetsModal,
  onBackToHub,
}) => {
  // Fixtures State (Dynamic from Google Sheet or System Default)
  const [fixtures, setFixtures] = useState<FixtureItem[]>([]);
  const [fixturesMeta, setFixturesMeta] = useState<FixturesSyncMeta>(getFixturesMeta());
  const [isSyncingFixtures, setIsSyncingFixtures] = useState(false);
  const [syncToast, setSyncToast] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [autoSyncConfig, setAutoSyncConfig] = useState<AutoSyncConfig>(getAutoSyncConfig());
  const [isAutoChecking, setIsAutoChecking] = useState(false);

  // Stadium Contacts Sync State
  const [syncedContacts, setSyncedContacts] = useState<MatchStadiumContact[]>([]);
  const [contactsSyncMeta, setContactsSyncMeta] = useState(getStadiumContactsSyncMeta());
  const [phonebookVersion, setPhonebookVersion] = useState(0);

  // Subscribe to real-time custom fixtures and contacts
  useEffect(() => {
    const unsubFixtures = subscribeToFixtures((loadedFixtures, meta) => {
      setFixtures(loadedFixtures);
      setFixturesMeta(meta);
    });

    const unsubContacts = subscribeToMatchContacts((list) => {
      setSyncedContacts(list);
    });

    const unsubContactMeta = subscribeToContactsSync((meta) => {
      setContactsSyncMeta(meta);
    });

    const unsubPhonebook = subscribeToStadiumPhonebook(() => {
      setPhonebookVersion(v => v + 1);
    });

    const unsubMatchConf = subscribeToMatchConfirmations(() => {
      setPhonebookVersion(v => v + 1);
    });

    const unsubAutoSync = subscribeToAutoSync((cfg, ev) => {
      setAutoSyncConfig(cfg);
      if (ev?.status === 'checking') {
        setIsAutoChecking(true);
      } else if (ev?.status === 'success' || ev?.status === 'failed') {
        setIsAutoChecking(false);
        if (ev.hasChanges) {
          setSyncToast({
            type: 'success',
            message: `🔄 ตรวจพบการอัปเดตจาก Google Sheets อัตโนมัติ: ${ev.message}`,
          });
          setTimeout(() => setSyncToast(null), 8000);
        }
      }
    });

    return () => {
      unsubFixtures();
      unsubContacts();
      unsubContactMeta();
      unsubPhonebook();
      unsubMatchConf();
      unsubAutoSync();
    };
  }, []);

  // Quick live sync handler from Google Sheet
  const handleQuickSyncFixtures = async () => {
    try {
      setIsSyncingFixtures(true);
      setSyncToast(null);
      const res = await fetchFixturesFromGoogleSheet();
      if (res.success) {
        const counts = res.leagueCounts || getFixturesMeta().leagueCounts;
        setSyncToast({
          type: 'success',
          message: `ซิงค์ตารางแข่งขันสดครบทั้ง 3 ลีกสำเร็จ (${res.count} คู่ • Thai League 1: ${counts['League 1'] || 0} คู่ | Thai League 2: ${counts['League 2'] || 0} คู่ | Thai League 3: ${counts['League 3'] || 0} คู่)!`,
        });
        setTimeout(() => setSyncToast(null), 6000);
      } else {
        setSyncToast({
          type: res.isPermissionIssue ? 'warning' : 'error',
          message: res.error || 'ไม่สามารถดึงข้อมูลตารางแข่งขันได้',
        });
        if (res.isPermissionIssue && onOpenSheetsModal) {
          onOpenSheetsModal('fixtures');
        }
      }
    } catch (e: any) {
      setSyncToast({
        type: 'error',
        message: e.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets',
      });
    } finally {
      setIsSyncingFixtures(false);
    }
  };

  // Active simulated reference date (syncs across components)
  const [simDate, setSimDate] = useState<string>(getSimulatedDate());

  // Active Registration Season (Syncs across whole application)
  const [activeSeason, setActiveSeason] = useState<string>(getActiveRegistrationSeason());

  useEffect(() => {
    const unsub = subscribeToActiveSeason((s) => {
      setActiveSeason(s);
    });
    return () => unsub();
  }, []);

  const handleSeasonChange = (newSeason: string) => {
    setActiveRegistrationSeason(newSeason);
    // Align simulated date with the season's kickoff date so "แมตช์ในอีก 7 วันข้างหน้า" shows matches for this season
    const startYear = parseInt(newSeason.split('/')[0], 10);
    if (!isNaN(startYear)) {
      setSimDate(`${startYear}-09-03`);
    }
  };

  useEffect(() => {
    const unsub = subscribeToSimulatedDate((newDate) => {
      setSimDate(newDate);
    });
    return () => unsub();
  }, []);
  // Selected League Tab Filter: 'League 1' | 'League 2' | 'League 3' | 'All'
  const [selectedLeagueTab, setSelectedLeagueTab] = useState<LeagueType | 'All'>(initialLeague);

  // Dynamic sponsor brands from configuration
  const [dynamicBrands, setDynamicBrands] = useState<SponsorBrandItem[]>(() => getSponsorBrands());

  useEffect(() => {
    const unsub = subscribeToBrands((updated) => {
      setDynamicBrands(updated);
    });
    return () => unsub();
  }, []);

  // Back-office authorized users subscription
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>(() => getAuthorizedUsers());

  useEffect(() => {
    const unsub = subscribeToAuthorizedUsers((users) => {
      setAuthorizedUsers(users);
    });
    return () => unsub();
  }, []);

  // Contact Info
  const [applicantName, setApplicantName] = useState(currentUser?.displayName || '');
  const [applicantEmail, setApplicantEmail] = useState(currentUser?.email || '');
  const [applicantPhone, setApplicantPhone] = useState('081-234-5678');
  const [organization, setOrganization] = useState(
    currentUser?.organization || ''
  );

  // Role resolution
  const isAdmin = currentUser?.role === 'admin';

  // Real-time lookup of user brand rights based on email or currentUser
  const detectedAuthInfo = useMemo(() => {
    const emailToTest = (applicantEmail || currentUser?.email || '').trim().toLowerCase();
    if (!emailToTest) return null;
    const directUser = authorizedUsers.find(u => u.email.toLowerCase() === emailToTest);
    if (directUser) {
      return {
        isKnown: true,
        role: directUser.role,
        assignedBrand: directUser.assignedBrand,
        displayName: directUser.name,
        organization: directUser.organization
      };
    }
    const check = checkUserRoleByEmail(emailToTest);
    return check.isKnown ? check : null;
  }, [applicantEmail, currentUser, authorizedUsers]);

  // Derived assigned brand (from email configuration or currentUser)
  const assignedBrand = useMemo(() => {
    if (detectedAuthInfo?.assignedBrand && detectedAuthInfo.assignedBrand !== 'All') {
      return detectedAuthInfo.assignedBrand as BrandType;
    }
    if (currentUser?.assignedBrand && currentUser.assignedBrand !== 'All') {
      return currentUser.assignedBrand as BrandType;
    }
    return !isAdmin && currentUser?.role === 'user' ? 'BYD' : null;
  }, [detectedAuthInfo, currentUser, isAdmin]);

  // If user is not admin, brand is strictly locked to their email
  const isBrandLocked = !isAdmin;

  // 1. Brand Selection: automatically enforced from email or assignedBrand
  const [selectedBrand, setSelectedBrand] = useState<BrandType>(() => {
    if (assignedBrand) return assignedBrand;
    if (initialBrand) return initialBrand;
    return 'BYD';
  });

  // Automatically enforce the brand derived from email / back-office settings
  useEffect(() => {
    if (assignedBrand) {
      setSelectedBrand(assignedBrand);
    }
  }, [assignedBrand]);

  // Sync coordinator details when user profile updates
  useEffect(() => {
    if (currentUser) {
      if (currentUser.displayName && !applicantName) setApplicantName(currentUser.displayName);
      if (currentUser.email && !applicantEmail) setApplicantEmail(currentUser.email);
      if (currentUser.organization && !organization) setOrganization(currentUser.organization);
    }
  }, [currentUser]);

  // Handle email typing with real-time brand detection
  const handleEmailChange = (newEmail: string) => {
    setApplicantEmail(newEmail);
    const clean = newEmail.trim().toLowerCase();
    if (!clean) return;

    const matched = authorizedUsers.find(u => u.email.toLowerCase() === clean);
    if (matched && matched.assignedBrand && matched.assignedBrand !== 'All') {
      setSelectedBrand(matched.assignedBrand as BrandType);
      if (matched.organization) setOrganization(matched.organization);
      if (matched.name && !applicantName) setApplicantName(matched.name);
      return;
    }

    const roleCheck = checkUserRoleByEmail(clean);
    if (roleCheck.isKnown && roleCheck.assignedBrand && roleCheck.assignedBrand !== 'All') {
      setSelectedBrand(roleCheck.assignedBrand as BrandType);
      if (roleCheck.organization) setOrganization(roleCheck.organization);
      if (roleCheck.displayName && !applicantName) setApplicantName(roleCheck.displayName);
    }
  };

  // Filter accessible records: if brand is locked, only allow access to records of that brand
  const accessibleRecords = useMemo(() => {
    if (isBrandLocked && assignedBrand) {
      return records.filter(r => r.brand === assignedBrand);
    }
    return records;
  }, [records, isBrandLocked, assignedBrand]);

  // Filter for Next 7 Days (Defaults to TRUE per user specification)
  const [showOnlyNext7Days, setShowOnlyNext7Days] = useState(true);

  // Multi-match selection state (Fixture IDs)
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [matchEntries, setMatchEntries] = useState<Record<string, MatchFormEntry>>({});

  // Client-revealed on-site stadium contacts state (revealed on-demand by client)
  const [revealedContactMatchIds, setRevealedContactMatchIds] = useState<Record<string, boolean>>({});

  const toggleRevealContact = (matchKey: string) => {
    setRevealedContactMatchIds(prev => ({
      ...prev,
      [matchKey]: !prev[matchKey]
    }));
  };

  // Helper to check if match day is finished (compares YYYY-MM-DD)
  // On-site stadium contacts remain active and displayed until the end of match day (23:59:59)
  const isMatchDayFinished = (matchDateStr: string, currentSimDateStr: string): boolean => {
    if (!matchDateStr) return false;
    const currentDay = currentSimDateStr.slice(0, 10);
    const matchDay = matchDateStr.slice(0, 10);
    return currentDay > matchDay;
  };

  const formatThaiDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
  };

  /**
   * Calculates Friday-to-Thursday match schedule window (7 days)
   * Example: 9-15 ต.ค. 2569, next is 16-22 ต.ค. 2569
   */
  const getFridayToThursdayCycle = (refDateStr: string) => {
    const d = new Date(refDateStr || '2026-10-09');
    const validDate = isNaN(d.getTime()) ? new Date('2026-10-09') : d;
    const dayOfWeek = validDate.getDay();
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
  };

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Calculate Friday-to-Thursday match cycle for the active simDate
  const currentMatchCycle = useMemo(() => getFridayToThursdayCycle(simDate), [simDate]);

  // Calculate matches occurring within the Friday-to-Thursday window from active simDate (filtered by activeSeason)
  const allNext7DaysMatches = useMemo(() => {
    // 1. Filter fixtures belonging to the active registration season
    const seasonFixtures = fixtures.filter(f => {
      const matchSeason = getSeasonFromDate(f.matchDate || f.month);
      return matchSeason === activeSeason;
    });

    // If no matches found for this season in current fixtures, check THAI_LEAGUE_FIXTURES
    const pool = seasonFixtures.length > 0 
      ? seasonFixtures 
      : THAI_LEAGUE_FIXTURES.filter(f => getSeasonFromDate(f.matchDate || f.month) === activeSeason);

    const cycle = getFridayToThursdayCycle(simDate);

    return pool.filter(f => {
      // Regular customers (!isAdmin) are strictly locked to current Friday-Thursday match cycle
      // "ลูกค้าไม่มีสิทธิ์กดดูแมตช์การแข่งขันสัปดาห์ก่อนหน้า หรือสัปดาห์ถัดไป"
      if (!isAdmin) {
        return f.matchDate >= cycle.fridayStr && f.matchDate <= cycle.thursdayStr;
      }
      if (showOnlyNext7Days) {
        return f.matchDate >= cycle.fridayStr && f.matchDate <= cycle.thursdayStr;
      }
      return true;
    });
  }, [fixtures, showOnlyNext7Days, simDate, activeSeason, isAdmin]);

  // Formatted date window text (e.g. 9-15 ต.ค. 2569)
  const dateWindowText = useMemo(() => {
    return currentMatchCycle.formattedRange;
  }, [currentMatchCycle]);

  // Filtered by selected league tab
  const displayedMatches = useMemo(() => {
    if (selectedLeagueTab === 'All') {
      return allNext7DaysMatches;
    }
    return allNext7DaysMatches.filter(f => f.league === selectedLeagueTab);
  }, [allNext7DaysMatches, selectedLeagueTab]);

  // Group displayed matches by league for clear structural hierarchy
  const matchesByLeague = useMemo(() => {
    const groups: Record<LeagueType, FixtureItem[]> = {
      'League 1': [],
      'League 2': [],
      'League 3': [],
    };
    displayedMatches.forEach(f => {
      if (groups[f.league]) {
        groups[f.league].push(f);
      }
    });
    return groups;
  }, [displayedMatches]);

  // Activate / Deactivate match for registration
  const toggleMatchSelection = (fixture: FixtureItem) => {
    const isSelected = selectedMatchIds.includes(fixture.id);
    if (isSelected) {
      setSelectedMatchIds(prev => prev.filter(id => id !== fixture.id));
    } else {
      const isBoothAllowed = isBrandAllowedForBooth(selectedBrand, fixture.league);
      const isTicketAllowed = isBrandAllowedForTickets(selectedBrand, fixture.league);
      if (!isBoothAllowed && !isTicketAllowed) {
        setSyncToast({
          type: 'warning',
          message: `แบรนด์ "${selectedBrand}" ไม่มีสิทธิ์ขอออกบูธและรับบัตรในรายการ ${fixture.league}`
        });
        return;
      }

      setSelectedMatchIds(prev => [...prev, fixture.id]);
      if (!matchEntries[fixture.id]) {
        setMatchEntries(prev => ({
          ...prev,
          [fixture.id]: {
            fixtureId: fixture.id,
            boothRequired: isBoothAllowed,
            dealerName: isBoothAllowed ? '' : '-',
            dealerPhone: isBoothAllowed ? '' : '-',
            ticketRequired: isTicketAllowed,
            ticketQuantity: isTicketAllowed ? 10 : 0,
            ticketRequesterPhone: isTicketAllowed ? applicantPhone : '-',
            remark: '',
          }
        }));
      }
    }
  };

  // Select all matches currently in view
  // Select all matches in current view (excluding approved locked matches and unauthorized leagues)
  const handleSelectAllInView = () => {
    const selectable = displayedMatches.filter(m => {
      const rec = accessibleRecords.find(r => r.brand === selectedBrand && (r.fixtureId === m.id || r.matchTitle === `${m.homeTeam} vs ${m.awayTeam}`));
      const isBooth = isBrandAllowedForBooth(selectedBrand, m.league);
      const isTicket = isBrandAllowedForTickets(selectedBrand, m.league);
      return rec?.status !== 'approved' && (isBooth || isTicket);
    });
    const newIds = selectable.map(m => m.id);
    setSelectedMatchIds(prev => {
      const combined = Array.from(new Set([...prev, ...newIds]));
      return combined;
    });

    setMatchEntries(prev => {
      const updated = { ...prev };
      selectable.forEach(f => {
        const isBooth = isBrandAllowedForBooth(selectedBrand, f.league);
        const isTicket = isBrandAllowedForTickets(selectedBrand, f.league);
        if (!updated[f.id]) {
          updated[f.id] = {
            fixtureId: f.id,
            boothRequired: isBooth,
            dealerName: isBooth ? '' : '-',
            dealerPhone: isBooth ? '' : '-',
            ticketRequired: isTicket,
            ticketQuantity: isTicket ? 10 : 0,
            ticketRequesterPhone: isTicket ? applicantPhone : '-',
            remark: '',
          };
        }
      });
      return updated;
    });
  };

  // Deselect all matches in current view
  const handleDeselectAllInView = () => {
    const viewIds = new Set(displayedMatches.map(m => m.id));
    setSelectedMatchIds(prev => prev.filter(id => !viewIds.has(id)));
  };

  // Update per-match entry field
  const updateMatchEntry = (fixtureId: string, field: keyof MatchFormEntry, value: any) => {
    // If updating a match that wasn't marked selected yet, mark it selected
    if (!selectedMatchIds.includes(fixtureId)) {
      setSelectedMatchIds(prev => [...prev, fixtureId]);
    }

    setMatchEntries(prev => {
      const current = prev[fixtureId] || {
        fixtureId,
        boothRequired: true,
        dealerName: '',
        dealerPhone: '',
        ticketRequired: true,
        ticketQuantity: 10,
        ticketRequesterPhone: applicantPhone,
        remark: '',
      };

      const updated = {
        ...current,
        [field]: value,
      };

      // Intelligent handling: if user puts '-' in dealerName, automatically sync '-' to dealerPhone if empty
      if (field === 'dealerName' && String(value).trim() === '-') {
        if (!updated.dealerPhone || updated.dealerPhone.trim() === '') {
          updated.dealerPhone = '-';
        }
      } else if (field === 'dealerPhone' && String(value).trim() === '-') {
        if (!updated.dealerName || updated.dealerName.trim() === '') {
          updated.dealerName = '-';
        }
      }

      // Intelligent handling: if user specifies 0 for ticketQuantity, sync '-' to ticketRequesterPhone if default
      if (field === 'ticketQuantity') {
        const num = Math.max(0, parseInt(value, 10) || 0);
        updated.ticketQuantity = num;
        if (num === 0 && (!updated.ticketRequesterPhone || updated.ticketRequesterPhone === applicantPhone)) {
          updated.ticketRequesterPhone = '-';
        }
      } else if (field === 'ticketRequesterPhone' && String(value).trim() === '-') {
        updated.ticketQuantity = 0;
      }

      return {
        ...prev,
        [fixtureId]: updated,
      };
    });
  };

  // Helper action: Set booth as not attending / '-' (ไม่ออกบูธ)
  const setBoothNotAttending = (fixtureId: string) => {
    setMatchEntries(prev => {
      const current = prev[fixtureId] || {
        fixtureId,
        boothRequired: false,
        dealerName: '-',
        dealerPhone: '-',
        ticketRequired: true,
        ticketQuantity: 10,
        ticketRequesterPhone: applicantPhone,
        remark: '',
      };
      return {
        ...prev,
        [fixtureId]: {
          ...current,
          boothRequired: false,
          dealerName: '-',
          dealerPhone: '-',
        }
      };
    });
  };

  // Helper action: Set booth as attending
  const setBoothAttending = (fixtureId: string) => {
    setMatchEntries(prev => {
      const current = prev[fixtureId] || {
        fixtureId,
        boothRequired: true,
        dealerName: '',
        dealerPhone: '',
        ticketRequired: true,
        ticketQuantity: 10,
        ticketRequesterPhone: applicantPhone,
        remark: '',
      };
      return {
        ...prev,
        [fixtureId]: {
          ...current,
          boothRequired: true,
          dealerName: current.dealerName === '-' ? '' : current.dealerName,
          dealerPhone: current.dealerPhone === '-' ? '' : current.dealerPhone,
        }
      };
    });
  };

  // Helper action: Set ticket as not attending / 0 / '-' (ไม่รับบัตร)
  const setTicketNotAttending = (fixtureId: string) => {
    setMatchEntries(prev => {
      const current = prev[fixtureId] || {
        fixtureId,
        boothRequired: true,
        dealerName: '',
        dealerPhone: '',
        ticketRequired: false,
        ticketQuantity: 0,
        ticketRequesterPhone: '-',
        remark: '',
      };
      return {
        ...prev,
        [fixtureId]: {
          ...current,
          ticketRequired: false,
          ticketQuantity: 0,
          ticketRequesterPhone: '-',
        }
      };
    });
  };

  // Helper action: Set ticket as attending (default 10 tickets)
  const setTicketAttending = (fixtureId: string, quantity = 10) => {
    setMatchEntries(prev => {
      const current = prev[fixtureId] || {
        fixtureId,
        boothRequired: true,
        dealerName: '',
        dealerPhone: '',
        ticketRequired: true,
        ticketQuantity: quantity,
        ticketRequesterPhone: applicantPhone,
        remark: '',
      };
      return {
        ...prev,
        [fixtureId]: {
          ...current,
          ticketRequired: true,
          ticketQuantity: quantity,
          ticketRequesterPhone: (current.ticketRequesterPhone === '-' || !current.ticketRequesterPhone) ? applicantPhone : current.ticketRequesterPhone,
        }
      };
    });
  };

  // Copy first match details to all other selected matches
  const handleCopyFirstMatchToAll = () => {
    if (selectedMatchIds.length <= 1) return;
    const firstId = selectedMatchIds[0];
    const source = matchEntries[firstId];
    if (!source) return;

    setMatchEntries(prev => {
      const updated = { ...prev };
      selectedMatchIds.forEach(id => {
        updated[id] = {
          ...source,
          fixtureId: id,
        };
      });
      return updated;
    });
  };

  // Current brand meta & quota
  const selectedBrandMeta = dynamicBrands.find(b => b.id.toLowerCase() === selectedBrand.toLowerCase()) || dynamicBrands[0] || SPONSOR_BRANDS[0];
  const currentBrandItem = dynamicBrands.find(b => b.id.toLowerCase() === selectedBrand.toLowerCase()) || dynamicBrands[0];
  const currentBrandQuota = currentBrandItem ? calculateBrandQuota(currentBrandItem, accessibleRecords, activeSeason) : null;

  // Total summary calculations
  const totalBoothsRequested = useMemo(() => {
    return selectedMatchIds.filter(id => isBoothActive(matchEntries[id])).length;
  }, [selectedMatchIds, matchEntries]);

  const totalTicketsRequested = useMemo(() => {
    return selectedMatchIds.reduce((sum, id) => {
      const entry = matchEntries[id];
      if (!isTicketActive(entry)) return sum;
      return sum + (Number(entry?.ticketQuantity) || 0);
    }, 0);
  }, [selectedMatchIds, matchEntries]);

  // Season ticket quota projection
  const seasonTicketQuota = currentBrandQuota?.quotaTotalTickets ?? 400;
  const alreadyUsedTickets = currentBrandQuota?.usedTotalTickets ?? 0;
  const projectedTotalSeasonTickets = alreadyUsedTickets + totalTicketsRequested;
  const projectedExcessTickets = Math.max(0, projectedTotalSeasonTickets - seasonTicketQuota);
  const isOverSeasonTicketQuota = projectedExcessTickets > 0;

  // Submit multiple matches
  const handleSubmitAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (selectedMatchIds.length === 0) {
      setErrorMessage('กรุณาเลือกและกรอกข้อมูลอย่างน้อย 1 แมตช์การแข่งขันในส่วนที่ 2');
      return;
    }

    if (!applicantEmail.trim()) {
      setErrorMessage('กรุณาระบุ E-mail ติดต่อในส่วนที่ 1 เพื่อตรวจสอบสิทธิ์แบรนด์');
      return;
    }

    if (!applicantPhone.trim()) {
      setErrorMessage('กรุณาระบุเบอร์โทรศัพท์ผู้ประสานงานหลักในส่วนที่ 1');
      return;
    }

    const finalApplicantName = applicantName.trim() || detectedAuthInfo?.displayName || applicantEmail.split('@')[0] || `ผู้แทนแบรนด์ ${selectedBrand}`;

    // Validate that each selected match has valid booth and ticket details
    for (const id of selectedMatchIds) {
      const entry = matchEntries[id];
      const match = fixtures.find(f => f.id === id) || THAI_LEAGUE_FIXTURES.find(f => f.id === id);
      const matchTitle = match ? `${match.homeTeam} vs ${match.awayTeam}` : id;

      const boothActive = isBoothActive(entry);
      const ticketActive = isTicketActive(entry);

      if (!boothActive && !ticketActive) {
        setErrorMessage(
          `แมตช์ "${matchTitle}" มีการระบุเครื่องหมาย "-" หรือไม่ประสงค์ทั้งสองรายการ (กรุณาเลือกขอออกบูธ หรือขอรับบัตรอย่างน้อย 1 รายการ หรือคลิกยกเลิกการเลือกแมตช์นี้หากไม่ประสงค์เข้าร่วม)`
        );
        return;
      }

      if (boothActive && !entry.dealerName.trim()) {
        setErrorMessage(`แมตช์ "${matchTitle}" กรุณากรอกชื่อดีลเลอร์ที่ขอพื้นที่ออกบูธ (หรือใส่ "-" หากไม่ต้องการออกบูธ)`);
        return;
      }
      if (boothActive && !entry.dealerPhone.trim()) {
        setErrorMessage(`แมตช์ "${matchTitle}" กรุณากรอกเบอร์ติดต่อของดีลเลอร์ (หรือใส่ "-" หากไม่ต้องการออกบูธ)`);
        return;
      }

      if (ticketActive && (!entry.ticketQuantity || entry.ticketQuantity <= 0)) {
        setErrorMessage(`แมตช์ "${matchTitle}" กรุณากรอกจำนวนบัตรที่ขอรับให้ถูกต้อง (หากไม่รับบัตรให้ระบุ 0 ใบ หรือใส่ "-")`);
        return;
      }
      if (ticketActive && !entry.ticketRequesterPhone.trim()) {
        setErrorMessage(`แมตช์ "${matchTitle}" กรุณากรอกเบอร์ติดต่อของคนขอรับบัตร (หากไม่รับบัตรให้ใส่ "-")`);
        return;
      }
    }

    try {
      setIsSubmitting(true);

      // Create a registration record for each selected match
      for (const id of selectedMatchIds) {
        const fixture = fixtures.find(f => f.id === id) || THAI_LEAGUE_FIXTURES.find(f => f.id === id)!;
        const entry = matchEntries[id];
        const boothActive = isBoothActive(entry);
        const ticketActive = isTicketActive(entry);

        if (boothActive && !isBrandAllowedForBooth(selectedBrand, fixture.league)) {
          setErrorMessage(`แบรนด์ "${selectedBrand}" ไม่มีสิทธิ์ขอออกบูธในการแข่งขันรายการ ${fixture.league} (${fixture.homeTeam} vs ${fixture.awayTeam}) ตามสัญญาผู้สนับสนุน`);
          setIsSubmitting(false);
          return;
        }

        if (ticketActive) {
          if (!isBrandAllowedForTickets(selectedBrand, fixture.league)) {
            setErrorMessage(`แบรนด์ "${selectedBrand}" ไม่มีสิทธิ์ขอรับบัตรในการแข่งขันรายการ ${fixture.league} (${fixture.homeTeam} vs ${fixture.awayTeam}) ตามสัญญาผู้สนับสนุน`);
            setIsSubmitting(false);
            return;
          }

          const matchMaxTickets = getMaxTicketsPerMatchForLeague(currentBrandItem, fixture.league);
          const reqQty = Number(entry.ticketQuantity) || 0;
          if (reqQty > matchMaxTickets) {
            setErrorMessage(
              `แมตช์ "${fixture.homeTeam} vs ${fixture.awayTeam}" (${fixture.league}) ขอรับบัตร ${reqQty} ใบ ซึ่งเกินโควตาสูงสุดของแบรนด์ "${selectedBrand}" ในรายการนี้ (จำกัดไม่เกิน ${matchMaxTickets} ใบ/นัด)`
            );
            setIsSubmitting(false);
            return;
          }
        }

        await createRegistration({
          league: fixture.league, // Recorded by each match's respective league
          brand: selectedBrand,
          fixtureId: fixture.id,
          matchTitle: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
          stadium: fixture.stadium,
          matchDate: fixture.matchDate,
          month: fixture.month,
          applicantName: finalApplicantName,
          applicantEmail,
          applicantPhone,
          organization: organization || `ผู้แทนแบรนด์ ${selectedBrand}`,
          boothRequired: boothActive,
          dealerName: boothActive ? entry.dealerName.trim() : '-',
          dealerPhone: boothActive ? entry.dealerPhone.trim() : '-',
          ticketRequired: ticketActive,
          ticketQuantity: ticketActive ? (Number(entry.ticketQuantity) || 0) : 0,
          ticketRequesterPhone: ticketActive ? entry.ticketRequesterPhone.trim() : '-',
          remark: entry.remark?.trim() || undefined,
          season: activeSeason || getSeasonFromDate(fixture.matchDate || fixture.month),
          adminNote: `ลงทะเบียนผ่านระบบ ฤดูกาล ${activeSeason} (แบรนด์: ${selectedBrand})${isOverSeasonTicketQuota && ticketActive ? ` [บัตรเกินโควต้าฤดูกาล: ต้องซื้อเพิ่มจากสโมสร]` : ''}`,
        });
      }

      // Auto-trigger n8n Webhook if enabled
      try {
        const n8nConfig = getN8nConfig();
        if (n8nConfig.enabled && n8nConfig.webhookUrl && n8nConfig.autoTriggerOnSubmission) {
          const channels: ('email' | 'line')[] = [];
          if (n8nConfig.enableEmail) channels.push('email');
          if (n8nConfig.enableLine) channels.push('line');

          triggerN8nWebhook({
            event: 'new_registration',
            timestamp: new Date().toISOString(),
            system: 'Thai League Sponsor Management Portal',
            channels: channels.length > 0 ? channels : ['line', 'email'],
            brand: selectedBrand,
            summary: {
              matchCount: selectedMatchIds.length,
              boothCount: selectedMatchIds.filter(id => matchEntries[id]?.boothRequired).length,
              ticketCount: selectedMatchIds.filter(id => matchEntries[id]?.ticketRequired).length,
              totalTicketQty: selectedMatchIds.reduce((sum, id) => sum + (matchEntries[id]?.ticketRequired ? Number(matchEntries[id]?.ticketQuantity || 0) : 0), 0),
              participatingBrands: [selectedBrand],
            },
            recipients: {
              email: applicantEmail,
              lineGroupName: `Sponsor: ${selectedBrand}`,
            },
            emailData: {
              subject: `[Thai League 2026/27] มีการลงทะเบียนใหม่จาก ${selectedBrand} (${selectedMatchIds.length} แมตช์)`,
              htmlBody: `<p>คุณ ${finalApplicantName} (${selectedBrand}) ได้ส่งคำขอลงทะเบียนจำนวน ${selectedMatchIds.length} แมตช์เรียบร้อยแล้ว</p>`,
              plainText: `ได้รับข้อมูลลงทะเบียนใหม่จากแบรนด์ ${selectedBrand} จำนวน ${selectedMatchIds.length} แมตช์ โดยคุณ ${finalApplicantName} (${applicantPhone})`,
            },
            lineData: {
              messageText: `🆕 มีการลงทะเบียนใหม่!\n• แบรนด์: ${selectedBrand}\n• ผู้ลงทะเบียน: ${finalApplicantName} (${applicantPhone})\n• จำนวน: ${selectedMatchIds.length} แมตช์\n• ระบบบันทึกข้อมูลเรียบร้อยแล้ว`,
              targetGroupName: `Sponsor: ${selectedBrand}`,
            },
            records: selectedMatchIds.map(id => {
              const f = displayedMatches.find(m => m.id === id);
              const e = matchEntries[id];
              return {
                matchId: id,
                league: f?.league || '',
                matchDate: f?.matchDate || '',
                homeTeam: f?.homeTeam || '',
                awayTeam: f?.awayTeam || '',
                stadium: f?.stadium || '',
                brand: selectedBrand,
                applicantName: finalApplicantName,
                applicantEmail,
                applicantPhone,
                organization: organization || `ผู้แทนแบรนด์ ${selectedBrand}`,
                boothRequired: Boolean(e?.boothRequired),
                boothDealerName: e?.dealerName || '-',
                ticketRequired: Boolean(e?.ticketRequired),
                ticketQuantity: Number(e?.ticketQuantity) || 0,
                ticketRequesterPhone: e?.ticketRequesterPhone || '-',
              };
            }),
          }).catch(e => console.warn('[n8n Submission Trigger Error]:', e));
        }
      } catch (e) {
        console.warn('[n8n Check Error]:', e);
      }

      setIsSubmitting(false);
      setSubmitSuccess(true);
      setTimeout(() => {
        onSuccessRegistered();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setIsSubmitting(false);
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-6 sm:p-8 shadow-xl">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 rounded-full bg-blue-600/20 blur-3xl pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-semibold backdrop-blur-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>ระบบลงทะเบียนออกบูธดีลเลอร์ & ขอรับบัตรดูบอล Thai League {getSeasonShort(activeSeason)}</span>
            </div>

            {/* Season Selector for Registration */}
            {isAdmin ? (
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-xs border border-white/20 rounded-xl px-3 py-1.5 text-xs">
                <Calendar className="w-3.5 h-3.5 text-sky-300" />
                <span className="text-slate-200 font-medium">ฤดูกาลลงทะเบียน:</span>
                <select
                  id="registration-season-select"
                  value={activeSeason}
                  onChange={(e) => handleSeasonChange(e.target.value)}
                  className="bg-slate-900/90 text-white text-xs font-bold rounded-lg px-2.5 py-1 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                >
                  {SUPPORTED_SEASONS.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.label || s.id}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 text-white text-xs font-semibold backdrop-blur-xs border border-white/20">
                <Calendar className="w-3.5 h-3.5 text-sky-300" />
                <span>ฤดูกาล {getSeasonShort(activeSeason)}</span>
              </div>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            ลงทะเบียนออกบูธ & รับบัตรเข้าชมฟุตบอล ({getSeasonShort(activeSeason)})
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
            ระบุข้อมูลดีลเลอร์ที่ขอออกบูธ และจำนวนบัตรพร้อมเบอร์ติดต่อคนขอรับบัตรแยกตามแต่ละแมตช์ในฤดูกาล {activeSeason} ได้อย่างอิสระ
          </p>
        </div>
      </div>

      {/* Success Notification */}
      {submitSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <div className="font-bold text-sm">บันทึกข้อมูลการลงทะเบียนเรียบร้อยแล้ว! ({selectedMatchIds.length} แมตช์)</div>
            <div className="text-xs text-emerald-700">ระบบบันทึกข้อมูลไปยัง Firebase (Thai League {activeSeason}) และกำลังนำท่านไปสู่หน้าสรุปผล...</div>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmitAll} className="space-y-6">
        {/* ============================================================
            ส่วนที่ 1: ข้อมูลการเข้าใช้งานและแบรนด์ผู้สนับสนุน (Email & Sponsor Brand)
            ============================================================ */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  ส่วนที่ 1: ข้อมูลการเข้าใช้งานและแบรนด์ผู้สนับสนุน (Email & Sponsor Brand)
                </h2>
                <p className="text-xs text-slate-500">
                  ระบบจะตรวจสอบและแสดงแบรนด์ของคุณโดยอัตโนมัติตาม E-mail ที่ผู้ดูแลระบบตั้งค่าไว้ในระบบหลังบ้าน (ลูกค้าไม่ต้องเลือกแบรนด์)
                </p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${selectedBrandMeta.badgeClass}`}>
              แบรนด์ {selectedBrand}
            </span>
          </div>

          {/* Coordinator Email & Phone Inputs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                ระบุ E-mail เพื่อเข้าใช้งานและตรวจสอบสิทธิ์แบรนด์
              </span>
              {!currentUser && (
                <button
                  type="button"
                  onClick={onOpenLoginModal}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>เข้าสู่ระบบด้วย Gmail</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  อีเมล Gmail / อีเมลผู้แทนแบรนด์ (กรอกเพื่อดึงแบรนด์อัตโนมัติ) *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    id="input-applicant-email"
                    value={applicantEmail}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    placeholder="เช่น chitipat.ja@planbmedia.co.th หรือ pakawan.pl@..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white font-medium shadow-2xs"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  * เมื่อกรอกอีเมล ระบบจะค้นหาและแสดงแบรนด์ที่ตั้งค่าไว้ในระบบหลังบ้านทันที
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  เบอร์โทรศัพท์ผู้ประสานงานหลัก *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    required
                    id="input-applicant-phone"
                    value={applicantPhone}
                    onChange={(e) => setApplicantPhone(e.target.value)}
                    placeholder="เช่น 081-234-5678"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white shadow-2xs"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  สำหรับเจ้าหน้าที่สนามติดต่อประสานงานจุดออกบูธและรับบัตร
                </p>
              </div>
            </div>
          </div>

          {/* AUTOMATIC BRAND DISPLAY CARD (NO SELECTION BUTTONS FOR CLIENTS) */}
          {detectedAuthInfo ? (
            /* VERIFIED BRAND CARD FOR USER */
            <div className="rounded-2xl border-2 border-emerald-400/80 bg-gradient-to-br from-emerald-50/90 via-white to-blue-50/60 p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div 
                    className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-xs shrink-0"
                    style={{ backgroundColor: selectedBrandMeta.color }}
                  >
                    {selectedBrandMeta.logoText.slice(0, 3)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                        ✓ ตรวจพบสิทธิ์แบรนด์จาก E-mail (ล็อคสิทธิ์อัตโนมัติ)
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        ตั้งค่าโดยผู้ดูแลระบบ
                      </span>
                    </div>
                    <div className="text-base sm:text-lg font-black text-slate-900 mt-1 flex items-center gap-2">
                      <span>แบรนด์ของคุณ:</span>
                      <span className="text-emerald-700 underline decoration-emerald-400 decoration-2">
                        {selectedBrandMeta.name} ({selectedBrand})
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-2">
                      <span>อีเมล: <strong className="text-slate-800">{applicantEmail}</strong></span>
                      {detectedAuthInfo.organization && <span>• องค์กร: <strong>{detectedAuthInfo.organization}</strong></span>}
                      {detectedAuthInfo.displayName && <span>• ผู้แทน: <strong>{detectedAuthInfo.displayName}</strong></span>}
                    </div>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-xs font-bold text-emerald-800 shadow-2xs self-start sm:self-auto">
                  <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>ล็อคสิทธิ์ตาม E-mail เรียบร้อย</span>
                </div>
              </div>

              <div className="pt-2.5 border-t border-emerald-200/70 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    ระบบแสดงเฉพาะข้อมูลและอนุญาตให้ลงทะเบียนในนามแบรนด์ <strong>{selectedBrand}</strong> เท่านั้น
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 italic">
                  * ลูกค้าไม่ต้องเลือกแบรนด์ ระบบตั้งค่าสิทธิ์ให้ตาม E-mail เรียบร้อยแล้ว
                </div>
              </div>
            </div>
          ) : applicantEmail.trim() ? (
            /* EMAIL ENTERED BUT NOT FOUND IN BACK-OFFICE */
            <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>แบรนด์ที่กำลังใช้งาน: {selectedBrandMeta.name} ({selectedBrand})</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                  โหมดทั่วไป
                </span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                อีเมล <strong>"{applicantEmail}"</strong> ยังไม่ได้รับการผูกกับแบรนด์ในระบบสิทธิ์หลังบ้าน หากท่านเป็นผู้แทนแบรนด์อื่น กรุณาตรวจสอบตัวสะกดอีเมล หรือแจ้งผู้ดูแลระบบ (Admin) เพื่อเพิ่มการกำหนดแบรนด์ในระบบหลังบ้าน
              </p>
            </div>
          ) : (
            /* PROMPT TO ENTER EMAIL */
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                <Mail className="w-5 h-5" />
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-800">
                กรุณากรอก E-mail ในช่องด้านบน หรือคลิกเข้าสู่ระบบด้วย Gmail
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                เมื่อท่านระบุ E-mail ระบบจะดึงแบรนด์ที่แอดมินได้ตั้งค่าไว้ในระบบหลังบ้านขึ้นมาโดยอัตโนมัติ ลูกค้าไม่จำเป็นต้องเลือกแบรนด์เอง
              </p>
              {!currentUser && (
                <button
                  type="button"
                  onClick={onOpenLoginModal}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-all mt-1"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>เข้าสู่ระบบด้วย Gmail</span>
                </button>
              )}
            </div>
          )}

          {/* ADMIN OVERRIDE SWITCHER (VISIBLE ONLY TO ADMIN) */}
          {isAdmin && (
            <div className="p-3.5 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-2.5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>[มุมมองเฉพาะแอดมิน/หลังบ้าน] สลับแบรนด์เพื่อทดสอบระบบหรือลงทะเบียนแทน</span>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 text-[10px] font-bold border border-amber-400/30">
                  Admin Control
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <label className="text-xs text-slate-300 font-semibold">
                  เลือกแบรนด์ที่ต้องการทดสอบ:
                </label>
                <select
                  id="select-admin-brand"
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value as BrandType)}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {dynamicBrands.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 italic">
                  (ลูกค้าจะไม่เห็นเมนูสลับแบรนด์นี้ ลูกค้าจะเห็นเฉพาะแบรนด์ของตนเองตาม E-mail เท่านั้น)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================
            ส่วนที่ 2: MATCHES IN NEXT 7 DAYS SEPARATED BY LEAGUE
            WITH INLINE PER-MATCH BOOTH & TICKET INPUTS
            "ส่วนที่ 2 ขึ้นรายละเอียดการแข่งขันทั้งหมดที่จะเกิดขึ้นในอีก 7 วันข้างหน้า โดยแยกเป็นแต่ละลีก
            ในแต่ละแมตช์การแข่งขัน มีช่องขึ้นมาให้กรอกชื่อ+เบอร์ติดต่อดีลเลอร์ที่ขอออกบูธ 
            และช่องกรอกจำนวนบัตรที่ต้องการ+เบอร์ติดต่อคนขอรับบัตร เพราะแต่ละแมตช์ลูกค้าที่ต้องการออกบูธรับบัตรไม่ใช่คนเดียวกัน"
            ============================================================ */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-6">
          {/* Header of Section 2 with 1-Week Rolling Date Window Controller */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                2
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>ส่วนที่ 2: รายละเอียดการแข่งขันทั้งหมดที่จะเกิดขึ้นในอีก 7 วันข้างหน้า (แยกเป็นแต่ละลีก)</span>
                </h2>
                <p className="text-xs text-slate-500">
                  ในแต่ละแมตช์มีช่องกรอกชื่อ+เบอร์ติดต่อดีลเลอร์ และจำนวนบัตร+เบอร์คนขอรับบัตรแยกกันอย่างอิสระ
                </p>
              </div>
            </div>

            {/* Week & Date Navigation Toolbar (ระบบรันข้อมูลแมตช์ 1 สัปดาห์ถัดไป) */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-bold text-slate-800">
                  รอบ 7 วัน: <span className="text-blue-700">{dateWindowText}</span>
                </span>
              </div>

              {/* Navigation controls - Visible ONLY to Admin */}
              {isAdmin && (
                <>
                  {/* Prev Week Button */}
                  <button
                    type="button"
                    id="btn-prev-week"
                    onClick={() => advanceSimulatedDate(-7)}
                    title="ย้อนกลับไป 1 สัปดาห์ (-7 วัน)"
                    className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 flex items-center gap-1 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>-7 วัน</span>
                  </button>

                  {/* Next Week Button (รันข้อมูล 1 สัปดาห์ถัดไป) */}
                  <button
                    type="button"
                    id="btn-next-week"
                    onClick={() => advanceSimulatedDate(7)}
                    title="รันข้อมูลแมตช์ 1 สัปดาห์ถัดไป (+7 วัน)"
                    className="px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1 transition-colors"
                  >
                    <span>สัปดาห์ถัดไป (+7 วัน)</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  {/* Reset to Today */}
                  <button
                    type="button"
                    id="btn-reset-week"
                    onClick={() => resetSimulatedDate()}
                    title="รีเซ็ตรอบสัปดาห์เป็นค่าเริ่มต้น"
                    className="p-1 rounded-xl bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  {/* Next 7 Days Toggle */}
                  <button
                    type="button"
                    id="toggle-next-7-days"
                    onClick={() => setShowOnlyNext7Days(!showOnlyNext7Days)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-colors ${
                      showOnlyNext7Days
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>{showOnlyNext7Days ? 'กรองเฉพาะ 7 วัน' : 'แสดงทั้งหมด'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Google Sheets Fixtures Sync Control Bar (ดึงและซิงค์ตารางแข่งขันสดจาก Google Sheet ของผู้ใช้ - แสดงเฉพาะ Admin) */}
          {isAdmin && (
            <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200 shadow-2xs space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs shrink-0">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-emerald-950">
                        {fixturesMeta.source === 'google-sheet'
                          ? '✅ ตารางแข่งขันซิงค์สดจาก Google Sheet ของคุณ'
                          : fixturesMeta.source === 'manual-import'
                          ? '📋 ตารางแข่งขันนำเข้าจากการวางตาราง Google Sheet'
                          : '📊 แหล่งข้อมูลตารางการแข่งขัน: ค่าเริ่มต้นของระบบ'}
                      </span>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/95 border border-emerald-300 text-emerald-800 font-bold">
                        {fixtures.length} คู่แข่งขันในระบบ
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {fixturesMeta.source === 'google-sheet' || fixturesMeta.source === 'manual-import'
                        ? `(Thai League 1: ${fixturesMeta.leagueCounts['League 1'] || 0} คู่ • Thai League 2: ${fixturesMeta.leagueCounts['League 2'] || 0} คู่ • Thai League 3: ${fixturesMeta.leagueCounts['League 3'] || 0} คู่) ${fixturesMeta.lastSyncedAt ? `• อัปเดตล่าสุด: ${fixturesMeta.lastSyncedAt}` : ''}`
                        : 'ข้อมูลตารางในเว็บไม่ตรงกับใน Google Sheet ของคุณ? ท่านสามารถกดดึงข้อมูลสดหรือวางข้อมูลได้ทันที'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                  {/* Auto-Sync Live Status Badge */}
                  {autoSyncConfig.enabled ? (
                    <button
                      type="button"
                      onClick={() => onOpenSheetsModal && onOpenSheetsModal('fixtures')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                      title={`ระบบเช็กอัปเดตอัตโนมัติ${autoSyncConfig.intervalMinutes > 0 ? `ทุก ${autoSyncConfig.intervalMinutes} นาที` : 'เมื่อเปิดหน้าเว็บ'} ${autoSyncConfig.lastAutoCheckedAt ? `• ล่าสุด: ${autoSyncConfig.lastAutoCheckedAt}` : ''} (คลิกเพื่อตั้งค่าความถี่)`}
                    >
                      <span className="relative flex h-2 w-2">
                        {isAutoChecking && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        )}
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span>
                        {isAutoChecking 
                          ? 'กำลังเช็กชีตในพื้นหลัง...' 
                          : `Auto-Sync ${autoSyncConfig.intervalMinutes > 0 ? `${autoSyncConfig.intervalMinutes} นาที` : 'On-load'}`}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenSheetsModal && onOpenSheetsModal('fixtures')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium transition-all cursor-pointer"
                      title="Auto-Sync ปิดอยู่ (คลิกเพื่อเปิดใช้งาน)"
                    >
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Auto-Sync: ปิด</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isSyncingFixtures}
                    onClick={handleQuickSyncFixtures}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title="ดึงข้อมูลตารางแข่งขันล่าสุดจาก Google Sheet ทันที"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingFixtures ? 'animate-spin' : ''}`} />
                    <span>{isSyncingFixtures ? 'กำลังดึงตาราง...' : '🔄 ซิงค์สดจาก Sheet'}</span>
                  </button>

                  {onOpenSheetsModal && (
                    <button
                      type="button"
                      onClick={() => onOpenSheetsModal('fixtures')}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-slate-600" />
                      <span>ตั้งค่าลิงก์ / นำเข้าตาราง</span>
                    </button>
                  )}
                </div>
              </div>

              {syncToast && (
                <div className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 ${
                  syncToast.type === 'success' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' :
                  syncToast.type === 'warning' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                  'bg-rose-100 text-rose-900 border border-rose-300'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {syncToast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <AlertCircle className="w-4 h-4 text-amber-700" />}
                    <span>{syncToast.message}</span>
                  </div>
                  <button type="button" onClick={() => setSyncToast(null)} className="text-slate-500 hover:text-slate-800 p-0.5 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* League Tabs Bar (3 Colors: เขียว แดง น้ำเงิน + All) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">
                เลือกลีกที่ต้องการดูหรือกรอกข้อมูล:
              </span>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllInView}
                  className="text-xs font-bold text-slate-700 hover:text-slate-900 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  เลือกทุกแมตช์ในมุมมองนี้
                </button>
                {selectedMatchIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeselectAllInView}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                  >
                    ล้างการเลือก
                  </button>
                )}
                {selectedMatchIds.length > 1 && (
                  <button
                    type="button"
                    onClick={handleCopyFirstMatchToAll}
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    <span>คัดลอกข้อมูลแมตช์แรกไปทุกแมตช์</span>
                  </button>
                )}
              </div>
            </div>

            {/* 3-Color League Switcher Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 bg-slate-100 rounded-2xl">
              {/* League 1 (แดง) */}
              <button
                type="button"
                id="tab-form-league-1"
                onClick={() => setSelectedLeagueTab('League 1')}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                  selectedLeagueTab === 'League 1'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                <span>Thai League 1</span>
                <span className="text-[10px] opacity-80">(แดง)</span>
              </button>

              {/* League 2 (น้ำเงิน) */}
              <button
                type="button"
                id="tab-form-league-2"
                onClick={() => setSelectedLeagueTab('League 2')}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                  selectedLeagueTab === 'League 2'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
                <span>Thai League 2</span>
                <span className="text-[10px] opacity-80">(น้ำเงิน)</span>
              </button>

              {/* League 3 (เขียว) */}
              <button
                type="button"
                id="tab-form-league-3"
                onClick={() => setSelectedLeagueTab('League 3')}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                  selectedLeagueTab === 'League 3'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <span>Thai League 3</span>
                <span className="text-[10px] opacity-80">(เขียว)</span>
              </button>

              {/* All Leagues (ทุกลีก) */}
              <button
                type="button"
                id="tab-form-league-all"
                onClick={() => setSelectedLeagueTab('All')}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                  selectedLeagueTab === 'All'
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>แสดงทุกลีก (All)</span>
              </button>
            </div>

            {/* Official League Badge Header Card (Mockup 3 Requirement) */}
            {selectedLeagueTab !== 'All' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-md border border-slate-700/80">
                <div className="flex items-center gap-4">
                  <LeagueBadge league={selectedLeagueTab} size="md" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                        selectedLeagueTab === 'League 1' ? 'bg-rose-500 text-white' :
                        selectedLeagueTab === 'League 2' ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white'
                      }`}>
                        {selectedLeagueTab}
                      </span>
                      <span className="text-xs text-amber-300 font-bold">โลโก้ทางการประจำลีก</span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-black text-white mt-1">
                      {selectedLeagueTab === 'League 1' ? 'BYD SEALION 6 LEAGUE I' :
                       selectedLeagueTab === 'League 2' ? 'BYD SEAL 5 LEAGUE II' :
                       'BYD DOLPHIN LEAGUE III'}
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      โปรแกรมการแข่งขันและลงทะเบียนบูธ & บัตรดูบอลเฉพาะรอบสัปดาห์นี้
                    </p>
                    <p className="text-xs text-amber-300 font-bold mt-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      <span>ช่วงวันที่แข่งขัน: {dateWindowText}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right sm:self-center">
                  <span className="text-xs font-semibold text-slate-400 block">แมตช์ในสัปดาห์นี้</span>
                  <span className="text-xl sm:text-2xl font-black text-white">
                    {displayedMatches.length} คู่แข่งขัน
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* List of Matches with Inline Forms for Each Match */}
          {displayedMatches.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto shadow-xs">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-bold text-slate-800">
                  ไม่มีการแข่งขันในสัปดาห์นี้
                </p>
                <p className="text-xs text-slate-500">
                  ช่วงวันที่ {dateWindowText} {selectedLeagueTab !== 'All' ? `(รายการ ${selectedLeagueTab})` : ''} ไม่มีการจัดโปรแกรมการแข่งขัน (เช่น สัปดาห์พักเบรกทีมชาติ FIFA Matchday)
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowOnlyNext7Days(false);
                    setSelectedLeagueTab('All');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors cursor-pointer shadow-xs"
                >
                  คลิกเพื่อแสดงแมตช์ทั้งหมดในระบบ ({fixtures.length} แมตช์)
                </button>

                {isAdmin && onOpenSheetsModal && (
                  <button
                    type="button"
                    onClick={() => onOpenSheetsModal('fixtures')}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>ดึงหรือวางตารางจาก Google Sheet</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {(selectedLeagueTab === 'All' 
                ? (['League 1', 'League 2', 'League 3'] as LeagueType[])
                : [selectedLeagueTab]
              ).map((leagueKey) => {
                const leagueFixtures = matchesByLeague[leagueKey] || [];
                const leagueMeta = LEAGUE_COLOR_MAP[leagueKey];

                if (leagueFixtures.length === 0) {
                  return (
                    <div key={leagueKey} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <span className={`w-3 h-3 rounded-full ${
                          leagueKey === 'League 1' ? 'bg-blue-600' :
                          leagueKey === 'League 2' ? 'bg-rose-600' : 'bg-emerald-600'
                        }`}></span>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                          {leagueMeta.name} ({leagueMeta.label})
                        </h3>
                      </div>
                      <div className="p-4 text-center bg-slate-50/80 rounded-xl border border-slate-200 text-xs text-slate-500 flex items-center justify-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <span className="font-semibold text-slate-700">ไม่มีการแข่งขันในสัปดาห์นี้</span>
                        <span className="text-[11px] text-slate-400">({dateWindowText})</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={leagueKey} className="space-y-3">
                    {/* League Group Header */}
                    <div className="flex items-center gap-2 px-1">
                      <span className={`w-3 h-3 rounded-full ${
                        leagueKey === 'League 1' ? 'bg-blue-600' :
                        leagueKey === 'League 2' ? 'bg-rose-600' : 'bg-emerald-600'
                      }`}></span>
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                        {leagueMeta.name} ({leagueMeta.label})
                      </h3>
                      <span className="text-[11px] text-slate-500">
                        • {leagueFixtures.length} แมตช์ในมุมมองนี้
                      </span>
                    </div>

                    {/* Fixture Cards with INLINE INPUTS */}
                    <div className="space-y-4">
                      {leagueFixtures.map((fixture) => {
                        // Check if this brand has already registered for this fixture
                        const registeredRecord = accessibleRecords.find(r => 
                          r.brand === selectedBrand && (r.fixtureId === fixture.id || r.matchTitle === `${fixture.homeTeam} vs ${fixture.awayTeam}`)
                        );
                        const isApproved = registeredRecord?.status === 'approved';
                        const isPending = registeredRecord?.status === 'pending';

                        const isBoothAllowed = isBrandAllowedForBooth(selectedBrand, fixture.league);
                        const isTicketAllowed = isBrandAllowedForTickets(selectedBrand, fixture.league);
                        const isAnyAllowed = isBoothAllowed || isTicketAllowed;

                        const isSelected = selectedMatchIds.includes(fixture.id);
                        const entry = matchEntries[fixture.id] || {
                          fixtureId: fixture.id,
                          boothRequired: isBoothAllowed,
                          dealerName: isBoothAllowed ? '' : '-',
                          dealerPhone: isBoothAllowed ? '' : '-',
                          ticketRequired: isTicketAllowed,
                          ticketQuantity: isTicketAllowed ? 10 : 0,
                          ticketRequesterPhone: isTicketAllowed ? applicantPhone : '-',
                          remark: '',
                        };

                        return (
                          <div
                            key={fixture.id}
                            className={`rounded-3xl border transition-all overflow-hidden ${
                              isApproved
                                ? 'border-amber-300 bg-amber-50/20 ring-1 ring-amber-300/60 shadow-xs'
                                : isSelected
                                ? `border-slate-900 ring-2 ring-slate-900 bg-white shadow-md`
                                : !isAnyAllowed
                                ? 'border-slate-200 bg-slate-100/50 opacity-80'
                                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
                            }`}
                          >
                            {/* Match Header Bar */}
                            <div className={`p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 border-b ${
                              isApproved ? 'border-amber-200/70 bg-amber-50/40' : 'border-slate-100 bg-white'
                            }`}>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${leagueMeta.badgeBg}`}>
                                    {leagueMeta.name}
                                  </span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                                    สัปดาห์ที่ {fixture.matchWeek} (7 วันข้างหน้า)
                                  </span>
                                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                                    <Calendar className="w-3.5 h-3.5 text-rose-500" />
                                    <span>{formatThaiDate(fixture.matchDate)}</span>
                                    <span className="text-slate-300">•</span>
                                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                                    <span>เวลา {fixture.matchTime} น.</span>
                                  </span>

                                  {/* Status Pills */}
                                  {isApproved && (
                                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>อนุมัติแล้ว</span>
                                    </span>
                                  )}
                                  {isPending && (
                                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-amber-600" />
                                      <span>รอแอดมินอนุมัติ</span>
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-3 my-2 flex-wrap">
                                  <div className="flex items-center gap-2.5">
                                    <ClubCrest clubName={fixture.homeTeam} league={fixture.league} size="lg" showTooltip />
                                    <span className="text-sm sm:text-base font-black text-slate-900">{fixture.homeTeam}</span>
                                  </div>
                                  <span className="text-[10px] font-black text-rose-500 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">VS</span>
                                  <div className="flex items-center gap-2.5">
                                    <ClubCrest clubName={fixture.awayTeam} league={fixture.league} size="lg" showTooltip />
                                    <span className="text-sm sm:text-base font-black text-slate-900">{fixture.awayTeam}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate">สนาม: {fixture.stadium}</span>
                                </div>
                              </div>

                              {/* Toggle Button or Locked Status for this Match */}
                              <div>
                                {isApproved ? (
                                  <div className="flex items-center gap-2">
                                    <span className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs">
                                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                                      <span>ล็อคการแก้ไขแล้ว</span>
                                    </span>
                                  </div>
                                ) : !isAnyAllowed ? (
                                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200/80 text-slate-500 text-xs font-bold border border-slate-300" title={`แบรนด์ ${selectedBrand} ไม่มีสิทธิ์ใน ${fixture.league}`}>
                                    <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                                    <span>ไม่มีสิทธิ์ใน {fixture.league}</span>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => toggleMatchSelection(fixture)}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                                      isSelected
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                                        : 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                                    }`}
                                  >
                                    {isSelected ? (
                                      <>
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>เลือกลงทะเบียนแมตช์นี้แล้ว</span>
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="w-4 h-4" />
                                        <span>+ เลือกลงทะเบียนแมตช์นี้</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* View when brand has no rights in this league */}
                            {!registeredRecord && !isAnyAllowed && (
                              <div className="p-4 sm:p-5 bg-amber-50/80 border-t border-amber-200 text-amber-950 text-xs flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                                <div className="space-y-0.5">
                                  <p className="font-bold text-amber-900">
                                    แบรนด์ {selectedBrand} ไม่มีสิทธิ์ขอออกบูธและรับบัตรในรายการ {leagueMeta.name} ({fixture.league})
                                  </p>
                                  <p className="text-[11px] text-amber-800 leading-relaxed">
                                    ตามเงื่อนไขสัญญาผู้สนับสนุนประจำฤดูกาล สิทธิ์การออกบูธดีลเลอร์และรับบัตรเข้าชมไม่ได้ครอบคลุมรายการนี้
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* View A: When registered (either Approved or Pending), show registered details and on-demand stadium contacts */}
                            {registeredRecord && !isSelected ? (
                              <div className={`p-4 sm:p-6 border-t space-y-4 ${
                                isApproved 
                                  ? 'bg-slate-50/90 border-amber-200/70' 
                                  : 'bg-amber-50/30 border-amber-200/50'
                              }`}>
                                {isApproved ? (
                                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1">
                                    <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                                      <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                                      <span>สถานะ: อนุมัติแล้ว (Approved) — ล็อคไม่ให้ลูกค้าแก้ไขข้อมูล</span>
                                    </div>
                                    <p className="text-xs text-amber-800 leading-relaxed font-medium">
                                      เมื่อแอดมินกดอนุมัติให้ออกบูธรับบัตรแล้ว ลูกค้าจะไม่มีสิทธิ์เข้ามาแก้ไขข้อมูลขอออกบูธรับบัตรได้ นอกจากลูกค้าจะแจ้งให้แอดมินแก้ไขให้เองหลังบ้าน
                                    </p>
                                  </div>
                                ) : (
                                  <div className="p-3.5 rounded-2xl bg-amber-100/70 border border-amber-300 text-amber-950 flex flex-wrap items-center justify-between gap-2">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-amber-900">
                                        <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                                        <span>สถานะ: ลงทะเบียนแล้ว (รอแอดมินอนุมัติ)</span>
                                      </div>
                                      <p className="text-[11px] text-amber-800 font-medium">
                                        ข้อมูลการขอออกบูธและรับบัตรถูกบันทึกในระบบแล้ว อยู่ระหว่างการพิจารณาจากเจ้าหน้าที่
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => toggleMatchSelection(fixture)}
                                      className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold hover:bg-amber-50 shadow-2xs transition-all"
                                    >
                                      ✏️ แก้ไขข้อมูลลงทะเบียน
                                    </button>
                                  </div>
                                )}

                                {/* Registered Details Summary */}
                                {(() => {
                                  const isBoothRecActive = registeredRecord.boothRequired && registeredRecord.dealerName !== '-' && registeredRecord.dealerPhone !== '-';
                                  const isTicketRecActive = registeredRecord.ticketRequired && (registeredRecord.ticketQuantity || 0) > 0 && registeredRecord.ticketRequesterPhone !== '-';

                                  return (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className={`p-4 rounded-2xl border shadow-2xs space-y-2 transition-all ${
                                        isBoothRecActive ? 'bg-white border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-90'
                                      }`}>
                                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                            <Building2 className={`w-4 h-4 ${isBoothRecActive ? 'text-emerald-700' : 'text-slate-500'}`} />
                                            <span>ขอพื้นที่ออกบูธ (ดีลเลอร์)</span>
                                          </span>
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                            isBoothRecActive 
                                              ? 'bg-emerald-100 text-emerald-800' 
                                              : 'bg-slate-200 text-slate-700'
                                          }`}>
                                            {isBoothRecActive 
                                              ? (isApproved ? 'อนุมัติให้ออกบูธ' : 'ขอพื้นที่ออกบูธ') 
                                              : 'ไม่ออกบูธ (-)'}
                                          </span>
                                        </div>
                                        {isBoothRecActive ? (
                                          <div className="space-y-1 pt-1 text-xs">
                                            <div>
                                              <span className="text-slate-500 font-medium">ชื่อดีลเลอร์: </span>
                                              <span className="font-bold text-slate-900">{registeredRecord.dealerName || '-'}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-600 font-mono">
                                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                                              <span>เบอร์ติดต่อดีลเลอร์: <strong className="text-slate-900">{registeredRecord.dealerPhone || '-'}</strong></span>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-xs text-slate-500 italic py-1">แมตช์นี้ลูกค้าตั้งค่าไม่ออกบูธ (ใส่เครื่องหมาย "-")</p>
                                        )}
                                      </div>

                                      <div className={`p-4 rounded-2xl border shadow-2xs space-y-2 transition-all ${
                                        isTicketRecActive ? 'bg-white border-blue-200' : 'bg-slate-50 border-slate-200 opacity-90'
                                      }`}>
                                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                            <Ticket className={`w-4 h-4 ${isTicketRecActive ? 'text-blue-700' : 'text-slate-500'}`} />
                                            <span>ขอรับบัตรดูบอล</span>
                                          </span>
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                            isTicketRecActive 
                                              ? 'bg-blue-100 text-blue-800' 
                                              : 'bg-slate-200 text-slate-700'
                                          }`}>
                                            {isTicketRecActive 
                                              ? (isApproved ? `อนุมัติ ${registeredRecord.ticketQuantity} ใบ` : `ขอรับ ${registeredRecord.ticketQuantity} ใบ`) 
                                              : 'ไม่รับบัตร (0 ใบ)'}
                                          </span>
                                        </div>
                                        {isTicketRecActive ? (
                                          <div className="space-y-1 pt-1 text-xs">
                                            <div>
                                              <span className="text-slate-500 font-medium">จำนวนบัตรที่ได้รับ: </span>
                                              <span className="font-bold text-blue-950 text-sm">{registeredRecord.ticketQuantity} ใบ</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-600 font-mono">
                                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                                              <span>เบอร์คนขอรับบัตร: <strong className="text-slate-900">{registeredRecord.ticketRequesterPhone || registeredRecord.applicantPhone || '-'}</strong></span>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-xs text-slate-500 italic py-1">แมตช์นี้ลูกค้าตั้งค่าไม่รับบัตร (ระบุ 0 ใบ หรือ "-")</p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                                {registeredRecord.remark && (
                                  <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/90 text-xs space-y-1">
                                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                                      <MessageSquare className="w-4 h-4 text-amber-700" />
                                      <span>หมายเหตุ / ความต้องการเพิ่มเติมจากลูกค้า (Remark):</span>
                                    </div>
                                    <p className="text-slate-800 whitespace-pre-line pl-5 font-normal leading-relaxed">
                                      {registeredRecord.remark}
                                    </p>
                                  </div>
                                )}

                                {/* On-Site Stadium Contacts for this Registered Match */}
                                {/* Requirement: Displayed only until end of match day. Only shows contact numbers if updated in Google Sheet. */}
                                {(() => {
                                  const isFinished = isMatchDayFinished(fixture.matchDate, simDate);
                                  // User requirement: เมื่อจบวันแข่งขันไปแล้วไม่ต้องขึ้นโชว์อีก ให้หายไปจากหน้าเลย
                                  if (isFinished) {
                                    return null;
                                  }

                                  const regContact = findContactForStadiumOrMatch({
                                    stadiumName: registeredRecord.stadium || fixture.stadium,
                                    homeClub: registeredRecord.matchTitle?.split(' vs ')[0]?.trim() || fixture.homeTeam,
                                    awayTeam: registeredRecord.matchTitle?.split(' vs ')[1]?.trim() || fixture.awayTeam,
                                    matchDate: fixture.matchDate,
                                    league: registeredRecord.league || fixture.league,
                                    fixtureId: registeredRecord.fixtureId || fixture.id,
                                    customList: syncedContacts,
                                  });

                                  const isRevealed = Boolean(revealedContactMatchIds[fixture.id]);
                                  const isConfirmed = Boolean(regContact.isWeeklyConfirmed);
                                  const isAdmin = currentUser?.role === 'admin';

                                  return (
                                    <div className="rounded-2xl border border-teal-200/90 bg-teal-50/40 overflow-hidden text-xs">
                                      <div className="p-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 bg-teal-50/70">
                                        <div className="flex items-center gap-1.5 font-bold text-teal-950">
                                          <PhoneCall className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                                          <span>เบอร์ติดต่อประสานงานหน้าสนาม ({registeredRecord.stadium || fixture.stadium}):</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                            <span>โชว์จนจบวันแข่งขัน ({formatThaiDate(fixture.matchDate)})</span>
                                          </span>
                                          {isConfirmed ? (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                              <Check className="w-3 h-3 text-emerald-600" />
                                              <span>Admin ยืนยันสัปดาห์นี้แล้ว</span>
                                            </span>
                                          ) : (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                              <Clock className="w-3 h-3 text-amber-600" />
                                              <span>รอ Admin ยืนยันสัปดาห์นี้</span>
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="p-3.5 space-y-2.5">
                                        <p className="text-[11px] text-teal-900 leading-relaxed">
                                          * แต่ละแมตช์การแข่งขัน เบอร์ติดต่อสำหรับออกบูธและรับบัตรจะไม่เหมือนกับเบอร์ติดต่อทั่วไปหน้าสนาม ลูกค้าสามารถเข้ามาตรวจสอบข้อมูลได้ด้วยตนเองในหน้านี้ (ข้อมูลจะแสดงจนสิ้นสุดวันแข่งขัน)
                                        </p>

                                        {(isConfirmed || isAdmin) ? (
                                          <div className="space-y-2">
                                            {!isConfirmed && isAdmin && (
                                              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-2">
                                                <span className="font-semibold flex items-center gap-1">
                                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                                  <span>ยังไม่ได้กดยืนยันเบอร์รอบสัปดาห์นี้ (ผู้ใช้ทั่วไปยังไม่เห็นเบอร์นี้)</span>
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={async () => {
                                                    const wInfo = getCurrentWeekInfo(fixture.matchDate);
                                                    await confirmMatchContact({
                                                      fixtureId: fixture.id,
                                                      matchDate: fixture.matchDate,
                                                      homeClub: fixture.homeTeam,
                                                      stadiumName: fixture.stadium,
                                                      league: fixture.league,
                                                      adminName: currentUser?.displayName || 'Admin',
                                                    });
                                                    if (regContact.id) {
                                                      await confirmStadiumForWeek(regContact.id, wInfo.weekKey, currentUser?.displayName || 'Admin');
                                                    }
                                                    setPhonebookVersion(v => v + 1);
                                                  }}
                                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs cursor-pointer flex items-center gap-1"
                                                >
                                                  <Check className="w-3 h-3" />
                                                  <span>⚡ กดยืนยันสัปดาห์นี้</span>
                                                </button>
                                              </div>
                                            )}
                                          {!isRevealed ? (
                                            <button
                                              type="button"
                                              onClick={() => toggleRevealContact(fixture.id)}
                                              className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-xs"
                                            >
                                              <PhoneCall className="w-3.5 h-3.5" />
                                              <span>คลิกเพื่อดูเบอร์ติดต่อและจุดประสานงานหน้าสนามประจำแมตช์นี้</span>
                                              <ChevronDown className="w-3.5 h-3.5" />
                                            </button>
                                          ) : (
                                            <div className="space-y-2.5 pt-0.5">
                                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                                                <div className="bg-white/95 p-3 rounded-xl border border-teal-200 shadow-2xs space-y-1.5">
                                                  <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-emerald-800 font-bold flex items-center gap-1">
                                                      <Building2 className="w-3 h-3 text-emerald-600" />
                                                      <span>เจ้าหน้าที่ฝ่ายออกบูธดีลเลอร์</span>
                                                    </span>
                                                    <span className="text-[10px] text-emerald-700 font-bold px-1.5 py-0.5 rounded bg-emerald-50">
                                                      เฉพาะแมตช์นี้
                                                    </span>
                                                  </div>
                                                  <div className="font-bold text-slate-900 text-xs">
                                                    {regContact.boothCoordinatorName || 'เจ้าหน้าที่สนาม'}
                                                  </div>
                                                  <div className="text-[11px] text-slate-600">
                                                    📍 จุดตั้งบูธ: <strong className="text-slate-800">{regContact.boothSetupLocation || '-'}</strong>
                                                  </div>
                                                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
                                                    <span className="text-[10px] text-slate-400">เบอร์โทรติดต่อ:</span>
                                                    {regContact.boothCoordinatorPhone ? (
                                                      <a 
                                                        href={`tel:${regContact.boothCoordinatorPhone}`} 
                                                        className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200"
                                                      >
                                                        <Phone className="w-3 h-3" />
                                                        <span>{regContact.boothCoordinatorPhone}</span>
                                                      </a>
                                                    ) : (
                                                      <span className="text-[11px] text-slate-400 italic">รออัปเดตเบอร์ในชีต</span>
                                                    )}
                                                  </div>
                                                </div>

                                                <div className="bg-white/95 p-3 rounded-xl border border-teal-200 shadow-2xs space-y-1.5">
                                                  <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-blue-800 font-bold flex items-center gap-1">
                                                      <Ticket className="w-3 h-3 text-blue-600" />
                                                      <span>เจ้าหน้าที่ฝ่ายรับบัตรดูบอล</span>
                                                    </span>
                                                    <span className="text-[10px] text-blue-700 font-bold px-1.5 py-0.5 rounded bg-blue-50">
                                                      เฉพาะแมตช์นี้
                                                    </span>
                                                  </div>
                                                  <div className="font-bold text-slate-900 text-xs">
                                                    {regContact.ticketCoordinatorName || 'เจ้าหน้าที่สนาม'}
                                                  </div>
                                                  <div className="text-[11px] text-slate-600">
                                                    📍 จุดรับบัตร: <strong className="text-slate-800">{regContact.ticketPickupLocation || '-'}</strong>
                                                  </div>
                                                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
                                                    <span className="text-[10px] text-slate-400">เบอร์โทรติดต่อ:</span>
                                                    {regContact.ticketCoordinatorPhone ? (
                                                      <a 
                                                        href={`tel:${regContact.ticketCoordinatorPhone}`} 
                                                        className="text-xs font-bold text-blue-700 hover:text-blue-800 hover:underline flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200"
                                                      >
                                                        <Phone className="w-3 h-3" />
                                                        <span>{regContact.ticketCoordinatorPhone}</span>
                                                      </a>
                                                    ) : (
                                                      <span className="text-[11px] text-slate-400 italic">รออัปเดตเบอร์ในชีต</span>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>

                                              <div className="flex items-center justify-between pt-1 text-[11px] text-teal-800 bg-white/70 px-3 py-1.5 rounded-xl border border-teal-100">
                                                <span>⏰ เวลาทำการหน้าสนาม: {regContact.operatingHours || 'เปิดให้บริการ 3 ชั่วโมงก่อนเริ่มการแข่งขันจนจบเกม'}</span>
                                                <button
                                                  type="button"
                                                  onClick={() => toggleRevealContact(fixture.id)}
                                                  className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 underline"
                                                >
                                                  ซ่อนข้อมูล
                                                </button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        ) : (
                                          <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-300 text-amber-950 space-y-1.5">
                                            <div className="flex items-center gap-2 font-bold text-xs text-amber-950">
                                              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                                              <span>⏳ รอ Admin กดยืนยันเบอร์ประจำสัปดาห์ ({regContact.weekLabel || 'รอบสัปดาห์นี้'})</span>
                                            </div>
                                            <p className="text-[11px] text-amber-800 leading-relaxed">
                                              เบอร์ติดต่อและจุดนัดหมายสำหรับออกบูธและรับบัตรประจำสนาม ({registeredRecord.stadium || fixture.stadium}) จะแสดงบนหน้าเว็บไซต์ให้โทรออกได้ก็ต่อเมื่อ Admin ตรวจสอบและกดยืนยันในรอบสัปดาห์นั้นแล้วเท่านั้น
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {onNavigateToContacts && (
                                  <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                                    <span className="text-[11px] text-slate-500">
                                      ต้องการดูตารางเบอร์ติดต่อเจ้าหน้าที่ทุกสนาม?
                                    </span>
                                    <button
                                      type="button"
                                      onClick={onNavigateToContacts}
                                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 underline underline-offset-4"
                                    >
                                      <span>เปิดตารางเบอร์ติดต่อหน้าสนามทั้งหมด</span>
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : isSelected ? (
                              /* Inline Form: Shows when match is selected for registration */
                              <div className="p-4 sm:p-6 bg-white space-y-4">
                                <div className="flex items-center justify-between text-xs text-slate-500">
                                  <span className="font-semibold text-slate-700">
                                    กรอกข้อมูลลงทะเบียนสำหรับแมตช์นี้ ({fixture.homeTeam} vs {fixture.awayTeam}):
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    * ข้อมูลขอออกบูธและรับบัตรสามารถระบุแยกตามแต่ละแมตช์ได้
                                  </span>
                                </div>

                                {/* Tip Banner for Booth-Only or Ticket-Only */}
                                <div className="p-3.5 rounded-2xl bg-slate-100/90 border border-slate-200 text-xs text-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0"></span>
                                    <span>
                                      <strong>ตัวเลือกออกบูธ / รับบัตร:</strong> หากต้องการออกแค่บูธให้ใส่บัตรเป็น <strong>0</strong> หรือใส่ <strong>"-"</strong> ในช่องบัตร / หากต้องการรับแค่บัตรให้ใส่เครื่องหมาย <strong>"-"</strong> ในช่องดีลเลอร์
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBoothAttending(fixture.id);
                                        setTicketNotAttending(fixture.id);
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200 transition-colors"
                                      title="ตั้งค่า: ออกแค่บูธ ไม่รับบัตร"
                                    >
                                      🏢 ออกแค่บูธ (ไม่รับบัตร)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBoothNotAttending(fixture.id);
                                        setTicketAttending(fixture.id, 10);
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-[11px] font-bold border border-blue-200 transition-colors"
                                      title="ตั้งค่า: รับแค่บัตร ไม่ออกบูธ"
                                    >
                                      🎟️ รับแค่บัตร (ไม่ออกบูธ)
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                  {/* SECTION A: ขอพื้นที่ออกบูธดีลเลอร์ */}
                                  {(() => {
                                    if (!isBoothAllowed) {
                                      return (
                                        <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-100/90 flex flex-col justify-center space-y-2">
                                          <div className="flex items-center gap-2 font-bold text-xs text-slate-700">
                                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                            <span>ไม่มีสิทธิ์ขอพื้นที่ออกบูธใน {fixture.league}</span>
                                          </div>
                                          <p className="text-[11px] text-slate-500 leading-relaxed">
                                            แบรนด์ <strong>{selectedBrand}</strong> ไม่มีสิทธิ์ขอพื้นที่ออกบูธดีลเลอร์ในรายการนี้ตามสัญญาผู้สนับสนุน
                                          </p>
                                        </div>
                                      );
                                    }

                                    const boothActive = isBoothActive(entry);
                                    return (
                                      <div className={`p-4 sm:p-5 rounded-2xl border space-y-3 transition-all ${
                                        boothActive
                                          ? 'bg-emerald-50/60 border-emerald-200/80'
                                          : 'bg-slate-50/80 border-slate-300'
                                      }`}>
                                        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                          <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-900">
                                            <input
                                              type="checkbox"
                                              checked={entry.boothRequired && boothActive}
                                              onChange={(e) => {
                                                if (e.target.checked) {
                                                  setBoothAttending(fixture.id);
                                                } else {
                                                  setBoothNotAttending(fixture.id);
                                                }
                                              }}
                                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                                            />
                                            <Building2 className={`w-4 h-4 ${boothActive ? 'text-emerald-700' : 'text-slate-400'}`} />
                                            <span>ขอพื้นที่ออกบูธ</span>
                                          </label>
                                          
                                          <div className="flex items-center gap-1.5">
                                            {boothActive ? (
                                              <button
                                                type="button"
                                                onClick={() => setBoothNotAttending(fixture.id)}
                                                className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors"
                                                title="คลิกเพื่อตั้งค่าเป็นไม่ออกบูธ (-)"
                                              >
                                                ใส่ "-" (ไม่ออกบูธ)
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setBoothAttending(fixture.id)}
                                                className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                                                title="คลิกเพื่อเปิดขอพื้นที่ออกบูธ"
                                              >
                                                + เปลี่ยนเป็นออกบูธ
                                              </button>
                                            )}
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                              boothActive
                                                ? 'bg-emerald-200/70 text-emerald-900'
                                                : 'bg-slate-200 text-slate-700'
                                            }`}>
                                              {boothActive ? 'ดีลเลอร์ออกบูธ' : 'ไม่ออกบูธ (-)'}
                                            </span>
                                          </div>
                                        </div>

                                        {!boothActive && (
                                          <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                                            <span>⚡ แมตช์นี้ตั้งค่า: <strong>ไม่ออกบูธ (-)</strong> (ระบบจะไม่นับบูธ)</span>
                                            <button
                                              type="button"
                                              onClick={() => setBoothAttending(fixture.id)}
                                              className="text-[10px] font-bold text-emerald-700 hover:underline"
                                            >
                                              ต้องการออกบูธคลิกที่นี่
                                            </button>
                                          </div>
                                        )}

                                        <div className="space-y-3 pt-1">
                                          <div>
                                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                              ชื่อดีลเลอร์ที่ขอพื้นที่ออกบูธ <span className="text-slate-400 font-normal">(ใส่ "-" หมายถึงไม่ออกบูธ)</span>
                                            </label>
                                            <input
                                              type="text"
                                              value={entry.dealerName}
                                              onChange={(e) => updateMatchEntry(fixture.id, 'dealerName', e.target.value)}
                                              placeholder={`เช่น ดีลเลอร์ ${selectedBrand} สาขา... หรือใส่ "-" หากไม่ออกบูธ`}
                                              className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-2 focus:outline-none font-medium transition-all ${
                                                !boothActive 
                                                  ? 'bg-slate-50 border-slate-300 text-slate-600 focus:ring-slate-400' 
                                                  : 'bg-white border-slate-300 focus:ring-emerald-500'
                                              }`}
                                            />
                                          </div>

                                          <div>
                                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                              เบอร์ติดต่อของดีลเลอร์ <span className="text-slate-400 font-normal">(ใส่ "-" หมายถึงไม่ออกบูธ)</span>
                                            </label>
                                            <input
                                              type="tel"
                                              value={entry.dealerPhone}
                                              onChange={(e) => updateMatchEntry(fixture.id, 'dealerPhone', e.target.value)}
                                              placeholder="08X-XXX-XXXX หรือใส่ '-' หากไม่ออกบูธ"
                                              className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-2 focus:outline-none font-medium transition-all ${
                                                !boothActive 
                                                  ? 'bg-slate-50 border-slate-300 text-slate-600 focus:ring-slate-400' 
                                                  : 'bg-white border-slate-300 focus:ring-emerald-500'
                                              }`}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* SECTION B: ขอรับบัตรดูบอล */}
                                  {(() => {
                                    if (!isTicketAllowed) {
                                      return (
                                        <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-100/90 flex flex-col justify-center space-y-2">
                                          <div className="flex items-center gap-2 font-bold text-xs text-slate-700">
                                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                            <span>ไม่มีสิทธิ์ขอรับบัตรดูบอลใน {fixture.league}</span>
                                          </div>
                                          <p className="text-[11px] text-slate-500 leading-relaxed">
                                            แบรนด์ <strong>{selectedBrand}</strong> ไม่มีสิทธิ์ขอรับบัตรเข้าชมการแข่งขันในรายการนี้ตามสัญญาผู้สนับสนุน
                                          </p>
                                        </div>
                                      );
                                    }

                                    const ticketActive = isTicketActive(entry);
                                    const leagueMaxTickets = currentBrandItem ? getMaxTicketsPerMatchForLeague(currentBrandItem, fixture.league) : 50;
                                    const reqQty = Number(entry.ticketQuantity) || 0;
                                    const isOverLimit = ticketActive && reqQty > leagueMaxTickets;

                                    return (
                                      <div className={`p-4 sm:p-5 rounded-2xl border space-y-3 transition-all ${
                                        ticketActive
                                          ? isOverLimit ? 'bg-rose-50/60 border-rose-300' : 'bg-blue-50/60 border-blue-200/80'
                                          : 'bg-slate-50/80 border-slate-300'
                                      }`}>
                                        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                          <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-900">
                                            <input
                                              type="checkbox"
                                              checked={entry.ticketRequired && ticketActive}
                                              onChange={(e) => {
                                                if (e.target.checked) {
                                                  setTicketAttending(fixture.id, 10);
                                                } else {
                                                  setTicketNotAttending(fixture.id);
                                                }
                                              }}
                                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                                            />
                                            <Ticket className={`w-4 h-4 ${ticketActive ? 'text-blue-700' : 'text-slate-400'}`} />
                                            <span>ขอรับบัตรดูบอล</span>
                                          </label>
                                          
                                          <div className="flex items-center gap-1.5">
                                            {ticketActive ? (
                                              <button
                                                type="button"
                                                onClick={() => setTicketNotAttending(fixture.id)}
                                                className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors"
                                                title="คลิกเพื่อตั้งค่าเป็นไม่รับบัตร (0 ใบ)"
                                              >
                                                ไม่รับบัตร (0 ใบ)
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setTicketAttending(fixture.id, 10)}
                                                className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                                                title="คลิกเพื่อเปิดขอรับบัตร"
                                              >
                                                + เปลี่ยนเป็นรับบัตร
                                              </button>
                                            )}
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                              ticketActive
                                                ? 'bg-blue-200/70 text-blue-900'
                                                : 'bg-slate-200 text-slate-700'
                                            }`}>
                                              {ticketActive ? `ขอรับ ${entry.ticketQuantity || 0} ใบ` : 'ไม่รับบัตร (0 ใบ)'}
                                            </span>
                                          </div>
                                        </div>

                                        {!ticketActive && (
                                          <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                                            <span>⚡ แมตช์นี้ตั้งค่า: <strong>ไม่รับบัตร (0 ใบ)</strong> (ระบบจะไม่นับบัตร)</span>
                                            <button
                                              type="button"
                                              onClick={() => setTicketAttending(fixture.id, 10)}
                                              className="text-[10px] font-bold text-blue-700 hover:underline"
                                            >
                                              ต้องการรับบัตรคลิกที่นี่
                                            </button>
                                          </div>
                                        )}

                                        <div className="space-y-3 pt-1">
                                          <div>
                                            <div className="flex items-center justify-between mb-1">
                                              <label className="block text-[11px] font-semibold text-slate-700">
                                                จำนวนบัตรที่ต้องการ (ใบ) <span className="text-slate-400 font-normal">(ใส่ 0 = ไม่รับบัตร)</span>
                                              </label>
                                              <div className="flex items-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => setTicketNotAttending(fixture.id)}
                                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                    Number(entry.ticketQuantity) === 0 
                                                      ? 'bg-slate-700 text-white' 
                                                      : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                                                  }`}
                                                  title="ไม่รับบัตร (0 ใบ)"
                                                >
                                                  0 ใบ
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const cur = Number(entry.ticketQuantity) || 0;
                                                    const next = Math.max(0, cur - 5);
                                                    if (next === 0) {
                                                      setTicketNotAttending(fixture.id);
                                                    } else {
                                                      updateMatchEntry(fixture.id, 'ticketQuantity', next);
                                                    }
                                                  }}
                                                  className="px-1.5 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 text-[10px] font-bold"
                                                >
                                                  -5
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const cur = Number(entry.ticketQuantity) || 0;
                                                    const next = cur + 5;
                                                    setTicketAttending(fixture.id, next);
                                                  }}
                                                  className="px-1.5 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 text-[10px] font-bold"
                                                >
                                                  +5
                                                </button>
                                              </div>
                                            </div>
                                            <input
                                              type="number"
                                              min="0"
                                              max={leagueMaxTickets * 2}
                                              value={entry.ticketQuantity}
                                              onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                const num = isNaN(val) ? 0 : Math.max(0, val);
                                                if (num === 0) {
                                                  setTicketNotAttending(fixture.id);
                                                } else {
                                                  setTicketAttending(fixture.id, num);
                                                }
                                              }}
                                              className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-2 focus:outline-none font-bold transition-all ${
                                                !ticketActive 
                                                  ? 'bg-slate-50 border-slate-300 text-slate-500 focus:ring-slate-400' 
                                                  : isOverLimit
                                                    ? 'bg-rose-50 border-rose-400 text-rose-900 focus:ring-rose-500 ring-1 ring-rose-300'
                                                    : 'bg-white border-slate-300 focus:ring-blue-500 text-blue-950'
                                              }`}
                                            />

                                            {/* Per-league ticket quota limit info & shortcut */}
                                            <div className="flex flex-wrap items-center justify-between gap-1 mt-1.5 text-[11px]">
                                              <span className={`flex items-center gap-1 font-medium ${isOverLimit ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                                                {isOverLimit ? (
                                                  <>
                                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                                    <span>เกินโควตาสูงสุดของ {fixture.league} (กำหนดไม่เกิน {leagueMaxTickets} ใบ/นัด)</span>
                                                  </>
                                                ) : (
                                                  <span>โควตาสูงสุด: <strong className="text-slate-800 font-bold">{leagueMaxTickets} ใบ/นัด</strong> ({fixture.league})</span>
                                                )}
                                              </span>
                                              {leagueMaxTickets > 0 && (
                                                <button
                                                  type="button"
                                                  onClick={() => setTicketAttending(fixture.id, leagueMaxTickets)}
                                                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold hover:underline shrink-0"
                                                >
                                                  ขอเต็มโควตา ({leagueMaxTickets} ใบ)
                                                </button>
                                              )}
                                            </div>
                                          </div>

                                          <div>
                                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                              เบอร์ติดต่อคนขอรับบัตร <span className="text-slate-400 font-normal">(ใส่ "-" หมายถึงไม่รับบัตร)</span>
                                            </label>
                                            <input
                                              type="tel"
                                              value={entry.ticketRequesterPhone}
                                              onChange={(e) => updateMatchEntry(fixture.id, 'ticketRequesterPhone', e.target.value)}
                                              placeholder="08X-XXX-XXXX หรือใส่ '-' หากไม่รับบัตร"
                                              className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-2 focus:outline-none font-medium transition-all ${
                                                !ticketActive 
                                                  ? 'bg-slate-50 border-slate-300 text-slate-600 focus:ring-slate-400' 
                                                  : 'bg-white border-slate-300 focus:ring-blue-500'
                                              }`}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                                {/* SECTION C: Remark / Additional Request */}
                                <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-2.5">
                                  <div className="flex items-center justify-between pb-1 border-b border-amber-100">
                                    <label className="flex items-center gap-2 font-bold text-xs text-amber-950">
                                      <MessageSquare className="w-4 h-4 text-amber-700" />
                                      <span>หมายเหตุ / ความต้องการเพิ่มเติมสำหรับแมตช์นี้ (Remark)</span>
                                    </label>
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                      ไม่บังคับ (Optional)
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 leading-relaxed">
                                    หากลูกค้าต้องการขอสิ่งอำนวยความสะดวก หรืออุปกรณ์เพิ่มเติมสำหรับแมตช์นี้ (เช่น ขอจุดต่อไฟฟ้า, ขอโต๊ะ/เก้าอี้เสริมสำหรับบูธ, บัตร VIP เพิ่มเติม หรือคำขอพิเศษอื่นๆ)
                                  </p>
                                  <textarea
                                    rows={2}
                                    value={entry.remark || ''}
                                    onChange={(e) => updateMatchEntry(fixture.id, 'remark', e.target.value)}
                                    placeholder="ระบุความต้องการเพิ่มเติมสำหรับแมตช์นี้ เช่น ขอโต๊ะ 2 ตัว เก้าอี้ 4 ตัว และจุดต่อปลั๊กไฟ 1 จุด..."
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-none bg-white font-normal placeholder:text-slate-400 resize-none transition-all shadow-2xs"
                                  />
                                </div>

                                <div className="flex justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => toggleMatchSelection(fixture)}
                                    className="text-[11px] font-semibold text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-1"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>ยกเลิกการเลือกลงทะเบียนแมตช์นี้</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500 px-5">
                                <span className="text-[11px] text-slate-400">
                                  ยังไม่ได้เปิดกรอกข้อมูลสำหรับแมตช์นี้
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleMatchSelection(fixture)}
                                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                  <span>คลิกเพื่อกรอกข้อมูลดีลเลอร์ & บัตร</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Error notification if validation fails */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ============================================================
            BOTTOM SUBMIT BAR & REAL-TIME SUMMARY
            ============================================================ */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
            <div className="space-y-1 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">สรุปการลงทะเบียน:</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold text-[11px]">
                  แบรนด์ {selectedBrand}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span>
                  แมตช์ที่เลือก: <strong className="text-blue-600 font-bold">{selectedMatchIds.length}</strong> แมตช์
                </span>
                <span>•</span>
                <span>
                  ขอออกบูธ: <strong className="text-emerald-600 font-bold">{totalBoothsRequested}</strong> แมตช์
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <span>รวมบัตรดูบอลรอบนี้:</span>
                  <strong className="text-blue-700 font-bold">{totalTicketsRequested} ใบ</strong>
                </span>
              </div>
            </div>

            <button
              type="submit"
              id="btn-submit-registration"
              disabled={isSubmitting || selectedMatchIds.length === 0}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-40 flex items-center justify-center gap-2 shrink-0"
            >
              {isSubmitting ? (
                <span>กำลังบันทึกข้อมูลไปยัง Firebase...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>ยืนยันส่งข้อมูลลงทะเบียน ({selectedMatchIds.length} แมตช์)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

