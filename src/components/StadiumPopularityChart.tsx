import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Trophy, 
  Building2, 
  Ticket, 
  Calendar, 
  Filter, 
  ChevronDown, 
  Layers, 
  Sparkles, 
  BarChart3, 
  Table as TableIcon,
  CheckCircle2,
  Users,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { RegistrationRecord, LeagueType } from '../types';
import { isRecordBoothActive, isRecordTicketActive } from '../lib/seasonService';
import { getFixtures } from '../lib/fixturesService';
import { LEAGUE_COLOR_MAP, SPONSOR_BRANDS } from '../data/fixtures';

export type TimeframeMode = 'season' | 'monthly' | 'weekly';
export type SortMetric = 'total' | 'booth' | 'ticket' | 'ticketQty';

interface StadiumPopularityChartProps {
  records: RegistrationRecord[];
  selectedSeason: string;
  seasonMonths: { key: string; nameThai: string; shortThai: string }[];
  initialLeagueFilter?: LeagueType | 'All';
  activeMonthKey?: string;
}

interface StadiumStatItem {
  stadiumName: string;
  league: LeagueType;
  homeClub?: string;
  totalRequests: number;
  boothRequests: number;
  ticketRequests: number;
  totalTicketQty: number;
  brands: string[];
  dealers: string[];
  matchesCount: number;
}

export const StadiumPopularityChart: React.FC<StadiumPopularityChartProps> = ({
  records,
  selectedSeason,
  seasonMonths,
  initialLeagueFilter = 'All',
  activeMonthKey,
}) => {
  // Dropdown 1: Timeframe mode ('season' | 'monthly' | 'weekly')
  const [timeframe, setTimeframe] = useState<TimeframeMode>('season');

  // Dropdown 2a: Selected month (for 'monthly' mode)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return activeMonthKey || seasonMonths[0]?.key || '2026-09';
  });

  // Dropdown 2b: Selected match week (for 'weekly' mode)
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  // Dropdown 3: Sort metric
  const [sortMetric, setSortMetric] = useState<SortMetric>('total');

  // Dropdown 4: League filter
  const [leagueFilter, setLeagueFilter] = useState<LeagueType | 'All'>(initialLeagueFilter);

  // View style toggle: 'chart' vs 'table'
  const [viewStyle, setViewStyle] = useState<'chart' | 'table'>('chart');

  // Vertical Bar style toggle: 'stacked' (ซ้อนรวม) vs 'grouped' (แท่งคู่เปรียบเทียบ)
  const [verticalBarStyle, setVerticalBarStyle] = useState<'stacked' | 'grouped'>('stacked');

  // Hovered / active stadium on vertical bar
  const [hoveredStadium, setHoveredStadium] = useState<string | null>(null);

  // Display limit (Top 5, Top 10, All)
  const [displayLimit, setDisplayLimit] = useState<number>(10);

  // Load all fixtures to map match weeks and home teams
  const allFixtures = useMemo(() => {
    return getFixtures();
  }, []);

  // Compute available match weeks from fixtures
  const availableWeeks = useMemo(() => {
    const weeksSet = new Set<number>();
    allFixtures.forEach(f => {
      if (f.matchWeek && f.matchWeek > 0) {
        weeksSet.add(f.matchWeek);
      }
    });
    const list = Array.from(weeksSet).sort((a, b) => a - b);
    return list.length > 0 ? list : Array.from({ length: 34 }, (_, i) => i + 1);
  }, [allFixtures]);

  // Lookup fixture helper
  const findFixtureForRecord = (record: RegistrationRecord) => {
    if (record.fixtureId) {
      const byId = allFixtures.find(f => f.id === record.fixtureId);
      if (byId) return byId;
    }
    // Match by date and stadium
    return allFixtures.find(f => 
      f.matchDate === record.matchDate && 
      (f.stadium === record.stadium || record.stadium.includes(f.stadium) || f.stadium.includes(record.stadium))
    );
  };

  // Filter records based on timeframe, month/week, and league
  const filteredRecords = useMemo(() => {
    return records.filter(rec => {
      // 1. League filter
      if (leagueFilter !== 'All' && rec.league !== leagueFilter) {
        return false;
      }

      // 2. Timeframe filter
      if (timeframe === 'season') {
        // All records for this season
        return true;
      } else if (timeframe === 'monthly') {
        // Match month
        const match = rec.month === selectedMonth || (rec.matchDate && rec.matchDate.startsWith(selectedMonth));
        return match;
      } else if (timeframe === 'weekly') {
        // Match matchWeek
        const fixture = findFixtureForRecord(rec);
        if (fixture && fixture.matchWeek === selectedWeek) {
          return true;
        }
        // If not found in fixture, check if remark notes the week
        if (rec.remark) {
          const matchWeekStr = rec.remark.match(/(?:สัปดาห์ที่|week\s*|นัดที่\s*)(\d+)/i);
          if (matchWeekStr && parseInt(matchWeekStr[1], 10) === selectedWeek) {
            return true;
          }
        }
        return false;
      }

      return true;
    });
  }, [records, timeframe, selectedMonth, selectedWeek, leagueFilter, allFixtures]);

  // Aggregate stats by stadium
  const stadiumStats = useMemo(() => {
    const map = new Map<string, StadiumStatItem>();

    filteredRecords.forEach(r => {
      const rawStadium = (r.stadium || 'ไม่ระบุสนาม').trim();
      if (!rawStadium) return;

      const isBooth = isRecordBoothActive(r);
      const isTicket = isRecordTicketActive(r);
      const tQty = isTicket ? (Number(r.ticketQuantity) || 0) : 0;

      // Try finding home team from fixtures
      const fixture = findFixtureForRecord(r);
      const homeTeam = fixture?.homeTeam || '';

      if (!map.has(rawStadium)) {
        map.set(rawStadium, {
          stadiumName: rawStadium,
          league: r.league,
          homeClub: homeTeam,
          totalRequests: 0,
          boothRequests: 0,
          ticketRequests: 0,
          totalTicketQty: 0,
          brands: [],
          dealers: [],
          matchesCount: 0,
        });
      }

      const item = map.get(rawStadium)!;
      if (isBooth) {
        item.boothRequests += 1;
        if (r.dealerName && !item.dealers.includes(r.dealerName)) {
          item.dealers.push(r.dealerName);
        }
      }
      if (isTicket) {
        item.ticketRequests += 1;
        item.totalTicketQty += tQty;
      }
      // รวมกิจกรรมทั้งหมด = ขอออกบูธ (ครั้ง) + ขอรับบัตร (ครั้ง)
      item.totalRequests = item.boothRequests + item.ticketRequests;
      if (r.brand && !item.brands.includes(r.brand)) {
        item.brands.push(r.brand);
      }
      item.matchesCount += 1;
      if (!item.homeClub && homeTeam) {
        item.homeClub = homeTeam;
      }
    });

    const list = Array.from(map.values());

    // Sort by selected metric
    list.sort((a, b) => {
      if (sortMetric === 'booth') {
        return b.boothRequests - a.boothRequests || b.totalRequests - a.totalRequests;
      }
      if (sortMetric === 'ticket') {
        return b.ticketRequests - a.ticketRequests || b.totalTicketQty - a.totalTicketQty;
      }
      if (sortMetric === 'ticketQty') {
        return b.totalTicketQty - a.totalTicketQty || b.ticketRequests - a.ticketRequests;
      }
      // default 'total'
      return b.totalRequests - a.totalRequests || (b.boothRequests + b.ticketRequests) - (a.boothRequests + a.ticketRequests);
    });

    return list;
  }, [filteredRecords, sortMetric, allFixtures]);

  // Overall totals for highlight cards
  const totalStats = useMemo(() => {
    let totalBooths = 0;
    let totalTickets = 0;
    let totalTicketsQty = 0;

    filteredRecords.forEach(r => {
      if (isRecordBoothActive(r)) totalBooths += 1;
      if (isRecordTicketActive(r)) {
        totalTickets += 1;
        totalTicketsQty += (Number(r.ticketQuantity) || 0);
      }
    });

    const totalRequests = totalBooths + totalTickets;

    return {
      totalRequests,
      totalBooths,
      totalTickets,
      totalTicketsQty,
      stadiumCount: stadiumStats.length,
      topStadium: stadiumStats[0] || null,
    };
  }, [filteredRecords, stadiumStats]);

  // Export popular stadiums to Excel with transparent columns
  const handleDownloadExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary
      const summaryRows = [
        { 'หัวข้อรายงาน': 'สถิติสนามยอดนิยม (Top Stadiums Ranking)', 'ขอบเขต': timeframeLabel, 'ฤดูกาล': selectedSeason },
        {},
        { 'ตัวชี้วัด (Key Metrics)': 'ค่าที่ได้', 'หมายเหตุ': '' },
        { 'ตัวชี้วัด (Key Metrics)': 'จำนวนสนามที่มีคำขอ', 'ค่าที่ได้': `${stadiumStats.length} สนาม`, 'หมายเหตุ': timeframeLabel },
        { 'ตัวชี้วัด (Key Metrics)': 'ยอดรวมขอออกบูธในสนาม', 'ค่าที่ได้': `${totalStats.totalBooths} ครั้ง`, 'หมายเหตุ': 'นับจำนวนครั้งที่ขอออกบูธ' },
        { 'ตัวชี้วัด (Key Metrics)': 'ยอดรวมขอรับบัตรในสนาม', 'ค่าที่ได้': `${totalStats.totalTickets} ครั้ง (= ${totalStats.totalTicketsQty.toLocaleString()} ใบ)`, 'หมายเหตุ': 'จำนวนครั้งและจำนวนบัตรรวม' },
        { 'ตัวชี้วัด (Key Metrics)': 'รวมกิจกรรมทั้งหมด', 'ค่าที่ได้': `${totalStats.totalRequests} ครั้ง`, 'หมายเหตุ': 'ขอออกบูธ (ครั้ง) + ขอรับบัตร (ครั้ง)' },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 32 }, { wch: 45 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      // Sheet 2: Data Detail
      const detailRows = stadiumStats.map((item, idx) => ({
        'อันดับ': idx + 1,
        'ชื่อสนาม': item.stadiumName,
        'ลีก': item.league,
        'สโมสรเหย้า': item.homeClub || '-',
        'รวมกิจกรรมทั้งหมด (ครั้ง)': item.totalRequests,
        'ขอออกบูธ (ครั้ง)': item.boothRequests,
        'ขอรับบัตร (ครั้ง)': item.ticketRequests,
        'สรุปขอรับบัตร': `${item.ticketRequests} ครั้ง (= ${item.totalTicketQty.toLocaleString()} ใบ)`,
        'จำนวนบัตรรวม (ใบ)': item.totalTicketQty,
        'แบรนด์ผู้สนับสนุน': item.brands.join(', ') || '-',
      }));

      const wsDetail = XLSX.utils.json_to_sheet(detailRows);
      const colKeys = Object.keys(detailRows[0] || {});
      wsDetail['!cols'] = colKeys.map(k => {
        let maxLen = k.length;
        detailRows.forEach(row => {
          const val = String((row as any)[k] ?? '');
          if (val.length > maxLen) maxLen = val.length;
        });
        return { wch: Math.max(maxLen + 4, 12) };
      });
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Data Detail');

      let filename = 'สถิติสนามยอดนิยม.xlsx';
      if (timeframe === 'monthly' && selectedMonth) {
        const parts = selectedMonth.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const thaiMonths = [
          'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
          'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
        ];
        const mName = !isNaN(m) && m >= 1 && m <= 12 ? thaiMonths[m - 1] : selectedMonth;
        const be = !isNaN(y) ? y + 543 : '';
        filename = `สถิติสนามยอดนิยม เดือน${mName} พ.ศ. ${be}.xlsx`;
      } else if (timeframe === 'weekly') {
        filename = `สถิติสนามยอดนิยม สัปดาห์ที่ ${selectedWeek}.xlsx`;
      } else {
        filename = 'สถิติสนามยอดนิยม.xlsx';
      }

      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Error generating Excel:', err);
    }
  };

  // Max value for bar chart percentage scaling
  const maxMetricValue = useMemo(() => {
    if (stadiumStats.length === 0) return 1;
    if (sortMetric === 'booth') {
      return Math.max(...stadiumStats.map(s => s.boothRequests), 1);
    }
    if (sortMetric === 'ticket') {
      return Math.max(...stadiumStats.map(s => s.ticketRequests), 1);
    }
    if (sortMetric === 'ticketQty') {
      return Math.max(...stadiumStats.map(s => s.totalTicketQty), 1);
    }
    return Math.max(...stadiumStats.map(s => s.totalRequests), 1);
  }, [stadiumStats, sortMetric]);

  // Sliced items according to limit
  const visibleStadiums = useMemo(() => {
    if (displayLimit >= 999) return stadiumStats;
    return stadiumStats.slice(0, displayLimit);
  }, [stadiumStats, displayLimit]);

  // Y-Axis scale calculations for the vertical bar chart
  const yAxisMax = useMemo(() => {
    if (stadiumStats.length === 0) return 4;
    if (sortMetric === 'ticketQty') {
      const m = Math.max(maxMetricValue, 10);
      return Math.ceil(m / 10) * 10;
    }
    const m = Math.max(maxMetricValue, 4);
    return Math.ceil(m / 4) * 4;
  }, [stadiumStats, maxMetricValue, sortMetric]);

  const yAxisTicks = useMemo(() => {
    return [
      yAxisMax,
      Math.round(yAxisMax * 0.75),
      Math.round(yAxisMax * 0.5),
      Math.round(yAxisMax * 0.25),
      0,
    ];
  }, [yAxisMax]);

  const hoveredItem = useMemo(() => {
    if (!hoveredStadium) return null;
    return visibleStadiums.find(s => s.stadiumName === hoveredStadium) || null;
  }, [hoveredStadium, visibleStadiums]);

  // Current timeframe display label
  const timeframeLabel = useMemo(() => {
    if (timeframe === 'season') {
      return `ทั้งฤดูกาล ${selectedSeason}`;
    }
    if (timeframe === 'monthly') {
      const mInfo = seasonMonths.find(m => m.key === selectedMonth);
      return `ประจำเดือน ${mInfo?.nameThai || selectedMonth}`;
    }
    return `สัปดาห์การแข่งขันที่ ${selectedWeek}`;
  }, [timeframe, selectedSeason, selectedMonth, selectedWeek, seasonMonths]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden space-y-5 p-5 sm:p-7">
      {/* Header & Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <Trophy className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                สถิติสนามยอดนิยม (ขอออกบูธ & รับบัตรเยอะที่สุด)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                จัดอันดับสนามฟุตบอลที่มีลูกค้าและดีลเลอร์ขอเข้าร่วมกิจกรรมมากที่สุด ({timeframeLabel})
              </p>
            </div>
          </div>
        </div>

        {/* Actions: Excel Download + View Mode Toggle */}
        <div className="flex items-center gap-2.5 self-start lg:self-auto flex-wrap">
          <button
            onClick={handleDownloadExcel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-bold transition-all shadow-2xs cursor-pointer"
            title="ดาวน์โหลดสถิติสนามยอดนิยมเป็นไฟล์ Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>ดาวน์โหลด Excel</span>
          </button>

          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewStyle('chart')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewStyle === 'chart'
                  ? 'bg-white text-sky-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>กราฟแท่งแนวตั้ง</span>
            </button>
            <button
              onClick={() => setViewStyle('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewStyle === 'table'
                  ? 'bg-white text-sky-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>ตารางจัดอันดับ</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dropdown Filters Toolbar */}
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Dropdown 1: Timeframe */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              ช่วงเวลาข้อมูล
            </label>
            <div className="relative">
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as TimeframeMode)}
                className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl py-2.5 px-3 pr-8 focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none shadow-2xs cursor-pointer"
              >
                <option value="season">🏆 ทั้งฤดูกาล ({selectedSeason})</option>
                <option value="monthly">📅 ข้อมูลรายเดือน (Monthly)</option>
                <option value="weekly">⏱️ ข้อมูลรายสัปดาห์ (Match Week)</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Dropdown 2: Conditional Sub-Selector (Month or Week) */}
          {timeframe === 'monthly' ? (
            <div>
              <label className="block text-[11px] font-bold text-sky-700 uppercase tracking-wider mb-1">
                เลือกเดือนแข่งขัน
              </label>
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full text-xs font-bold text-sky-900 bg-sky-50/70 border border-sky-200 rounded-xl py-2.5 px-3 pr-8 focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none shadow-2xs cursor-pointer"
                >
                  {seasonMonths.map(m => (
                    <option key={m.key} value={m.key}>
                      {m.nameThai}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-sky-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          ) : timeframe === 'weekly' ? (
            <div>
              <label className="block text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-1">
                เลือกสัปดาห์แข่งขัน (Week)
              </label>
              <div className="relative">
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(Number(e.target.value))}
                  className="w-full text-xs font-bold text-indigo-900 bg-indigo-50/70 border border-indigo-200 rounded-xl py-2.5 px-3 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none shadow-2xs cursor-pointer"
                >
                  {availableWeeks.map(w => (
                    <option key={w} value={w}>
                      สัปดาห์ที่ {w} (Match Week {w})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-indigo-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                ขอบเขตฤดูกาล
              </label>
              <div className="w-full text-xs font-semibold text-slate-700 bg-white/70 border border-slate-200 rounded-xl py-2.5 px-3">
                คำนวณสะสมรวมทุกเดือนตลอดฤดูกาล
              </div>
            </div>
          )}

          {/* Dropdown 3: Sort Metric */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              จัดอันดับตาม
            </label>
            <div className="relative">
              <select
                value={sortMetric}
                onChange={(e) => setSortMetric(e.target.value as SortMetric)}
                className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl py-2.5 px-3 pr-8 focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none shadow-2xs cursor-pointer"
              >
                <option value="total">📊 รวมคำขอทั้งหมด (ออกบูธ + รับบัตร)</option>
                <option value="booth">🏢 ขอออกบูธมากที่สุด</option>
                <option value="ticket">🎟️ ขอรับบัตรมากที่สุด (ครั้ง)</option>
                <option value="ticketQty">🎫 จำนวนตั๋วรวมมากที่สุด (ใบ)</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Dropdown 4: League Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              กรองตามลีก
            </label>
            <div className="relative">
              <select
                value={leagueFilter}
                onChange={(e) => setLeagueFilter(e.target.value as LeagueType | 'All')}
                className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl py-2.5 px-3 pr-8 focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none shadow-2xs cursor-pointer"
              >
                <option value="All">⚽ ทุกลีก (League 1 - 3)</option>
                <option value="League 1">🔴 Thai League 1 (สีแดง)</option>
                <option value="League 2">🔵 Thai League 2 (สีน้ำเงิน)</option>
                <option value="League 3">🟢 Thai League 3 (สีเขียว)</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Top 1 Stadium */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/60 rounded-2xl p-3.5 border border-amber-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-600" />
              <span>อันดับ 1</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/60 text-amber-900 font-bold">
              ยอดนิยมสูงสุด
            </span>
          </div>
          <div className="mt-1 font-bold text-slate-900 text-sm truncate" title={totalStats.topStadium?.stadiumName || 'ไม่มีข้อมูล'}>
            {totalStats.topStadium ? totalStats.topStadium.stadiumName : 'ยังไม่มีคำขอ'}
          </div>
          <div className="text-xs text-amber-900 font-semibold mt-0.5">
            {totalStats.topStadium ? `${totalStats.topStadium.totalRequests} คำขอ (${totalStats.topStadium.boothRequests} บูธ • ${totalStats.topStadium.ticketRequests} บัตร)` : '-'}
          </div>
        </div>

        {/* Active Stadiums Count */}
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500">สนามที่มีคำขอ</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900">
              {totalStats.stadiumCount}
            </span>
            <span className="text-xs text-slate-500">สนาม</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            จากทั้งหมด {filteredRecords.length} รายการ
          </div>
        </div>

        {/* Total Booths */}
        <div className="bg-emerald-50/70 rounded-2xl p-3.5 border border-emerald-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1">
            <Building2 className="w-3 h-3 text-emerald-600" />
            <span>ขอออกบูธ (ดีลเลอร์)</span>
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-emerald-900">
              {totalStats.totalBooths}
            </span>
            <span className="text-xs text-emerald-700">ครั้ง</span>
          </div>
          <div className="text-[11px] text-emerald-700 mt-0.5">
            ไม่รวมเครื่องหมาย -
          </div>
        </div>

        {/* Total Tickets */}
        <div className="bg-blue-50/70 rounded-2xl p-3.5 border border-blue-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-blue-800 flex items-center gap-1">
            <Ticket className="w-3 h-3 text-blue-600" />
            <span>ขอรับบัตรดูบอล</span>
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-blue-900">
              {totalStats.totalTickets}
            </span>
            <span className="text-xs text-blue-700">ครั้ง ({totalStats.totalTicketsQty} ใบ)</span>
          </div>
          <div className="text-[11px] text-blue-700 mt-0.5">
            ไม่รวมจำนวนบัตร 0
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {stadiumStats.length === 0 ? (
        <div className="py-12 px-4 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <div className="text-sm font-bold text-slate-700">
            ไม่พบข้อมูลคำขอของสนามในช่วงเวลาที่เลือก
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            ลองเปลี่ยนช่วงเวลาเป็น "ทั้งฤดูกาล" หรือเลือกเดือน/สัปดาห์อื่นที่มีการลงทะเบียนคำขอเข้ามา
          </p>
        </div>
      ) : viewStyle === 'chart' ? (
        /* VERTICAL BAR GRAPH VIEW (กราฟแท่งแนวตั้ง) */
        <div className="space-y-4">
          {/* Chart Header Bar: Legend, Info, and Stacked/Grouped Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-sky-600" />
              <span className="font-bold text-slate-800">
                กราฟแท่งแนวตั้งแสดงอันดับสนามยอดนิยม ({visibleStadiums.length} อันดับแรก)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Legend */}
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500 shadow-2xs"></span>
                  <span>ออกบูธดีลเลอร์</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                  <span className="w-3 h-3 rounded-sm bg-blue-500 shadow-2xs"></span>
                  <span>รับบัตรดูบอล</span>
                </span>
              </div>

              {/* Sub-toggle: Stacked vs Grouped */}
              <div className="inline-flex p-0.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setVerticalBarStyle('stacked')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    verticalBarStyle === 'stacked'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  แท่งซ้อนรวม (Stacked)
                </button>
                <button
                  type="button"
                  onClick={() => setVerticalBarStyle('grouped')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    verticalBarStyle === 'grouped'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  แท่งคู่แยกประเภท (Grouped)
                </button>
              </div>
            </div>
          </div>

          {/* MAIN VERTICAL CHART PLOTTING STAGE */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-2xs">
            <div className="relative">
              {/* Y-Axis Unit Header */}
              <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center justify-between">
                <span>{sortMetric === 'ticketQty' ? 'แกน Y: จำนวนตั๋วรวม (ใบ)' : 'แกน Y: จำนวนคำขอ (ครั้ง)'}</span>
                <span className="text-[10px] text-slate-400">แกน X: สนามเหย้าที่ได้รับความนิยม</span>
              </div>

              {/* Chart Plotting Area */}
              <div className="flex">
                {/* Left Y-Axis Numbers */}
                <div className="flex flex-col justify-between pr-3 h-64 text-[10px] font-mono font-semibold text-slate-400 select-none text-right shrink-0 border-r border-slate-200">
                  {yAxisTicks.map((val, idx) => (
                    <span key={idx} className="-translate-y-1/2">{val}</span>
                  ))}
                </div>

                {/* Plotting Canvas with Horizontal Gridlines & Vertical Bars */}
                <div className="relative flex-1 overflow-x-auto min-h-[350px] pl-3 pb-2">
                  {/* Background Horizontal Gridlines */}
                  <div className="absolute inset-x-0 top-0 h-64 flex flex-col justify-between pointer-events-none pl-3">
                    {yAxisTicks.map((_, idx) => (
                      <div 
                        key={idx} 
                        className={`w-full ${idx === yAxisTicks.length - 1 ? 'border-b-2 border-slate-300' : 'border-b border-dashed border-slate-100'}`} 
                      />
                    ))}
                  </div>

                  {/* Vertical Columns Container */}
                  <div className="relative z-10 flex items-end gap-3 sm:gap-5 h-64 min-w-max px-2">
                    {visibleStadiums.map((item, idx) => {
                      const rank = idx + 1;
                      const isHovered = hoveredStadium === item.stadiumName;
                      const isTopRank = rank <= 3;

                      // Calculations for vertical bar heights
                      const totalVal = sortMetric === 'booth' 
                        ? item.boothRequests 
                        : sortMetric === 'ticket' 
                        ? item.ticketRequests 
                        : sortMetric === 'ticketQty' 
                        ? item.totalTicketQty 
                        : item.totalRequests;

                      const barTotalPct = Math.min(100, Math.max(totalVal > 0 ? 5 : 0, Math.round((totalVal / yAxisMax) * 100)));
                      
                      const boothPctOfMax = Math.min(100, Math.max(item.boothRequests > 0 ? 5 : 0, Math.round((item.boothRequests / yAxisMax) * 100)));
                      const ticketPctOfMax = Math.min(100, Math.max(item.ticketRequests > 0 ? 5 : 0, Math.round((item.ticketRequests / yAxisMax) * 100)));

                      // Stacked proportions
                      const boothPctOfTotal = item.totalRequests > 0 ? (item.boothRequests / item.totalRequests) * 100 : 0;
                      const ticketPctOfTotal = item.totalRequests > 0 ? (item.ticketRequests / item.totalRequests) * 100 : 0;

                      return (
                        <div 
                          key={item.stadiumName}
                          onMouseEnter={() => setHoveredStadium(item.stadiumName)}
                          onMouseLeave={() => setHoveredStadium(null)}
                          onClick={() => setHoveredStadium(hoveredStadium === item.stadiumName ? null : item.stadiumName)}
                          className={`flex flex-col items-center justify-end h-full w-20 sm:w-24 group cursor-pointer transition-all duration-200 ${
                            isHovered ? 'scale-105 z-20' : 'z-10'
                          }`}
                        >
                          {/* Value / Rank Badge on Top of Bar */}
                          <div className="mb-2 flex flex-col items-center transition-transform group-hover:-translate-y-1">
                            <span className="text-[11px] font-bold">
                              {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                            </span>
                            <span className={`text-[11px] font-black px-2 py-0.5 rounded-full shadow-2xs transition-colors ${
                              isHovered 
                                ? 'bg-slate-900 text-white' 
                                : isTopRank 
                                ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}>
                              {totalVal}
                            </span>
                          </div>

                          {/* THE VERTICAL BAR COLUMN */}
                          <div className="w-full flex items-end justify-center h-full max-h-52">
                            {verticalBarStyle === 'stacked' ? (
                              /* STACKED VERTICAL COLUMN (บูธ + บัตร) */
                              <div 
                                className={`w-9 sm:w-11 rounded-t-xl overflow-hidden flex flex-col-reverse transition-all duration-300 shadow-xs ${
                                  isHovered ? 'ring-2 ring-sky-500 ring-offset-2' : ''
                                }`}
                                style={{ height: `${barTotalPct}%` }}
                              >
                                {/* Bottom Segment: Booth (Emerald) */}
                                {item.boothRequests > 0 && (
                                  <div 
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 transition-colors"
                                    style={{ height: `${boothPctOfTotal}%` }}
                                    title={`ออกบูธ: ${item.boothRequests} ครั้ง`}
                                  />
                                )}
                                {/* Top Segment: Ticket (Blue) */}
                                {item.ticketRequests > 0 && (
                                  <div 
                                    className="w-full bg-blue-500 hover:bg-blue-600 transition-colors"
                                    style={{ height: `${ticketPctOfTotal}%` }}
                                    title={`รับบัตร: ${item.ticketRequests} ครั้ง (${item.totalTicketQty} ใบ)`}
                                  />
                                )}
                              </div>
                            ) : (
                              /* GROUPED DUAL VERTICAL COLUMNS (บูธ vs บัตร เคียงคู่กัน) */
                              <div className="flex items-end gap-1.5 w-full justify-center">
                                {/* Bar 1: Booth (Emerald) */}
                                <div 
                                  className={`w-4 sm:w-5 bg-emerald-500 rounded-t-lg transition-all duration-300 shadow-2xs hover:bg-emerald-600 ${
                                    isHovered ? 'ring-1 ring-emerald-600' : ''
                                  }`}
                                  style={{ height: `${boothPctOfMax}%` }}
                                  title={`ออกบูธ: ${item.boothRequests} ครั้ง`}
                                />
                                {/* Bar 2: Ticket (Blue) */}
                                <div 
                                  className={`w-4 sm:w-5 bg-blue-500 rounded-t-lg transition-all duration-300 shadow-2xs hover:bg-blue-600 ${
                                    isHovered ? 'ring-1 ring-blue-600' : ''
                                  }`}
                                  style={{ height: `${ticketPctOfMax}%` }}
                                  title={`รับบัตร: ${item.ticketRequests} ครั้ง (${item.totalTicketQty} ใบ)`}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* X-Axis Baseline & Labels */}
                  <div className="flex items-start gap-3 sm:gap-5 min-w-max px-2 pt-3 border-t-2 border-slate-300">
                    {visibleStadiums.map((item) => {
                      const isHovered = hoveredStadium === item.stadiumName;
                      const leagueMeta = LEAGUE_COLOR_MAP[item.league] || {
                        name: item.league,
                        badgeBg: 'bg-slate-100 text-slate-700',
                      };

                      return (
                        <div 
                          key={item.stadiumName}
                          onMouseEnter={() => setHoveredStadium(item.stadiumName)}
                          onMouseLeave={() => setHoveredStadium(null)}
                          onClick={() => setHoveredStadium(hoveredStadium === item.stadiumName ? null : item.stadiumName)}
                          className="w-20 sm:w-24 flex flex-col items-center text-center cursor-pointer"
                        >
                          <span className={`text-[9px] font-black px-1.5 py-0.2 rounded border mb-1.5 ${leagueMeta.badgeBg}`}>
                            {item.league === 'League 1' ? 'T1' : item.league === 'League 2' ? 'T2' : 'T3'}
                          </span>
                          <span 
                            className={`text-xs font-bold line-clamp-2 leading-tight transition-colors ${
                              isHovered ? 'text-sky-600 font-black' : 'text-slate-800'
                            }`}
                            title={item.stadiumName}
                          >
                            {item.stadiumName}
                          </span>
                          {item.homeClub && (
                            <span 
                              className="text-[10px] text-slate-400 line-clamp-1 mt-0.5"
                              title={item.homeClub}
                            >
                              {item.homeClub}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Hover / Selected Inspector Strip */}
            {hoveredItem ? (
              <div className="mt-5 p-3.5 rounded-xl bg-sky-50/70 border border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all animate-fadeIn">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-lg bg-sky-500 text-white font-black text-xs">
                    {visibleStadiums.findIndex(s => s.stadiumName === hoveredItem.stadiumName) + 1}
                  </span>
                  <div>
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <span>{hoveredItem.stadiumName}</span>
                      <span className="text-xs text-slate-500 font-normal">({hoveredItem.homeClub || hoveredItem.league})</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      แบรนด์ที่ขอเข้าร่วม: <strong className="text-slate-700">{hoveredItem.brands.join(', ') || 'ไม่มีข้อมูล'}</strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                    🏢 ออกบูธ {hoveredItem.boothRequests} ครั้ง
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 font-bold border border-blue-200">
                    🎟️ รับบัตร {hoveredItem.ticketRequests} ครั้ง ({hoveredItem.totalTicketQty} ใบ)
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-slate-900 text-white font-black">
                    รวม {hoveredItem.totalRequests} ครั้ง
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 pt-3 border-t border-slate-100 text-center text-[11px] text-slate-400">
                💡 ชี้เมาส์หรือคลิกที่แท่งกราฟแนวตั้งเพื่อดูข้อมูลรายละเอียดคำขอและแบรนด์ของสนามนั้น
              </div>
            )}
          </div>

          {/* Top Stadiums Ranking List (เรียงแถวเดียว สไตล์ Match Fixture) */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-1">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                <span>สรุปรายละเอียดสนามยอดนิยม ({visibleStadiums.length} อันดับแรก - เรียงลำดับแถวเดียว):</span>
              </div>
              <span className="text-[11px] text-slate-400">
                คลิกที่แถวเพื่อไฮไลต์กราฟแท่งด้านบน
              </span>
            </div>

            <div className="space-y-2">
              {visibleStadiums.map((item, idx) => {
                const rank = idx + 1;
                const isHovered = hoveredStadium === item.stadiumName;
                const leagueMeta = LEAGUE_COLOR_MAP[item.league] || {
                  name: item.league,
                  badgeBg: 'bg-slate-100 text-slate-700',
                };

                return (
                  <div 
                    key={item.stadiumName}
                    onMouseEnter={() => setHoveredStadium(item.stadiumName)}
                    onMouseLeave={() => setHoveredStadium(null)}
                    onClick={() => setHoveredStadium(hoveredStadium === item.stadiumName ? null : item.stadiumName)}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all duration-150 cursor-pointer ${
                      isHovered
                        ? 'bg-sky-50/70 border-sky-400 shadow-xs ring-1 ring-sky-400/50'
                        : rank === 1
                        ? 'bg-amber-50/40 border-amber-200 hover:border-amber-300 hover:bg-amber-50/60'
                        : rank === 2
                        ? 'bg-slate-50/60 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                        : rank === 3
                        ? 'bg-orange-50/30 border-orange-200 hover:border-orange-300 hover:bg-orange-50/50'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      {/* Left: Rank Badge + League + Stadium Name + Home Club */}
                      <div className="flex items-center gap-3 min-w-0 lg:w-5/12">
                        {/* Rank Badge */}
                        <div className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 shadow-2xs ${
                          rank === 1 
                            ? 'bg-amber-500 text-white shadow-amber-200' 
                            : rank === 2 
                            ? 'bg-slate-400 text-white' 
                            : rank === 3 
                            ? 'bg-amber-700 text-white' 
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                        </div>

                        {/* Stadium Name & Club */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black px-1.5 py-0.2 rounded border shrink-0 ${leagueMeta.badgeBg}`}>
                              {item.league === 'League 1' ? 'T1' : item.league === 'League 2' ? 'T2' : 'T3'}
                            </span>
                            <span 
                              className={`text-sm font-bold truncate transition-colors ${
                                isHovered ? 'text-sky-600' : 'text-slate-900'
                              }`} 
                              title={item.stadiumName}
                            >
                              {item.stadiumName}
                            </span>
                          </div>
                          {item.homeClub && (
                            <div className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-1.5">
                              <span className="text-[11px] text-slate-400 font-medium">สโมสรเหย้า:</span>
                              <span className="font-semibold text-slate-700">{item.homeClub}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Middle: Brands tags */}
                      <div className="min-w-0 lg:w-3/12 flex items-center gap-1.5 flex-wrap">
                        {item.brands.length > 0 ? (
                          <>
                            <span className="text-[11px] text-slate-400 font-medium shrink-0">แบรนด์:</span>
                            {item.brands.map(b => (
                              <span 
                                key={b} 
                                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs"
                              >
                                {b}
                              </span>
                            ))}
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400">-</span>
                        )}
                      </div>

                      {/* Right: Metrics Pills (ออกบูธ / รับบัตร / รวม) */}
                      <div className="flex items-center gap-2 self-start lg:self-center shrink-0 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <Building2 className="w-3 h-3 text-emerald-600" />
                          <span>ออกบูธ {item.boothRequests} ครั้ง</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                          <Ticket className="w-3 h-3 text-blue-600" />
                          <span>รับบัตร {item.ticketRequests} ครั้ง ({item.totalTicketQty} ใบ)</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-black px-3 py-1 rounded-xl bg-slate-900 text-white shadow-2xs">
                          <span>รวม {item.totalRequests} ครั้ง</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* TABLE RANKING VIEW */
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 text-center w-12">อันดับ</th>
                <th className="py-3 px-4">สนาม & ลีก</th>
                <th className="py-3 px-4 text-center">ขอออกบูธ</th>
                <th className="py-3 px-4 text-center">ขอรับบัตร</th>
                <th className="py-3 px-4 text-center">จำนวนตั๋วรวม</th>
                <th className="py-3 px-4 text-center">รวมทุกคำขอ</th>
                <th className="py-3 px-4">แบรนด์ที่ลงทะเบียน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleStadiums.map((item, idx) => {
                const rank = idx + 1;
                const leagueMeta = LEAGUE_COLOR_MAP[item.league] || {
                  name: item.league,
                  badgeBg: 'bg-slate-100 text-slate-700',
                };

                return (
                  <tr key={item.stadiumName} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 text-center font-bold">
                      {rank === 1 ? '🥇 1' : rank === 2 ? '🥈 2' : rank === 3 ? '🥉 3' : rank}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{item.stadiumName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${leagueMeta.badgeBg}`}>
                          {item.league}
                        </span>
                        {item.homeClub && (
                          <span className="text-[10px] text-slate-500">{item.homeClub}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {item.boothRequests} ครั้ง
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {item.ticketRequests} ครั้ง
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-900">
                      {item.totalTicketQty} ใบ
                    </td>
                    <td className="py-3 px-4 text-center font-extrabold text-slate-900">
                      {item.totalRequests}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 flex-wrap">
                        {item.brands.map(b => (
                          <span key={b} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            {b}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination / Limit Toggle */}
      {stadiumStats.length > 5 && (
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs text-slate-500">
          <span>
            แสดง {visibleStadiums.length} จากทั้งหมด {stadiumStats.length} สนาม
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setDisplayLimit(5)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                displayLimit === 5 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Top 5
            </button>
            <button
              onClick={() => setDisplayLimit(10)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                displayLimit === 10 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Top 10
            </button>
            <button
              onClick={() => setDisplayLimit(999)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                displayLimit >= 999 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              แสดงทั้งหมด ({stadiumStats.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
