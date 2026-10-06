import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  X, 
  Copy, 
  Check, 
  ExternalLink, 
  ArrowRight,
  Database,
  Sparkles,
  Download,
  Link2,
  Info,
  HelpCircle,
  Save,
  RefreshCw,
  Calendar,
  AlertCircle,
  Layers,
  ChevronDown,
  RotateCcw,
  CheckCircle2,
  Clock,
  Sliders,
  Radio,
  PhoneCall,
  Phone,
  BookOpen,
  Settings2,
  ShieldCheck
} from 'lucide-react';
import { RegistrationRecord, FixtureItem, LeagueType } from '../types';
import { getBackendSheetsUrl, saveBackendSheetsUrl } from '../lib/firebase';
import { 
  fetchFixturesFromGoogleSheet, 
  syncAllLeaguesFromGoogleSheet,
  syncFromOfficialDualSheets,
  saveFixturesForLeague,
  appendFixturesForLeague,
  importFixturesFromRawText, 
  saveFixtures, 
  resetFixturesToDefault, 
  getFixtures, 
  getFixturesMeta, 
  getFixturesSheetUrl,
  setFixturesSheetUrl,
  setLeagueSheetUrl,
  getFixturesSheetT1T2Url,
  setFixturesSheetT1T2Url,
  getFixturesSheetT3Url,
  setFixturesSheetT3Url,
  FixturesSyncMeta,
  AutoSyncConfig,
  getAutoSyncConfig,
  setAutoSyncConfig,
  subscribeToAutoSync,
  runAutoSyncCheck
} from '../lib/fixturesService';
import {
  syncStadiumContactsFromOfficialSheet,
  getStadiumContactsSyncMeta,
  StadiumContactsSyncMeta,
  subscribeToContactsSync,
  getStadiumContactsSheetUrl,
  setStadiumContactsSheetUrl,
} from '../lib/stadiumContactsService';
import { syncClubPhonebookFromGoogleSheet } from '../lib/clubPhonebookService';
import { LEAGUE_COLOR_MAP } from '../data/fixtures';
import { exportToExcelTwoTabs } from '../lib/excelExportService';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: RegistrationRecord[];
  defaultTab?: 'fixtures' | 'contacts' | 'export';
  onNavigateToContacts?: () => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  records,
  defaultTab = 'fixtures',
  onNavigateToContacts,
}) => {
  // Main Tab: 'fixtures' (ดึงตารางแข่ง 2 ลิงก์), 'contacts' (เบอร์ติดต่อหน้าสนาม 1 ลิงก์เดียว), 'export' (ตารางสรุปส่งข้อมูล)
  const [activeTab, setActiveTab] = useState<'fixtures' | 'contacts' | 'export'>(defaultTab);

  // Fixtures Sync State
  const [fixturesMeta, setFixturesMeta] = useState<FixturesSyncMeta>(getFixturesMeta());
  const [sheetFixturesUrl, setSheetFixturesUrl] = useState<string>(getFixturesSheetUrl());
  // Dual Main Official Sheets State (For Match Fixtures only: Source 1 = L1 & L2, Source 2 = L3)
  const [sheetT1T2Url, setSheetT1T2Url] = useState<string>(getFixturesSheetT1T2Url());
  const [sheetT3Url, setSheetT3Url] = useState<string>(getFixturesSheetT3Url());
  const [leagueUrls, setLeagueUrls] = useState<Record<LeagueType, string>>({
    'League 1': getFixturesSheetUrl('League 1') || getFixturesSheetUrl(),
    'League 2': getFixturesSheetUrl('League 2'),
    'League 3': getFixturesSheetUrl('League 3'),
  });
  const [selectedLeagueSyncTab, setSelectedLeagueSyncTab] = useState<'all' | LeagueType>('all');
  const [importMethod, setImportMethod] = useState<'url' | 'paste'>('url');
  const [pasteRawText, setPasteRawText] = useState<string>('');
  const [defaultLeagueSelect, setDefaultLeagueSelect] = useState<LeagueType>('League 1');
  const [pasteReplaceMode, setPasteReplaceMode] = useState<'replace-league' | 'append-league' | 'replace-all'>('replace-league');
  
  const [syncingLeague, setSyncingLeague] = useState<'all' | 't1t2' | 't1' | 't2' | 't3' | LeagueType | null>(null);
  const [syncProgressMessage, setSyncProgressMessage] = useState<string | null>(null);
  const [customL3TabNamesInput, setCustomL3TabNamesInput] = useState<string>('');
  const [showCustomL3TabNames, setShowCustomL3TabNames] = useState<boolean>(false);

  // Stadium Contacts Sync State (Single Sheet for all 3 leagues: "Thai League 1 -3 FIXTURES 2026/27_DATA")
  const [sheetContactsUrl, setSheetContactsUrl] = useState<string>(
    getStadiumContactsSheetUrl() || ''
  );
  const [contactsSyncMeta, setContactsSyncMeta] = useState<StadiumContactsSyncMeta>(getStadiumContactsSyncMeta());
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [contactsUrlSavedStatus, setContactsUrlSavedStatus] = useState<string | null>(null);

  // Synchronize when modal opens or defaultTab changes
  useEffect(() => {
    if (isOpen) {
      if (defaultTab) {
        setActiveTab(defaultTab);
      }
      const cUrl = getStadiumContactsSheetUrl() || '';
      if (cUrl) {
        setSheetContactsUrl(cUrl);
      }
    }
  }, [isOpen, defaultTab]);

  // Subscribe to stadium contacts sync
  useEffect(() => {
    const unsub = subscribeToContactsSync((meta) => {
      setContactsSyncMeta(meta);
    });
    return () => unsub();
  }, []);

  const [fixturesSyncResult, setFixturesSyncResult] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
    count?: number;
    leagueCounts?: Record<LeagueType, number>;
    previewMatches?: FixtureItem[];
    detectedTabsL3?: { name: string; count: number }[];
  } | null>(null);

  // Export State
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(
    localStorage.getItem('thaileague_sheets_webhook') || ''
  );
  const [backendUrl, setBackendUrl] = useState<string>(getBackendSheetsUrl());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [urlSavedStatus, setUrlSavedStatus] = useState<string | null>(null);

  // Auto-Sync Configuration State
  const [autoSyncConfig, setAutoSyncConfigState] = useState<AutoSyncConfig>(getAutoSyncConfig());
  const [isTestingAutoSync, setIsTestingAutoSync] = useState<boolean>(false);
  const [autoSyncSavedNotice, setAutoSyncSavedNotice] = useState<string | null>(null);

  // Subscribe to auto-sync events
  useEffect(() => {
    const unsub = subscribeToAutoSync((cfg) => {
      setAutoSyncConfigState(cfg);
    });
    return () => unsub();
  }, []);

  const handleUpdateAutoSyncConfig = (updates: Partial<AutoSyncConfig>) => {
    const updated = setAutoSyncConfig(updates);
    setAutoSyncConfigState(updated);
    setAutoSyncSavedNotice('บันทึกการตั้งค่าการซิงค์อัตโนมัติแล้ว');
    setTimeout(() => setAutoSyncSavedNotice(null), 3000);
  };

  const handleTestAutoSyncNow = async () => {
    try {
      setIsTestingAutoSync(true);
      const res = await runAutoSyncCheck({ force: true, reason: 'manual' });
      const updatedMeta = getFixturesMeta();
      setFixturesMeta(updatedMeta);
      setFixturesSyncResult({
        type: res.success ? 'success' : 'error',
        message: res.message,
        count: res.count,
        leagueCounts: updatedMeta.leagueCounts,
      });
    } catch (err: any) {
      setFixturesSyncResult({
        type: 'error',
        message: err.message || 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูลสด',
      });
    } finally {
      setIsTestingAutoSync(false);
    }
  };

  // Update state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      const meta = getFixturesMeta();
      setFixturesMeta(meta);
      setSheetFixturesUrl(getFixturesSheetUrl());
      setSheetT1T2Url(getFixturesSheetT1T2Url());
      setSheetT3Url(getFixturesSheetT3Url());
      setLeagueUrls({
        'League 1': getFixturesSheetUrl('League 1') || getFixturesSheetUrl(),
        'League 2': getFixturesSheetUrl('League 2'),
        'League 3': getFixturesSheetUrl('League 3'),
      });
      setBackendUrl(getBackendSheetsUrl());
      setFixturesSyncResult(null);
      setSyncProgressMessage(null);
    }
  }, [isOpen, defaultTab]);

  if (!isOpen) return null;

  // =========================================================================
  // FIXTURES: LIVE FETCH FROM 2 MAIN OFFICIAL GOOGLE SHEETS
  // 1. Thai League 1 & 2 FIXTURES 2026/27 (Tabs: T1-(THA) & T2-(THA))
  // 2. BYD DOLPHIN LEAGUE III FIXTURES 2026/27 (UPDATE 11 AUG 2026) -> All Zones/Tabs
  // =========================================================================
  const handleSyncDualMainSheets = async (target: 'all' | 't1t2' | 't1' | 't2' | 't3' = 'all') => {
    try {
      setSyncingLeague(target);
      setSyncProgressMessage(
        target === 't3' || target === 'all' 
          ? 'กำลังเริ่มเชื่อมต่อและค้นหาแท็บทั้งหมดในชีต League 3...' 
          : 'กำลังเชื่อมต่อ Google Sheets...'
      );
      setFixturesSyncResult(null);

      const customTabs = customL3TabNamesInput
        .split(/[\n,]/)
        .map(s => s.trim())
        .filter(Boolean);

      const res = await syncFromOfficialDualSheets({
        t1t2UrlInput: sheetT1T2Url,
        t3UrlInput: sheetT3Url,
        target,
        customL3TabNames: customTabs.length > 0 ? customTabs : undefined,
        onProgress: (msg) => {
          setSyncProgressMessage(msg);
        },
      });

      if (res.success) {
        const updatedMeta = getFixturesMeta();
        setFixturesMeta(updatedMeta);
        
        let msg = '';
        if (target === 'all') {
          const l3TabsInfo = res.detectedTabsL3 && res.detectedTabsL3.length > 0
            ? ` (ดึง L3 ครบ ${res.detectedTabsL3.length} แท็บ)`
            : '';
          msg = `ซิงค์ตารางแข่งขันสดสำเร็จครบทั้ง 2 ชีตหลัก! รวม ${res.count} คู่แข่งขัน (L1: ${res.leagueCounts['League 1']} คู่ | L2: ${res.leagueCounts['League 2']} คู่ จากชีต Thai League 1 & 2 FIXTURES 2026/27, L3: ${res.leagueCounts['League 3']} คู่ จากชีต BYD DOLPHIN${l3TabsInfo})`;
        } else if (target === 't1t2') {
          msg = `ซิงค์ตารางแข่งขัน League 1 & 2 จากชีต Thai League 1 & 2 FIXTURES 2026/27 (แท็บ T1-(THA) และ T2-(THA)) สำเร็จ! (L1: ${res.leagueCounts['League 1']} คู่ | L2: ${res.leagueCounts['League 2']} คู่)`;
        } else if (target === 't1') {
          msg = `ดึงตารางแท็บ T1-(THA) จากชีต Thai League 1 & 2 FIXTURES 2026/27 สำเร็จ (${res.leagueCounts['League 1']} คู่)`;
        } else if (target === 't2') {
          msg = `ดึงตารางแท็บ T2-(THA) จากชีต Thai League 1 & 2 FIXTURES 2026/27 สำเร็จ (${res.leagueCounts['League 2']} คู่)`;
        } else {
          const l3Count = res.leagueCounts['League 3'];
          const tabCount = res.detectedTabsL3?.length || 0;
          msg = `ซิงค์ตาราง Thai League 3 จากชีต BYD DOLPHIN LEAGUE III สำเร็จครบทุกแท็บ! รวมทั้งหมด ${l3Count} คู่ (จาก ${tabCount} แท็บ/โซน)`;
        }

        setFixturesSyncResult({
          type: res.error ? 'warning' : 'success',
          message: res.error ? `${msg} — แต่มีบางส่วนที่ต้องตรวจสอบ: ${res.error}` : msg,
          count: res.count,
          leagueCounts: res.leagueCounts,
          detectedTabsL3: res.detectedTabsL3,
          previewMatches: res.fixtures.slice(0, 6),
        });
      } else {
        setFixturesSyncResult({
          type: res.isPermissionIssue ? 'warning' : 'error',
          message: res.error || 'ไม่สามารถดึงข้อมูลจาก Google Sheets ได้ กรุณาตรวจสอบว่าตั้งค่าสิทธิ์เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู"',
        });
      }
    } catch (err: any) {
      setFixturesSyncResult({
        type: 'error',
        message: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets',
      });
    } finally {
      setSyncingLeague(null);
      setSyncProgressMessage(null);
    }
  };

  // Dedicated Handler: Sync Stadium Contacts (Booth + Ticket + Remark) from Google Sheet:
  // "เบอร์ติดต่อหน้าสนาม"
  // League 1 -> Tab League 1
  // League 2 -> Tab League 2
  // League 3 -> Tab League 3
  // Matched by Home Team (ทีมเหย้า)
  const handleSaveContactsUrl = () => {
    const url = sheetContactsUrl.trim();
    if (!url) return;
    setStadiumContactsSheetUrl(url);
    setContactsUrlSavedStatus('บันทึกลิงก์ชีต "เบอร์ติดต่อหน้าสนาม" เรียบร้อยแล้ว');
    setTimeout(() => setContactsUrlSavedStatus(null), 4000);
  };

  const handleSyncStadiumContacts = async (targetLeague: 'all' | 'League 1' | 'League 2' | 'League 3' = 'all') => {
    const targetUrl = sheetContactsUrl.trim();
    if (!targetUrl) {
      setFixturesSyncResult({
        type: 'error',
        message: 'กรุณาระบุลิงก์ Google Sheet "เบอร์ติดต่อหน้าสนาม"',
      });
      return;
    }

    try {
      setIsSyncingContacts(true);
      setSyncProgressMessage(
        targetLeague === 'all'
          ? 'กำลังดึงเบอร์ติดต่อออกบูธ+รับบัตร+Remark จากชีต "เบอร์ติดต่อหน้าสนาม" (แท็บ League 1, League 2, League 3)...'
          : `กำลังดึงเบอร์ติดต่อ ${targetLeague} จากชีต "เบอร์ติดต่อหน้าสนาม"...`
      );
      setFixturesSyncResult(null);

      const res = await syncStadiumContactsFromOfficialSheet(targetUrl, targetLeague);

      setContactsSyncMeta(getStadiumContactsSyncMeta());
      if (res.success) {
        const lc = res.leagueCounts;
        const leagueInfo = lc ? ` (L1: ${lc['League 1']} | L2: ${lc['League 2']} | L3: ${lc['League 3']})` : '';
        setFixturesSyncResult({
          type: 'success',
          message: `ซิงค์เบอร์ติดต่อจากชีต "เบอร์ติดต่อหน้าสนาม" สำเร็จ รวม ${res.count} สโมสร${leagueInfo} (แท็บ: ${res.syncedTabs.join(', ')}) จับคู่ตามคอลัมน์ "สโมสรทีมเหย้า"`,
          count: res.count,
          leagueCounts: fixturesMeta.leagueCounts,
        });
      } else {
        setFixturesSyncResult({
          type: 'error',
          message: res.error || 'ไม่สามารถดึงข้อมูลเบอร์ติดต่อจากชีตได้',
        });
      }
    } catch (err: any) {
      setFixturesSyncResult({
        type: 'error',
        message: err.message || 'เกิดข้อผิดพลาดในการซิงค์ข้อมูลเบอร์ติดต่อ',
      });
    } finally {
      setIsSyncingContacts(false);
      setSyncProgressMessage(null);
    }
  };

  // =========================================================================
  // FIXTURES: LIVE FETCH FROM GOOGLE SHEET (ALL 3 LEAGUES)
  // =========================================================================
  const handleSyncAllLeagues = async () => {
    const masterUrl = sheetFixturesUrl.trim();
    if (!masterUrl) {
      setFixturesSyncResult({
        type: 'error',
        message: 'กรุณากรอกลิงก์ Google Sheets ตารางการแข่งขันของคุณ',
      });
      return;
    }

    try {
      setSyncingLeague('all');
      setFixturesSyncResult(null);

      const res = await syncAllLeaguesFromGoogleSheet(masterUrl);
      
      if (res.success) {
        const updatedMeta = getFixturesMeta();
        setFixturesMeta(updatedMeta);
        setFixturesSyncResult({
          type: 'success',
          message: `ซิงค์ตารางแข่งขันสดครบทั้ง 3 ลีกสำเร็จ! รวม ${res.count} คู่ (Thai League 1: ${res.leagueCounts['League 1']} คู่ | Thai League 2: ${res.leagueCounts['League 2']} คู่ | Thai League 3: ${res.leagueCounts['League 3']} คู่)`,
          count: res.count,
          leagueCounts: res.leagueCounts,
          previewMatches: res.fixtures.slice(0, 6),
        });
      } else {
        setFixturesSyncResult({
          type: res.isPermissionIssue ? 'warning' : 'error',
          message: res.error || 'ไม่สามารถดึงข้อมูลจาก Google Sheets ได้',
        });
      }
    } catch (err: any) {
      setFixturesSyncResult({
        type: 'error',
        message: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets',
      });
    } finally {
      setSyncingLeague(null);
    }
  };

  // =========================================================================
  // FIXTURES: LIVE FETCH FOR SPECIFIC LEAGUE
  // =========================================================================
  const handleSyncSpecificLeague = async (league: LeagueType) => {
    const targetUrl = (leagueUrls[league] || sheetFixturesUrl || '').trim();
    if (!targetUrl) {
      setFixturesSyncResult({
        type: 'error',
        message: `กรุณากรอกลิงก์ Google Sheets (หรือแท็บที่มี gid) สำหรับ ${league}`,
      });
      return;
    }

    try {
      setSyncingLeague(league);
      setFixturesSyncResult(null);

      const res = await fetchFixturesFromGoogleSheet(targetUrl, league);

      if (res.success) {
        const updatedMeta = getFixturesMeta();
        setFixturesMeta(updatedMeta);
        setFixturesSyncResult({
          type: 'success',
          message: `ซิงค์ตาราง ${league} สำเร็จ! พบข้อมูล ${res.count} คู่แข่งขัน (รวมตารางทุกสะสม ${updatedMeta.matchCount} คู่)`,
          count: res.count,
          leagueCounts: updatedMeta.leagueCounts,
          previewMatches: res.fixtures.slice(0, 5),
        });
      } else {
        setFixturesSyncResult({
          type: res.isPermissionIssue ? 'warning' : 'error',
          message: res.error || `ไม่สามารถดึงข้อมูล ${league} จาก Google Sheets ได้`,
        });
      }
    } catch (err: any) {
      setFixturesSyncResult({
        type: 'error',
        message: err.message || `เกิดข้อผิดพลาดในการดึงข้อมูล ${league}`,
      });
    } finally {
      setSyncingLeague(null);
    }
  };

  const handleUpdateLeagueUrl = (league: LeagueType, val: string) => {
    setLeagueUrls(prev => ({ ...prev, [league]: val }));
    setLeagueSheetUrl(league, val);
  };

  // =========================================================================
  // FIXTURES: IMPORT FROM RAW COPY-PASTE (TSV / CSV)
  // =========================================================================
  const handleParseAndApplyPastedFixtures = async () => {
    if (!pasteRawText.trim()) {
      setFixturesSyncResult({
        type: 'error',
        message: 'กรุณาวางข้อมูลตารางแข่งขันที่คัดลอกมาจาก Google Sheet ก่อนกดแปลงข้อมูล',
      });
      return;
    }

    const parsed = importFixturesFromRawText(pasteRawText, defaultLeagueSelect);
    if (!parsed.success) {
      setFixturesSyncResult({
        type: 'error',
        message: parsed.error || 'ไม่สามารถแปลงข้อมูลได้ กรุณาตรวจสอบรูปแบบตาราง',
      });
      return;
    }

    const nowStr = new Date().toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    if (pasteReplaceMode === 'append-league') {
      const appendRes = await appendFixturesForLeague(parsed.fixtures, defaultLeagueSelect, {
        source: 'manual-import',
        lastSyncedAt: nowStr,
      });

      const updatedMeta = getFixturesMeta();
      setFixturesMeta(updatedMeta);
      setFixturesSyncResult({
        type: 'success',
        message: `เพิ่มข้อมูลตารางแข่งขัน ${defaultLeagueSelect} สำเร็จ! เพิ่มคู่ใหม่ +${appendRes.addedCount} คู่ (รวมในลีกนี้เป็น ${appendRes.totalLeagueCount} คู่, รวมทุกตาราง ${updatedMeta.matchCount} คู่)`,
        count: appendRes.addedCount,
        leagueCounts: updatedMeta.leagueCounts,
        previewMatches: parsed.fixtures.slice(0, 5),
      });
      setPasteRawText('');
      return;
    }

    if (pasteReplaceMode === 'replace-league') {
      // Strictly force all fixtures in this paste to belong to defaultLeagueSelect!
      const targetFixtures = parsed.fixtures.map(f => ({
        ...f,
        league: defaultLeagueSelect,
      }));

      await saveFixturesForLeague(targetFixtures, defaultLeagueSelect, {
        source: 'manual-import',
        lastSyncedAt: nowStr,
        statusMessage: `นำเข้าข้อมูลตารางแข่ง ${defaultLeagueSelect} จากการวางข้อมูลสำเร็จ (${targetFixtures.length} คู่)`,
      });
    } else {
      // Replace all
      await saveFixtures(parsed.fixtures, {
        source: 'manual-import',
        lastSyncedAt: nowStr,
        statusMessage: `นำเข้าข้อมูลตารางแข่งจากการวางข้อมูลสำเร็จ (${parsed.count} คู่แข่งขัน)`,
      });
    }

    const updatedMeta = getFixturesMeta();
    setFixturesMeta(updatedMeta);
    setFixturesSyncResult({
      type: 'success',
      message: `นำเข้าตารางแข่งขันสำเร็จ! บันทึกและแสดงผล ${parsed.count} คู่แข่งขันบนเว็บไซต์เรียบร้อยแล้ว (ยอดรวมปัจจุบัน: ${updatedMeta.matchCount} คู่)`,
      count: parsed.count,
      leagueCounts: updatedMeta.leagueCounts,
      previewMatches: parsed.fixtures.slice(0, 5),
    });
    setPasteRawText('');
  };

  // Reset to default
  const handleResetFixtures = async () => {
    await resetFixturesToDefault();
    const updatedMeta = getFixturesMeta();
    setFixturesMeta(updatedMeta);
    setFixturesSyncResult({
      type: 'success',
      message: `รีเซ็ตตารางการแข่งขันกลับเป็นตารางมาตรฐานเรียบร้อยแล้ว (${updatedMeta.matchCount} คู่ • L1: ${updatedMeta.leagueCounts['League 1']} | L2: ${updatedMeta.leagueCounts['League 2']} | L3: ${updatedMeta.leagueCounts['League 3']})`,
    });
  };

  // =========================================================================
  // EXPORT / BACKEND SHEETS HANDLERS
  // =========================================================================
  const handleSaveBackendUrl = () => {
    if (!backendUrl.trim()) {
      setUrlSavedStatus('กรุณากรอกลิงก์ Google Sheets');
      setTimeout(() => setUrlSavedStatus(null), 3000);
      return;
    }
    saveBackendSheetsUrl(backendUrl.trim());
    setUrlSavedStatus('บันทึกลิงก์ Google Sheets ตารางหลังบ้านสำเร็จแล้ว!');
    setTimeout(() => setUrlSavedStatus(null), 3000);
  };

  const handleCopyTSVForSheets = () => {
    const headers = [
      'ID',
      'วันที่บันทึก',
      'ลีก (League 1/2/3)',
      'เดือน',
      'แบรนด์ผู้สนับสนุน',
      'แมตช์การแข่งขัน',
      'สนาม',
      'ผู้ลงทะเบียน (Gmail)',
      'อีเมล',
      'เบอร์โทรผู้ลงทะเบียน',
      'ขอออกบูธ',
      'ชื่อดีลเลอร์ออกบูธ',
      'เบอร์ติดต่อดีลเลอร์',
      'ขอรับตั๋วดูบอล',
      'จำนวนตั๋ว (ใบ)',
      'เบอร์คนขอบัตร',
      'หมายเหตุจากลูกค้า (Remark)',
      'สถานะอนุมัติ',
      'หมายเหตุแอดมิน',
    ];

    const rows = records.map(r => [
      r.id,
      r.createdAt,
      r.league,
      r.month,
      r.brand || '-',
      r.matchTitle,
      r.stadium,
      r.applicantName,
      r.applicantEmail,
      r.applicantPhone,
      r.boothRequired ? 'ใช่' : 'ไม่',
      r.dealerName || '-',
      r.dealerPhone || '-',
      r.ticketRequired ? 'ใช่' : 'ไม่',
      r.ticketQuantity || 0,
      r.ticketRequesterPhone || r.applicantPhone,
      r.remark || '-',
      r.status,
      r.adminNote || '',
    ]);

    const tsvContent = [headers.join('\t'), ...rows.map(e => e.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsvContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveWebhook = () => {
    localStorage.setItem('thaileague_sheets_webhook', webhookUrl.trim());
    setSyncStatus('บันทึก Webhook URL สำเร็จ!');
    setTimeout(() => setSyncStatus(null), 3000);
  };

  const handleSyncToWebhook = async () => {
    if (!webhookUrl) {
      alert('กรุณากรอก Google Apps Script Webhook URL ก่อนกดซิงก์');
      return;
    }
    try {
      setIsSyncing(true);
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'SYNC_ALL',
          timestamp: new Date().toISOString(),
          project: 'Thaileague 2026-27',
          data: records,
        }),
      });
      setSyncStatus('ส่งข้อมูลไปยัง Google Sheets สำเร็จเรียบร้อยแล้ว!');
      setTimeout(() => setSyncStatus(null), 4000);
    } catch (err) {
      console.error(err);
      setSyncStatus('เกิดข้อผิดพลาดในการเชื่อมต่อ Webhook');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-5 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                ระบบจัดการ & ซิงค์ Google Sheets
              </h3>
              <p className="text-xs text-slate-500">
                ดึงตารางแข่งขันจริงจาก Google Sheet และส่งออกข้อมูลการลงทะเบียน
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top 3-Tabs Navigation */}
        <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 rounded-2xl">
          <button
            type="button"
            id="tab-btn-fixtures"
            onClick={() => setActiveTab('fixtures')}
            className={`py-2.5 px-2 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'fixtures'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Calendar className="w-4 h-4 shrink-0" />
            <span className="truncate">📥 1. ตารางแมตช์แข่งขัน (2 ลิงก์)</span>
          </button>

          <button
            type="button"
            id="tab-btn-contacts"
            onClick={() => setActiveTab('contacts')}
            className={`py-2.5 px-2 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'contacts'
                ? 'bg-teal-700 text-white shadow-md'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <PhoneCall className="w-4 h-4 shrink-0" />
            <span className="truncate">📞 2. ชีต "เบอร์ติดต่อหน้าสนาม"</span>
          </button>

          <button
            type="button"
            id="tab-btn-export"
            onClick={() => setActiveTab('export')}
            className={`py-2.5 px-2 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'export'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span className="truncate">📤 3. สรุปส่งข้อมูล & ส่งออก</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: FIXTURES IMPORT (ดึงตารางการแข่งขันจาก Google Sheet ของคุณ) */}
        {/* ========================================================================= */}
        {activeTab === 'fixtures' && (
          <div className="space-y-4">
            {/* Current Active Status Card */}
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>สถานะตารางแข่งขันปัจจุบัน:</span>
                  </span>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${
                    fixturesMeta.source === 'google-sheet'
                      ? 'bg-emerald-200 text-emerald-900'
                      : fixturesMeta.source === 'manual-import'
                      ? 'bg-blue-100 text-blue-900'
                      : 'bg-slate-200 text-slate-800'
                  }`}>
                    {fixturesMeta.source === 'google-sheet' ? '🌐 ซิงค์จาก Google Sheet' :
                     fixturesMeta.source === 'manual-import' ? '📋 นำเข้าจากการวางตาราง' : '⚙️ ตารางเริ่มต้นระบบ'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  รวมทั้งหมด <strong>{fixturesMeta.matchCount} คู่แข่งขัน</strong> 
                  {' '}(League 1: {fixturesMeta.leagueCounts['League 1'] || 0} | League 2: {fixturesMeta.leagueCounts['League 2'] || 0} | League 3: {fixturesMeta.leagueCounts['League 3'] || 0})
                  {fixturesMeta.lastSyncedAt && ` • อัปเดตล่าสุด: ${fixturesMeta.lastSyncedAt}`}
                </p>
              </div>

              {fixturesMeta.source !== 'default' && (
                <button
                  type="button"
                  onClick={handleResetFixtures}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 transition-colors flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
                  title="รีเซ็ตกลับเป็นตารางแข่งขันของระบบ"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>รีเซ็ตเป็นตารางเริ่มต้น</span>
                </button>
              )}
            </div>

            {/* Auto-Sync & Background Interval Settings Card */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    autoSyncConfig.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-800">
                        ⚡ ตรวจสอบและซิงค์ข้อมูลอัตโนมัติในพื้นหลัง (Background Auto-Sync)
                      </h4>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        autoSyncConfig.enabled 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {autoSyncConfig.enabled ? '🟢 เปิดใช้งานอยู่' : '⏸️ ปิดการทำงาน'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      เมื่อชีตหลักมีการแก้ไข ระบบจะตรวจเช็กและอัปเดตตารางแข่งขันให้เว็บไซต์ทันทีโดยไม่ต้องคอยกดเอง
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    disabled={isTestingAutoSync}
                    onClick={handleTestAutoSyncNow}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title="ทดสอบตรวจสอบการเปลี่ยนแปลงของชีตเดี๋ยวนี้"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingAutoSync ? 'animate-spin' : ''}`} />
                    <span>{isTestingAutoSync ? 'กำลังตรวจเช็ก...' : '⚡ ตรวจสอบเดี๋ยวนี้'}</span>
                  </button>
                </div>
              </div>

              {/* Controls: Enable toggle, On Page Load checkbox, Interval selector */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Master Toggle */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">เปิด Auto-Sync</span>
                    <span className="text-[10px] text-slate-500 block">ให้ระบบทำงานอัตโนมัติ</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSyncConfig.enabled}
                      onChange={(e) => handleUpdateAutoSyncConfig({ enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {/* 2. On Page Load Checkbox */}
                <div className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-2 ${
                  autoSyncConfig.enabled ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-50/50 border-slate-200/50 opacity-60'
                }`}>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">เช็กเมื่อเปิดหน้าเว็บ</span>
                    <span className="text-[10px] text-slate-500 block">Auto-check on Page Load</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!autoSyncConfig.enabled}
                      checked={autoSyncConfig.onPageLoad}
                      onChange={(e) => handleUpdateAutoSyncConfig({ onPageLoad: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {/* 3. Background Interval Dropdown */}
                <div className={`p-3 rounded-xl border transition-colors flex flex-col justify-center gap-1 ${
                  autoSyncConfig.enabled ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-50/50 border-slate-200/50 opacity-60'
                }`}>
                  <label className="text-xs font-bold text-slate-800 block">
                    ความถี่ตรวจสอบ (Interval)
                  </label>
                  <select
                    disabled={!autoSyncConfig.enabled}
                    value={autoSyncConfig.intervalMinutes}
                    onChange={(e) => handleUpdateAutoSyncConfig({ intervalMinutes: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  >
                    <option value={15}>ทุก 15 นาที</option>
                    <option value={30}>ทุก 30 นาที (แนะนำ)</option>
                    <option value={60}>ทุก 1 ชั่วโมง (60 นาที)</option>
                    <option value={120}>ทุก 2 ชั่วโมง (120 นาที)</option>
                    <option value={0}>เฉพาะตอนเปิดหน้าเว็บเท่านั้น (ไม่ตั้งรอบเวลา)</option>
                  </select>
                </div>
              </div>

              {/* Status footer bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">
                    {autoSyncConfig.lastAutoCheckedAt ? `ตรวจสอบล่าสุด: ${autoSyncConfig.lastAutoCheckedAt}` : 'ยังไม่มีประวัติการตรวจสอบ'}
                  </span>
                  {autoSyncConfig.lastAutoCheckMessage && (
                    <span className="text-slate-500 border-l border-slate-300 pl-2">
                      {autoSyncConfig.lastAutoCheckMessage}
                    </span>
                  )}
                </div>
                {autoSyncSavedNotice && (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>{autoSyncSavedNotice}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Sub-Methods Switcher */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setImportMethod('url')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  importMethod === 'url'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                1. ดึงข้อมูลสดผ่านลิงก์ Google Sheets (Live Sync)
              </button>
              <button
                type="button"
                onClick={() => setImportMethod('paste')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  importMethod === 'paste'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                2. วางข้อมูลจากชีตโดยตรง (Ctrl+V Paste)
              </button>
            </div>

            {/* Method A: URL Live Fetch */}
            {importMethod === 'url' && (
              <div className="space-y-4">
                {/* Master Dual Sync Button Banner */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white shadow-md space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold tracking-wide uppercase">
                        <Sparkles className="w-3 h-3" />
                        <span>ระบบซิงค์ 2 ชีตหลัก (Dual Master Sheets)</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mt-1">
                        ดึงสดพร้อมกันจาก 2 ลิงก์หลัก (L1, L2 จากแท็บ T1 & T2 + L3 จาก BYD Dolphin)
                      </h4>
                      <p className="text-[11px] text-emerald-100">
                        ดึงข้อมูลคู่แข่งขันครบทั้ง 3 ลีก โดยแยกแท็บ T1-(THA), T2-(THA) และชีต League 3 อย่างแม่นยำ
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={syncingLeague !== null}
                      onClick={() => handleSyncDualMainSheets('all')}
                      className="px-4 py-2.5 rounded-xl bg-white text-emerald-900 hover:bg-emerald-50 text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 text-emerald-700 ${syncingLeague === 'all' ? 'animate-spin' : ''}`} />
                      <span>{syncingLeague === 'all' ? 'กำลังซิงค์ทั้ง 2 ชีต...' : '⚡ ซิงค์สดครบทั้ง 2 ลิงก์หลัก'}</span>
                    </button>
                  </div>

                  {/* Reassuring New-Season Preservation Notice */}
                  <div className="pt-2 border-t border-white/20 flex items-center gap-2 text-[11px] text-emerald-50">
                    <Info className="w-4 h-4 text-emerald-200 shrink-0" />
                    <span>
                      <strong>เมื่อเริ่มฤดูกาลใหม่:</strong> สามารถลบลิงก์เดิมและใส่ลิงก์ Google Sheets ของฤดูกาลใหม่ได้ทันที ระบบมีระบบ Multi-Season Preservation ช่วยเก็บรักษาประวัติตารางแข่งและคำขอลงทะเบียนของฤดูกาลเก่าไว้ครบถ้วน ไม่สูญหาย
                    </span>
                  </div>
                </div>

                {/* Source 1: Thai League 1 & 2 FIXTURES 2026/27 */}
                <div className="p-4 rounded-2xl bg-white border-2 border-emerald-200/80 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">
                          ลิงก์แข่งขัน 1
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                          Thai League 1 & 2 FIXTURES 2026/27
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        • Thai League 1: แท็บ <code className="bg-emerald-50 text-emerald-800 px-1 py-0.5 rounded font-mono font-bold">T1-(THA)</code> ตรวจจับคอลัมน์ <em>"วันที่แข่งขัน,เวลา,ทีมเหย้า,ทีมเยือน"</em> (ตามชีต 204 คู่)
                        <br />
                        • Thai League 2: แท็บ <code className="bg-blue-50 text-blue-800 px-1 py-0.5 rounded font-mono font-bold">T2-(THA)</code> ตรวจจับคอลัมน์ <em>"วันที่แข่งขัน,เวลา,ทีมเหย้า,ทีมเยือน"</em> (ตามชีต 306 คู่)
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                        L1: {fixturesMeta.leagueCounts['League 1'] || 0} คู่ (ตามชีต 204)
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                        L2: {fixturesMeta.leagueCounts['League 2'] || 0} คู่ (ตามชีต 306)
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="url"
                      value={sheetT1T2Url}
                      onChange={(e) => {
                        setSheetT1T2Url(e.target.value);
                        setFixturesSheetT1T2Url(e.target.value);
                        setSheetFixturesUrl(e.target.value);
                      }}
                      placeholder="ใส่ลิงก์ Google Sheet: Thai League 1 & 2 FIXTURES 2026/27 (เช่น https://docs.google.com/spreadsheets/d/...)"
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 text-slate-800 font-medium"
                    />

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={syncingLeague !== null}
                        onClick={() => handleSyncDualMainSheets('t1t2')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncingLeague === 't1t2' ? 'animate-spin' : ''}`} />
                        <span>{syncingLeague === 't1t2' ? 'กำลังซิงค์ T1 & T2...' : '🔄 ซิงค์ทั้ง L1 & L2 (แท็บ T1 & T2)'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={syncingLeague !== null}
                        onClick={() => handleSyncDualMainSheets('t1')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingLeague === 't1' ? 'animate-spin' : ''}`} />
                        <span>ดึงเฉพาะแท็บ T1-(THA) (204 คู่)</span>
                      </button>

                      <button
                        type="button"
                        disabled={syncingLeague !== null}
                        onClick={() => handleSyncDualMainSheets('t2')}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingLeague === 't2' ? 'animate-spin' : ''}`} />
                        <span>ดึงเฉพาะแท็บ T2-(THA) (306 คู่)</span>
                      </button>
                    </div>

                    {/* Notice card pointing to dedicated Contacts tab */}
                    <div className="mt-2 p-2.5 rounded-xl bg-teal-50/70 border border-teal-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-teal-900 text-[11px]">
                        <PhoneCall className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                        <span>
                          <strong>เบอร์ติดต่อหน้าสนาม (ออกบูธ + รับบัตร):</strong> แยกไปจัดการในแท็บ <strong>2. เบอร์ติดต่อหน้าสนาม</strong> (ดึงจาก Google Sheet ชื่อ <em>เบอร์ติดต่อหน้าสนาม</em> คอลัมน์ สโมสรทีมเหย้า, ออกบูธ, รับบัตร, Remark)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('contacts')}
                        className="px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-[11px] shrink-0 transition-colors cursor-pointer self-start sm:self-auto"
                      >
                        ไปที่แท็บเบอร์ติดต่อ →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Source 2: BYD DOLPHIN LEAGUE III FIXTURES 2026/27 */}
                <div className="p-4 rounded-2xl bg-white border-2 border-purple-200/80 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white text-[10px] font-bold">
                          ลิงก์หลัก 2
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                          BYD DOLPHIN LEAGUE III FIXTURES 2026/27 (UPDATE 11 AUG 2026)
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        ดึงข้อมูลตารางแข่งขัน Thai League 3 ในแท็บ <strong>NORTH, NORTHEAST, EAST, CENTRAL, WEST, SOUTH</strong> ตรวจจับคอลัมน์ <em>"วันเดือนปี,เวลา,ทีมเหย้า,ทีมเยือน,สนามแข่งขัน"</em> (ตามชีต 728 คู่)
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 font-bold shrink-0">
                        L3 ในระบบ: {fixturesMeta.leagueCounts['League 3'] || 0} คู่ (ตามชีต 728)
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="url"
                      value={sheetT3Url}
                      onChange={(e) => {
                        setSheetT3Url(e.target.value);
                        setFixturesSheetT3Url(e.target.value);
                      }}
                      placeholder="ใส่ลิงก์ Google Sheet: BYD DOLPHIN LEAGUE III FIXTURES 2026/27 (เช่น https://docs.google.com/spreadsheets/d/...)"
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 text-slate-800 font-medium"
                    />

                    {/* Real-time Progress Bar / Notification during sync */}
                    {(syncingLeague === 't3' || syncingLeague === 'all') && syncProgressMessage && (
                      <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center gap-2 animate-pulse">
                        <RefreshCw className="w-4 h-4 text-purple-600 animate-spin shrink-0" />
                        <span className="font-medium">{syncProgressMessage}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={syncingLeague !== null}
                          onClick={() => handleSyncDualMainSheets('t3')}
                          className="px-3.5 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingLeague === 't3' ? 'animate-spin' : ''}`} />
                          <span>{syncingLeague === 't3' ? 'กำลังดึงทุกแท็บ L3...' : '🔄 ซิงค์ทุกแท็บ Thai League 3 (All Zones)'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowCustomL3TabNames(prev => !prev)}
                          className="text-[11px] text-slate-500 hover:text-purple-700 underline font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <span>{showCustomL3TabNames ? 'ซ่อนการระบุแท็บ' : '⚙️ ระบุชื่อแท็บเอง (ตัวเลือก)'}</span>
                        </button>
                      </div>

                      {fixturesMeta.detectedTabsL3 && fixturesMeta.detectedTabsL3.length > 0 && (
                        <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>เชื่อมต่อแล้ว {fixturesMeta.detectedTabsL3.length} แท็บ</span>
                        </span>
                      )}
                    </div>

                    {/* Expandable Custom Tab Names */}
                    {showCustomL3TabNames && (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 mt-2">
                        <label className="block font-bold text-slate-700">
                          ระบุชื่อแท็บที่ต้องการดึง (คั่นด้วยเครื่องหมายจุลภาค , หรือขึ้นบรรทัดใหม่):
                        </label>
                        <textarea
                          rows={2}
                          value={customL3TabNamesInput}
                          onChange={(e) => setCustomL3TabNamesInput(e.target.value)}
                          placeholder="เช่น โซนภาคเหนือ, โซนภาคตะวันออกเฉียงเหนือ, โซนภาคตะวันออก, โซนภาคตะวันตก, โซนภาคกลาง, โซนกรุงเทพและปริมณฑล, โซนภาคใต้"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800"
                        />
                        <p className="text-[10px] text-slate-500">
                          * หากเว้นว่างไว้ ระบบจะตรวจหาและดึงแท็บทั้งหมดในชีต League 3 ให้อัตโนมัติ
                        </p>
                      </div>
                    )}

                    {/* Detected L3 Tabs Breakdown Card */}
                    {fixturesMeta.detectedTabsL3 && fixturesMeta.detectedTabsL3.length > 0 && (
                      <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-100 text-xs space-y-1.5 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-purple-900 text-[11px] flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5 text-purple-700" />
                            <span>แท็บที่ดึงข้อมูลสำเร็จ ({fixturesMeta.detectedTabsL3.length} แท็บ รวม {fixturesMeta.leagueCounts['League 3']} คู่):</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {fixturesMeta.detectedTabsL3.map((tab, idx) => (
                            <span 
                              key={idx}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-purple-200/80 text-purple-900 text-[11px] font-medium shadow-2xs"
                            >
                              <Check className="w-3 h-3 text-purple-600 shrink-0" />
                              <span>{tab.name}</span>
                              <strong className="text-purple-700 bg-purple-100/70 px-1.5 py-0.2 rounded text-[10px]">{tab.count} คู่</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sharing Tip */}
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-950">
                    <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>คำแนะนำสิทธิ์การเข้าถึงชีต (Google Sheets Sharing):</span>
                  </div>
                  <p className="text-amber-900/90 leading-relaxed">
                    โปรดตรวจสอบให้แน่ใจว่าทั้ง 2 ลิงก์ Google Sheets ได้ตั้งค่าปุ่ม <strong>แชร์ (Share)</strong> เป็น <strong>"ทุกคนที่มีลิงก์มีสิทธิ์ดู" (Anyone with link can view)</strong> หรือหากชีตจำกัดสิทธิ์องค์กร สามารถใช้วิธี <strong>"วางข้อมูลจากชีตโดยตรง (Ctrl+V Paste)"</strong> ในแท็บด้านบนได้ทันที
                  </p>
                </div>
              </div>
            )}

            {/* Method B: Paste TSV / CSV */}
            {importMethod === 'paste' && (
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-800">
                    คัดลอกตารางจาก Google Sheet แล้วนำมาวางที่นี่ (Instant Paste)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    เปิดชีตของคุณ กดคลุมแถวตารางการแข่งขันของลีกที่ต้องการ แล้วกด <strong>Ctrl + C</strong> จากนั้นนำมาคลิกวาง (Ctrl + V) ในกล่องด้านล่าง
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-500 font-semibold">เลือกตามแท็บที่คัดลอกมา:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDefaultLeagueSelect('League 1');
                        setPasteReplaceMode('replace-league');
                      }}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                        defaultLeagueSelect === 'League 1'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      คัดลอกจากแท็บ T1-(THA) [League 1]
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDefaultLeagueSelect('League 2');
                        setPasteReplaceMode('replace-league');
                      }}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                        defaultLeagueSelect === 'League 2'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                      }`}
                    >
                      คัดลอกจากแท็บ T2-(THA) [League 2]
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDefaultLeagueSelect('League 3');
                        setPasteReplaceMode('replace-league');
                      }}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                        defaultLeagueSelect === 'League 3'
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                      }`}
                    >
                      คัดลอกจากชีต BYD DOLPHIN [League 3]
                    </button>
                  </div>
                </div>

                <textarea
                  rows={6}
                  value={pasteRawText}
                  onChange={(e) => setPasteRawText(e.target.value)}
                  placeholder="ตัวอย่างการวางข้อมูล:
นัดที่	ระดับลีก	วันที่	เวลา	ทีมเหย้า	ทีมเยือน	สนามแข่งขัน
4	League 2	2026-09-05	18:00	พัทยา ยูไนเต็ด	นครศรี ยูไนเต็ด	สนามกีฬาเทศบาลเมืองหนองปรือ
4	League 2	2026-09-06	19:00	เชียงใหม่ ยูไนเต็ด	ลำปาง เอฟซี	สนามสมโภชเชียงใหม่ 700 ปี"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 font-mono"
                />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-600 font-medium">ลีกเป้าหมาย:</span>
                      <select
                        value={defaultLeagueSelect}
                        onChange={(e) => setDefaultLeagueSelect(e.target.value as LeagueType)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white font-semibold"
                      >
                        <option value="League 1">Thai League 1</option>
                        <option value="League 2">Thai League 2</option>
                        <option value="League 3">Thai League 3</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-600 font-medium">รูปแบบ:</span>
                      <select
                        value={pasteReplaceMode}
                        onChange={(e) => setPasteReplaceMode(e.target.value as any)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white font-semibold text-emerald-800"
                      >
                        <option value="append-league">➕ เพิ่มต่อท้ายในลีกนี้ (ไม่ลบของเดิม - เหมาะกับก๊อปปี้วางทีละโซน/แท็บ)</option>
                        <option value="replace-league">🔄 แทนที่เฉพาะลีกนี้ (คงข้อมูลลีกอื่นไว้)</option>
                        <option value="replace-all">⚠️ แทนที่ตารางทั้งหมด</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleParseAndApplyPastedFixtures}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer self-end sm:self-auto"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>แปลงและบันทึกตาราง</span>
                  </button>
                </div>
              </div>
            )}

            {/* Official Specifications & Rules Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2.5">
              <div className="flex items-center gap-2 text-slate-800 font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>ข้อกำหนดการซิงค์ข้อมูลตามชีตจริง (ห้าม mock data 100%)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
                <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-1">
                  <span className="font-bold text-emerald-700">Thai League 1 (204 คู่)</span>
                  <p className="text-slate-600">ชีต Thai League 1 & 2 FIXTURES 2026/27 แท็บ <code>T1-(THA)</code> คอลัมน์ <em>"วันที่แข่งขัน,เวลา,ทีมเหย้า,ทีมเยือน"</em></p>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-1">
                  <span className="font-bold text-blue-700">Thai League 2 (306 คู่)</span>
                  <p className="text-slate-600">ชีต Thai League 1 & 2 FIXTURES 2026/27 แท็บ <code>T2-(THA)</code> คอลัมน์ <em>"วันที่แข่งขัน,เวลา,ทีมเหย้า,ทีมเยือน"</em></p>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-1">
                  <span className="font-bold text-purple-700">Thai League 3 (728 คู่)</span>
                  <p className="text-slate-600">ชีต BYD DOLPHIN LEAGUE III FIXTURES 2026/27 แท็บ <code>NORTH, NORTHEAST, EAST, CENTRAL, WEST, SOUTH</code> คอลัมน์ <em>"วันเดือนปี,เวลา,ทีมเหย้า,ทีมเยือน,สนามแข่งขัน"</em></p>
                </div>
              </div>
              <ul className="text-[11px] text-slate-600 list-disc list-inside space-y-1 pt-1 border-t border-slate-200/60">
                <li><strong>ไม่มี mock data:</strong> หากดึงข้อมูลไม่สำเร็จระบบจะแจ้ง error ทันที ไม่มีการสร้างข้อมูลจำลองขึ้นมาเอง</li>
                <li><strong>ป้องกันข้อมูลซ้ำ (Incremental Update):</strong> คู่แข่งขันไหนที่มีอยู่แล้วและไม่มีการเปลี่ยนแปลงจะไม่ดึงซ้ำ ดึงเฉพาะคู่แข่งขันที่มีการแก้ไข</li>
                <li><strong>สัปดาห์ไม่มีแข่ง:</strong> สัปดาห์ไหนไม่มีโปรแกรมแข่ง (เช่น วันที่ 1-8 ต.ค. 2569 ที่ League 1 และ League 2 ไม่มีการแข่งขัน) ระบบจะขึ้นแจ้ง <em>"ไม่มีการแข่งขันในสัปดาห์นี้"</em></li>
              </ul>
            </div>

            {/* Sync Feedback Toast / Banner */}
            {fixturesSyncResult && (
              <div className={`p-4 rounded-2xl border text-xs font-medium space-y-2 ${
                fixturesSyncResult.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : fixturesSyncResult.type === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}>
                <div className="flex items-start gap-2">
                  {fixturesSyncResult.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-bold">{fixturesSyncResult.message}</p>
                    {fixturesSyncResult.type === 'warning' && (
                      <p className="mt-1 text-[11px] text-amber-900">
                        💡 คำแนะนำ: หาก Google Sheet อยู่ในโดเมนองค์กรที่จำกัดสิทธิ์ภายนอก ท่านสามารถเลือกแท็บ <strong>"2. วางข้อมูลจากชีตโดยตรง (Ctrl+V Paste)"</strong> ด้านบน เพื่อคัดลอกตารางมาวางได้ทันที 100% โดยไม่ต้องปรับสิทธิ์ความปลอดภัยใดๆ
                      </p>
                    )}
                  </div>
                </div>

                {/* Sample Matches Preview */}
                {fixturesSyncResult.previewMatches && fixturesSyncResult.previewMatches.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-emerald-200">
                    <span className="text-[11px] font-bold text-emerald-900 block mb-1">
                      ตัวอย่างคู่แข่งขันที่ตรวจพบ:
                    </span>
                    <div className="space-y-1">
                      {fixturesSyncResult.previewMatches.map((m) => (
                        <div key={m.id} className="text-[11px] bg-white/80 px-2.5 py-1 rounded-lg border border-emerald-100 flex items-center justify-between">
                          <span className="font-semibold text-slate-800">
                            [{m.league}] {m.homeTeam} vs {m.awayTeam}
                          </span>
                          <span className="text-slate-500">
                            {m.matchDate} ({m.matchTime} น.) @ {m.stadium}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: GOOGLE SHEET "เบอร์ติดต่อหน้าสนาม" & STADIUM PHONEBOOK */}
        {/* ========================================================================= */}
        {activeTab === 'contacts' && (
          <div className="space-y-4">
            {/* Master Banner for Google Sheet "เบอร์ติดต่อหน้าสนาม" */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 text-white shadow-md space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-bold tracking-wide uppercase border border-emerald-400/30">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>ดึงจาก Google Sheet: "เบอร์ติดต่อหน้าสนาม"</span>
                  </div>
                  <h4 className="text-base font-bold text-white">
                    ซิงค์เบอร์ติดต่อออกบูธ, รับบัตร และ Remark จาก Google Sheet "เบอร์ติดต่อหน้าสนาม"
                  </h4>
                  <p className="text-xs text-teal-100/90 max-w-2xl leading-relaxed">
                    ระบบดึงข้อมูลเบอร์ติดต่อสำหรับออกบูธและรับบัตรจากชีต <strong>"เบอร์ติดต่อหน้าสนาม"</strong> โดยตรง โดยจับคู่กับ<strong>ชื่อทีมเหย้า</strong>ตามแต่ละลีก (League 1 ↔ แท็บ League 1, League 2 ↔ แท็บ League 2, League 3 ↔ แท็บ League 3)
                  </p>
                </div>

                {onNavigateToContacts && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToContacts();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4 text-slate-950" />
                    <span>เปิดสมุดโทรศัพท์ 103 สโมสร</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sync Card: Google Sheet "เบอร์ติดต่อหน้าสนาม" */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-teal-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-teal-700 text-white text-[10px] font-bold">
                      Google Sheet แหล่งข้อมูลเบอร์ติดต่อ
                    </span>
                    <h5 className="text-xs sm:text-sm font-bold text-slate-900">
                      เบอร์ติดต่อหน้าสนาม (คอลัมน์ออกบูธ, รับบัตร, Remark)
                    </h5>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    วางลิงก์ Google Sheet ชื่อ <strong>เบอร์ติดต่อหน้าสนาม</strong> ที่มีแท็บ League 1, League 2, League 3
                  </p>
                </div>

                {contactsSyncMeta.lastSyncedAt && (
                  <span className="text-[11px] text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200 font-semibold shrink-0">
                    ซิงค์ล่าสุด: {contactsSyncMeta.lastSyncedAt} ({contactsSyncMeta.count} แมตช์)
                  </span>
                )}
              </div>

              {/* URL input and save */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-teal-600" />
                  <span>URL ลิงก์ Google Sheet:</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={sheetContactsUrl}
                    onChange={(e) => setSheetContactsUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=..."
                    className="flex-1 px-3.5 py-2.5 text-xs rounded-xl border border-teal-300 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-800 font-medium"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleSaveContactsUrl}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-300"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>บันทึกลิงก์</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSyncingContacts}
                      onClick={() => handleSyncStadiumContacts('all')}
                      className="px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-black shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingContacts ? 'animate-spin' : ''}`} />
                      <span>{isSyncingContacts ? 'กำลังดึงเบอร์...' : '⚡ ดึงสดครบทุกแท็บ (L1, L2, L3)'}</span>
                    </button>
                  </div>
                </div>

                {contactsUrlSavedStatus && (
                  <div className="text-xs text-emerald-800 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{contactsUrlSavedStatus}</span>
                  </div>
                )}
              </div>

              {/* League-specific quick sync buttons */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[11px] text-slate-500 font-semibold mr-1">หรือเลือกซิงค์เฉพาะแท็บ:</span>
                  <button
                    type="button"
                    disabled={isSyncingContacts}
                    onClick={() => handleSyncStadiumContacts('League 1')}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    ดึงแท็บ League 1
                  </button>
                  <button
                    type="button"
                    disabled={isSyncingContacts}
                    onClick={() => handleSyncStadiumContacts('League 2')}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    ดึงแท็บ League 2
                  </button>
                  <button
                    type="button"
                    disabled={isSyncingContacts}
                    onClick={() => handleSyncStadiumContacts('League 3')}
                    className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    ดึงแท็บ League 3
                  </button>
                </div>
              </div>

              {/* Exact Mapping Specification Box */}
              <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200 text-teal-950 text-xs space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-teal-900">
                  <Info className="w-4 h-4 text-teal-700 shrink-0" />
                  <span>กฎการจับคู่ข้อมูลเบอร์ติดต่อหน้าสนามตามที่ระบุ:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="bg-white/90 p-2.5 rounded-lg border border-teal-200/80">
                    <span className="font-bold text-emerald-800 block">Thai League 1</span>
                    <span className="text-slate-600">จับคู่กับข้อมูลในแท็บ <strong>League 1</strong> ด้วยชื่อ<strong>ทีมเหย้า</strong></span>
                  </div>
                  <div className="bg-white/90 p-2.5 rounded-lg border border-teal-200/80">
                    <span className="font-bold text-blue-800 block">Thai League 2</span>
                    <span className="text-slate-600">จับคู่กับข้อมูลในแท็บ <strong>League 2</strong> ด้วยชื่อ<strong>ทีมเหย้า</strong></span>
                  </div>
                  <div className="bg-white/90 p-2.5 rounded-lg border border-teal-200/80">
                    <span className="font-bold text-purple-800 block">Thai League 3</span>
                    <span className="text-slate-600">จับคู่กับข้อมูลในแท็บ <strong>League 3</strong> ด้วยชื่อ<strong>ทีมเหย้า</strong></span>
                  </div>
                </div>
                <div className="pt-1 text-[11px] text-teal-800">
                  📋 <strong>คอลัมน์ที่ระบบตรวจจับและดึงข้อมูล:</strong> <code className="bg-white px-1.5 py-0.5 rounded border border-teal-200 font-bold text-slate-800">สโมสรทีมเหย้า</code>, <code className="bg-white px-1.5 py-0.5 rounded border border-teal-200 font-bold text-slate-800">ชื่อ+เบอร์ติดต่อสำหรับออกบูธ</code>, <code className="bg-white px-1.5 py-0.5 rounded border border-teal-200 font-bold text-slate-800">ชื่อ+เบอร์ติดต่อสำหรับรับบัตร</code>, และ <code className="bg-white px-1.5 py-0.5 rounded border border-teal-200 font-bold text-slate-800">Remark</code> (ไม่สร้าง mock data ทุกกรณี หากดึงไม่สำเร็จจะแสดงข้อความ error ทันที)
                </div>
              </div>
            </div>

            {/* Sync Feedback Toast / Banner if present */}
            {fixturesSyncResult && (
              <div className={`p-4 rounded-2xl border text-xs font-medium space-y-2 ${
                fixturesSyncResult.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : fixturesSyncResult.type === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}>
                <div className="flex items-start gap-2">
                  {fixturesSyncResult.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-bold">{fixturesSyncResult.message}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Stadium Phonebook & Weekly Confirmation Notice */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                    <Phone className="w-3.5 h-3.5" />
                  </div>
                  <h5 className="text-xs font-bold text-slate-900">สมุดโทรศัพท์ประจำสนาม (ระบบหลังบ้าน)</h5>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  ข้อมูลเบอร์ติดต่อที่ซิงค์จากชีตจะถูกจัดเก็บเข้าสู่ระบบ สามารถแก้ไขชื่อผู้ประสานงาน จุดตั้งบูธ จุดรับบัตรได้ตลอดเวลา
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <h5 className="text-xs font-bold text-slate-900">การยืนยันรายสัปดาห์โดย Admin</h5>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Admin สามารถตรวจสอบความถูกต้องและกดยืนยันเบอร์รายสัปดาห์ เพื่อให้ลูกค้าเห็นข้อมูลบนหน้าเว็บจนสิ้นสุดวันแข่งขัน
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: EXPORT SUBMISSIONS & BACKEND SHEETS LINK (ตารางสรุปส่งข้อมูล) */}
        {/* ========================================================================= */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            {/* Backend Sheets Link */}
            <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-bold text-xs text-sky-950 flex items-center gap-1.5">
                  <Link2 className="w-4 h-4 text-sky-700" />
                  <span>ลิงก์ Google Sheets ตารางสรุปส่งข้อมูลหลังบ้านทีมงาน</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold">
                  ลิงก์ทีมงาน
                </span>
              </div>
              
              <p className="text-xs text-slate-600 leading-relaxed">
                บันทึก URL ของ Google Sheets ตารางสรุปส่งข้อมูล เพื่อให้เจ้าหน้าที่เปิดเข้าดูและนำข้อมูลไปสรุปผลได้สะดวกรวดเร็ว
              </p>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-sky-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-600 text-slate-800 font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleSaveBackendUrl}
                    className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>บันทึกลิงก์</span>
                  </button>
                </div>

                {urlSavedStatus && (
                  <div className="text-xs text-sky-700 font-bold bg-sky-100/80 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-sky-600" />
                    <span>{urlSavedStatus}</span>
                  </div>
                )}

                {backendUrl && (
                  <a
                    href={backendUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-xl bg-white border border-sky-300 text-sky-800 hover:bg-sky-50 text-xs font-bold transition-all shadow-2xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-sky-600" />
                    <span>เปิดตารางสรุปส่งข้อมูล Google Sheets ในแท็บใหม่</span>
                  </a>
                )}
              </div>
            </div>

            {/* Direct Excel File Export (.xlsx) - 2 Tabs */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-300 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-bold text-xs text-emerald-950 flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-emerald-600 text-white">
                    <FileSpreadsheet className="w-4 h-4" />
                  </span>
                  <span>ดาวน์โหลดไฟล์ Excel (.xlsx) จัดรูปแบบสำเร็จรูปแยก 2 แท็บ</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  แท็บออกบูธ + แท็บรับบัตร
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                สร้างไฟล์ Excel โดยแบ่งเป็น <strong>แท็บ 1: "ออกบูธ"</strong> และ <strong>แท็บ 2: "รับบัตร"</strong> พร้อมจัดกลุ่มหัวตารางแยกรายแบรนด์ (byd, chang, castrol, coke, molten, เงินให้ใจ) ตามคู่แข่งขันอย่างเป็นระเบียบ
              </p>
              <button
                id="btn-download-excel-tabs"
                onClick={() => {
                  exportToExcelTwoTabs({
                    registrations: records,
                    allFixturesMode: false,
                    filenamePrefix: 'thaileague_booth_ticket',
                  });
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลดไฟล์ Excel (.xlsx) แยก 2 แท็บทันที</span>
              </button>
            </div>

            {/* Method 1: TSV Copy */}
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-bold text-xs text-emerald-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                  <span>คัดลอกข้อมูลลงทะเบียนไปวางใน Google Sheets ทันที (One-Click Copy)</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  {records.length} แถวข้อมูล
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                กดปุ่มด้านล่างแล้วกด <strong>Ctrl + V (หรือ Cmd + V)</strong> ในเซลล์ A1 ของ Google Sheets ตารางจะถูกจัดคอลัมน์ให้อย่างสวยงามทันที
              </p>
              <button
                id="btn-copy-tsv"
                onClick={handleCopyTSVForSheets}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>คัดลอกข้อมูลทั้งหมดเรียบร้อยแล้ว! นำไปวางใน Google Sheet ได้เลย</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>คัดลอกข้อมูลทั้งหมดสำหรับ Google Sheets</span>
                  </>
                )}
              </button>
            </div>

            {/* Method 2: Webhook Automation */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                <span>หรือเชื่อมต่อแบบ Real-Time อัตโนมัติด้วย Google Apps Script Webhook</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                ระบุ URL ของ Web App ใน Google Apps Script เพื่อให้ทุกครั้งที่มีการลงทะเบียน ข้อมูลจะถูกบันทึกลง Sheet ทันที
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button
                  onClick={handleSaveWebhook}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 cursor-pointer"
                >
                  บันทึก URL
                </button>
              </div>

              {webhookUrl && (
                <button
                  onClick={handleSyncToWebhook}
                  disabled={isSyncing}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isSyncing ? 'กำลังส่งข้อมูล...' : 'ส่งข้อมูลทั้งหมดไปยัง Google Sheets เดี๋ยวนี้'}</span>
                </button>
              )}

              {syncStatus && (
                <div className="text-xs font-semibold text-emerald-700 text-center py-1">
                  {syncStatus}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <span className="text-[11px] text-slate-400">
            Thai League 2026-27 • Google Sheets Real-Time Sync
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
