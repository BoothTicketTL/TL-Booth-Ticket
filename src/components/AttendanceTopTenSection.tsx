import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Trophy, 
  Users, 
  MapPin, 
  Calendar, 
  Clock, 
  TrendingUp, 
  BarChart3, 
  FileSpreadsheet, 
  Award, 
  Flame, 
  Sparkles, 
  ArrowUpDown,
  Layers,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { LeagueType, StadiumAttendanceRecord } from '../types';
import { ClubCrest } from './common/ClubCrest';
import { LeagueBadge } from './common/LeagueBadge';
import { subscribeToAttendance, getAttendanceRecords } from '../lib/attendanceService';
import { LEAGUE_COLOR_MAP } from '../data/fixtures';

interface AttendanceTopTenSectionProps {
  initialLeagueFilter?: LeagueType | 'All';
  showTitle?: boolean;
}

export const AttendanceTopTenSection: React.FC<AttendanceTopTenSectionProps> = ({
  initialLeagueFilter = 'All',
  showTitle = true,
}) => {
  const [records, setRecords] = useState<StadiumAttendanceRecord[]>(() => getAttendanceRecords());
  const [selectedLeagueTab, setSelectedLeagueTab] = useState<LeagueType | 'All'>(initialLeagueFilter);
  const [viewRankingMode, setViewRankingMode] = useState<'matches' | 'stadiums'>('matches');

  // Real-time listener for attendance updates (from Cloud Firestore / Excel uploads)
  useEffect(() => {
    const unsub = subscribeToAttendance((data) => {
      setRecords(data);
    });
    return () => unsub();
  }, []);

  // Filter records by selected league
  const filteredRecords = useMemo(() => {
    if (selectedLeagueTab === 'All') return records;
    return records.filter(r => {
      const norm = r.league === 'Thai League 1' ? 'League 1' 
        : r.league === 'Thai League 2' ? 'League 2' 
        : r.league === 'Thai League 3' ? 'League 3' 
        : r.league;
      return norm === selectedLeagueTab;
    });
  }, [records, selectedLeagueTab]);

  // 1. Top 10 Matches by Attendance
  const top10Matches = useMemo(() => {
    const valid = filteredRecords.filter(r => (r.attendance || 0) > 0);
    const sorted = [...valid].sort((a, b) => (b.attendance || 0) - (a.attendance || 0));
    return sorted.slice(0, 10);
  }, [filteredRecords]);

  // 2. Top 10 Stadiums / Clubs by Total Attendance
  const top10Stadiums = useMemo(() => {
    const stadiumMap = new Map<string, {
      stadium: string;
      homeTeam: string;
      league: LeagueType;
      province?: string;
      capacity: number;
      matchesCount: number;
      totalAttendance: number;
      highestMatchAttendance: number;
      highestMatchOpponent: string;
    }>();

    filteredRecords.forEach(r => {
      if (!r.attendance || r.attendance <= 0) return;
      const sKey = `${r.league}_${r.homeTeam}_${r.stadium || ''}`.trim();
      const prev = stadiumMap.get(sKey) || {
        stadium: r.stadium || `สนามเหย้า ${r.homeTeam}`,
        homeTeam: r.homeTeam,
        league: r.league,
        province: r.province,
        capacity: r.capacity || 0,
        matchesCount: 0,
        totalAttendance: 0,
        highestMatchAttendance: 0,
        highestMatchOpponent: '',
      };

      prev.matchesCount += 1;
      prev.totalAttendance += r.attendance;
      if (r.capacity && r.capacity > prev.capacity) prev.capacity = r.capacity;

      if (r.attendance > prev.highestMatchAttendance) {
        prev.highestMatchAttendance = r.attendance;
        prev.highestMatchOpponent = r.awayTeam;
      }

      stadiumMap.set(sKey, prev);
    });

    const list = Array.from(stadiumMap.values()).map(s => {
      const avg = s.matchesCount > 0 ? Math.round(s.totalAttendance / s.matchesCount) : 0;
      const occ = s.capacity > 0 && avg > 0 ? parseFloat(((avg / s.capacity) * 100).toFixed(1)) : 0;
      return {
        ...s,
        averageAttendance: avg,
        occupancyRate: occ,
      };
    });

    list.sort((a, b) => b.totalAttendance - a.totalAttendance || b.averageAttendance - a.averageAttendance);
    return list.slice(0, 10);
  }, [filteredRecords]);

  // Overall Metrics for the current view
  const metrics = useMemo(() => {
    const valid = filteredRecords.filter(r => (r.attendance || 0) > 0);
    const totalAtt = valid.reduce((acc, r) => acc + (r.attendance || 0), 0);
    const avgAtt = valid.length > 0 ? Math.round(totalAtt / valid.length) : 0;
    const topMatch = top10Matches[0];

    let avgOcc = 0;
    const occs = valid.filter(r => r.capacity && r.capacity > 0).map(r => ((r.attendance || 0) / r.capacity!) * 100);
    if (occs.length > 0) {
      avgOcc = parseFloat((occs.reduce((a, b) => a + b, 0) / occs.length).toFixed(1));
    }

    return {
      totalMatches: valid.length,
      totalAttendance: totalAtt,
      averageAttendance: avgAtt,
      averageOccupancy: avgOcc,
      topMatch,
    };
  }, [filteredRecords, top10Matches]);

  // Excel Export Handler
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const scopeLabel = selectedLeagueTab === 'All' ? 'รวมทุกลีก (League 1, 2, 3)' : selectedLeagueTab;

      if (viewRankingMode === 'matches') {
        const rows = top10Matches.map((m, idx) => ({
          'อันดับ': idx + 1,
          'ลีก': m.league,
          'ทีมเหย้า': m.homeTeam,
          'ผลบอล': m.score || '-',
          'ทีมเยือน': m.awayTeam,
          'สนามแข่งขัน': m.stadium,
          'จังหวัด': m.province || '-',
          'วันที่แข่งขัน': m.matchDate,
          'เวลา': m.matchTime || '-',
          'ยอดผู้ชม (คน)': m.attendance,
          'ความจุสนาม (ที่นั่ง)': m.capacity || '-',
          'อัตราครองที่นั่ง (%)': m.occupancyRate ? `${m.occupancyRate}%` : '-',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 24 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Top 10 Matches');
        XLSX.writeFile(wb, `ตารางจัดอันดับ 10 แมตช์ยอดผู้ชมสูงสุด (${scopeLabel}).xlsx`);
      } else {
        const rows = top10Stadiums.map((s, idx) => ({
          'อันดับ': idx + 1,
          'ลีก': s.league,
          'สโมสรเจ้าบ้าน': s.homeTeam,
          'สนามเหย้า': s.stadium,
          'จังหวัด': s.province || '-',
          'จำนวนนัดที่แข่งเหย้า': s.matchesCount,
          'ยอดผู้ชมรวม (คน)': s.totalAttendance,
          'เฉลี่ยต่อนัด (คน)': s.averageAttendance,
          'นัดยอดผู้ชมสูงสุด (คน)': `${s.highestMatchAttendance.toLocaleString()} (vs ${s.highestMatchOpponent || '-'})`,
          'ความจุสนาม (ที่นั่ง)': s.capacity || '-',
          'อัตราครองที่นั่งเฉลี่ย (%)': `${s.occupancyRate}%`,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 24 }, { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 26 }, { wch: 18 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Top 10 Stadiums');
        XLSX.writeFile(wb, `ตารางจัดอันดับ 10 สนามยอดผู้ชมสูงสุด (${scopeLabel}).xlsx`);
      }
    } catch (err) {
      console.error('Export Excel failed:', err);
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-amber-100 text-amber-800 font-extrabold text-xs shadow-xs border border-amber-300">
          🥇 1
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-100 text-slate-700 font-extrabold text-xs shadow-xs border border-slate-300">
          🥈 2
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-amber-50 text-amber-900 font-extrabold text-xs shadow-xs border border-amber-200">
          🥉 3
        </span>
      );
    }
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-50 text-slate-600 font-bold text-xs border border-slate-200">
        {rank}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden space-y-6 p-5 sm:p-6">
      {/* Header Bar */}
      {showTitle && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
                <Flame className="w-3.5 h-3.5 text-rose-600" />
                <span>สถิติยอดผู้ชมสด (Spectator Attendance Rankings)</span>
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                10 อันดับสนาม & แมตช์คนดูเยอะที่สุด
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
              ตารางจัดอันดับ 10 สนาม & แมตช์ยอดผู้ชมสูงสุด
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              วิเคราะห์สถิติความหนาแน่นของแฟนบอลในสนามเหย้า ทั้งแบบรวมทุกลีก และแยกลีก (Thai League 1, 2, 3)
            </p>
          </div>

          <button
            onClick={handleExportExcel}
            className="self-start md:self-auto px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold text-xs border border-slate-200 shadow-2xs flex items-center gap-2 cursor-pointer transition-all"
            title="ดาวน์โหลดตารางจัดอันดับนี้เป็น Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>ดาวน์โหลด Excel ตารางจัดอันดับ</span>
          </button>
        </div>
      )}

      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Top 1 Match Highlight */}
        <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent rounded-2xl p-4 border border-amber-200/80 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-600" />
              <span>แมตช์ยอดผู้ชมสูงสุดอันดับ 1</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold">
              TOP 1
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-amber-900">
              {metrics.topMatch ? metrics.topMatch.attendance.toLocaleString() : 0}{' '}
              <span className="text-xs font-normal text-amber-700">คน</span>
            </div>
            <div className="text-xs font-bold text-slate-800 truncate mt-1">
              {metrics.topMatch ? `${metrics.topMatch.homeTeam} vs ${metrics.topMatch.awayTeam}` : '-'}
            </div>
            <div className="text-[11px] text-slate-500 truncate mt-0.5">
              {metrics.topMatch ? `${metrics.topMatch.stadium} (${metrics.topMatch.league})` : '-'}
            </div>
          </div>
        </div>

        {/* Total Attendance */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-sky-600" />
              <span>ยอดผู้ชมรวมทั้งหมด</span>
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-slate-900">
              {metrics.totalAttendance.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">คน</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              จากทั้งหมด {metrics.totalMatches} แมตช์ที่มีบันทึกยอดผู้ชม
            </div>
          </div>
        </div>

        {/* Average Attendance */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>เฉลี่ยยอดผู้ชมต่อนัด</span>
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-emerald-800">
              {metrics.averageAttendance.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">คน/นัด</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              สถิติเฉลี่ยตามลีกที่เลือก
            </div>
          </div>
        </div>

        {/* Average Occupancy */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <span>อัตราครองความจุสนาม</span>
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-indigo-900">
              {metrics.averageOccupancy}%
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
              <div 
                className="h-full bg-indigo-600 rounded-full transition-all" 
                style={{ width: `${Math.min(100, metrics.averageOccupancy)}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              เทียบกับความจุมาตรฐานของแต่ละสนาม
            </div>
          </div>
        </div>
      </div>

      {/* Control Tabs: League Filter & Ranking Mode */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
        {/* League Selector: รวมทุกลีก vs แยกลีก */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80">
          <button
            onClick={() => setSelectedLeagueTab('All')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedLeagueTab === 'All'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>จัดอันดับรวมทุกลีก (Top 10 Overall)</span>
          </button>

          <button
            onClick={() => setSelectedLeagueTab('League 1')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedLeagueTab === 'League 1'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-rose-700 hover:bg-white/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>Thai League 1 (แดง)</span>
          </button>

          <button
            onClick={() => setSelectedLeagueTab('League 2')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedLeagueTab === 'League 2'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-blue-700 hover:bg-white/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Thai League 2 (น้ำเงิน)</span>
          </button>

          <button
            onClick={() => setSelectedLeagueTab('League 3')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedLeagueTab === 'League 3'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-emerald-700 hover:bg-white/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Thai League 3 (เขียว)</span>
          </button>
        </div>

        {/* Mode Switcher: Matches vs Stadiums */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
          <button
            onClick={() => setViewRankingMode('matches')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewRankingMode === 'matches'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>จัดอันดับ 10 แมตช์</span>
          </button>
          <button
            onClick={() => setViewRankingMode('stadiums')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewRankingMode === 'stadiums'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>จัดอันดับ 10 สนาม</span>
          </button>
        </div>
      </div>

      {/* ============================================================
          TABLE 1: 10 อันดับแมตช์ที่มียอดผู้ชมสูงสุด
          ============================================================ */}
      {viewRankingMode === 'matches' && (
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="p-3.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <span>
                10 แมตช์ที่มีแฟนบอลเข้าชมสูงสุด • {selectedLeagueTab === 'All' ? 'รวมทุกลีก (League 1–3)' : selectedLeagueTab}
              </span>
            </span>
            <span className="text-[11px] text-slate-500">
              เรียงลำดับตามจำนวนผู้ชมจริง (Audience Count)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3.5 text-center w-14">อันดับ</th>
                  <th className="py-3 px-4">คู่แข่งขัน (Match)</th>
                  <th className="py-3 px-3 text-center">ผลบอล</th>
                  <th className="py-3 px-4">สนามแข่งขัน & จังหวัด</th>
                  <th className="py-3 px-3 text-center">ลีก</th>
                  <th className="py-3 px-3.5 text-center">วัน & เวลาแข่งขัน</th>
                  <th className="py-3 px-4 text-right">ยอดผู้ชม (คน)</th>
                  <th className="py-3 px-4 text-right">ความจุ & % เต็มสนาม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {top10Matches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      ยังไม่มีข้อมูลยอดผู้ชมสำหรับลีกนี้
                    </td>
                  </tr>
                ) : (
                  top10Matches.map((m, idx) => {
                    const occ = m.occupancyRate || (m.capacity ? Math.round((m.attendance / m.capacity) * 100) : 0);
                    return (
                      <tr key={m.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        {/* Rank */}
                        <td className="py-3 px-3.5 align-middle text-center">
                          {getRankBadge(idx + 1)}
                        </td>

                        {/* Match & Crests */}
                        <td className="py-3 px-4 align-middle">
                          <div className="flex items-center gap-2.5">
                            <ClubCrest clubName={m.homeTeam} league={m.league} size="md" />
                            <div className="min-w-0">
                              <div className="font-extrabold text-slate-900 text-xs sm:text-sm">
                                {m.homeTeam}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                <span>vs</span>
                                <ClubCrest clubName={m.awayTeam} league={m.league} size="xs" />
                                <span className="font-semibold text-slate-700">{m.awayTeam}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Score */}
                        <td className="py-3 px-3 align-middle text-center">
                          {m.score ? (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-slate-900 text-white font-extrabold text-xs tracking-wider">
                              {m.score}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>

                        {/* Stadium & Province */}
                        <td className="py-3 px-4 align-middle">
                          <div className="font-bold text-slate-900 truncate max-w-[220px]">
                            {m.stadium}
                          </div>
                          {m.province && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{m.province}</span>
                            </div>
                          )}
                        </td>

                        {/* League */}
                        <td className="py-3 px-3 align-middle text-center">
                          <LeagueBadge league={m.league} />
                        </td>

                        {/* Date & Time */}
                        <td className="py-3 px-3.5 align-middle text-center">
                          <div className="text-slate-800 font-semibold whitespace-nowrap">
                            {m.matchDate}
                          </div>
                          {m.matchTime && (
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {m.matchTime} น.
                            </div>
                          )}
                        </td>

                        {/* Attendance */}
                        <td className="py-3 px-4 align-middle text-right">
                          <div className="font-black text-rose-700 text-sm sm:text-base">
                            {m.attendance.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-400">ผู้ชมในสนาม</div>
                        </td>

                        {/* Capacity & Occupancy Bar */}
                        <td className="py-3 px-4 align-middle text-right">
                          <div className="font-extrabold text-slate-800 text-xs">
                            {occ}%
                          </div>
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full ml-auto mt-1 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                occ >= 90 ? 'bg-rose-500' : occ >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, occ)}%` }}
                            />
                          </div>
                          {m.capacity && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              จุได้ {m.capacity.toLocaleString()} คน
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================
          TABLE 2: 10 อันดับสนามเหย้าที่มีแฟนบอลรวมสูงสุด
          ============================================================ */}
      {viewRankingMode === 'stadiums' && (
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="p-3.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>
                10 สนามเหย้าที่มียอดผู้ชมรวมสูงสุด • {selectedLeagueTab === 'All' ? 'รวมทุกลีก (League 1–3)' : selectedLeagueTab}
              </span>
            </span>
            <span className="text-[11px] text-slate-500">
              เรียงลำดับตามยอดรวมผู้ชมและค่าเฉลี่ยต่อนัด
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3.5 text-center w-14">อันดับ</th>
                  <th className="py-3 px-4">สโมสรเจ้าบ้าน & สนามเหย้า</th>
                  <th className="py-3 px-3 text-center">ลีก</th>
                  <th className="py-3 px-3 text-center">นัดเหย้า</th>
                  <th className="py-3 px-4 text-right">ยอดผู้ชมรวม (คน)</th>
                  <th className="py-3 px-4 text-right">เฉลี่ยต่อนัด (คน)</th>
                  <th className="py-3 px-4 text-right">นัดคนดูเยอะที่สุด</th>
                  <th className="py-3 px-4 text-right">ความจุ & ครองที่นั่ง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {top10Stadiums.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      ยังไม่มีข้อมูลสนามสำหรับลีกนี้
                    </td>
                  </tr>
                ) : (
                  top10Stadiums.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      {/* Rank */}
                      <td className="py-3 px-3.5 align-middle text-center">
                        {getRankBadge(idx + 1)}
                      </td>

                      {/* Home Club & Stadium */}
                      <td className="py-3 px-4 align-middle">
                        <div className="flex items-center gap-2.5">
                          <ClubCrest clubName={s.homeTeam} league={s.league} size="md" />
                          <div>
                            <div className="font-extrabold text-slate-900 text-xs sm:text-sm">
                              {s.homeTeam}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[240px]">
                              {s.stadium} {s.province ? `(${s.province})` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* League */}
                      <td className="py-3 px-3 align-middle text-center">
                        <LeagueBadge league={s.league} />
                      </td>

                      {/* Matches Played */}
                      <td className="py-3 px-3 align-middle text-center">
                        <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                          {s.matchesCount} นัด
                        </span>
                      </td>

                      {/* Total Attendance */}
                      <td className="py-3 px-4 align-middle text-right">
                        <div className="font-black text-rose-700 text-sm sm:text-base">
                          {s.totalAttendance.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400">คนรวม</div>
                      </td>

                      {/* Average Attendance */}
                      <td className="py-3 px-4 align-middle text-right">
                        <div className="font-extrabold text-slate-900 text-xs sm:text-sm">
                          {s.averageAttendance.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400">คน/นัด</div>
                      </td>

                      {/* Highest Match */}
                      <td className="py-3 px-4 align-middle text-right">
                        <div className="font-extrabold text-amber-700 text-xs">
                          {s.highestMatchAttendance.toLocaleString()} คน
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px] ml-auto">
                          vs {s.highestMatchOpponent || '-'}
                        </div>
                      </td>

                      {/* Capacity & Avg Occupancy */}
                      <td className="py-3 px-4 align-middle text-right">
                        <div className="font-extrabold text-slate-800 text-xs">
                          {s.occupancyRate}%
                        </div>
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full ml-auto mt-1 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              s.occupancyRate >= 90 ? 'bg-rose-500' : s.occupancyRate >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, s.occupancyRate)}%` }}
                          />
                        </div>
                        {s.capacity > 0 && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            จุ {s.capacity.toLocaleString()} ที่นั่ง
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
