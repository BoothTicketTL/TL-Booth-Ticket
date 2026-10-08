import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, 
  MapPin, 
  Calendar, 
  Clock, 
  Users, 
  FileText, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles,
  TrendingUp,
  Flame,
  Trophy,
  Edit3,
  X,
  Save,
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle
} from 'lucide-react';
import { LeagueType, UserProfile, FixtureItem, StadiumAttendanceRecord, AttendanceImportSummary } from '../types';
import { ClubCrest } from './common/ClubCrest';
import { LeagueBadge } from './common/LeagueBadge';
import { resolveOfficialClubName } from '../lib/clubNameResolver';
import { getFixtures, subscribeToFixtures } from '../lib/fixturesService';
import { getSimulatedDate, subscribeToSimulatedDate } from '../lib/firebase';
import { CURRENT_SIMULATED_DATE } from '../data/fixtures';
import { 
  subscribeToAttendance, 
  getAttendanceRecords, 
  saveAttendanceRecords,
  saveAttendanceRecordsForLeague,
  parseAttendanceExcel,
  generateAttendanceExcelTemplate,
  STADIUM_CAPACITY_LOOKUP 
} from '../lib/attendanceService';

interface CleanStadiumAttendanceViewProps {
  currentUser: UserProfile | null;
  initialLeague?: LeagueType;
  onBackToHub: () => void;
  onOpenAdmin?: () => void;
  onSwitchRole?: () => void;
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

export const CleanStadiumAttendanceView: React.FC<CleanStadiumAttendanceViewProps> = ({
  currentUser,
  initialLeague = 'League 1',
  onBackToHub,
  onOpenAdmin,
  onSwitchRole,
}) => {
  const [selectedLeague, setSelectedLeague] = useState<LeagueType>(initialLeague);
  const [fixtures, setFixtures] = useState<FixtureItem[]>(() => getFixtures());
  const [simDate, setSimDate] = useState<string>(() => getSimulatedDate() || '2026-10-09');
  const [attendanceRecords, setAttendanceRecords] = useState<StadiumAttendanceRecord[]>(() => getAttendanceRecords());
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Excel Upload Modal State (Specific target league: L1, L2, L3)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [targetUploadLeague, setTargetUploadLeague] = useState<LeagueType>('League 1');
  const [importSummary, setImportSummary] = useState<AttendanceImportSummary | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDropzoneDragging, setIsDropzoneDragging] = useState(false);
  const [isPageDragging, setIsPageDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit attendance state (for Admin) - No capacity field per user request
  const [editingMatch, setEditingMatch] = useState<{
    id: string;
    homeTeam: string;
    awayTeam: string;
    attendance: number;
    homeScore?: number;
    awayScore?: number;
    score: string;
  } | null>(null);

  // Drag and drop listener on window for Admin
  useEffect(() => {
    if (currentUser?.role !== 'admin') return;

    let dragCounter = 0;
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsPageDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        setIsPageDragging(false);
        dragCounter = 0;
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsPageDragging(false);
      dragCounter = 0;
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        processExcelFile(file, selectedLeague);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [currentUser, selectedLeague]);

  // Subscribe to real-time fixtures, simDate, and attendance
  useEffect(() => {
    const unsubFixtures = subscribeToFixtures((data) => {
      setFixtures(data);
    });
    const unsubSimDate = subscribeToSimulatedDate((newDate) => {
      setSimDate(newDate);
    });
    const unsubAttendance = subscribeToAttendance((data) => {
      setAttendanceRecords(data);
    });
    return () => {
      unsubFixtures();
      unsubSimDate();
      unsubAttendance();
    };
  }, []);

  // Sync initialLeague if prop changes
  useEffect(() => {
    if (initialLeague) {
      setSelectedLeague(initialLeague);
    }
  }, [initialLeague]);

  const availableMonths = useMemo(() => {
    const names = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const map = new Map<string,string>();
    fixtures.filter(f => f.league === selectedLeague && f.matchDate).forEach(f => {
      const d = new Date(f.matchDate);
      if (!isNaN(d.getTime())) {
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        map.set(key, `${names[d.getMonth()]} ${d.getFullYear()+543}`);
      }
    });
    return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([key,label])=>({key,label}));
  }, [fixtures, selectedLeague]);

  useEffect(() => {
    if (!availableMonths.some(m => m.key === selectedMonth)) setSelectedMonth(availableMonths[0]?.key || '');
  }, [availableMonths, selectedMonth]);

  const displayedMatches = useMemo(() => fixtures
    .filter(f => f.league === selectedLeague)
    .filter(f => !selectedMonth || (f.matchDate || '').startsWith(selectedMonth))
    .sort((a,b) => (a.matchDate || '').localeCompare(b.matchDate || '') || (a.matchTime || '').localeCompare(b.matchTime || '')),
    [fixtures, selectedLeague, selectedMonth]);

  // Attendance & score of a match = the record imported from Excel for the SAME league and the SAME two clubs
  // (compared by official club name). If there is no record, nothing is shown: no estimated / simulated numbers.
  const officialPairKey = (lg: LeagueType, home: string, away: string) =>
    `${lg}|${(resolveOfficialClubName(home, lg) || home).replace(/\s+/g, '').toLowerCase()}|${(resolveOfficialClubName(away, lg) || away).replace(/\s+/g, '').toLowerCase()}`;

  const attendanceByPair = useMemo(() => {
    const map = new Map<string, StadiumAttendanceRecord>();
    attendanceRecords.forEach(r => map.set(officialPairKey(r.league, r.homeTeam, r.awayTeam), r));
    return map;
  }, [attendanceRecords]);

  const getAttendanceForMatch = (match: FixtureItem) => {
    const found = attendanceByPair.get(officialPairKey(match.league, match.homeTeam, match.awayTeam));

    let score = found?.score || '';
    let homeScore: number | undefined = found?.homeScore;
    let awayScore: number | undefined = found?.awayScore;

    // Parse score string if homeScore/awayScore are not directly stored
    if ((homeScore === undefined || awayScore === undefined) && score) {
      const parts = score.match(/(\d+)\s*[-:]\s*(\d+)/);
      if (parts) {
        if (homeScore === undefined) homeScore = parseInt(parts[1], 10);
        if (awayScore === undefined) awayScore = parseInt(parts[2], 10);
      }
    }
    if (homeScore !== undefined && awayScore !== undefined && !score) {
      score = `${homeScore} - ${awayScore}`;
    }

    const attendance: number | null = found ? found.attendance : null;
    const capacity: number | null = found && found.capacity && found.capacity > 0 ? found.capacity : null;
    const occupancyRate: number | null =
      attendance !== null && capacity ? parseFloat(((attendance / capacity) * 100).toFixed(1)) : null;

    return {
      attendance,
      capacity,
      occupancyRate,
      score,
      homeScore,
      awayScore,
      province: found?.province || '',
      foundRecord: found,
    };
  };

  // Handle saving edited attendance and score (No capacity per user request)
  const handleSaveAttendance = async () => {
    if (!editingMatch) return;
    const editedFixture = displayedMatches.find(m => m.id === editingMatch.id);
    const existingRec = attendanceRecords.find(r => r.id === editingMatch.id);

    let finalScore = editingMatch.score;
    if (editingMatch.homeScore !== undefined && editingMatch.awayScore !== undefined) {
      finalScore = `${editingMatch.homeScore} - ${editingMatch.awayScore}`;
    }

    const updatedRecord: StadiumAttendanceRecord = {
      id: editingMatch.id,
      league: selectedLeague,
      matchWeek: editedFixture?.matchWeek ?? 0,
      matchDate: editedFixture?.matchDate || '',
      homeTeam: editingMatch.homeTeam,
      awayTeam: editingMatch.awayTeam,
      stadium: displayedMatches.find(m => m.id === editingMatch.id)?.stadium || '',
      attendance: editingMatch.attendance,
      capacity: existingRec?.capacity || 0,
      occupancyRate: 0,
      homeScore: editingMatch.homeScore,
      awayScore: editingMatch.awayScore,
      score: finalScore,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.email || 'Admin',
    };

    await saveAttendanceRecords([updatedRecord], 'merge', currentUser?.email || 'Admin');
    setEditingMatch(null);
    setToastMessage('✅ อัปเดตผลการแข่งขันและยอดผู้ชมเรียบร้อยแล้ว');
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Handle opening Excel Upload for a specific league (Item 3)
  const handleOpenLeagueUpload = (league: LeagueType) => {
    setTargetUploadLeague(league);
    setImportSummary(null);
    setIsUploadModalOpen(true);
  };

  // Process Excel File (used by both file input and drag-and-drop)
  const processExcelFile = async (file: File, league: LeagueType) => {
    if (!file) return;
    setIsParsing(true);
    setTargetUploadLeague(league);
    setIsUploadModalOpen(true);
    try {
      const summary = await parseAttendanceExcel(file, league);
      setImportSummary(summary);
    } catch (err: any) {
      alert(`ไม่สามารถประมวลผลไฟล์ Excel ได้: ${err.message || err}`);
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Excel file upload via input
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processExcelFile(file, targetUploadLeague);
    }
  };

  const handleConfirmImport = async () => {
    if (!importSummary || importSummary.validRows === 0) return;
    await saveAttendanceRecordsForLeague(importSummary.parsedRecords, targetUploadLeague, 'merge', currentUser?.email || 'User');
    setSelectedLeague(targetUploadLeague);
    setToastMessage(`✅ นำเข้าข้อมูลสำเร็จ: ผลคะแนนและยอดผู้ชม ${targetUploadLeague} จำนวน ${importSummary.validRows} แมตช์`);
    setTimeout(() => setToastMessage(null), 4500);
    setIsUploadModalOpen(false);
    setImportSummary(null);
  };

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden bg-gradient-to-b from-[#e6f7f9] via-white to-[#f0fbf7] text-slate-800 select-none pb-24">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Full-Page Drag & Drop Overlay for Admin (Item 7) */}
      {currentUser?.role === 'admin' && isPageDragging && (
        <div 
          onDragOver={(e) => { 
            e.preventDefault(); 
            e.stopPropagation(); 
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(e) => { 
            e.preventDefault(); 
            e.stopPropagation(); 
            if (e.currentTarget === e.target) {
              setIsPageDragging(false); 
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsPageDragging(false);
            const file = e.dataTransfer?.files?.[0];
            if (file) {
              processExcelFile(file, selectedLeague);
            }
          }}
          className="fixed inset-0 z-50 bg-emerald-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-white animate-in fade-in cursor-copy"
        >
          <div className="p-10 rounded-3xl border-4 border-dashed border-emerald-400 bg-emerald-900/80 max-w-lg text-center space-y-4 shadow-2xl pointer-events-none">
            <FileSpreadsheet className="w-16 h-16 text-emerald-300 mx-auto animate-bounce" />
            <h3 className="text-2xl font-black text-white">
              วางไฟล์ Excel ที่นี่
            </h3>
            <p className="text-sm text-emerald-200">
              เพื่ออัปเดตผลการแข่งขันและยอดผู้ชมสำหรับ <strong>{selectedLeague}</strong> ทันที
            </p>
          </div>
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

      {/* Top Header Bar: "หน้ายอดผู้ชมการแข่งขัน" on left + Hub Back Button */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 flex items-center justify-between gap-4 flex-wrap">
        {/* Left Side: Mockup Title "หน้ายอดผู้ชมการแข่งขัน" */}
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">
            หน้ายอดผู้ชมการแข่งขัน
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

        {/* Right Side: Quick League Switcher & Admin Excel Upload Buttons */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {/* 3 Separate Buttons for updating Excel: ADMIN ONLY ("แถบอัปเดตข้อมูลไม่อยากให้ User เห็น ปรับหน่อย") */}
          {currentUser?.role === 'admin' && (
            <div className="flex items-center bg-white/90 backdrop-blur-md p-1 rounded-2xl border border-slate-300 shadow-2xs gap-1">
              <span className="text-[11px] font-black text-slate-500 pl-2 pr-1 hidden xl:inline">
                อัปเดต Excel:
              </span>
              {/* L1 Excel Button */}
              <button
                type="button"
                onClick={() => handleOpenLeagueUpload('League 1')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-2xs cursor-pointer transition-all hover:scale-105 active:scale-95"
                title="อัปเดตไฟล์ Excel ผลคะแนนและยอดผู้ชมสำหรับ League 1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>อัปเดต League 1</span>
              </button>

              {/* L2 Excel Button */}
              <button
                type="button"
                onClick={() => handleOpenLeagueUpload('League 2')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-2xs cursor-pointer transition-all hover:scale-105 active:scale-95"
                title="อัปเดตไฟล์ Excel ผลคะแนนและยอดผู้ชมสำหรับ League 2"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>อัปเดต League 2</span>
              </button>

              {/* L3 Excel Button */}
              <button
                type="button"
                onClick={() => handleOpenLeagueUpload('League 3')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-2xs cursor-pointer transition-all hover:scale-105 active:scale-95"
                title="อัปเดตไฟล์ Excel ผลคะแนนและยอดผู้ชมสำหรับ League 3"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>อัปเดต League 3</span>
              </button>
            </div>
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

          {/* Admin Dashboard shortcut if admin */}
          {currentUser?.role === 'admin' && onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>แดชบอร์ดแอดมิน</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Center Stage (Mockup 2 Exact Design) */}
      <main className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 space-y-6">
        <div className="flex items-center justify-center gap-2">
          <label htmlFor="attendance-month" className="text-xs font-black text-slate-700">เลือกเดือน</label>
          <select id="attendance-month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold">
            {availableMonths.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        {/* Center Official League Emblem */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-36 h-44 sm:w-44 sm:h-52 flex items-center justify-center transition-transform hover:scale-105 drop-shadow-xl">
            <LeagueBadge league={selectedLeague} size="xl" />
          </div>

          {/* Title: ยอดผู้ชมการแข่งขัน แมตช์วันที่ 9-15 ต.ค.2569 (เป๊ะเท่ากันทั้ง 3 ลีก) */}
          <div className="space-y-1">
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
              ยอดผู้ชมการแข่งขัน {selectedMonth ? (availableMonths.find(m => m.key === selectedMonth)?.label || selectedMonth) : ''}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-slate-500">
              ผลการแข่งขันและสถิติยอดผู้ชมในสนามจริง อัปเดตจากไฟล์ Excel ของระบบ
            </p>
          </div>
        </div>

        {/* Admin Drag & Drop Quick Upload Banner (เฉพาะ Admin เท่านั้น ไม่แสดงให้ User เห็น) */}
        {currentUser?.role === 'admin' && (
          <div
            onClick={() => handleOpenLeagueUpload(selectedLeague)}
            onDragOver={(e) => {
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer?.files?.[0];
              if (file) {
                processExcelFile(file, selectedLeague);
              }
            }}
            className="p-3.5 sm:p-4 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50/80 hover:bg-emerald-100/80 text-emerald-950 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs group"
            title={`ลากไฟล์ Excel (${selectedLeague}) มาวางที่นี่เพื่ออัปเดตยอดผู้ชม`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs sm:text-sm font-bold text-emerald-950">
                  อัปเดตยอดผู้ชม ({selectedLeague}): ลากไฟล์ Excel มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์
                </p>
                <p className="text-[11px] text-emerald-700">
                  อัปเดตผลคะแนนและยอดผู้ชมในสนามจริง (แยกอัปเดตรายลีกได้ที่ปุ่มด้านบน)
                </p>
              </div>
            </div>
            <button
              type="button"
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shrink-0 shadow-2xs pointer-events-none"
            >
              เลือกไฟล์ Excel
            </button>
          </div>
        )}

        {/* Empty State */}
        {displayedMatches.length === 0 && (
          <div className="p-12 text-center bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <Calendar className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">
              ไม่มีโปรแกรมการแข่งขันในเดือนที่เลือกสำหรับ {selectedLeague}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              อาจเป็นสัปดาห์พักเบรกทีมชาติหรือยังไม่มีโปรแกรมในระบบ ท่านสามารถเลือกลีกอื่นด้านบนเพื่อดูยอดผู้ชม
            </p>
          </div>
        )}

        {/* Matches List: Exact Mockup 2 Layout */}
        <div className="space-y-10 sm:space-y-12 pt-4">
          {displayedMatches.map((match) => {
            const att = getAttendanceForMatch(match);
            const isHigh = att.attendance !== null && att.attendance >= 10000;

            const hasHomeScore = att.homeScore !== undefined && att.homeScore !== null;
            const hasAwayScore = att.awayScore !== undefined && att.awayScore !== null;

            const displayHomeScore = hasHomeScore 
              ? att.homeScore 
              : (att.score && att.score.includes('-') ? att.score.split('-')[0]?.trim() : '-');

            const displayAwayScore = hasAwayScore 
              ? att.awayScore 
              : (att.score && att.score.includes('-') ? att.score.split('-')[1]?.trim() : '-');

            const hasRealScore = (hasHomeScore && hasAwayScore) || (att.score && att.score.includes('-'));

            return (
              <div 
                key={match.id}
                id={`clean-attendance-card-${match.id}`}
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

                {/* Top-Right Tab: "สถิติยอดผู้ชมสนามจริง" (Exact Mockup 2) */}
                <div className="absolute -top-4 right-0 z-10 flex items-center gap-1.5">
                  <div className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1 rounded-t-lg border-t border-x border-slate-300 shadow-2xs flex items-center gap-1.5 transition-colors">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    <span>สถิติยอดผู้ชมสนามจริง</span>
                    {isHigh && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 text-[10px] font-black flex items-center gap-0.5">
                        <Flame className="w-2.5 h-2.5 text-rose-600" /> คนดูแน่น
                      </span>
                    )}
                  </div>

                  {/* Admin Edit Button */}
                  {currentUser?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => setEditingMatch({
                        id: match.id,
                        homeTeam: match.homeTeam,
                        awayTeam: match.awayTeam,
                        attendance: att.attendance ?? 0,
                        homeScore: att.homeScore,
                        awayScore: att.awayScore,
                        score: att.score || '',
                      })}
                      className="bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold px-2 py-1 rounded-t-lg border-t border-x border-amber-300 shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
                      title="แก้ไขผลการแข่งขัน (Home Score, Away Score) หรือยอดผู้ชม (สำหรับ Admin)"
                    >
                      <Edit3 className="w-3 h-3 text-amber-700" />
                      <span>แก้ไขผลบอล</span>
                    </button>
                  )}
                </div>

                {/* Center Match Banner: Home Team - Crest - [ Home Score ] : [ Away Score ] - Crest - Away Team */}
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

                  {/* Match Result Display: [ Home Score ] : [ Away Score ] from Excel */}
                  <div className="flex flex-col items-center justify-center shrink-0 px-1 sm:px-2">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {/* Home Score (คะแนนทีมเหย้า จากคอลัมน์ Home Score) */}
                      <span 
                        className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl bg-[#ff0033] text-white font-black text-base sm:text-2xl flex items-center justify-center shadow-md tracking-tight transition-transform hover:scale-105"
                        title={`คะแนนทีมเหย้า (${match.homeTeam}): ${displayHomeScore} (จากคอลัมน์ Home Score ใน Excel)`}
                      >
                        {displayHomeScore}
                      </span>

                      {/* Colon Separator */}
                      <span className="text-[#ff0033] font-black text-xl sm:text-3xl">:</span>

                      {/* Away Score (คะแนนทีมเยือน จากคอลัมน์ Away Score) */}
                      <span 
                        className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl bg-[#ff0033] text-white font-black text-base sm:text-2xl flex items-center justify-center shadow-md tracking-tight transition-transform hover:scale-105"
                        title={`คะแนนทีมเยือน (${match.awayTeam}): ${displayAwayScore} (จากคอลัมน์ Away Score ใน Excel)`}
                      >
                        {displayAwayScore}
                      </span>
                    </div>

                    {/* Score Label Tag */}
                    <span className="text-[10px] sm:text-[11px] font-black text-[#ff0033] mt-1 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      {hasRealScore ? 'ผลการแข่งขัน' : 'ผลการแข่งขัน'}
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

                {/* Attendance Info Rounded Box (User Request: ไม่ต้องมีช่องความจุสนาม เพราะในไฟล์ Excel ไม่มีความจุสนาม) */}
                <div className="rounded-2xl border-2 border-slate-800 bg-white overflow-hidden shadow-2xs max-w-xl mx-auto w-full">
                  <div className="p-3.5 sm:p-4 text-center flex items-center justify-center gap-2">
                    <span className="text-xs sm:text-base font-bold text-[#ff0033]">
                      ยอดผู้ชมในสนาม:
                    </span>
                    <span className="text-sm sm:text-lg font-black text-[#ff0033]">
                      {att.attendance !== null ? `${att.attendance.toLocaleString()} คน` : 'ยังไม่มีข้อมูลยอดผู้ชมในไฟล์ Excel'}
                    </span>
                  </div>
                </div>

                {/* Bottom Highlight Box */}
                <div className="flex items-center justify-center pt-1">
                  <div className="px-6 sm:px-10 py-2 rounded-2xl border-2 border-slate-800 bg-white text-center shadow-2xs flex items-center justify-center gap-2">
                    <span className="text-xs sm:text-sm font-extrabold text-slate-800 tracking-wide">
                      {hasRealScore ? `ผลการแข่งขัน: ${match.homeTeam} ${displayHomeScore} - ${displayAwayScore} ${match.awayTeam}` : 'ยังไม่มีผลการแข่งขันในไฟล์ Excel'}
                      {att.attendance !== null ? ` • ยอดผู้ชม ${att.attendance.toLocaleString()} คน` : ''}
                      {isHigh ? ' 🔥 (ผู้ชมหนาแน่น)' : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Excel Upload Modal: นำเข้าไฟล์ Excel แยกเป็น 3 ลีก (Item 3) */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-2xl w-full border border-slate-200 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold ${
                  targetUploadLeague === 'League 1' ? 'bg-rose-600' :
                  targetUploadLeague === 'League 2' ? 'bg-blue-600' : 'bg-emerald-600'
                }`}>
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    อัปเดตไฟล์ Excel ยอดผู้ชม: {targetUploadLeague}
                  </h3>
                  <p className="text-xs text-slate-500">
                    ระบบจะอ่านผลบอลจากคอลัมน์ <strong>Home Score</strong>, <strong>Away Score</strong> และยอดผู้ชมจากคอลัมน์ <strong>Audience</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setImportSummary(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target League Selector inside Modal */}
            <div className="flex items-center gap-2 p-2 rounded-2xl bg-slate-100 border border-slate-200">
              <span className="text-xs font-bold text-slate-600 pl-2">เลือกลีกเป้าหมาย:</span>
              {(['League 1', 'League 2', 'League 3'] as LeagueType[]).map((lg) => (
                <button
                  key={lg}
                  type="button"
                  onClick={() => {
                    setTargetUploadLeague(lg);
                    setImportSummary(null);
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    targetUploadLeague === lg
                      ? (lg === 'League 1' ? 'bg-rose-600 text-white shadow-xs' :
                         lg === 'League 2' ? 'bg-blue-600 text-white shadow-xs' : 'bg-emerald-600 text-white shadow-xs')
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  {lg}
                </button>
              ))}
            </div>

            {/* Upload Dropzone */}
            {!importSummary && (
              <div className="space-y-4">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDropzoneDragging(true);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDropzoneDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDropzoneDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDropzoneDragging(false);
                    const file = e.dataTransfer?.files?.[0];
                    if (file) {
                      processExcelFile(file, targetUploadLeague);
                    }
                  }}
                  className={`p-8 border-2 border-dashed rounded-3xl text-center cursor-pointer transition-all space-y-3 ${
                    isDropzoneDragging 
                      ? 'border-emerald-600 bg-emerald-100/90 scale-[1.02] shadow-xl ring-4 ring-emerald-300'
                      : 'border-emerald-300 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50'
                  }`}
                >
                  <Upload className={`w-10 h-10 mx-auto transition-transform ${isDropzoneDragging ? 'text-emerald-700 scale-125 animate-bounce' : 'text-emerald-600'}`} />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-800">
                      {isDropzoneDragging ? 'ปล่อยไฟล์ Excel ที่นี่เพื่ออัปเดตทันที!' : `ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์ Excel สำหรับ ${targetUploadLeague}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      รองรับไฟล์ .xlsx, .xls, .csv (คอลัมน์ Home Team, <strong>Home Score</strong>, <strong>Away Score</strong>, Away Team, Audience / ยอดผู้ชม)
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {isParsing && (
                    <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-700">
                      <span className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
                      <span>กำลังอ่านข้อมูลจากไฟล์ Excel สำหรับ {targetUploadLeague}...</span>
                    </div>
                  )}
                </div>

                {/* Template Download Option */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
                  <div className="text-slate-600">
                    ดาวน์โหลดแม่แบบ Excel ที่มีคอลัมน์มาตรฐาน Home Score / Away Score ครบถ้วน
                  </div>
                  <button
                    type="button"
                    onClick={() => generateAttendanceExcelTemplate()}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold shrink-0 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>ดาวน์โหลดแม่แบบ Excel</span>
                  </button>
                </div>
              </div>
            )}

            {/* Import Summary & Preview */}
            {importSummary && (
              <div className="space-y-4 animate-in fade-in">
                {importSummary.validRows > 0 && (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        อ่านไฟล์ Excel {targetUploadLeague} สำเร็จ: พบข้อมูล {importSummary.validRows} รายการ
                      </span>
                      <span className="text-xs text-emerald-700 font-bold">
                        ยอดผู้ชมรวม: {importSummary.totalAttendance.toLocaleString()} คน
                      </span>
                    </div>
                  </div>
                )}
                {importSummary.errors && importSummary.errors.length > 0 && (
                  <div className={`rounded-xl border p-3 text-xs space-y-1 max-h-44 overflow-y-auto ${importSummary.validRows === 0 ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
                    <div className="font-bold">
                      {importSummary.validRows === 0 ? 'ไม่สามารถนำเข้าไฟล์นี้ได้' : `นำเข้าได้ ${importSummary.validRows} แมตช์ แต่มีรายการที่ต้องตรวจสอบ`}
                    </div>
                    {importSummary.errors.map((msg, i) => (
                      <div key={i}>• {msg}</div>
                    ))}
                  </div>
                )}

                {/* Preview Table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                      <tr>
                        <th className="p-2.5">ลีก</th>
                        <th className="p-2.5">ทีมเหย้า</th>
                        <th className="p-2.5 text-center text-red-600">Home Score</th>
                        <th className="p-2.5 text-center text-red-600">Away Score</th>
                        <th className="p-2.5">ทีมเยือน</th>
                        <th className="p-2.5 text-right">ยอดผู้ชม (คน)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importSummary.parsedRecords.slice(0, 15).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-semibold text-slate-500">{row.league}</td>
                          <td className="p-2.5 font-bold text-slate-900">{row.homeTeam}</td>
                          <td className="p-2.5 text-center font-black text-white">
                            <span className="px-2 py-0.5 rounded bg-red-600">
                              {row.homeScore !== undefined ? row.homeScore : '-'}
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-black text-white">
                            <span className="px-2 py-0.5 rounded bg-red-600">
                              {row.awayScore !== undefined ? row.awayScore : '-'}
                            </span>
                          </td>
                          <td className="p-2.5 font-bold text-slate-900">{row.awayTeam}</td>
                          <td className="p-2.5 text-right font-bold text-slate-700">{row.attendance.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {importSummary.parsedRecords.length > 15 && (
                  <p className="text-[11px] text-slate-400 text-right">
                    ... และอีก {importSummary.parsedRecords.length - 15} รายการ
                  </p>
                )}

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setImportSummary(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    เลือกไฟล์อื่น
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={importSummary.validRows === 0}
                    className="disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>ยืนยันบันทึกยอดผู้ชม {targetUploadLeague} ลงระบบ</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Quick Edit Attendance & Score Modal */}
      {editingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-red-600" />
                <h3 className="text-base font-black text-slate-900">แก้ไขข้อมูลผลบอล & สถิติผู้ชม</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingMatch(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl text-xs space-y-1">
              <div className="font-bold text-slate-800">{editingMatch.homeTeam} vs {editingMatch.awayTeam}</div>
              <div className="text-slate-500">ลีก: {selectedLeague}</div>
            </div>

            <div className="space-y-3">
              {/* Home Score & Away Score inputs */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-red-50/60 border border-red-100 rounded-2xl">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    คะแนนทีมเหย้า (Home Score):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingMatch.homeScore !== undefined ? editingMatch.homeScore : ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                      setEditingMatch({
                        ...editingMatch,
                        homeScore: isNaN(val as number) ? undefined : val,
                      });
                    }}
                    placeholder="เช่น 2"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    คะแนนทีมเยือน (Away Score):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingMatch.awayScore !== undefined ? editingMatch.awayScore : ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                      setEditingMatch({
                        ...editingMatch,
                        awayScore: isNaN(val as number) ? undefined : val,
                      });
                    }}
                    placeholder="เช่น 1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ยอดผู้ชมในสนาม (คน):</label>
                <input
                  type="number"
                  value={editingMatch.attendance}
                  onChange={(e) => setEditingMatch({ ...editingMatch, attendance: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingMatch(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveAttendance}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>บันทึกผลบอลและยอดผู้ชม</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
