import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Building2, 
  Ticket, 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  Store, 
  FileSpreadsheet, 
  Calendar,
  Sparkles,
  Info,
  ChevronRight,
  Clock,
  Layers
} from 'lucide-react';
import { RegistrationRecord, UserProfile, LeagueType } from '../types';
import { 
  SponsorBrandItem, 
  DEFAULT_SPONSOR_BRANDS, 
  subscribeToBrands, 
  calculateBrandQuota, 
  formatMaxTicketsPerMatch,
  BrandQuotaUsage 
} from '../lib/brandService';
import { LEAGUE_COLOR_MAP } from '../data/fixtures';

interface BrandQuotasPrivilegesSectionProps {
  records: RegistrationRecord[];
  selectedSeason: string;
  currentUser?: UserProfile | null;
}

export const BrandQuotasPrivilegesSection: React.FC<BrandQuotasPrivilegesSectionProps> = ({
  records,
  selectedSeason,
  currentUser,
}) => {
  const [brands, setBrands] = useState<SponsorBrandItem[]>(DEFAULT_SPONSOR_BRANDS);
  const [activeBrandId, setActiveBrandId] = useState<string>('BYD');

  // Real-time listener for brands from Firestore / local service
  useEffect(() => {
    const unsub = subscribeToBrands((list) => {
      if (list && list.length > 0) {
        setBrands(list);
      }
    });
    return () => unsub();
  }, []);

  // Selected brand object
  const selectedBrand = useMemo(() => {
    return brands.find(b => b.id.toLowerCase() === activeBrandId.toLowerCase()) || brands[0];
  }, [brands, activeBrandId]);

  // Quota calculation for the selected brand
  const selectedBrandQuota: BrandQuotaUsage | null = useMemo(() => {
    if (!selectedBrand) return null;
    return calculateBrandQuota(selectedBrand, records, selectedSeason);
  }, [selectedBrand, records, selectedSeason]);

  // All brand quota summaries (for Master Quota Matrix)
  const allBrandQuotas = useMemo(() => {
    return brands.map(b => {
      const quota = calculateBrandQuota(b, records, selectedSeason);
      return {
        brand: b,
        quota,
      };
    });
  }, [brands, records, selectedSeason]);

  // Excel Export Handler
  const handleExportQuotaExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = allBrandQuotas.map(({ brand, quota }) => ({
        'แบรนด์ผู้สนับสนุน': brand.id,
        'ชื่อบริษัท/สัญญา': brand.name,
        'โควต้าออกบูธ (ครั้ง)': `${quota.usedBoothMatches} / ${quota.quotaBoothMatches} (เหลือ ${quota.remainingBoothMatches})`,
        'สิทธิ์ออกบูธตามลีก': brand.allowedBoothLeagues.map(l => l === 'League 1' ? 'T1' : l === 'League 2' ? 'T2' : 'T3').join(', '),
        'โควต้ารับบัตร (ใบ)': `${quota.usedTotalTickets} / ${quota.quotaTotalTickets} (เหลือ ${quota.remainingTotalTickets})`,
        'โควตารับบัตร (นัด)': `${quota.usedTicketMatches} / ${quota.quotaTicketMatches} นัด`,
        'เพดานบัตรต่อแมตช์': formatMaxTicketsPerMatch(brand),
        'สิทธิ์รับบัตรตามลีก': brand.allowedTicketLeagues.map(l => l === 'League 1' ? 'T1' : l === 'League 2' ? 'T2' : 'T3').join(', '),
        'ยอดขอจริง L1 (บูธ/บัตร)': `${quota.usedBoothMatchesByLeague['League 1']} บูธ / ${records.filter(r => r.brand?.toLowerCase() === brand.id.toLowerCase() && r.league === 'League 1' && r.ticketRequired).reduce((s, r) => s + (r.ticketQuantity || 0), 0)} ใบ`,
        'ยอดขอจริง L2 (บูธ/บัตร)': `${quota.usedBoothMatchesByLeague['League 2']} บูธ / ${records.filter(r => r.brand?.toLowerCase() === brand.id.toLowerCase() && r.league === 'League 2' && r.ticketRequired).reduce((s, r) => s + (r.ticketQuantity || 0), 0)} ใบ`,
        'ยอดขอจริง L3 (บูธ/บัตร)': `${quota.usedBoothMatchesByLeague['League 3']} บูธ / ${records.filter(r => r.brand?.toLowerCase() === brand.id.toLowerCase() && r.league === 'League 3' && r.ticketRequired).reduce((s, r) => s + (r.ticketQuantity || 0), 0)} ใบ`,
        'สถานะโควต้าบัตร': quota.hasExcessTickets ? `เกินโควต้า +${quota.excessTotalTickets} ใบ` : 'ปกติ',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 18 }, { wch: 32 }, { wch: 22 }, { wch: 18 },
        { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 18 },
        { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Brand Quotas & Rights');
      XLSX.writeFile(wb, `สรุปโควต้ารับบัตรและสิทธิ์แต่ละแบรนด์ ฤดูกาล ${selectedSeason.replace('/', '-')}.xlsx`);
    } catch (err) {
      console.error('Failed to export brand quota Excel:', err);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden p-5 sm:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              <span>สรุปโควต้ารับบัตร & สิทธิ์แต่ละแบรนด์ (Brand Quotas & Privileges)</span>
            </span>
            <span className="text-[11px] font-semibold text-slate-400">
              ฤดูกาล {selectedSeason}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            สรุปโควต้ารับบัตร & สิทธิ์ออกบูธแต่ละแบรนด์ตามสัญญา
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ติดตามโควต้าคงเหลือ สัดส่วนการใช้สิทธิ์ และเงื่อนไขการรับบัตรของแต่ละแบรนด์ผู้สนับสนุนตลอดทั้งฤดูกาล
          </p>
        </div>

        <button
          onClick={handleExportQuotaExcel}
          className="self-start md:self-auto px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold text-xs border border-slate-200 shadow-2xs flex items-center gap-2 cursor-pointer transition-all"
          title="ดาวน์โหลดสรุปโควต้าและสิทธิ์ทั้งหมดเป็น Excel (.xlsx)"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>ดาวน์โหลด Excel สรุปโควต้า</span>
        </button>
      </div>

      {/* Brand Selection Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {brands.map((b) => {
          const isSelected = b.id.toLowerCase() === activeBrandId.toLowerCase();
          const quota = calculateBrandQuota(b, records, selectedSeason);
          return (
            <button
              key={b.id}
              onClick={() => setActiveBrandId(b.id)}
              className={`flex-shrink-0 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all border cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              <span 
                className="w-3 h-3 rounded-full shrink-0" 
                style={{ backgroundColor: b.color }}
              />
              <span>{b.id}</span>
              {quota.hasExcessTickets ? (
                <span className="px-1.5 py-0.2 rounded bg-rose-500 text-white text-[9px] font-extrabold">
                  เกิน
                </span>
              ) : (
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                  isSelected ? 'bg-white/20 text-slate-200' : 'bg-slate-200 text-slate-600'
                }`}>
                  เหลือ {quota.remainingTotalTickets} ใบ
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Brand Detailed Quota Card */}
      {selectedBrand && selectedBrandQuota && (
        <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white border border-slate-700 shadow-md space-y-5 animate-fadeIn">
          {/* Card Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span 
                className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-sm"
                style={{ backgroundColor: selectedBrand.color }}
              >
                {selectedBrand.logoText.slice(0, 3)}
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-base sm:text-lg">{selectedBrand.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-slate-200">
                    ฤดูกาล {selectedSeason}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  สิทธิประโยชน์และโควต้าที่ได้รับตามสัญญาพันธมิตรไทยลีก
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
                selectedBrandQuota.remainingBoothMatches === 0
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : selectedBrandQuota.remainingBoothMatches <= 2
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              }`}>
                <span>ออกบูธคงเหลือ:</span>
                <strong className="underline underline-offset-2">{selectedBrandQuota.remainingBoothMatches} ครั้ง</strong>
              </span>

              <span className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
                selectedBrandQuota.remainingTicketMatches === 0
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : selectedBrandQuota.remainingTicketMatches <= 3
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}>
                <span>รับบัตรคงเหลือ:</span>
                <strong className="underline underline-offset-2">{selectedBrandQuota.remainingTicketMatches} ครั้ง</strong>
              </span>
            </div>
          </div>

          {/* Quota Progress Bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Booth Quota Bar */}
            <div className="space-y-2 bg-white/5 p-4 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-blue-400" />
                  <span>ขอออกบูธไปแล้ว:</span>
                  <strong className="text-white text-sm">
                    {selectedBrandQuota.usedBoothMatches} / {selectedBrandQuota.quotaBoothMatches} ครั้ง
                  </strong>
                </span>
                <span className="text-slate-400 text-[11px]">
                  {selectedBrand.allowedBoothLeagues.length < 3 
                    ? `(${selectedBrand.allowedBoothLeagues.map(l => l === 'League 1' ? 'T1' : l === 'League 2' ? 'T2' : 'T3').join('+')} รวมกัน)` 
                    : 'ทุกรายการ (L1+L2+L3)'}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-700/80 overflow-hidden">
                <div 
                  className={`h-full transition-all rounded-full ${
                    selectedBrandQuota.isBoothLimitReached ? 'bg-rose-500' : selectedBrandQuota.isBoothNearLimit ? 'bg-amber-400' : 'bg-blue-400'
                  }`}
                  style={{ width: `${selectedBrandQuota.boothUsagePercent}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-0.5">
                <span>ใช้ไปแล้ว {selectedBrandQuota.boothUsagePercent}% ของโควต้า</span>
                <span>เหลืออีก {selectedBrandQuota.remainingBoothMatches} ครั้ง</span>
              </div>
            </div>

            {/* Ticket Quota Bar */}
            <div className="space-y-2 bg-white/5 p-4 rounded-2xl border border-white/10">
              <div className="flex flex-wrap items-center justify-between text-xs font-semibold gap-1">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Ticket className="w-4 h-4 text-emerald-400" />
                  <span>ขอรับบัตรไปแล้ว:</span>
                  <strong className="text-white text-sm">
                    {selectedBrandQuota.usedTotalTickets} / {selectedBrandQuota.quotaTotalTickets} ใบ
                  </strong>
                  <span className="text-slate-400 text-[11px]">({selectedBrandQuota.usedTicketMatches}/{selectedBrandQuota.quotaTicketMatches} นัด)</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {selectedBrandQuota.hasExcessTickets ? (
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                      <span>เกินโควต้า +{selectedBrandQuota.excessTotalTickets} ใบ</span>
                    </span>
                  ) : (
                    <span className="text-emerald-400 text-xs font-bold">
                      เหลือ {selectedBrandQuota.remainingTotalTickets} ใบ
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-700/80 overflow-hidden">
                <div 
                  className={`h-full transition-all rounded-full ${
                    selectedBrandQuota.hasExcessTickets
                      ? 'bg-rose-500' 
                      : selectedBrandQuota.usedTotalTickets >= selectedBrandQuota.quotaTotalTickets * 0.8
                        ? 'bg-amber-400' 
                        : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, selectedBrandQuota.totalTicketsUsagePercent)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-0.5">
                <span>ใช้ไปแล้ว {selectedBrandQuota.totalTicketsUsagePercent}% • เพดาน: {formatMaxTicketsPerMatch(selectedBrand)}</span>
                <span>{selectedBrandQuota.hasExcessTickets ? '⚠️ เกินโควต้า' : `เหลือ ${selectedBrandQuota.remainingTotalTickets} ใบ`}</span>
              </div>
              {selectedBrandQuota.hasExcessTickets && (
                <div className="text-xs text-rose-300 bg-rose-500/15 p-2.5 rounded-xl border border-rose-500/20 flex items-center gap-2 mt-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>แบรนด์นี้ขอรับบัตรเกินโควต้าประจำฤดูกาลแล้ว <strong>+{selectedBrandQuota.excessTotalTickets} ใบ</strong> (มีค่าใช้จ่ายซื้อบัตรเพิ่มจากสโมสร)</span>
                </div>
              )}
            </div>
          </div>

          {/* League Permissions & Breakdown */}
          <div className="pt-3 border-t border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-slate-300">
              <span>🏢 สิทธิ์ออกบูธตามสัญญา: <strong className="text-white">{selectedBrand.allowedBoothLeagues.map(l => l === 'League 1' ? 'Thai League 1' : l === 'League 2' ? 'Thai League 2' : 'Thai League 3').join(', ') || 'ไม่มีสิทธิ์'}</strong></span>
              <span>•</span>
              <span>🎟️ สิทธิ์รับบัตรตามสัญญา: <strong className="text-white">{selectedBrand.allowedTicketLeagues.map(l => l === 'League 1' ? 'Thai League 1' : l === 'League 2' ? 'Thai League 2' : 'Thai League 3').join(', ') || 'ไม่มีสิทธิ์'}</strong></span>
            </div>

            {/* Quick breakdown badges */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-rose-300 bg-rose-900/30 px-2 py-0.5 rounded-md border border-rose-700/40">
                L1: {selectedBrandQuota.usedBoothMatchesByLeague['League 1']} บูธ / {selectedBrandQuota.usedTicketMatchesByLeague['League 1']} นัด
              </span>
              <span className="text-[11px] text-blue-300 bg-blue-900/30 px-2 py-0.5 rounded-md border border-blue-700/40">
                L2: {selectedBrandQuota.usedBoothMatchesByLeague['League 2']} บูธ / {selectedBrandQuota.usedTicketMatchesByLeague['League 2']} นัด
              </span>
              <span className="text-[11px] text-emerald-300 bg-emerald-900/30 px-2 py-0.5 rounded-md border border-emerald-700/40">
                L3: {selectedBrandQuota.usedBoothMatchesByLeague['League 3']} บูธ / {selectedBrandQuota.usedTicketMatchesByLeague['League 3']} นัด
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Master Brand Quotas Table (All Brands Overview) */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="p-3.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-sky-600" />
            <span>ตารางเปรียบเทียบโควต้า & สิทธิ์ของทุกแบรนด์ผู้สนับสนุน (ฤดูกาล {selectedSeason})</span>
          </span>
          <span className="text-[11px] text-slate-500">
            {allBrandQuotas.length} แบรนด์พันธมิตร
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">แบรนด์ผู้สนับสนุน</th>
                <th className="py-3 px-4 text-center">โควต้าออกบูธ (ใช้/รวม)</th>
                <th className="py-3 px-4 text-center">โควต้ารับบัตร (ใช้/รวม)</th>
                <th className="py-3 px-3.5 text-center">เพดานต่อแมตช์</th>
                <th className="py-3 px-3.5 text-center">สิทธิ์ออกบูธ (ลีก)</th>
                <th className="py-3 px-3.5 text-center">สิทธิ์รับบัตร (ลีก)</th>
                <th className="py-3 px-4 text-center">ยอดขอจริงแยกลีก (L1 / L2 / L3)</th>
                <th className="py-3 px-4 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {allBrandQuotas.map(({ brand, quota }) => {
                const isSelected = brand.id.toLowerCase() === activeBrandId.toLowerCase();
                return (
                  <tr 
                    key={brand.id}
                    onClick={() => setActiveBrandId(brand.id)}
                    className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                      isSelected ? 'bg-sky-50/50' : ''
                    }`}
                  >
                    {/* Brand */}
                    <td className="py-3.5 px-4 align-middle">
                      <div className="flex items-center gap-2.5">
                        <span 
                          className="w-3.5 h-3.5 rounded-full shrink-0" 
                          style={{ backgroundColor: brand.color }}
                        />
                        <div>
                          <div className="font-extrabold text-slate-900 text-xs sm:text-sm">
                            {brand.id}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {brand.name.split(' ')[0]}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Booth Quota */}
                    <td className="py-3.5 px-4 align-middle text-center">
                      <div className="font-bold text-slate-800">
                        {quota.usedBoothMatches} / {quota.quotaBoothMatches} ครั้ง
                      </div>
                      <div className={`text-[10px] mt-0.5 ${
                        quota.remainingBoothMatches === 0 ? 'text-rose-600 font-bold' : 'text-slate-500'
                      }`}>
                        เหลือ {quota.remainingBoothMatches} ครั้ง
                      </div>
                    </td>

                    {/* Ticket Quota */}
                    <td className="py-3.5 px-4 align-middle text-center">
                      <div className="font-bold text-slate-800">
                        {quota.usedTotalTickets} / {quota.quotaTotalTickets} ใบ
                      </div>
                      <div className={`text-[10px] mt-0.5 ${
                        quota.hasExcessTickets 
                          ? 'text-rose-600 font-bold' 
                          : quota.remainingTotalTickets <= 50 
                            ? 'text-amber-600 font-bold' 
                            : 'text-emerald-700'
                      }`}>
                        {quota.hasExcessTickets ? `เกิน +${quota.excessTotalTickets} ใบ` : `เหลือ ${quota.remainingTotalTickets} ใบ`}
                      </div>
                    </td>

                    {/* Ceiling */}
                    <td className="py-3.5 px-3.5 align-middle text-center">
                      <span className="text-slate-700 text-xs font-semibold">
                        {formatMaxTicketsPerMatch(brand)}
                      </span>
                    </td>

                    {/* Allowed Booth Leagues */}
                    <td className="py-3.5 px-3.5 align-middle text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {brand.allowedBoothLeagues.map(l => (
                          <span 
                            key={l} 
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              l === 'League 1' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              l === 'League 2' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {l === 'League 1' ? 'T1' : l === 'League 2' ? 'T2' : 'T3'}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Allowed Ticket Leagues */}
                    <td className="py-3.5 px-3.5 align-middle text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {brand.allowedTicketLeagues.map(l => (
                          <span 
                            key={l} 
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              l === 'League 1' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              l === 'League 2' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {l === 'League 1' ? 'T1' : l === 'League 2' ? 'T2' : 'T3'}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Actual Breakdown L1 / L2 / L3 */}
                    <td className="py-3.5 px-4 align-middle text-center">
                      <div className="text-[11px] text-slate-700 font-semibold space-y-0.5">
                        <span className="text-rose-700 font-bold">L1: {quota.usedBoothMatchesByLeague['League 1']} บูธ</span> •{' '}
                        <span className="text-blue-700 font-bold">L2: {quota.usedBoothMatchesByLeague['League 2']} บูธ</span> •{' '}
                        <span className="text-emerald-700 font-bold">L3: {quota.usedBoothMatchesByLeague['League 3']} บูธ</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 align-middle text-center">
                      {quota.hasExcessTickets ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                          <span>เกินโควต้า</span>
                        </span>
                      ) : quota.isNearLimit || quota.isBoothNearLimit ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                          <span>ใกล้เต็ม</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span>ปกติ</span>
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
  );
};
