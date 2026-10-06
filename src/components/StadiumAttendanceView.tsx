import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Users, 
  BarChart3, 
  Upload, 
  Download, 
  Trophy, 
  Flame, 
  Calendar, 
  MapPin, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  FileSpreadsheet, 
  ArrowUpDown, 
  Layers, 
  Sparkles, 
  ChevronRight, 
  X, 
  RotateCcw,
  TrendingUp,
  Shield,
  Ticket,
  Clock,
  Swords,
  Table as TableIcon,
  LayoutGrid,
  ArrowLeft
} from 'lucide-react';
import { LeagueType, StadiumAttendanceRecord, ClubAttendanceRanking, AttendanceImportSummary, UserProfile } from '../types';
import { ClubCrest } from './common/ClubCrest';
import { LeagueBadge } from './common/LeagueBadge';
import { 
  subscribeToAttendance, 
  getLastUpdatedAttendance, 
  parseAttendanceExcel, 
  saveAttendanceRecords, 
  saveAttendanceRecordsForLeague,
  resetAttendanceToInitial, 
  getClubAttendanceRankings, 
  generateAttendanceExcelTemplate, 
  exportAttendanceToExcel 
} from '../lib/attendanceService';

interface StadiumAttendanceViewProps {
  currentUser: UserProfile | null;
  selectedLeagueFilter: LeagueType | 'All';
  onBackToHub?: () => void;
}

export const StadiumAttendanceView: React.FC<StadiumAttendanceViewProps> = ({
  currentUser,
  selectedLeagueFilter: initialLeagueFilter,
  onBackToHub,
}) => {
  const [records, setRecords] = useState<StadiumAttendanceRecord[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<LeagueType | 'All'>(initialLeagueFilter);
  const [selectedWeek, setSelectedWeek] = useState<number | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<'attendance-desc' | 'date-desc' | 'occupancy-desc'>('attendance-desc');
  const [activeSubTab, setActiveSubTab] = useState<'matches' | 'table' | 'rankings'>('matches');

  // Excel Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [targetUploadLeague, setTargetUploadLeague] = useState<LeagueType | 'All'>('League 1');
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [importSummary, setImportSummary] = useState<AttendanceImportSummary | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [saveMode, setSaveMode] = useState<'merge' | 'replace'>('merge');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync with prop if it changes
  useEffect(() => {
    setSelectedLeague(initialLeagueFilter);
  }, [initialLeagueFilter]);

  // Subscribe to real-time attendance
  useEffect(() => {
    const unsub = subscribeToAttendance((data) => {
      setRecords(data);
    });
    return () => unsub();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // League match counts for summary
  const leagueCounts = useMemo(() => {
    return {
      'League 1': records.filter(r => r.league === 'League 1').length,
      'League 2': records.filter(r => r.league === 'League 2').length,
      'League 3': records.filter(r => r.league === 'League 3').length,
    };
  }, [records]);

  // Available Matchweeks in the records
  const availableWeeks = useMemo(() => {
    const weeksSet = new Set<number>();
    records.forEach(r => {
      if (r.matchWeek) weeksSet.add(r.matchWeek);
    });
    return Array.from(weeksSet).sort((a, b) => a - b);
  }, [records]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // League
      if (selectedLeague !== 'All' && r.league !== selectedLeague) {
        return false;
      }
      // Week
      if (selectedWeek !== 'All' && r.matchWeek !== selectedWeek) {
        return false;
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesClub = r.homeTeam.toLowerCase().includes(q) || r.awayTeam.toLowerCase().includes(q);
        const matchesStadium = r.stadium.toLowerCase().includes(q);
        const matchesProvince = (r.province || '').toLowerCase().includes(q);
        if (!matchesClub && !matchesStadium && !matchesProvince) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      if (sortOption === 'attendance-desc') {
        return b.attendance - a.attendance;
      }
      if (sortOption === 'occupancy-desc') {
        return (b.occupancyRate || 0) - (a.occupancyRate || 0);
      }
      // date-desc
      const dDiff = (b.matchDate || '').localeCompare(a.matchDate || '');
      if (dDiff !== 0) return dDiff;
      return (b.matchTime || '').localeCompare(a.matchTime || '');
    });
  }, [records, selectedLeague, selectedWeek, searchQuery, sortOption]);

  // Club Rankings
  const clubRankings = useMemo(() => {
    return getClubAttendanceRankings(records, selectedLeague);
  }, [records, selectedLeague]);

  // Summary Metrics for the current filter
  const metrics = useMemo(() => {
    const totalMatches = filteredRecords.length;
    const totalAttendance = filteredRecords.reduce((sum, r) => sum + r.attendance, 0);
    const avgAttendance = totalMatches > 0 ? Math.round(totalAttendance / totalMatches) : 0;

    // Highest match in this filter
    let highestMatch: StadiumAttendanceRecord | null = null;
    filteredRecords.forEach(r => {
      if (!highestMatch || r.attendance > highestMatch.attendance) {
        highestMatch = r;
      }
    });

    // Top Club in this filter
    const topClub = clubRankings.length > 0 ? clubRankings[0] : null;

    return {
      totalMatches,
      totalAttendance,
      avgAttendance,
      highestMatch,
      topClub,
    };
  }, [filteredRecords, clubRankings]);

  // Open modal targeting a specific league
  const handleOpenLeagueUpload = (league: LeagueType | 'All') => {
    setTargetUploadLeague(league);
    setImportSummary(null);
    setImportFile(null);
    setIsUploadModalOpen(true);
  };

  // Handle File Upload & Parsing
  const processUploadedFile = async (file: File) => {
    setIsParsing(true);
    setImportFile(file);
    try {
      const buffer = await file.arrayBuffer();
      const targetL = targetUploadLeague !== 'All' ? targetUploadLeague : undefined;
      const summary = await parseAttendanceExcel(buffer, targetL);
      setImportSummary(summary);
      if (summary.parsedRecords.length === 0) {
        showToast('⚠️ นำเข้าไม่ได้: ' + (summary.errors && summary.errors[0] ? summary.errors[0] : 'ไม่พบแถวข้อมูลที่อ่านได้ กรุณาตรวจสอบหัวตารางในไฟล์'));
      }
    } catch (err: any) {
      console.error(err);
      showToast('❌ เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: ' + (err.message || 'รูปแบบไม่ถูกต้อง'));
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processUploadedFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFile(e.target.files[0]);
    }
  };

  const handleSaveImportedData = async () => {
    if (!importSummary || importSummary.parsedRecords.length === 0) return;
    try {
      const updater = currentUser?.displayName || currentUser?.email || 'Admin';

      if (targetUploadLeague !== 'All') {
        // Save specifically to this league! Leaves other 2 leagues intact!
        await saveAttendanceRecordsForLeague(
          importSummary.parsedRecords,
          targetUploadLeague,
          saveMode,
          updater
        );
        showToast(`🎉 บันทึกข้อมูลสำเร็จ! อัปเดตสถิติผู้ชม ${targetUploadLeague} เรียบร้อยแล้ว ${importSummary.validRows} แมตช์`);
      } else {
        // Multi-league save
        await saveAttendanceRecords(
          importSummary.parsedRecords,
          saveMode,
          updater
        );
        showToast(`🎉 บันทึกข้อมูลสำเร็จ! ระบบดึงข้อมูลเรียบร้อยแล้ว ${importSummary.validRows} คู่`);
      }

      setIsUploadModalOpen(false);
      setImportSummary(null);
      setImportFile(null);
    } catch (err: any) {
      console.error(err);
      showToast('❌ ไม่สามารถบันทึกข้อมูลได้: ' + err.message);
    }
  };

  const handleResetSampleData = async () => {
    if (confirm('คุณต้องการรีเซ็ตข้อมูลสถิติยอดผู้ชมกลับเป็นค่าเริ่มต้นหรือไม่?')) {
      await resetAttendanceToInitial();
      showToast('🔄 รีเซ็ตข้อมูลสถิติผู้ชมกลับเป็นค่าเริ่มต้นแล้ว');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mockup 5 Top Header & League Emblem */}
      <div className="flex flex-col items-center text-center space-y-3 pt-2 pb-2">
        {onBackToHub && (
          <div className="w-full flex items-center justify-between pb-2">
            <button
              type="button"
              onClick={onBackToHub}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer hover:scale-105"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>← กลับสู่เมนูหลัก (Back to Menu)</span>
            </button>

            {/* League switcher tabs in header */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              {(['League 1', 'League 2', 'League 3'] as LeagueType[]).map(lg => (
                <button
                  key={lg}
                  type="button"
                  onClick={() => setSelectedLeague(lg)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    selectedLeague === lg ? 'bg-white text-slate-900 shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lg}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Official League Logo (Mockup 5) */}
        <LeagueBadge league={selectedLeague !== 'All' ? selectedLeague : 'League 1'} size="lg" />

        <h2 className="text-xl sm:text-2xl font-black text-slate-900">
          หน้ารายงานยอดผู้ชมสนาม ({selectedLeague !== 'All' ? selectedLeague : 'ทุกลีก'})
        </h2>
      </div>

      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden">
        {/* Tricolor accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-rose-500 to-blue-600" />
        
        {/* Decorative background glow */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-48 -bottom-16 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-gradient-to-r from-emerald-500/20 via-rose-500/20 to-blue-500/20 border border-slate-700 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 shadow-xs">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span>Thai League Stadium Attendance & Match Scores</span>
              </span>
              <span className="text-xs text-slate-400 font-normal">
                • {getLastUpdatedAttendance()}
              </span>
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <span>ยอดผู้ชมสนาม & Score การแข่งขัน</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
                สถิติแฟนบอล & สกอร์
              </span>
            </h1>
            
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              สถิติยอดผู้เข้าชมจริง (Audience) และผลการแข่งขัน (Score) ทุกสนามในไทยลีก อัปเดตรายสัปดาห์ 
              สำหรับวิเคราะห์สถิติทราฟฟิกแฟนบอลและผลการแข่งขันแต่ละสนาม
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {currentUser?.role === 'admin' && (
              <button
                id="btn-upload-attendance-excel"
                onClick={() => handleOpenLeagueUpload(selectedLeague !== 'All' ? selectedLeague : 'League 1')}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 flex items-center gap-2 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <Upload className="w-4 h-4" />
                <span>อัปเดตไฟล์ Excel สถิติผู้ชม</span>
              </button>
            )}

            <button
              id="btn-export-attendance-data"
              onClick={() => exportAttendanceToExcel(filteredRecords)}
              title="ส่งออกสถิติผู้ชมเป็น Excel"
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">ส่งออก Excel</span>
            </button>

            {currentUser?.role === 'admin' && (
              <button
                onClick={handleResetSampleData}
                title="รีเซ็ตสถิติผู้ชมกลับเป็นค่าเริ่มต้น"
                className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3 Dedicated League Upload Cards (เฉพาะ Admin ที่มีสิทธิ์อัปเดตไฟล์ Excel) */}
      {currentUser?.role === 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* League 1 Card (Red) */}
          <div className="bg-white rounded-2xl border-2 border-rose-200/80 p-4 shadow-xs relative overflow-hidden flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span>Thai League 1</span>
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {leagueCounts['League 1']} แมตช์ในระบบ
              </span>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900">สถิติผู้ชม Thai League 1 (1 ไฟล์)</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                รองรับคอลัมน์ Home Score, Away Score, และ Audience
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleOpenLeagueUpload('League 1')}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs shadow-rose-200"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>อัปเดตไฟล์ T1</span>
              </button>
              <button
                onClick={() => generateAttendanceExcelTemplate('League 1')}
                title="โหลดเทมเพลต Excel สำหรับ Thai League 1"
                className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* League 2 Card (Blue) */}
          <div className="bg-white rounded-2xl border-2 border-blue-200/80 p-4 shadow-xs relative overflow-hidden flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span>Thai League 2</span>
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {leagueCounts['League 2']} แมตช์ในระบบ
              </span>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900">สถิติผู้ชม Thai League 2 (1 ไฟล์)</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                รองรับคอลัมน์ Home Score, Away Score, และ Audience
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleOpenLeagueUpload('League 2')}
                className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs shadow-blue-200"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>อัปเดตไฟล์ T2</span>
              </button>
              <button
                onClick={() => generateAttendanceExcelTemplate('League 2')}
                title="โหลดเทมเพลต Excel สำหรับ Thai League 2"
                className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* League 3 Card (Green) */}
          <div className="bg-white rounded-2xl border-2 border-emerald-200/80 p-4 shadow-xs relative overflow-hidden flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Thai League 3</span>
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {leagueCounts['League 3']} แมตช์ในระบบ
              </span>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900">สถิติผู้ชม Thai League 3 (1 ไฟล์)</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                รองรับคอลัมน์ Home Score, Away Score, และ Audience
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleOpenLeagueUpload('League 3')}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs shadow-emerald-200"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>อัปเดตไฟล์ T3</span>
              </button>
              <button
                onClick={() => generateAttendanceExcelTemplate('League 3')}
                title="โหลดเทมเพลต Excel สำหรับ Thai League 3"
                className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Attendance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">ยอดผู้ชมสะสม (Audience)</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {metrics.totalAttendance.toLocaleString()} <span className="text-xs font-semibold text-slate-500">คน</span>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <span>คำนวณจาก</span>
            <strong className="text-slate-800">{metrics.totalMatches} แมตช์</strong>
            <span>ในการแข่งขันที่เลือก</span>
          </div>
        </div>

        {/* Card 2: Average Attendance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">ค่าเฉลี่ยผู้ชมต่อนัด</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700">
            {metrics.avgAttendance.toLocaleString()} <span className="text-xs font-semibold text-slate-500">คน / แมตช์</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>ความหนาแน่นแฟนบอลเฉลี่ย</span>
          </div>
        </div>

        {/* Card 3: Season Record Match */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">แมตช์ยอดผู้ชมสูงสุด</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          {metrics.highestMatch ? (
            <>
              <div className="text-2xl font-black text-rose-600">
                {metrics.highestMatch.attendance.toLocaleString()} <span className="text-xs font-semibold text-slate-500">คน</span>
              </div>
              <div className="text-[11px] text-slate-600 truncate font-semibold" title={`${metrics.highestMatch.homeTeam} vs ${metrics.highestMatch.awayTeam}`}>
                {metrics.highestMatch.homeTeam} {metrics.highestMatch.score ? `[${metrics.highestMatch.score}]` : 'vs'} {metrics.highestMatch.awayTeam}
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-400 py-2">- ไม่มีข้อมูล -</div>
          )}
        </div>

        {/* Card 4: Top Popular Club */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">สโมสรยอดนิยมอันดับ 1</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          {metrics.topClub ? (
            <>
              <div className="text-lg font-black text-slate-900 truncate" title={metrics.topClub.clubName}>
                {metrics.topClub.clubName}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                <span>เฉลี่ย <strong>{metrics.topClub.averageAttendance.toLocaleString()}</strong> คน</span>
                <span className="text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded font-bold text-[10px]">
                  สูงสุด {metrics.topClub.highestAttendance.toLocaleString()}
                </span>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-400 py-2">- ไม่มีข้อมูล -</div>
          )}
        </div>
      </div>

      {/* Main Filter & Navigation Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        {/* League Selector (3 Colors: Red, Blue, Green) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-1">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>เลือกลีก:</span>
            </span>

            {/* All */}
            <button
              onClick={() => setSelectedLeague('All')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedLeague === 'All'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ทุกลีก (All Leagues)
            </button>

            {/* League 1 (Red) */}
            <button
              onClick={() => setSelectedLeague('League 1')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedLeague === 'League 1'
                  ? 'bg-rose-600 text-white shadow-xs shadow-rose-200'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              <span>Thai League 1</span>
            </button>

            {/* League 2 (Blue) */}
            <button
              onClick={() => setSelectedLeague('League 2')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedLeague === 'League 2'
                  ? 'bg-blue-600 text-white shadow-xs shadow-blue-200'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              <span>Thai League 2</span>
            </button>

            {/* League 3 (Green) */}
            <button
              onClick={() => setSelectedLeague('League 3')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedLeague === 'League 3'
                  ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-200'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Thai League 3</span>
            </button>
          </div>

          {/* View Mode Toggle: Cards vs Table vs Rankings */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-end sm:self-auto">
            <button
              onClick={() => setActiveSubTab('matches')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'matches'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>การ์ดแมตช์</span>
            </button>
            <button
              onClick={() => setActiveSubTab('table')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>ตารางสถิติ (Excel View)</span>
            </button>
            <button
              onClick={() => setActiveSubTab('rankings')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'rankings'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>จัดอันดับแฟนบอลแน่น</span>
            </button>
          </div>
        </div>

        {/* Secondary Filter Row: Matchweek + Search + Sort */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
          {/* Matchweek Filter */}
          <div className="sm:col-span-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value === 'All' ? 'All' : parseInt(e.target.value, 10))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All">ทุกสัปดาห์ (All Matchweeks)</option>
              {availableWeeks.map(w => (
                <option key={w} value={w}>สัปดาห์ที่ {w} (Matchweek {w})</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาชื่อทีมเหย้า, ทีมเยือน, สถานที่แข่งขัน, จังหวัด..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort By */}
          <div className="sm:col-span-4 flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={sortOption}
              onChange={(e: any) => setSortOption(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="attendance-desc">เรียง: ยอดผู้ชม (Audience) มากสุด</option>
              <option value="occupancy-desc">เรียง: อัตราครองความจุ (%) สูงสุด</option>
              <option value="date-desc">เรียง: วันแข่งขันล่าสุด</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content View 1: Match-by-Match Cards with Score & Venue */}
      {activeSubTab === 'matches' && (
        <div className="space-y-4">
          {/* Official League Badge Header Card (Mockup 5 Requirement) */}
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
                    สถิติคะแนนผลการแข่งขันและยอดผู้ชมสนาม (Audience)
                  </p>
                </div>
              </div>

              <div className="text-right sm:self-center">
                <span className="text-xs font-semibold text-slate-400 block">สถิติในระบบ</span>
                <span className="text-xl sm:text-2xl font-black text-white">
                  {filteredRecords.length} แมตช์
                </span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              พบสถิติทั้งหมด <strong className="text-slate-800 font-bold">{filteredRecords.length}</strong> แมตช์
              {selectedLeague !== 'All' && ` (${selectedLeague})`}
              {selectedWeek !== 'All' && ` • สัปดาห์ที่ ${selectedWeek}`}
            </span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              แสดง วัน-เวลา, ทีมเหย้า-เยือน, Score (Home/Away), สถานที่แข่งขัน และ Audience
            </span>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">ไม่พบข้อมูลสถิติที่ตรงกับเงื่อนไขการค้นหา</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                ลองปรับเปลี่ยนสัปดาห์การแข่งขัน หรือกด "อัปเดตไฟล์ Excel สถิติผู้ชม" เพื่อนำเข้าข้อมูลสถิติสัปดาห์ใหม่
              </p>
              <button
                onClick={() => {
                  setSelectedLeague('All');
                  setSelectedWeek('All');
                  setSearchQuery('');
                }}
                className="mt-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredRecords.map((match) => {
                const isHighAttendance = match.attendance >= 10000;
                const isMediumHigh = match.attendance >= 4000 && match.attendance < 10000;
                const isPackedOccupancy = (match.occupancyRate || 0) >= 80;

                const leagueColor = match.league === 'League 1' 
                  ? 'bg-rose-50 text-rose-700 border-rose-200' 
                  : match.league === 'League 2' 
                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200';

                // Format Home Score vs Away Score
                const hasScore = match.score !== undefined || (match.homeScore !== undefined && match.awayScore !== undefined);
                const displayHomeScore = match.homeScore !== undefined ? match.homeScore : (match.score ? match.score.split('-')[0]?.trim() : '-');
                const displayAwayScore = match.awayScore !== undefined ? match.awayScore : (match.score ? match.score.split('-')[1]?.trim() : '-');

                return (
                  <div
                    key={match.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 group relative"
                  >
                    {/* Card Top: Matchweek & League badges */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${leagueColor}`}>
                          {match.league}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold">
                          MW {match.matchWeek}
                        </span>
                      </div>

                      {/* Heat badge */}
                      {isHighAttendance ? (
                        <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 text-[11px] font-bold flex items-center gap-1 border border-rose-200 animate-pulse">
                          <Flame className="w-3 h-3 text-rose-600" />
                          <span>ผู้ชมแน่นพิเศษ</span>
                        </span>
                      ) : isPackedOccupancy ? (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold flex items-center gap-1 border border-amber-200">
                          <Sparkles className="w-3 h-3 text-amber-600" />
                          <span>คนดูเต็มสนาม</span>
                        </span>
                      ) : isMediumHigh ? (
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-emerald-600" />
                          <span>ยอดดี</span>
                        </span>
                      ) : null}
                    </div>

                    {/* Requirement 1 & 3: Match Teams & Scoreboard (Home Score & Away Score) */}
                    <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-100 space-y-2.5">
                      <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                          <span>ทีมเหย้า (Home)</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span>ทีมเยือน (Away)</span>
                          <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                        </span>
                      </div>

                      {/* Team names & Red Score Boxes matching Mockup 5 */}
                      <div className="flex items-center justify-center gap-3 sm:gap-4 my-2 flex-wrap">
                        {/* Home Team */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-black text-slate-900 text-right">{match.homeTeam}</span>
                          <ClubCrest clubName={match.homeTeam} league={match.league} size="md" showTooltip />
                        </div>

                        {/* Score Display (Red Square Boxes [ 2 ] : [ 1 ] matching Mockup 5) */}
                        <div className="flex items-center gap-1.5 px-2">
                          {hasScore ? (
                            <div className="flex items-center gap-1">
                              <span className="w-8 h-8 rounded-lg bg-red-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                                {displayHomeScore}
                              </span>
                              <span className="text-red-600 font-black text-base">:</span>
                              <span className="w-8 h-8 rounded-lg bg-red-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                                {displayAwayScore}
                              </span>
                            </div>
                          ) : (
                            <span className="px-2.5 py-1 rounded-md bg-slate-200 text-slate-600 font-black text-xs">
                              VS
                            </span>
                          )}
                        </div>

                        {/* Away Team */}
                        <div className="flex items-center gap-2">
                          <ClubCrest clubName={match.awayTeam} league={match.league} size="md" showTooltip />
                          <span className="text-xs sm:text-sm font-black text-slate-900 text-left">{match.awayTeam}</span>
                        </div>
                      </div>

                      {/* Prominent Red Audience Counter (Mockup 5) */}
                      {match.attendance > 0 && (
                        <div className="text-center my-1.5">
                          <span className="text-sm sm:text-base font-black text-red-600 tracking-wide">
                            Audience : {match.attendance.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Venue (สถานที่แข่งขัน) & Date */}
                    <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-slate-800">สถานที่แข่งขัน: </span>
                          <span className="text-slate-700 font-semibold" title={match.stadium}>
                            {match.stadium} {match.province ? `(${match.province})` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Date & Time */}
                      <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{match.matchDate}</span>
                        </span>
                        {match.matchTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{match.matchTime} น.</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Requirement 4: Audience (จำนวนผู้เข้าชม) Highlight Box */}
                    <div className="bg-gradient-to-br from-slate-50 to-emerald-50/40 rounded-2xl p-3.5 border border-slate-200/80 space-y-2">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-700">Audience (จำนวนผู้เข้าชม)</div>
                          <div className="text-[10px] text-slate-400">สถิติคนเข้าดูจริงหน้าสนาม</div>
                        </div>
                        <div className="text-2xl font-black text-slate-900 text-right">
                          {match.attendance.toLocaleString()} <span className="text-xs font-semibold text-slate-500">คน</span>
                        </div>
                      </div>

                      {/* Capacity progress bar */}
                      {match.capacity && match.capacity > 0 ? (
                        <div className="space-y-1 pt-1">
                          <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                isHighAttendance ? 'bg-gradient-to-r from-rose-500 to-rose-600' :
                                isMediumHigh ? 'bg-gradient-to-r from-emerald-500 to-teal-600' :
                                'bg-blue-500'
                              }`}
                              style={{ width: `${Math.min(100, match.occupancyRate || 0)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                            <span>ความจุ {match.capacity.toLocaleString()} ที่นั่ง</span>
                            <span className="font-bold text-slate-700">{match.occupancyRate}% ความจุ</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Content View 2: Detailed Table View (Excel View) */}
      {activeSubTab === 'table' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              ตารางสถิติผู้เข้าชมแบบละเอียด ({filteredRecords.length} แถวข้อมูล)
            </span>
            <span className="text-[11px] text-slate-400">
              คอลัมน์มาตรฐาน: วัน, เวลา, ทีมเหย้า, Home Score, Away Score, ทีมเยือน, สถานที่แข่งขัน, Audience
            </span>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-white font-semibold">
                  <tr>
                    <th className="py-3.5 px-3 text-center">สัปดาห์</th>
                    <th className="py-3.5 px-3 text-center">ลีก</th>
                    <th className="py-3.5 px-3">วันที่</th>
                    <th className="py-3.5 px-2">เวลา</th>
                    <th className="py-3.5 px-3">ชื่อทีมเหย้า</th>
                    <th className="py-3.5 px-2.5 text-center bg-slate-800 text-emerald-300">Home Score</th>
                    <th className="py-3.5 px-2.5 text-center bg-slate-800 text-blue-300">Away Score</th>
                    <th className="py-3.5 px-3">ชื่อทีมเยือน</th>
                    <th className="py-3.5 px-4">สถานที่แข่งขัน (Stadium)</th>
                    <th className="py-3.5 px-4 text-right bg-slate-800/80 text-amber-300">Audience (ผู้เข้าชม)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredRecords.map((m, idx) => {
                    const displayHomeScore = m.homeScore !== undefined ? m.homeScore : (m.score ? m.score.split('-')[0]?.trim() : '-');
                    const displayAwayScore = m.awayScore !== undefined ? m.awayScore : (m.score ? m.score.split('-')[1]?.trim() : '-');
                    
                    return (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-3 text-center font-bold text-slate-500">
                          W{m.matchWeek}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.league === 'League 1' ? 'bg-rose-100 text-rose-800' :
                            m.league === 'League 2' ? 'bg-blue-100 text-blue-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {m.league === 'League 1' ? 'T1' : m.league === 'League 2' ? 'T2' : 'T3'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
                          {m.matchDate}
                        </td>
                        <td className="py-3.5 px-2 text-slate-500 whitespace-nowrap">
                          {m.matchTime || '-'}
                        </td>
                        <td className="py-3.5 px-3 font-bold text-slate-900">
                          {m.homeTeam}
                        </td>
                        <td className="py-3.5 px-2.5 text-center font-black text-sm bg-emerald-50/50 text-emerald-800">
                          {displayHomeScore}
                        </td>
                        <td className="py-3.5 px-2.5 text-center font-black text-sm bg-blue-50/50 text-blue-800">
                          {displayAwayScore}
                        </td>
                        <td className="py-3.5 px-3 font-bold text-slate-900">
                          {m.awayTeam}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">
                          <div className="font-semibold text-slate-800">{m.stadium}</div>
                          {m.province && <div className="text-[10px] text-slate-400">{m.province}</div>}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-sm bg-amber-50/40 text-slate-900 whitespace-nowrap">
                          {m.attendance.toLocaleString()} คน
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Content View 3: Club Attendance Rankings */}
      {activeSubTab === 'rankings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              จัดอันดับสโมสรที่มีแฟนบอลเข้าชมเฉลี่ยสูงสุด <strong>{clubRankings.length}</strong> ทีม
              {selectedLeague !== 'All' ? ` (${selectedLeague})` : ' (รวมทุกลีก)'}
            </span>
            <span className="text-[11px] text-slate-400">
              วิเคราะห์จากสถิติเกมเหย้า (Home Matches) ในฤดูกาล
            </span>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4 w-16 text-center">อันดับ</th>
                    <th className="py-3.5 px-4">สโมสร & สถานที่แข่งขัน</th>
                    <th className="py-3.5 px-3 text-center">ลีก</th>
                    <th className="py-3.5 px-3 text-center">จำนวนนัดในบ้าน</th>
                    <th className="py-3.5 px-4 text-right">ยอดรวมทั้งหมด</th>
                    <th className="py-3.5 px-4 text-right">ผู้ชมเฉลี่ยต่อนัด</th>
                    <th className="py-3.5 px-4 text-right">นัดที่มีผู้ชมสูงสุด</th>
                    <th className="py-3.5 px-4 text-center">ระดับความหนาแน่นแฟนบอล</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {clubRankings.map((club, idx) => {
                    const rank = idx + 1;
                    const maxAvg = clubRankings[0]?.averageAttendance || 1;
                    const barWidth = Math.round((club.averageAttendance / maxAvg) * 100);

                    return (
                      <tr key={club.clubName} className="hover:bg-slate-50/80 transition-colors">
                        {/* Rank */}
                        <td className="py-4 px-4 text-center font-bold">
                          {rank === 1 ? (
                            <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 inline-flex items-center justify-center font-black shadow-xs">
                              🥇
                            </span>
                          ) : rank === 2 ? (
                            <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-800 inline-flex items-center justify-center font-black">
                              🥈
                            </span>
                          ) : rank === 3 ? (
                            <span className="w-7 h-7 rounded-full bg-amber-50 text-amber-900 border border-amber-300 inline-flex items-center justify-center font-black">
                              🥉
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs font-semibold">#{rank}</span>
                          )}
                        </td>

                        {/* Club & Stadium */}
                        <td className="py-4 px-4">
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <span>{club.clubName}</span>
                          </div>
                          <div className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{club.stadium} {club.province ? `• ${club.province}` : ''}</span>
                          </div>
                        </td>

                        {/* League */}
                        <td className="py-4 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                            club.league === 'League 1' ? 'bg-rose-100 text-rose-800' :
                            club.league === 'League 2' ? 'bg-blue-100 text-blue-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {club.league}
                          </span>
                        </td>

                        {/* Matches Played */}
                        <td className="py-4 px-3 text-center text-slate-600">
                          {club.matchesPlayed} นัด
                        </td>

                        {/* Total Attendance */}
                        <td className="py-4 px-4 text-right font-semibold text-slate-800">
                          {club.totalAttendance.toLocaleString()} คน
                        </td>

                        {/* Average Attendance with mini bar */}
                        <td className="py-4 px-4 text-right">
                          <div className="font-black text-slate-900 text-sm">
                            {club.averageAttendance.toLocaleString()} คน
                          </div>
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full ml-auto mt-1 overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </td>

                        {/* Highest Record */}
                        <td className="py-4 px-4 text-right text-rose-600 font-bold">
                          {club.highestAttendance.toLocaleString()} คน
                        </td>

                        {/* Recommendation */}
                        <td className="py-4 px-4 text-center">
                          {club.averageAttendance >= 8000 ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                              🔥 แฟนบอลแน่นพิเศษ
                            </span>
                          ) : club.averageAttendance >= 4000 ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              ⭐ แฟนบอลหนาแน่น
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium">
                              แฟนบอลทั่วไป
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXCEL DRAG & DROP UPLOAD MODAL - SEPARATED BY LEAGUE */}
      {/* ========================================================================= */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 relative max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => {
                setIsUploadModalOpen(false);
                setImportSummary(null);
                setImportFile(null);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  อัปเดตไฟล์ Excel สถิติผู้ชมสนาม & Score
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                เลือกช่องอัปเดตแยกตามลีก (Thai League 1, 2, 3) เพื่อดึงข้อมูล วัน เวลา ทีมเหย้า ทีมเยือน สถานที่แข่งขัน Home Score Away Score และ Audience
              </p>
            </div>

            {/* League Target Selector Tabs inside Modal */}
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setTargetUploadLeague('League 1');
                  setImportSummary(null);
                  setImportFile(null);
                }}
                className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  targetUploadLeague === 'League 1'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                <span className="truncate">League 1</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTargetUploadLeague('League 2');
                  setImportSummary(null);
                  setImportFile(null);
                }}
                className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  targetUploadLeague === 'League 2'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <span className="truncate">League 2</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTargetUploadLeague('League 3');
                  setImportSummary(null);
                  setImportFile(null);
                }}
                className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  targetUploadLeague === 'League 3'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="truncate">League 3</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTargetUploadLeague('All');
                  setImportSummary(null);
                  setImportFile(null);
                }}
                className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  targetUploadLeague === 'All'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>รวมทุกลีก</span>
              </button>
            </div>

            {/* Drop Zone Area */}
            {!importSummary ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                    : targetUploadLeague === 'League 1' ? 'border-rose-300 bg-rose-50/30 hover:border-rose-400' :
                      targetUploadLeague === 'League 2' ? 'border-blue-300 bg-blue-50/30 hover:border-blue-400' :
                      targetUploadLeague === 'League 3' ? 'border-emerald-300 bg-emerald-50/30 hover:border-emerald-400' :
                      'border-slate-300 bg-slate-50/50 hover:border-slate-400'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xs ${
                  targetUploadLeague === 'League 1' ? 'bg-rose-100 text-rose-700' :
                  targetUploadLeague === 'League 2' ? 'bg-blue-100 text-blue-700' :
                  targetUploadLeague === 'League 3' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  <Upload className="w-7 h-7" />
                </div>

                <div className="text-sm font-bold text-slate-900">
                  โยนไฟล์ Excel สถิติผู้ชมสำหรับ{' '}
                  <span className={
                    targetUploadLeague === 'League 1' ? 'text-rose-600' :
                    targetUploadLeague === 'League 2' ? 'text-blue-600' :
                    targetUploadLeague === 'League 3' ? 'text-emerald-600' :
                    'text-slate-900'
                  }>
                    {targetUploadLeague !== 'All' ? `Thai ${targetUploadLeague}` : 'ทุกลีก'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  คลิกเพื่อเลือกไฟล์ หรือ ลากไฟล์ .xlsx มาวางที่นี่
                </div>

                {/* Detected columns guidance */}
                <div className="mt-4 p-2.5 rounded-xl bg-white/80 border border-slate-200/80 inline-block text-[11px] text-slate-600">
                  <div className="font-semibold text-slate-800">คอลัมน์ที่ระบบจะดึงข้อมูลอัตโนมัติ:</div>
                  <div className="text-slate-500 mt-0.5">
                    1. วัน-เวลา • 2. ทีมเหย้า-ทีมเยือน • 3. สถานที่แข่งขัน • 4. Home Score & Away Score • 5. Audience
                  </div>
                </div>

                {isParsing && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700">
                    <span className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
                    <span>กำลังอ่านและประมวลผลไฟล์...</span>
                  </div>
                )}
              </div>
            ) : (
              /* Verification & Summary Preview */
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>อ่านไฟล์สำเร็จ: {importFile?.name}</span>
                    </div>
                    <button
                      onClick={() => {
                        setImportSummary(null);
                        setImportFile(null);
                      }}
                      className="text-xs text-emerald-700 hover:underline cursor-pointer"
                    >
                      เลือกไฟล์ใหม่
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                    <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100 text-center">
                      <div className="text-slate-500 text-[10px]">จำนวนที่ตรวจพบ</div>
                      <div className="text-base font-black text-slate-900">
                        {importSummary.validRows} แมตช์
                      </div>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100 text-center">
                      <div className="text-slate-500 text-[10px]">เป้าหมายลีก</div>
                      <div className="text-base font-black text-emerald-700">
                        {targetUploadLeague !== 'All' ? targetUploadLeague : 'หลายลีก'}
                      </div>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100 text-center">
                      <div className="text-slate-500 text-[10px]">Audience รวม</div>
                      <div className="text-base font-black text-blue-700">
                        {importSummary.totalAttendance.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Strategy Options */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                  <div className="font-bold text-slate-800">
                    เลือกรูปแบบการบันทึก ({targetUploadLeague !== 'All' ? `เฉพาะ ${targetUploadLeague}` : 'ทุกลีก'}):
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-all ${
                      saveMode === 'merge' ? 'bg-blue-50/80 border-blue-400 text-blue-950 font-bold' : 'bg-white border-slate-200 text-slate-600'
                    }`}>
                      <input
                        type="radio"
                        name="saveMode"
                        checked={saveMode === 'merge'}
                        onChange={() => setSaveMode('merge')}
                        className="mt-0.5"
                      />
                      <div>
                        <div>เพิ่ม / อัปเดตข้อมูลสัปดาห์นี้</div>
                        <div className="text-[10px] font-normal text-slate-500">คงข้อมูลสัปดาห์อื่นไว้ และอัปเดตแมตช์ที่ตรงกัน</div>
                      </div>
                    </label>

                    <label className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-all ${
                      saveMode === 'replace' ? 'bg-rose-50/80 border-rose-400 text-rose-950 font-bold' : 'bg-white border-slate-200 text-slate-600'
                    }`}>
                      <input
                        type="radio"
                        name="saveMode"
                        checked={saveMode === 'replace'}
                        onChange={() => setSaveMode('replace')}
                        className="mt-0.5"
                      />
                      <div>
                        <div>แทนที่ข้อมูลทั้งหมดในลีกนี้</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          {targetUploadLeague !== 'All' ? `ล้างเฉพาะ ${targetUploadLeague} โดยไม่แตะต้องลีกอื่น` : 'ล้างข้อมูลเดิมและแทนที่'}
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

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

                {/* Preview sample rows with 4 required items */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-700">ตัวอย่างข้อมูลที่อ่านได้ (พร้อม Score & Audience):</div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-[11px] divide-y divide-slate-100 bg-white">
                    {importSummary.parsedRecords.slice(0, 4).map((r, i) => (
                      <div key={i} className="p-2.5 flex items-center justify-between gap-2">
                        <div className="space-y-0.5 truncate">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900 truncate">
                            <span>{r.homeTeam}</span>
                            <span className="px-1.5 py-0.2 rounded bg-slate-900 text-white font-black text-[10px]">
                              {r.score || (r.homeScore !== undefined && r.awayScore !== undefined ? `${r.homeScore} - ${r.awayScore}` : 'vs')}
                            </span>
                            <span>{r.awayTeam}</span>
                          </div>
                          <div className="text-slate-400 text-[10px] truncate">
                            📍 {r.stadium} • 🗓️ {r.matchDate} {r.matchTime || ''}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-black text-emerald-700 text-xs">
                            {r.attendance.toLocaleString()} คน
                          </div>
                          <div className="text-[10px] text-slate-400">Audience</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Template Help & Download */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800">
                  ดาวน์โหลดเทมเพลต Excel {targetUploadLeague !== 'All' ? `(${targetUploadLeague})` : ''}
                </div>
                <div className="text-[11px] text-slate-500">
                  มีคอลัมน์มาตรฐาน: วันที่, เวลา, ทีมเหย้า, Home Score, Away Score, ทีมเยือน, สถานที่แข่งขัน, Audience
                </div>
              </div>
              <button
                onClick={() => generateAttendanceExcelTemplate(targetUploadLeague !== 'All' ? targetUploadLeague : undefined)}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>โหลดเทมเพลต</span>
              </button>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setImportSummary(null);
                  setImportFile(null);
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>

              <button
                id="btn-confirm-save-attendance"
                disabled={!importSummary || importSummary.validRows === 0}
                onClick={handleSaveImportedData}
                className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer transition-all ${
                  !importSummary || importSummary.validRows === 0
                    ? 'bg-slate-400 cursor-not-allowed opacity-60'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  กดบันทึกข้อมูล {targetUploadLeague !== 'All' ? `(${targetUploadLeague})` : ''} ({importSummary?.validRows || 0} แมตช์)
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
