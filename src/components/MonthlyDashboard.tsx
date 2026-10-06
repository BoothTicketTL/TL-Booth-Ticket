import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  CalendarDays, 
  Building2, 
  Ticket, 
  ChevronRight, 
  Sparkles, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  Layers, 
  PieChart as PieChartIcon,
  MessageSquare,
  Trophy,
  ArrowRight,
  Database,
  Check,
  BarChart3,
  Calendar,
  Download,
  Filter,
  Lock,
  Shield,
  Mail,
  Send,
  Search,
  FileSpreadsheet
} from 'lucide-react';
import { RegistrationRecord, LeagueType, UserProfile } from '../types';
import { LEAGUE_COLOR_MAP, SPONSOR_BRANDS } from '../data/fixtures';
import { DonutPieChart, PieChartSegment } from './DonutPieChart';
import { SeasonProportionPieCard } from './SeasonProportionPieCard';
import { StadiumPopularityChart } from './StadiumPopularityChart';
import { AutoEmailExportModal, EmailExportPayload } from './AutoEmailExportModal';
import { 
  SUPPORTED_SEASONS, 
  DEFAULT_SEASON, 
  getSeasonMonths, 
  computeSeasonSummary, 
  computeMonthSummary,
  getRecordSeason,
  isRecordBoothActive,
  isRecordTicketActive,
  TOTAL_SEASON_MATCHES 
} from '../lib/seasonService';

interface MonthlyDashboardProps {
  records: RegistrationRecord[];
  selectedLeagueFilter: LeagueType | 'All';
  onNavigateToRegister: () => void;
  currentUser?: UserProfile | null;
}

export const MonthlyDashboard: React.FC<MonthlyDashboardProps> = ({
  records,
  selectedLeagueFilter,
  onNavigateToRegister,
  currentUser,
}) => {
  // Brand restriction check: non-admin users with assigned brand are locked to viewing only their brand
  const isBrandRestricted = currentUser?.role === 'user' && !!currentUser?.assignedBrand && currentUser.assignedBrand !== 'All';
  const effectiveBrand = isBrandRestricted ? currentUser.assignedBrand : null;

  // Filter accessible records for this user (locks out other brand data)
  const accessibleRecords = useMemo(() => {
    if (isBrandRestricted && effectiveBrand) {
      return records.filter(r => r.brand === effectiveBrand);
    }
    return records;
  }, [records, isBrandRestricted, effectiveBrand]);

  // Season selector state (default to 2026/27)
  const [selectedSeason, setSelectedSeason] = useState<string>(DEFAULT_SEASON);

  // Active view mode: 'season-overview' (ภาพรวมทั้งฤดูกาล) or 'monthly-detail' (เจาะลึกรายเดือน)
  const [viewMode, setViewMode] = useState<'season-overview' | 'monthly-detail'>('season-overview');

  // Topic Tab state: 'overview' | 'proportions' | 'stadiums'
  const [activeTopicTab, setActiveTopicTab] = useState<'overview' | 'proportions' | 'stadiums'>('overview');

  // Email Export Modal State
  const [emailModalPayload, setEmailModalPayload] = useState<EmailExportPayload | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState<boolean>(false);

  // Months available for the selected season
  const seasonMonths = useMemo(() => {
    return getSeasonMonths(selectedSeason);
  }, [selectedSeason]);

  // Active month key for monthly detail view (defaults to 2nd month of season or first available)
  const [activeMonthKey, setActiveMonthKey] = useState<string>(() => {
    const initialMonths = getSeasonMonths(DEFAULT_SEASON);
    return initialMonths[1]?.key || initialMonths[0]?.key || '2026-09';
  });

  // When season changes, ensure activeMonthKey is valid within the new season
  const handleSeasonChange = (newSeasonId: string) => {
    setSelectedSeason(newSeasonId);
    const newMonths = getSeasonMonths(newSeasonId);
    if (newMonths.length > 0) {
      // Pick September or first month of the new season
      const sep = newMonths.find(m => m.key.endsWith('-09'));
      setActiveMonthKey(sep ? sep.key : newMonths[0].key);
    }
  };

  // 1. Season level summary calculation
  const seasonSummary = useMemo(() => {
    return computeSeasonSummary(selectedSeason, accessibleRecords, selectedLeagueFilter);
  }, [selectedSeason, accessibleRecords, selectedLeagueFilter]);

  // Records belonging to the active selected season
  const seasonRecords = useMemo(() => {
    return accessibleRecords.filter(r => {
      const s = getRecordSeason(r);
      if (s !== selectedSeason) return false;
      if (selectedLeagueFilter !== 'All' && r.league !== selectedLeagueFilter) return false;
      return true;
    });
  }, [accessibleRecords, selectedSeason, selectedLeagueFilter]);

  // 2. Active month summary calculation (for monthly detail view)
  const monthSummary = useMemo(() => {
    return computeMonthSummary(activeMonthKey, seasonRecords, selectedLeagueFilter);
  }, [activeMonthKey, seasonRecords, selectedLeagueFilter]);

  // Records for the active month
  const activeMonthRecords = useMemo(() => {
    return seasonRecords.filter(r => 
      r.month === activeMonthKey || (r.matchDate && r.matchDate.startsWith(activeMonthKey))
    );
  }, [seasonRecords, activeMonthKey]);

  // Active month label
  const activeMonthInfo = useMemo(() => {
    return seasonMonths.find(m => m.key === activeMonthKey) || {
      key: activeMonthKey,
      nameThai: activeMonthKey,
      shortThai: activeMonthKey,
    };
  }, [seasonMonths, activeMonthKey]);

  // ==========================================
  // PIE CHART DATA: SEASON OVERVIEW
  // ==========================================
  // 1. Season Brand Booth Share
  const seasonBrandBoothPieData: PieChartSegment[] = useMemo(() => {
    return SPONSOR_BRANDS.map(b => {
      const bStat = seasonSummary.brandStats.find(s => s.brand === b.id);
      return {
        id: b.id,
        label: b.id,
        value: bStat?.totalBooths || 0,
        color: b.color,
      };
    });
  }, [seasonSummary]);

  // 2. Season Brand Ticket Share
  const seasonBrandTicketPieData: PieChartSegment[] = useMemo(() => {
    return SPONSOR_BRANDS.map(b => {
      const bStat = seasonSummary.brandStats.find(s => s.brand === b.id);
      return {
        id: b.id,
        label: b.id,
        value: bStat?.totalTickets || 0,
        color: b.color,
      };
    });
  }, [seasonSummary]);

  // 3. Season League Ticket Share (3 Colors: Red, Blue, Green)
  const seasonLeaguePieData: PieChartSegment[] = useMemo(() => {
    return [
      { id: 'l1', label: 'League 1 (แดง)', value: seasonSummary.byLeague['League 1'].tickets, color: '#dc2626' },
      { id: 'l2', label: 'League 2 (น้ำเงิน)', value: seasonSummary.byLeague['League 2'].tickets, color: '#2563eb' },
      { id: 'l3', label: 'League 3 (เขียว)', value: seasonSummary.byLeague['League 3'].tickets, color: '#059669' },
    ];
  }, [seasonSummary]);

  // ==========================================
  // PIE CHART DATA: MONTHLY DETAIL
  // ==========================================
  const monthlyBrandPieData: PieChartSegment[] = useMemo(() => {
    const brandCounts: Record<string, number> = {};
    SPONSOR_BRANDS.forEach(b => { brandCounts[b.id] = 0; });
    activeMonthRecords.forEach(r => {
      if (r.brand && brandCounts[r.brand] !== undefined) {
        brandCounts[r.brand] += 1;
      }
    });

    return SPONSOR_BRANDS.map(b => ({
      id: b.id,
      label: b.id,
      value: brandCounts[b.id] || 0,
      color: b.color,
    }));
  }, [activeMonthRecords]);

  const monthlyLeaguePieData: PieChartSegment[] = useMemo(() => {
    let l1 = 0;
    let l2 = 0;
    let l3 = 0;
    activeMonthRecords.forEach(r => {
      const qty = r.ticketQuantity || 0;
      if (r.league === 'League 1') l1 += qty;
      if (r.league === 'League 2') l2 += qty;
      if (r.league === 'League 3') l3 += qty;
    });

    return [
      { id: 'l1', label: 'League 1 (แดง)', value: l1, color: '#dc2626' },
      { id: 'l2', label: 'League 2 (น้ำเงิน)', value: l2, color: '#2563eb' },
      { id: 'l3', label: 'League 3 (เขียว)', value: l3, color: '#059669' },
    ];
  }, [activeMonthRecords]);

  const monthlyTypePieData: PieChartSegment[] = useMemo(() => {
    let bothCount = 0;
    let boothOnly = 0;
    let ticketOnly = 0;

    activeMonthRecords.forEach(r => {
      const isBooth = isRecordBoothActive(r);
      const isTicket = isRecordTicketActive(r);

      if (isBooth && isTicket) bothCount++;
      else if (isBooth && !isTicket) boothOnly++;
      else if (!isBooth && isTicket) ticketOnly++;
    });

    return [
      { id: 'booth-only', label: '2.1 ขอออกบูธอย่างเดียว', value: boothOnly, color: '#10b981' },
      { id: 'ticket-only', label: '2.2 ขอรับบัตรอย่างเดียว', value: ticketOnly, color: '#3b82f6' },
      { id: 'both', label: '2.3 ขอทั้งออกบูธ&รับบัตร', value: bothCount, color: '#8b5cf6' },
    ];
  }, [activeMonthRecords]);

  // Jump into a specific month from the season overview
  const handleDrillDownToMonth = (monthKey: string) => {
    setActiveMonthKey(monthKey);
    setViewMode('monthly-detail');
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  // 3 Main Topics for clean tabbed layout
  const TOPIC_TABS = useMemo(() => [
    {
      id: 'overview' as const,
      label: '1. ภาพรวม & สถิติสรุป',
      shortLabel: 'ภาพรวม',
      icon: BarChart3,
      desc: 'KPI รวม, สัดส่วน 3 ลีก (แดง/น้ำเงิน/เขียว), สรุปตามแบรนด์',
    },
    {
      id: 'proportions' as const,
      label: '2. สัดส่วน 3 ประเภท & 1,274 นัด',
      shortLabel: 'สัดส่วน 3 สิทธิ',
      icon: PieChartIcon,
      desc: '2.1 ขอออกบูธอย่างเดียว / 2.2 ขอรับบัตรอย่างเดียว / 2.3 ขอทั้งคู่',
    },
    {
      id: 'stadiums' as const,
      label: '3. สถิติสนามยอดนิยม',
      shortLabel: 'สนามยอดนิยม',
      icon: Trophy,
      desc: 'จัดอันดับสนามเหย้าที่มีการขอออกบูธและรับบัตรมากที่สุด',
    },
  ], []);

  // Helper to extract Thai month name and BE year
  const getThaiMonthYear = (monthKey: string) => {
    const parts = monthKey.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const monthName = !isNaN(m) && m >= 1 && m <= 12 ? thaiMonths[m - 1] : monthKey;
    const beYear = !isNaN(y) ? y + 543 : '';
    return { monthName, beYear };
  };

  // Helper to build topic export payload & intuitive Thai filenames
  const buildTopicExportData = (topic: 'overview' | 'proportions' | 'stadiums') => {
    const isMonth = viewMode === 'monthly-detail';
    const currentRecords = isMonth ? activeMonthRecords : seasonRecords;
    const currentScopeLabel = isMonth ? `${activeMonthInfo.nameThai} (${activeMonthKey})` : `ทั้งฤดูกาล ${selectedSeason}`;
    const { monthName, beYear } = getThaiMonthYear(activeMonthKey);
    
    let topicTitle = '';
    let suggestedFilename = '';
    let summaryMetrics: { label: string; value: string | number; subtext?: string }[] = [];
    let customTableData: Record<string, any>[] = [];

    if (topic === 'overview') {
      topicTitle = isMonth 
        ? `สรุปภาพรวม & ตัวเลขสถิติ (${activeMonthInfo.shortThai})` 
        : `สรุปภาพรวม & ตัวเลขสถิติทั้งฤดูกาล (${selectedSeason})`;
      suggestedFilename = isMonth
        ? `สรุปภาพรวม & ตัวเลขสถิติ เดือน${monthName} พ.ศ. ${beYear}.xlsx`
        : `สรุปภาพรวม & ตัวเลขสถิติ ฤดูกาล ${selectedSeason.replace('/', '-')}.xlsx`;

      const currentSum = isMonth ? monthSummary : seasonSummary;
      summaryMetrics = [
        { label: 'คำขอทั้งหมด', value: `${currentSum.totalRegistrations} รายการ`, subtext: `อนุมัติแล้ว ${isMonth ? monthSummary.byStatus.approved : seasonSummary.approvedRegistrations} รายการ` },
        { label: 'ขอออกบูธดีลเลอร์', value: `${currentSum.totalBooths} ครั้ง`, subtext: 'ไม่นับช่องที่กรอกเครื่องหมาย -' },
        { label: 'ขอรับบัตรดูบอล', value: `${currentSum.totalTickets.toLocaleString()} ใบ`, subtext: 'ไม่นับช่องที่กรอกจำนวน 0' },
        { label: 'League 1 (แดง)', value: `${currentSum.byLeague['League 1'].booths} บูธ / ${currentSum.byLeague['League 1'].tickets} บัตร`, subtext: `รวม ${currentSum.byLeague['League 1'].registrations} คำขอ` },
        { label: 'League 2 (น้ำเงิน)', value: `${currentSum.byLeague['League 2'].booths} บูธ / ${currentSum.byLeague['League 2'].tickets} บัตร`, subtext: `รวม ${currentSum.byLeague['League 2'].registrations} คำขอ` },
        { label: 'League 3 (เขียว)', value: `${currentSum.byLeague['League 3'].booths} บูธ / ${currentSum.byLeague['League 3'].tickets} บัตร`, subtext: `รวม ${currentSum.byLeague['League 3'].registrations} คำขอ` },
      ];
      customTableData = SPONSOR_BRANDS.map(b => {
        const bStat = seasonSummary.brandStats.find(s => s.brand === b.id);
        return {
          'แบรนด์ผู้สนับสนุน': b.id,
          'ชื่อบริษัท': b.name,
          'ขอออกบูธ (ครั้ง)': bStat?.totalBooths || 0,
          'ขอรับบัตร (ใบ)': bStat?.totalTickets || 0,
          'League 1 (บูธ/บัตร)': `${bStat?.byLeague['League 1'].booths || 0} บูธ / ${bStat?.byLeague['League 1'].tickets || 0} ใบ`,
          'League 2 (บูธ/บัตร)': `${bStat?.byLeague['League 2'].booths || 0} บูธ / ${bStat?.byLeague['League 2'].tickets || 0} ใบ`,
          'League 3 (บูธ/บัตร)': `${bStat?.byLeague['League 3'].booths || 0} บูธ / ${bStat?.byLeague['League 3'].tickets || 0} ใบ`,
          'อนุมัติแล้ว (บูธ)': bStat?.approvedBooths || 0,
          'อนุมัติแล้ว (บัตร)': bStat?.approvedTickets || 0,
        };
      });
    } else if (topic === 'proportions') {
      topicTitle = `สัดส่วน 3 ประเภทคำขอ & เทียบ 1,274 แมตช์ (${currentScopeLabel})`;
      suggestedFilename = isMonth
        ? `สัดส่วน 3 ประเภท เดือน${monthName} พ.ศ. ${beYear}.xlsx`
        : `สัดส่วน 3 ประเภท.xlsx`;
      
      const matchMap = new Map<string, { booth: boolean; ticket: boolean }>();
      currentRecords.forEach(r => {
        const key = `${r.league}_${r.matchTitle}_${r.matchDate}`.trim();
        const existing = matchMap.get(key) || { booth: false, ticket: false };
        if (isRecordBoothActive(r)) existing.booth = true;
        if (isRecordTicketActive(r)) existing.ticket = true;
        matchMap.set(key, existing);
      });

      let boothOnly = 0;
      let ticketOnly = 0;
      let both = 0;
      matchMap.forEach(v => {
        if (v.booth && v.ticket) both++;
        else if (v.booth && !v.ticket) boothOnly++;
        else if (!v.booth && v.ticket) ticketOnly++;
      });

      const activeMatchesTotal = boothOnly + ticketOnly + both;
      const seasonTotal = TOTAL_SEASON_MATCHES; // 1,274
      const remainingMatches = Math.max(0, seasonTotal - activeMatchesTotal);

      summaryMetrics = [
        { label: '2.1 ขอออกบูธอย่างเดียว', value: `${boothOnly} แมตช์`, subtext: `${((boothOnly / seasonTotal) * 100).toFixed(1)}% ของ 1,274 นัด` },
        { label: '2.2 ขอรับบัตรอย่างเดียว', value: `${ticketOnly} แมตช์`, subtext: `${((ticketOnly / seasonTotal) * 100).toFixed(1)}% ของ 1,274 นัด` },
        { label: '2.3 ขอทั้งออกบูธ & รับบัตร', value: `${both} แมตช์`, subtext: `${((both / seasonTotal) * 100).toFixed(1)}% ของ 1,274 นัด` },
        { label: 'รวมแมตช์ที่มีคำขอ', value: `${activeMatchesTotal} แมตช์`, subtext: `${((activeMatchesTotal / seasonTotal) * 100).toFixed(1)}% ของ 1,274 นัด` },
        { label: 'โควตารวม 3 ลีก', value: `${seasonTotal.toLocaleString()} แมตช์`, subtext: 'T1: 240, T2: 306, T3: 728' },
        { label: 'แมตช์ที่ยังไม่มีคำขอ', value: `${remainingMatches.toLocaleString()} แมตช์`, subtext: `${((remainingMatches / seasonTotal) * 100).toFixed(1)}% ของทั้งฤดูกาล` },
      ];

      customTableData = [
        { 'หมวดหมู่คำขอ': '2.1 ขอออกบูธอย่างเดียว', 'จำนวนแมตช์': boothOnly, 'สัดส่วนจาก 1,274 แมตช์ (%)': `${((boothOnly / seasonTotal) * 100).toFixed(2)}%`, 'สัดส่วนจากแมตช์ที่มีคำขอ (%)': activeMatchesTotal > 0 ? `${((boothOnly / activeMatchesTotal) * 100).toFixed(2)}%` : '0%' },
        { 'หมวดหมู่คำขอ': '2.2 ขอรับบัตรอย่างเดียว', 'จำนวนแมตช์': ticketOnly, 'สัดส่วนจาก 1,274 แมตช์ (%)': `${((ticketOnly / seasonTotal) * 100).toFixed(2)}%`, 'สัดส่วนจากแมตช์ที่มีคำขอ (%)': activeMatchesTotal > 0 ? `${((ticketOnly / activeMatchesTotal) * 100).toFixed(2)}%` : '0%' },
        { 'หมวดหมู่คำขอ': '2.3 ขอทั้งออกบูธ & รับบัตร', 'จำนวนแมตช์': both, 'สัดส่วนจาก 1,274 แมตช์ (%)': `${((both / seasonTotal) * 100).toFixed(2)}%`, 'สัดส่วนจากแมตช์ที่มีคำขอ (%)': activeMatchesTotal > 0 ? `${((both / activeMatchesTotal) * 100).toFixed(2)}%` : '0%' },
        { 'หมวดหมู่คำขอ': 'รวมแมตช์ที่มีคำขอ', 'จำนวนแมตช์': activeMatchesTotal, 'สัดส่วนจาก 1,274 แมตช์ (%)': `${((activeMatchesTotal / seasonTotal) * 100).toFixed(2)}%`, 'สัดส่วนจากแมตช์ที่มีคำขอ (%)': '100%' },
        { 'หมวดหมู่คำขอ': 'แมตช์ที่ยังไม่มีคำขอ', 'จำนวนแมตช์': remainingMatches, 'สัดส่วนจาก 1,274 แมตช์ (%)': `${((remainingMatches / seasonTotal) * 100).toFixed(2)}%`, 'สัดส่วนจากแมตช์ที่มีคำขอ (%)': '-' },
      ];
    } else if (topic === 'stadiums') {
      topicTitle = `สถิติสนามยอดนิยม (Top Stadiums) - ${currentScopeLabel}`;
      suggestedFilename = isMonth
        ? `สถิติสนามยอดนิยม เดือน${monthName} พ.ศ. ${beYear}.xlsx`
        : `สถิติสนามยอดนิยม.xlsx`;
      
      const stadiumMap = new Map<string, { 
        stadium: string; 
        league: string; 
        booths: number; 
        ticketRequests: number; 
        tickets: number; 
        total: number;
        brands: string[];
      }>();
      currentRecords.forEach(r => {
        const sName = r.stadium?.trim() || 'ไม่ระบุสนาม';
        const isBooth = isRecordBoothActive(r);
        const isTicket = isRecordTicketActive(r);
        const tQty = isTicket ? (Number(r.ticketQuantity) || 0) : 0;
        
        const prev = stadiumMap.get(sName) || { 
          stadium: sName, 
          league: r.league, 
          booths: 0, 
          ticketRequests: 0, 
          tickets: 0, 
          total: 0,
          brands: [] 
        };
        if (isBooth) prev.booths += 1;
        if (isTicket) {
          prev.ticketRequests += 1;
          prev.tickets += tQty;
        }
        // รวมกิจกรรมทั้งหมด = ขอออกบูธ (ครั้ง) + ขอรับบัตร (ครั้ง)
        prev.total = prev.booths + prev.ticketRequests;
        if (r.brand && !prev.brands.includes(r.brand)) {
          prev.brands.push(r.brand);
        }
        stadiumMap.set(sName, prev);
      });

      const sortedStadiums = Array.from(stadiumMap.values()).sort((a, b) => b.total - a.total || b.tickets - a.tickets);
      const top1 = sortedStadiums[0];

      summaryMetrics = [
        { 
          label: 'สนามยอดนิยมอันดับ 1', 
          value: top1 ? top1.stadium : '-', 
          subtext: top1 
            ? `${top1.total} กิจกรรม (ขอออกบูธ ${top1.booths} ครั้ง, ขอรับบัตร ${top1.ticketRequests} ครั้ง = ${top1.tickets.toLocaleString()} ใบ)` 
            : undefined 
        },
        { label: 'จำนวนสนามที่มีคำขอ', value: `${sortedStadiums.length} สนาม`, subtext: currentScopeLabel },
        { label: 'ยอดรวมขอออกบูธในสนาม', value: `${sortedStadiums.reduce((acc, s) => acc + s.booths, 0)} ครั้ง`, subtext: 'นับจำนวนครั้งที่ขอออกบูธ' },
        { 
          label: 'ยอดรวมขอรับบัตรในสนาม', 
          value: `${sortedStadiums.reduce((acc, s) => acc + s.ticketRequests, 0)} ครั้ง (= ${sortedStadiums.reduce((acc, s) => acc + s.tickets, 0).toLocaleString()} ใบ)`, 
          subtext: 'จำนวนครั้งและยอดรวมใบตั๋ว' 
        },
      ];

      customTableData = sortedStadiums.map((s, idx) => ({
        'อันดับ': idx + 1,
        'ชื่อสนาม': s.stadium,
        'ลีก': s.league,
        'รวมกิจกรรมทั้งหมด (ครั้ง)': s.total,
        'ขอออกบูธ (ครั้ง)': s.booths,
        'ขอรับบัตร (ครั้ง)': s.ticketRequests,
        'สรุปขอรับบัตร': `${s.ticketRequests} ครั้ง (= ${s.tickets.toLocaleString()} ใบ)`,
        'จำนวนบัตรรวม (ใบ)': s.tickets,
        'แบรนด์ผู้สนับสนุน': s.brands.join(', ') || '-',
      }));
    }

    return {
      topicTitle,
      suggestedFilename,
      currentScopeLabel,
      currentRecords,
      summaryMetrics,
      customTableData,
    };
  };

  // Handler to open Email Export Modal with dynamic payload for the requested topic
  const handleOpenEmailExport = (topic: 'overview' | 'proportions' | 'stadiums') => {
    const data = buildTopicExportData(topic);
    setEmailModalPayload({
      topicId: topic,
      topicTitle: data.topicTitle,
      scopeLabel: data.currentScopeLabel,
      selectedSeason,
      selectedLeagueFilter,
      suggestedFilename: data.suggestedFilename,
      records: data.currentRecords,
      summaryMetrics: data.summaryMetrics,
      customTableData: data.customTableData,
    });
    setIsEmailModalOpen(true);
  };

  // Direct Excel download handler
  const handleDirectExcelDownload = (topic: 'overview' | 'proportions' | 'stadiums') => {
    try {
      const data = buildTopicExportData(topic);
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary Metrics
      const summaryRows = [
        { 'หัวข้อรายงาน': data.topicTitle, 'ขอบเขต': data.currentScopeLabel, 'ฤดูกาล': selectedSeason },
        {},
        { 'ตัวชี้วัด (Key Metrics)': 'ค่าที่ได้', 'หมายเหตุ': '' },
        ...data.summaryMetrics.map(m => ({
          'ตัวชี้วัด (Key Metrics)': m.label,
          'ค่าที่ได้': m.value,
          'หมายเหตุ': m.subtext || '',
        })),
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 32 }, { wch: 45 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      // Sheet 2: Detailed Data (if available)
      if (data.customTableData && data.customTableData.length > 0) {
        const wsDetail = XLSX.utils.json_to_sheet(data.customTableData);
        const colKeys = Object.keys(data.customTableData[0]);
        wsDetail['!cols'] = colKeys.map(k => {
          let maxLen = k.length;
          data.customTableData!.forEach(row => {
            const val = String(row[k] ?? '');
            if (val.length > maxLen) maxLen = val.length;
          });
          return { wch: Math.max(maxLen + 4, 12) };
        });
        XLSX.utils.book_append_sheet(wb, wsDetail, 'Data Detail');
      }

      XLSX.writeFile(wb, data.suggestedFilename);
    } catch (err) {
      console.error('Error generating direct Excel download:', err);
    }
  };

  // Render Top Action Bar for each topic
  const renderTopicHeaderBar = (
    title: string,
    subtitle: string,
    topic: 'overview' | 'proportions' | 'stadiums',
    countBadge?: string
  ) => {
    const data = buildTopicExportData(topic);

    return (
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
              {TOPIC_TABS.find(t => t.id === topic)?.label}
            </span>
            {countBadge && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {countBadge}
              </span>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
            {title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => handleDirectExcelDownload(topic)}
            className="px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold text-xs transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title={`ดาวน์โหลดไฟล์ Excel (.xlsx): ${data.suggestedFilename}`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>ดาวน์โหลด Excel</span>
          </button>

          <button
            onClick={() => handleOpenEmailExport(topic)}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-700 hover:from-sky-700 hover:to-indigo-800 active:scale-98 text-white font-bold text-xs transition-all shadow-md shadow-sky-600/20 flex items-center gap-2 cursor-pointer"
            title="คลิกเพื่อส่งรายงานหัวข้อนี้ทาง E-mail อัตโนมัติ"
          >
            <Mail className="w-4 h-4 text-sky-200" />
            <span>Export ส่งทาง E-mail อัตโนมัติ</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Brand Restriction Notice Banner */}
      {isBrandRestricted && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/90 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  🔒 มุมมองเฉพาะแบรนด์ของคุณ (Brand Restricted View)
                </span>
                <span className="text-[11px] text-slate-500">
                  {currentUser?.email}
                </span>
              </div>
              <div className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
                กำลังแสดงผลเฉพาะข้อมูลการออกบูธ & รับบัตรของแบรนด์ <strong className="text-emerald-700 underline">{effectiveBrand}</strong>
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                ตั้งค่าโดย Admin Plan B Media เพื่อรักษาความเป็นส่วนตัวและป้องกันการเข้าถึงข้อมูลของแบรนด์อื่น
              </div>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-xs font-bold text-emerald-800 shadow-2xs self-start sm:self-auto shrink-0">
            <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>สิทธิ์เฉพาะ {effectiveBrand}</span>
          </div>
        </div>
      )}

      {/* ============================================================
          TOP HEADER BANNER & SEASON SELECTOR
          ============================================================ */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-semibold backdrop-blur-xs mb-3">
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span>ระบบจัดเก็บสถิติระยะยาว 5–10 ปี • Thai League Archive</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              สรุปยอดการออกบูธ & รับบัตรดูบอล
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1.5 max-w-2xl leading-relaxed">
              วิเคราะห์และติดตามข้อมูลสรุปของแต่ละแบรนด์ผู้สนับสนุนได้ทั้งในระดับภาพรวมทั้งฤดูกาล และเจาะลึกรายเดือน พร้อมระบบจัดเก็บข้อมูลระยะยาวสำหรับองค์กร
            </p>
          </div>

          {/* Quick Register Action */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={onNavigateToRegister}
              className="px-5 py-3 rounded-2xl bg-white text-slate-900 font-bold text-xs sm:text-sm hover:bg-slate-100 transition-colors shadow-sm flex items-center gap-2"
            >
              <span>ลงทะเบียนคำขอใหม่</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Season & View Mode Control Bar */}
        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Season Dropdown */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-400" />
              <label htmlFor="season-select" className="text-xs font-bold text-slate-200">
                เลือกฤดูกาลแข่งขัน:
              </label>
            </div>
            <div className="relative">
              <select
                id="season-select"
                value={selectedSeason}
                onChange={(e) => handleSeasonChange(e.target.value)}
                className="bg-slate-800 text-white border border-slate-700 font-semibold text-xs sm:text-sm rounded-xl px-4 py-2.5 pr-9 focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none cursor-pointer shadow-inner"
              >
                {SUPPORTED_SEASONS.map((season) => (
                  <option key={season.id} value={season.id} className="bg-slate-900 text-white">
                    {season.label}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2.5 pointer-events-none text-slate-400">
                <ChevronRight className="w-4 h-4 rotate-90" />
              </div>
            </div>

            <span className="text-[11px] px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 font-medium border border-sky-400/30">
              {SUPPORTED_SEASONS.find(s => s.id === selectedSeason)?.isCurrent ? 'ฤดูกาลปัจจุบัน' : 'คลังสถิติย้อนหลัง/อนาคต'}
            </span>
          </div>

          {/* View Mode Switcher (ภาพรวมทั้งฤดูกาล vs เจาะลึกรายเดือน) */}
          <div className="flex items-center bg-slate-800/90 p-1 rounded-2xl border border-slate-700/80 shadow-inner">
            <button
              onClick={() => setViewMode('season-overview')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                viewMode === 'season-overview'
                  ? 'bg-sky-500 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>ภาพรวมทั้งฤดูกาล</span>
            </button>
            <button
              onClick={() => setViewMode('monthly-detail')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                viewMode === 'monthly-detail'
                  ? 'bg-sky-500 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>เจาะลึกสรุปรายเดือน</span>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================
          VIEW 1: สรุปการออกบูธรับบัตรของแต่ละแบรนด์ของทั้งฤดูกาล
          (SEASON OVERVIEW)
          ============================================================ */}
      {viewMode === 'season-overview' && (
        <div className="space-y-6">
          {/* Season Highlights Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 text-white rounded-3xl p-6 border border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-sky-400 font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>สรุปการออกบูธและรับบัตรของแต่ละแบรนด์ตลอดทั้งฤดูกาล</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold">
                {seasonSummary.seasonLabel}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                รวมคำขอทั้งหมด {seasonSummary.totalRegistrations} รายการ • ขอออกบูธ {seasonSummary.totalBooths} ครั้ง • ขอรับบัตรดูบอล {seasonSummary.totalTickets.toLocaleString()} ใบ
              </p>
            </div>

            <button
              onClick={() => setViewMode('monthly-detail')}
              className="self-start md:self-auto px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors border border-white/20 flex items-center gap-2"
            >
              <span>คลิกเพื่อดูสรุปแยกรายเดือน</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* TOPIC TABS BAR (Season Overview) */}
          <div className="bg-white rounded-3xl p-2 sm:p-2.5 border border-slate-200 shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              {TOPIC_TABS.map((tab) => {
                const isSelected = activeTopicTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTopicTab(tab.id)}
                    className={`flex items-start sm:items-center gap-3 p-3 sm:p-3.5 rounded-2xl text-left transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
                        : 'bg-slate-50/70 hover:bg-slate-100/90 text-slate-700 border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-white text-slate-700 shadow-2xs'
                    }`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs sm:text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                          {tab.label}
                        </span>
                      </div>
                      <div className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        {tab.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* TAB 1: ภาพรวม & สถิติสรุป (Season Overview) */}
          {activeTopicTab === 'overview' && (
            <div className="space-y-6">
              {renderTopicHeaderBar(
                `สรุปภาพรวม & ตัวเลขสถิติทั้งฤดูกาล (${selectedSeason})`,
                `ยอดรวมทั้งฤดูกาล ${seasonSummary.totalRegistrations} คำขอ (ออกบูธ ${seasonSummary.totalBooths} ครั้ง, รับบัตร ${seasonSummary.totalTickets.toLocaleString()} ใบ)`,
                'overview',
                `${seasonSummary.totalRegistrations} รายการ`
              )}

              {/* Season KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Registrations */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs">
              <span className="text-xs font-semibold text-slate-500">คำขอทั้งหมดทั้งฤดูกาล</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">
                  {seasonSummary.totalRegistrations}
                </span>
                <span className="text-xs text-slate-500">รายการ</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>อนุมัติแล้ว {seasonSummary.approvedRegistrations} รายการ</span>
              </div>
            </div>

            {/* Total Booth Requests */}
            <div className="bg-white rounded-3xl p-5 border border-emerald-200 shadow-2xs">
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span>ขอพื้นที่ออกบูธดีลเลอร์</span>
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-emerald-800">
                  {seasonSummary.totalBooths}
                </span>
                <span className="text-xs text-slate-500">นัด</span>
              </div>
              <div className="mt-3 text-xs text-slate-500">
                ครอบคลุมสนามเหย้าไทยลีก 1–3
              </div>
            </div>

            {/* Total Ticket Requests */}
            <div className="bg-white rounded-3xl p-5 border border-blue-200 shadow-2xs">
              <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <Ticket className="w-4 h-4 text-blue-600" />
                <span>ขอรับบัตรเข้าชมฟุตบอล</span>
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-blue-800">
                  {seasonSummary.totalTickets.toLocaleString()}
                </span>
                <span className="text-xs text-slate-500">ใบ</span>
              </div>
              <div className="mt-3 text-xs text-slate-500">
                สัดส่วนตามสิทธิ์ของผู้สนับสนุน
              </div>
            </div>

            {/* League Breakdown Summary */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs">
              <span className="text-xs font-semibold text-slate-500">สัดส่วนตามลีก (บูธ / บัตร)</span>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-rose-700 font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                    League 1:
                  </span>
                  <span className="font-semibold text-slate-800">
                    {seasonSummary.byLeague['League 1'].booths} บูธ / {seasonSummary.byLeague['League 1'].tickets} ใบ
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-blue-700 font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    League 2:
                  </span>
                  <span className="font-semibold text-slate-800">
                    {seasonSummary.byLeague['League 2'].booths} บูธ / {seasonSummary.byLeague['League 2'].tickets} ใบ
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    League 3:
                  </span>
                  <span className="font-semibold text-slate-800">
                    {seasonSummary.byLeague['League 3'].booths} บูธ / {seasonSummary.byLeague['League 3'].tickets} ใบ
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================
              MASTER BRAND MATRIX TABLE (ตารางสรุปแต่ละแบรนด์ของทั้งฤดูกาล)
              ============================================================ */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span>ตารางสรุปการออกบูธและรับบัตรของแต่ละแบรนด์ (ทั้งฤดูกาล {selectedSeason})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  จำแนกตามแบรนด์ผู้สนับสนุน, จำนวนนัดที่ขอออกบูธ, จำนวนบัตรที่ขอ, และสัดส่วนแยกลีก
                </p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-200/80 text-slate-700 self-start sm:self-auto">
                {SPONSOR_BRANDS.length} แบรนด์พันธมิตร
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4">แบรนด์ผู้สนับสนุน</th>
                    <th className="py-3.5 px-4 text-center">ขอออกบูธทั้งหมด (ครั้ง)</th>
                    <th className="py-3.5 px-4 text-center">ขอรับบัตรทั้งหมด (ใบ)</th>
                    <th className="py-3.5 px-4 text-center">League 1 (แดง)</th>
                    <th className="py-3.5 px-4 text-center">League 2 (น้ำเงิน)</th>
                    <th className="py-3.5 px-4 text-center">League 3 (เขียว)</th>
                    <th className="py-3.5 px-4 text-center">สถานะอนุมัติ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {SPONSOR_BRANDS.map((brandMeta) => {
                    const bStat = seasonSummary.brandStats.find(s => s.brand === brandMeta.id);
                    const booths = bStat?.totalBooths || 0;
                    const tickets = bStat?.totalTickets || 0;
                    const approvedBooths = bStat?.approvedBooths || 0;
                    const approvedTickets = bStat?.approvedTickets || 0;

                    const l1Booths = bStat?.byLeague['League 1'].booths || 0;
                    const l1Tickets = bStat?.byLeague['League 1'].tickets || 0;

                    const l2Booths = bStat?.byLeague['League 2'].booths || 0;
                    const l2Tickets = bStat?.byLeague['League 2'].tickets || 0;

                    const l3Booths = bStat?.byLeague['League 3'].booths || 0;
                    const l3Tickets = bStat?.byLeague['League 3'].tickets || 0;

                    return (
                      <tr key={brandMeta.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Brand Name & Badge */}
                        <td className="py-4 px-4 align-middle">
                          <div className="flex items-center gap-2.5">
                            <span 
                              className="w-3.5 h-3.5 rounded-full shrink-0" 
                              style={{ backgroundColor: brandMeta.color }}
                            />
                            <div>
                              <div className="font-bold text-slate-900 text-sm">
                                {brandMeta.id}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {brandMeta.name}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Total Booths */}
                        <td className="py-4 px-4 align-middle text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-extrabold ${
                            booths > 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-50 text-slate-400'
                          }`}>
                            <Building2 className="w-3.5 h-3.5" />
                            <span>{booths} นัด</span>
                          </span>
                          {booths > 0 && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              อนุมัติแล้ว {approvedBooths} นัด
                            </div>
                          )}
                        </td>

                        {/* Total Tickets */}
                        <td className="py-4 px-4 align-middle text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-extrabold ${
                            tickets > 0 ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-slate-50 text-slate-400'
                          }`}>
                            <Ticket className="w-3.5 h-3.5" />
                            <span>{tickets.toLocaleString()} ใบ</span>
                          </span>
                          {tickets > 0 && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              อนุมัติแล้ว {approvedTickets} ใบ
                            </div>
                          )}
                        </td>

                        {/* League 1 Breakdown */}
                        <td className="py-4 px-4 align-middle text-center">
                          <div className="text-rose-800 font-semibold text-xs">
                            {l1Booths} บูธ / {l1Tickets} ใบ
                          </div>
                        </td>

                        {/* League 2 Breakdown */}
                        <td className="py-4 px-4 align-middle text-center">
                          <div className="text-blue-800 font-semibold text-xs">
                            {l2Booths} บูธ / {l2Tickets} ใบ
                          </div>
                        </td>

                        {/* League 3 Breakdown */}
                        <td className="py-4 px-4 align-middle text-center">
                          <div className="text-emerald-800 font-semibold text-xs">
                            {l3Booths} บูธ / {l3Tickets} ใบ
                          </div>
                        </td>

                        {/* Approval Rate */}
                        <td className="py-4 px-4 align-middle text-center">
                          {booths + tickets === 0 ? (
                            <span className="text-slate-400 text-[11px]">-</span>
                          ) : (
                            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>บันทึกในระบบ</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

              {/* Season Monthly Progression / Calendar */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-sky-600" />
                      <span>สถิติแยกรายเดือนในฤดูกาล {selectedSeason}</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      กดเลือกเดือนที่ต้องการ เพื่อดูรายละเอียดคำขอและแผนภูมิเจาะลึกเฉพาะเดือนนั้น
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    คลิกเดือนใดก็ได้เพื่อเปิดสรุปรายเดือน
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {seasonSummary.monthlyBreakdown.map((m) => {
                    const hasData = m.totalRegistrations > 0;
                    return (
                      <button
                        key={m.monthKey}
                        onClick={() => handleDrillDownToMonth(m.monthKey)}
                        className={`p-4 rounded-2xl border text-left transition-all group cursor-pointer ${
                          hasData
                            ? 'bg-slate-50 hover:bg-sky-50 border-slate-200 hover:border-sky-300 shadow-xs'
                            : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 group-hover:text-sky-700">
                            {m.shortThai}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-sky-600 transition-transform group-hover:translate-x-0.5" />
                        </div>

                        <div className="mt-2 space-y-0.5 text-xs">
                          <div className="font-semibold text-slate-700">
                            {m.totalRegistrations} รายการ
                          </div>
                          <div className="text-[11px] text-slate-500">
                            บูธ: <span className="font-bold text-emerald-700">{m.totalBooths}</span> • บัตร: <span className="font-bold text-blue-700">{m.totalTickets}</span>
                          </div>
                        </div>

                        <div className="mt-2.5 text-[10px] text-sky-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          เข้าดูผลเดือนนี้ →
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: สัดส่วน 3 ประเภท & 1,274 นัด (Season Proportions) */}
          {activeTopicTab === 'proportions' && (
            <div className="space-y-6">
              {renderTopicHeaderBar(
                `สัดส่วน 3 ประเภทคำขอ & เทียบ 1,274 แมตช์ทั้งฤดูกาล (${selectedSeason})`,
                `แยก 3 สัดส่วนหลัก: 2.1 ขอออกบูธอย่างเดียว / 2.2 ขอรับบัตรอย่างเดียว / 2.3 ขอทั้งออกบูธ&รับบัตร พร้อมแสดงสัดส่วนจาก 1,274 แมตช์ตลอดฤดูกาล`,
                'proportions'
              )}

              {/* SEASON PROPORTION PIE CHART (User Requirement 2: 3 Categories + 1,274 Season Matches) */}
              <SeasonProportionPieCard
                records={seasonRecords}
                title={`แผนภูมิวงกลมสัดส่วนประเภทคำขอทั้งฤดูกาล (${seasonSummary.seasonLabel})`}
                subtitle="แยก 3 สัดส่วนหลัก: 2.1 ขอออกบูธอย่างเดียว / 2.2 ขอรับบัตรอย่างเดียว / 2.3 ขอทั้งออกบูธ&รับบัตร พร้อมแสดงสัดส่วนจาก 1,274 แมตช์ตลอดฤดูกาล"
                selectedLeagueFilter={selectedLeagueFilter}
                scope="season"
                scopeLabel={seasonSummary.seasonLabel}
              />

              {/* SEASON PIE CHARTS (3 CHARTS: Brand & League Details) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <PieChartIcon className="w-4 h-4 text-sky-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    สัดส่วนจำแนกตามแบรนด์และลีกทั้งฤดูกาล ({seasonSummary.seasonLabel})
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Pie 1: Season Booths by Brand */}
                  <DonutPieChart
                    title="1. สัดส่วนการขอออกบูธตามแบรนด์"
                    subtitle="คำนวณจากทุกนัดตลอดทั้งฤดูกาล"
                    data={seasonBrandBoothPieData}
                    unit="นัด"
                    centerTotalLabel="บูธทั้งฤดูกาล"
                  />

                  {/* Pie 2: Season Tickets by Brand */}
                  <DonutPieChart
                    title="2. สัดส่วนการขอรับบัตรตามแบรนด์"
                    subtitle="จำนวนตั๋วดูบอลรวมตลอดทั้งฤดูกาล"
                    data={seasonBrandTicketPieData}
                    unit="ใบ"
                    centerTotalLabel="บัตรทั้งฤดูกาล"
                  />

                  {/* Pie 3: Season Tickets by League (3 Colors) */}
                  <DonutPieChart
                    title="3. สัดส่วนบัตรดูบอลตามลีก (3 สี)"
                    subtitle="League 1 (น้ำเงิน), League 2 (แดง), League 3 (เขียว)"
                    data={seasonLeaguePieData}
                    unit="ใบ"
                    centerTotalLabel="ตั๋วทุกลีก"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: สถิติสนามยอดนิยม (Season Stadiums) */}
          {activeTopicTab === 'stadiums' && (
            <div className="space-y-6">
              {renderTopicHeaderBar(
                `สถิติสนามยอดนิยมทั้งฤดูกาล (Top Stadiums Ranking) - ${selectedSeason}`,
                `จัดอันดับสนามเหย้าที่มีการจัดกิจกรรมมากที่สุดในฤดูกาล ${seasonSummary.seasonLabel} พร้อมตัวกรองเวลาและสถิติแยกตามลีก`,
                'stadiums'
              )}

              <StadiumPopularityChart
                records={seasonRecords}
                selectedSeason={selectedSeason}
                seasonMonths={seasonMonths}
                initialLeagueFilter={selectedLeagueFilter}
                activeMonthKey={activeMonthKey}
              />
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          VIEW 2: เจาะลึกสรุปรายเดือนในฤดูกาลนั้น
          (MONTHLY DETAIL DRILL-DOWN)
          ============================================================ */}
      {viewMode === 'monthly-detail' && (
        <div className="space-y-6">
          {/* Month Selector Tabs for Selected Season */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-sky-600" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  เลือกเดือนแข่งขันในฤดูกาล {selectedSeason}
                </span>
              </div>
              <button
                onClick={() => setViewMode('season-overview')}
                className="text-xs text-sky-600 font-bold hover:underline flex items-center gap-1"
              >
                <span>← กลับไปดูภาพรวมทั้งฤดูกาล</span>
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {seasonMonths.map((month) => {
                const isSelected = activeMonthKey === month.key;
                const mStat = seasonSummary.monthlyBreakdown.find(b => b.monthKey === month.key);
                const count = mStat?.totalRegistrations || 0;

                return (
                  <button
                    key={month.key}
                    onClick={() => setActiveMonthKey(month.key)}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : count > 0
                        ? 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-center">
                      <div>{month.shortThai}</div>
                      <div className={`text-[10px] mt-0.5 font-normal ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        {count > 0 ? `${count} รายการ` : '0 รายการ'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Month Header Banner */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
                สรุปยอดเจาะลึกประจำเดือน
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                {activeMonthInfo.nameThai} (ฤดูกาล {selectedSeason})
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700">
                รวม {monthSummary.totalRegistrations} รายการ
              </span>
              <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                ออกบูธ {monthSummary.totalBooths} ครั้ง
              </span>
              <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-50 text-blue-800 border border-blue-200">
                รับบัตร {monthSummary.totalTickets} ใบ
              </span>
            </div>
          </div>

          {/* TOPIC TABS BAR (Monthly Detail) */}
          <div className="bg-white rounded-3xl p-2 sm:p-2.5 border border-slate-200 shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              {TOPIC_TABS.map((tab) => {
                const isSelected = activeTopicTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTopicTab(tab.id)}
                    className={`flex items-start sm:items-center gap-3 p-3 sm:p-3.5 rounded-2xl text-left transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
                        : 'bg-slate-50/70 hover:bg-slate-100/90 text-slate-700 border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-white text-slate-700 shadow-2xs'
                    }`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs sm:text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                          {tab.label}
                        </span>
                      </div>
                      <div className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        {tab.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* TAB 1: ภาพรวม & สถิติสรุป (Overview) */}
          {activeTopicTab === 'overview' && (
            <div className="space-y-6">
              {renderTopicHeaderBar(
                `สรุปภาพรวม & ตัวเลขสถิติ (${activeMonthInfo.shortThai})`,
                `ยอดคำขอรวม ${monthSummary.totalRegistrations} รายการ (ออกบูธ ${monthSummary.totalBooths} ครั้ง, รับบัตร ${monthSummary.totalTickets} ใบ) พร้อมจำแนก 3 ลีก`,
                'overview',
                `${monthSummary.totalRegistrations} รายการ`
              )}

              {/* Monthly KPI Stats Cards (With 3-Color League breakdown) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Registrations in Active Month */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">คำขอประจำเดือน</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                      {activeMonthKey}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-slate-900">
                      {monthSummary.totalRegistrations}
                    </span>
                    <span className="text-xs text-slate-500">รายการ</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>อนุมัติแล้ว: {monthSummary.byStatus.approved} รายการ</span>
                  </div>
                </div>

                {/* League 1 (แดง) */}
                <div className="bg-white rounded-3xl p-5 border border-rose-200 shadow-2xs relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                      <span>Thai League 1</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-200">
                      สีแดง
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-extrabold text-rose-800">
                        {monthSummary.byLeague['League 1'].booths}
                      </span>
                      <span className="text-xs text-slate-500 ml-1">บูธ</span>
                    </div>
                    <div>
                      <span className="text-2xl font-extrabold text-rose-800">
                        {monthSummary.byLeague['League 1'].tickets}
                      </span>
                      <span className="text-xs text-slate-500 ml-1">บัตร</span>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    คำขอทั้งหมด {monthSummary.byLeague['League 1'].registrations} รายการ
                  </div>
                </div>

                {/* League 2 (น้ำเงิน) */}
                <div className="bg-white rounded-3xl p-5 border border-blue-200 shadow-2xs relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                      <span>Thai League 2</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                      สีน้ำเงิน
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-extrabold text-blue-800">
                        {monthSummary.byLeague['League 2'].booths}
                      </span>
                      <span className="text-xs text-slate-500 ml-1">บูธ</span>
                    </div>
                    <div>
                      <span className="text-2xl font-extrabold text-blue-800">
                        {monthSummary.byLeague['League 2'].tickets}
                      </span>
                      <span className="text-xs text-slate-500 ml-1">บัตร</span>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    คำขอทั้งหมด {monthSummary.byLeague['League 2'].registrations} รายการ
                  </div>
                </div>

                {/* League 3 (เขียว) */}
                <div className="bg-white rounded-3xl p-5 border border-emerald-200 shadow-2xs relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                      <span>Thai League 3</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                      สีเขียว
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-extrabold text-emerald-800">
                        {monthSummary.byLeague['League 3'].booths}
                      </span>
                      <span className="text-xs text-slate-500 ml-1">บูธ</span>
                    </div>
                    <div>
                      <span className="text-2xl font-extrabold text-emerald-800">
                        {monthSummary.byLeague['League 3'].tickets}
                      </span>
                      <span className="text-xs text-slate-500 ml-1">บัตร</span>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    คำขอทั้งหมด {monthSummary.byLeague['League 3'].registrations} รายการ
                  </div>
                </div>
              </div>

              {/* Monthly Donut Charts */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <PieChartIcon className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    แผนภูมิวงกลมแสดงสัดส่วนประจำเดือน ({activeMonthInfo.shortThai})
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Pie 1: Brand Share */}
                  <DonutPieChart
                    title="1. สัดส่วนตามแบรนด์ผู้สนับสนุน"
                    subtitle="BYD, Chang, Castrol, Coke, Molten, เงินให้ใจ"
                    data={monthlyBrandPieData}
                    unit="รายการ"
                    centerTotalLabel="คำขอประจำเดือน"
                  />

                  {/* Pie 2: League 3-Colors Ticket Share */}
                  <DonutPieChart
                    title="2. สัดส่วนบัตรดูบอลตามลีก (3 สี)"
                    subtitle="League 1 (น้ำเงิน), League 2 (แดง), League 3 (เขียว)"
                    data={monthlyLeaguePieData}
                    unit="ใบ"
                    centerTotalLabel="ตั๋วทั้งหมด"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: สัดส่วน 3 ประเภท & 1,274 นัด (Proportions) */}
          {activeTopicTab === 'proportions' && (
            <div className="space-y-6">
              {renderTopicHeaderBar(
                `สัดส่วน 3 ประเภทคำขอ & เทียบ 1,274 แมตช์ (${activeMonthInfo.shortThai})`,
                `แยก 3 สัดส่วนหลัก: 2.1 ขอออกบูธอย่างเดียว / 2.2 ขอรับบัตรอย่างเดียว / 2.3 ขอทั้งออกบูธ&รับบัตร พร้อมแสดงสัดส่วนจาก 1,274 แมตช์ตลอดฤดูกาล`,
                'proportions'
              )}

              {/* Monthly Season Proportion Card (User Requirement 2: 3 Categories + 1,274 Season Matches) */}
              <SeasonProportionPieCard
                records={activeMonthRecords}
                title={`แผนภูมิวงกลมสัดส่วนประเภทคำขอประจำเดือน: ${activeMonthInfo.nameThai}`}
                subtitle={`แยก 3 สัดส่วนหลัก (2.1 ขอออกบูธอย่างเดียว / 2.2 ขอรับบัตรอย่างเดียว / 2.3 ขอทั้งออกบูธ&รับบัตร) พร้อมแสดงสัดส่วนชัดเจนเทียบกับ 1,274 แมตช์ตลอดฤดูกาล`}
                selectedLeagueFilter={selectedLeagueFilter}
                scope="month"
                scopeLabel={activeMonthInfo.shortThai}
              />

              {/* Donut Pie Chart for 3 Types */}
              <div className="max-w-md mx-auto">
                <DonutPieChart
                  title="3. สัดส่วนประเภทคำขอ (3 หัวข้อ)"
                  subtitle="ออกบูธอย่างเดียว / รับบัตรอย่างเดียว / ขอทั้งคู่"
                  data={monthlyTypePieData}
                  unit="รายการ"
                  centerTotalLabel="รายการคำขอ"
                />
              </div>
            </div>
          )}

          {/* TAB 3: สถิติสนามยอดนิยม (Stadiums) */}
          {activeTopicTab === 'stadiums' && (
            <div className="space-y-6">
              {renderTopicHeaderBar(
                `สถิติสนามยอดนิยม (Top Stadiums Ranking) - ${activeMonthInfo.shortThai}`,
                `จัดอันดับสนามเหย้าที่มีการขอออกบูธและรับบัตรมากที่สุด สามารถเลือกช่วงเวลาและรูปแบบกราฟ/ตารางได้`,
                'stadiums'
              )}

              {/* Monthly Stadium Popularity Chart (User Requirement 3) */}
              <StadiumPopularityChart
                records={seasonRecords}
                selectedSeason={selectedSeason}
                seasonMonths={seasonMonths}
                initialLeagueFilter={selectedLeagueFilter}
                activeMonthKey={activeMonthKey}
              />
            </div>
          )}
        </div>
      )}

      {/* Automated Email Export Modal */}
      {isEmailModalOpen && emailModalPayload && (
        <AutoEmailExportModal
          isOpen={isEmailModalOpen}
          onClose={() => setIsEmailModalOpen(false)}
          payload={emailModalPayload}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};
