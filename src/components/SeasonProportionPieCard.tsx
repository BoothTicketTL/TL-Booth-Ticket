import React, { useMemo, useState } from 'react';
import { 
  PieChart as PieChartIcon, 
  Building2, 
  Ticket, 
  Sparkles, 
  Layers, 
  Info,
  Calendar,
  CheckCircle2,
  Trophy
} from 'lucide-react';
import { RegistrationRecord, LeagueType } from '../types';
import { DonutPieChart, PieChartSegment } from './DonutPieChart';
import { 
  isRecordBoothActive, 
  isRecordTicketActive, 
  TOTAL_SEASON_MATCHES, 
  TOTAL_LEAGUE_MATCHES 
} from '../lib/seasonService';
import { getFixtures } from '../lib/fixturesService';

interface SeasonProportionPieCardProps {
  records: RegistrationRecord[];
  title?: string;
  subtitle?: string;
  selectedLeagueFilter?: LeagueType | 'All';
  scope?: 'season' | 'month';
  scopeLabel?: string;
  activeMonthFixturesCount?: number;
}

export const SeasonProportionPieCard: React.FC<SeasonProportionPieCardProps> = ({
  records,
  title = 'แผนภูมิวงกลมสัดส่วนประเภทคำขอ',
  subtitle = 'แบ่ง 3 สัดส่วนหลัก เทียบกับจำนวนแมตช์แข่งขันจริงทั้งฤดูกาล (1,274 แมตช์)',
  selectedLeagueFilter = 'All',
  scope = 'season',
  scopeLabel,
  activeMonthFixturesCount,
}) => {
  // Mode toggle: 'requests-only' (3 slices as requested: 2.1, 2.2, 2.3) vs 'season-benchmark' (includes unrequested matches)
  const [pieMode, setPieMode] = useState<'requests-only' | 'season-benchmark'>('requests-only');

  // Compute Total Season Matches based on League Filter
  const totalSeasonMatches = useMemo(() => {
    const allFixtures = getFixtures();
    if (allFixtures && allFixtures.length > 0) {
      if (selectedLeagueFilter === 'All') return allFixtures.length;
      const count = allFixtures.filter(f => f.league === selectedLeagueFilter).length;
      if (count > 0) return count;
    }
    if (selectedLeagueFilter === 'All') return TOTAL_SEASON_MATCHES;
    return TOTAL_LEAGUE_MATCHES[selectedLeagueFilter] || 1274;
  }, [selectedLeagueFilter]);

  // Compute Counts with user exclusion rules:
  // - dealerName === '-' NOT counted as booth
  // - ticketQuantity === 0 NOT counted as ticket
  const { boothOnly, ticketOnly, bothCount, totalValidRequests } = useMemo(() => {
    let bOnly = 0;
    let tOnly = 0;
    let both = 0;

    records.forEach(r => {
      const isBooth = isRecordBoothActive(r);
      const isTicket = isRecordTicketActive(r);

      if (isBooth && isTicket) {
        both++;
      } else if (isBooth && !isTicket) {
        bOnly++;
      } else if (!isBooth && isTicket) {
        tOnly++;
      }
    });

    return {
      boothOnly: bOnly,
      ticketOnly: tOnly,
      bothCount: both,
      totalValidRequests: bOnly + tOnly + both,
    };
  }, [records]);

  // Unrequested matches throughout season
  const unrequestedMatches = Math.max(0, totalSeasonMatches - totalValidRequests);

  // Percentages relative to Total Season Matches (1,274)
  const seasonCoveragePct = totalSeasonMatches > 0 ? (totalValidRequests / totalSeasonMatches) * 100 : 0;
  const boothOnlyPctOfSeason = totalSeasonMatches > 0 ? (boothOnly / totalSeasonMatches) * 100 : 0;
  const ticketOnlyPctOfSeason = totalSeasonMatches > 0 ? (ticketOnly / totalSeasonMatches) * 100 : 0;
  const bothPctOfSeason = totalSeasonMatches > 0 ? (bothCount / totalSeasonMatches) * 100 : 0;
  const unrequestedPctOfSeason = totalSeasonMatches > 0 ? (unrequestedMatches / totalSeasonMatches) * 100 : 0;

  // Percentages relative to Requests Only
  const boothOnlyPctOfReq = totalValidRequests > 0 ? (boothOnly / totalValidRequests) * 100 : 0;
  const ticketOnlyPctOfReq = totalValidRequests > 0 ? (ticketOnly / totalValidRequests) * 100 : 0;
  const bothPctOfReq = totalValidRequests > 0 ? (bothCount / totalValidRequests) * 100 : 0;

  // 3-Category Pie Data (User Requirement 2.1, 2.2, 2.3)
  const requestsOnlyPieData: PieChartSegment[] = useMemo(() => {
    return [
      {
        id: 'booth-only',
        label: '2.1 ขอออกบูธอย่างเดียว',
        value: boothOnly,
        color: '#10b981', // Emerald green
      },
      {
        id: 'ticket-only',
        label: '2.2 ขอรับบัตรอย่างเดียว',
        value: ticketOnly,
        color: '#3b82f6', // Blue
      },
      {
        id: 'both',
        label: '2.3 ขอทั้งออกบูธ&รับบัตร',
        value: bothCount,
        color: '#8b5cf6', // Violet
      },
    ];
  }, [boothOnly, ticketOnly, bothCount]);

  // Alternative benchmark pie data including unrequested matches
  const benchmarkPieData: PieChartSegment[] = useMemo(() => {
    return [
      {
        id: 'booth-only',
        label: '2.1 ขอออกบูธอย่างเดียว',
        value: boothOnly,
        color: '#10b981',
      },
      {
        id: 'ticket-only',
        label: '2.2 ขอรับบัตรอย่างเดียว',
        value: ticketOnly,
        color: '#3b82f6',
      },
      {
        id: 'both',
        label: '2.3 ขอทั้งออกบูธ&รับบัตร',
        value: bothCount,
        color: '#8b5cf6',
      },
      {
        id: 'unrequested',
        label: 'ยังไม่มีการขอสิทธิ์',
        value: unrequestedMatches,
        color: '#cbd5e1', // Slate 300
      },
    ];
  }, [boothOnly, ticketOnly, bothCount, unrequestedMatches]);

  const activePieData = pieMode === 'requests-only' ? requestsOnlyPieData : benchmarkPieData;
  const activeCenterTotal = pieMode === 'requests-only' ? totalValidRequests : totalSeasonMatches;
  const activeCenterLabel = pieMode === 'requests-only' ? 'รายการคำขอ' : 'แมตช์ทั้งฤดูกาล';

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-5">
      {/* Header & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-violet-50 text-violet-600 border border-violet-200">
              <PieChartIcon className="w-4 h-4" />
            </span>
            <h3 className="text-base font-bold text-slate-900">
              {title}
            </h3>
            {scopeLabel && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {scopeLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {subtitle}
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            onClick={() => setPieMode('requests-only')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              pieMode === 'requests-only'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3 สัดส่วนคำขอ
          </button>
          <button
            onClick={() => setPieMode('season-benchmark')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              pieMode === 'season-benchmark'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            เทียบทั้งฤดูกาล ({totalSeasonMatches} นัด)
          </button>
        </div>
      </div>

      {/* Grid: Left = Donut Chart, Right = Season Proportion Breakdown Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Donut Chart (5 cols) */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-sm">
            <DonutPieChart
              title={pieMode === 'requests-only' ? 'สัดส่วน 3 ประเภทคำขอ' : 'สัดส่วนเทียบทั้งฤดูกาล'}
              subtitle={
                pieMode === 'requests-only'
                  ? 'ออกบูธอย่างเดียว / รับบัตรอย่างเดียว / ขอทั้งคู่'
                  : `คิดจากทั้งหมด ${totalSeasonMatches.toLocaleString()} แมตช์`
              }
              data={activePieData}
              unit="แมตช์"
              centerTotalLabel={activeCenterLabel}
            />
          </div>
        </div>

        {/* Right: Season Benchmark & 3-Topics Detailed Cards (7 cols) */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* Main Season Benchmark Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold tracking-wide text-sky-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>จำนวนการแข่งขันทั้งหมดในฤดูกาล 2026/27</span>
              </span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-700/80 text-slate-200 font-mono">
                {selectedLeagueFilter === 'All' ? 'รวมทั้ง 3 ลีก' : selectedLeagueFilter}
              </span>
            </div>

            <div className="mt-2.5 flex items-baseline justify-between flex-wrap gap-2">
              <div>
                <span className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                  {totalSeasonMatches.toLocaleString()}
                </span>
                <span className="text-xs text-slate-300 ml-1.5">แมตช์ตลอดฤดูกาล</span>
              </div>
              <div className="text-right">
                <span className="text-xl sm:text-2xl font-black text-emerald-400">
                  {totalValidRequests}
                </span>
                <span className="text-xs text-slate-300 ml-1">แมตช์มีคำขอ ({seasonCoveragePct.toFixed(1)}%)</span>
              </div>
            </div>

            {/* League Breakdown Subtext */}
            <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-300 flex-wrap gap-2">
              <span>สัดส่วนลีก: T1 (240 นัด) • T2 (306 นัด) • T3 (728 นัด)</span>
              <span className="font-mono text-amber-300">
                ยังไม่มีคำขอ: {unrequestedMatches.toLocaleString()} นัด ({unrequestedPctOfSeason.toFixed(1)}%)
              </span>
            </div>

            {/* Visual Season Progress Bar */}
            <div className="mt-3 w-full bg-slate-700/70 h-2.5 rounded-full overflow-hidden flex">
              <div 
                className="bg-emerald-500 h-full transition-all duration-500" 
                style={{ width: `${boothOnlyPctOfSeason}%` }}
                title={`ออกบูธอย่างเดียว: ${boothOnlyPctOfSeason.toFixed(1)}%`}
              />
              <div 
                className="bg-blue-500 h-full transition-all duration-500" 
                style={{ width: `${ticketOnlyPctOfSeason}%` }}
                title={`รับบัตรอย่างเดียว: ${ticketOnlyPctOfSeason.toFixed(1)}%`}
              />
              <div 
                className="bg-violet-500 h-full transition-all duration-500" 
                style={{ width: `${bothPctOfSeason}%` }}
                title={`ขอทั้งคู่: ${bothPctOfSeason.toFixed(1)}%`}
              />
            </div>
          </div>

          {/* 3 Categories Detailed Cards */}
          <div className="space-y-2.5">
            {/* 2.1: Booth Only */}
            <div className="p-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <span>2.1 สัดส่วนเฉพาะการขอออกบูธอย่างเดียว</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300">
                      ดีลเลอร์
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-0.5">
                    ไม่นับแมตช์ที่ระบุชื่อดีลเลอร์เป็น "-"
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-base sm:text-lg font-black text-emerald-900">
                  {boothOnly} <span className="text-xs font-normal">แมตช์</span>
                </div>
                <div className="text-[10px] text-emerald-800 font-semibold">
                  {boothOnlyPctOfSeason.toFixed(1)}% ของทั้งฤดูกาล ({boothOnlyPctOfReq.toFixed(1)}% ของคำขอ)
                </div>
              </div>
            </div>

            {/* 2.2: Ticket Only */}
            <div className="p-3 rounded-2xl border border-blue-200 bg-blue-50/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0">
                  <Ticket className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                    <span>2.2 สัดส่วนเฉพาะการขอรับบัตรอย่างเดียว</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-semibold border border-blue-300">
                      ตั๋วดูบอล
                    </span>
                  </div>
                  <div className="text-[11px] text-blue-700 mt-0.5">
                    ไม่นับแมตช์ที่ระบุจำนวนบัตรเป็น 0
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-base sm:text-lg font-black text-blue-900">
                  {ticketOnly} <span className="text-xs font-normal">แมตช์</span>
                </div>
                <div className="text-[10px] text-blue-800 font-semibold">
                  {ticketOnlyPctOfSeason.toFixed(1)}% ของทั้งฤดูกาล ({ticketOnlyPctOfReq.toFixed(1)}% ของคำขอ)
                </div>
              </div>
            </div>

            {/* 2.3: Both Booth & Ticket */}
            <div className="p-3 rounded-2xl border border-violet-200 bg-violet-50/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-violet-950 flex items-center gap-1.5">
                    <span>2.3 สัดส่วนการขอทั้งออกบูธ & รับบัตร</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-100 text-violet-800 font-semibold border border-violet-300">
                      ครบ 2 สิทธิ์
                    </span>
                  </div>
                  <div className="text-[11px] text-violet-700 mt-0.5">
                    มีทั้งชื่อดีลเลอร์ (ไม่ใช่ -) และจำนวนตั๋วมากกว่า 0
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-base sm:text-lg font-black text-violet-900">
                  {bothCount} <span className="text-xs font-normal">แมตช์</span>
                </div>
                <div className="text-[10px] text-violet-800 font-semibold">
                  {bothPctOfSeason.toFixed(1)}% ของทั้งฤดูกาล ({bothPctOfReq.toFixed(1)}% ของคำขอ)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
