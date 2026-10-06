import * as XLSX from 'xlsx';
import { RegistrationRecord, FixtureItem } from '../types';
import { getFixtures } from './fixturesService';

export interface ExcelExportOptions {
  registrations: RegistrationRecord[];
  allFixturesMode?: boolean; // If true, export all fixtures in scope and fill brand info; if false, export distinct matches that have registrations
  selectedMonth?: string;
  selectedLeague?: string;
  selectedBrand?: string; // 'All' or specific brand e.g. 'BYD', 'Chang', etc.
  brandColumnMode?: 'single' | 'all'; // 'single' = only selected brand column, 'all' = full sponsor columns
  startDate?: string; // Optional start date for date range/weekly export
  endDate?: string;   // Optional end date for date range/weekly export
  filenamePrefix?: string;
}

// Sponsor brands matching columns F to K in images 2 & 3
export const SPONSOR_COLUMNS: { key: string; label: string }[] = [
  { key: 'byd', label: 'byd' },
  { key: 'chang', label: 'chang' },
  { key: 'castrol', label: 'castrol' },
  { key: 'coke', label: 'coke' },
  { key: 'molten', label: 'molten' },
  { key: 'เงินให้ใจ', label: 'เงินให้ใจ' },
];

/**
 * Normalizes a brand string from registration to match standard sponsor column keys
 */
export function normalizeBrandKey(brandStr?: string): string {
  if (!brandStr) return '';
  const b = brandStr.trim().toLowerCase();
  if (b.includes('byd')) return 'byd';
  if (b.includes('chang') || b.includes('ช้าง')) return 'chang';
  if (b.includes('castrol') || b.includes('คาสตรอล')) return 'castrol';
  if (b.includes('coke') || b.includes('coca') || b.includes('โค้ก')) return 'coke';
  if (b.includes('molten') || b.includes('มอลเทน')) return 'molten';
  if (b.includes('เงินให้ใจ') || b.includes('ngern') || b.includes('haijai')) return 'เงินให้ใจ';
  return brandStr.trim();
}

export interface MatchRowInfo {
  matchKey: string;
  league: string;
  matchDate: string;
  matchTime: string;
  matchTitle: string;
  stadium: string;
  month?: string;
  registrations: RegistrationRecord[];
}

/**
 * Builds the structured match list for the Excel export.
 */
export function buildMatchRows(
  registrations: RegistrationRecord[],
  allFixturesMode = false,
  selectedMonth = 'All',
  selectedLeague = 'All',
  startDate?: string,
  endDate?: string,
  selectedBrand = 'All'
): MatchRowInfo[] {
  const allFixtures = getFixtures();

  // Normalize brand filter
  const isBrandFiltered = selectedBrand && selectedBrand !== 'All';
  const targetBrandKey = isBrandFiltered ? normalizeBrandKey(selectedBrand) : '';

  // Filter registrations by brand and date if specified
  let filteredRegs = registrations;
  if (isBrandFiltered) {
    filteredRegs = filteredRegs.filter(r => normalizeBrandKey(r.brand) === targetBrandKey);
  }
  if (startDate && endDate) {
    filteredRegs = filteredRegs.filter(r => r.matchDate >= startDate && r.matchDate <= endDate);
  }

  if (allFixturesMode) {
    // Mode: Include all fixtures in the filtered scope, then map existing registrations
    let filteredFixtures = allFixtures;
    if (selectedMonth && selectedMonth !== 'All') {
      filteredFixtures = filteredFixtures.filter(f => f.month === selectedMonth || f.matchDate.startsWith(selectedMonth));
    }
    if (selectedLeague && selectedLeague !== 'All') {
      filteredFixtures = filteredFixtures.filter(f => f.league === selectedLeague);
    }
    if (startDate && endDate) {
      filteredFixtures = filteredFixtures.filter(f => f.matchDate >= startDate && f.matchDate <= endDate);
    }

    return filteredFixtures.map(f => {
      const matchTitle = `${f.homeTeam} vs ${f.awayTeam}`;
      const matchKey = `${f.matchDate}_${f.league}_${f.homeTeam}_${f.awayTeam}`.toLowerCase();

      // Find all registrations matching this fixture
      const matchRegs = filteredRegs.filter(r => {
        if (r.fixtureId && r.fixtureId === f.id) return true;
        if (r.matchDate === f.matchDate && r.league === f.league) {
          const rTitle = r.matchTitle.toLowerCase();
          const h = f.homeTeam.toLowerCase();
          const a = f.awayTeam.toLowerCase();
          if (rTitle.includes(h) || rTitle.includes(a)) return true;
        }
        return false;
      });

      return {
        matchKey,
        league: f.league,
        matchDate: f.matchDate,
        matchTime: f.matchTime || '18:00',
        matchTitle,
        stadium: f.stadium,
        month: f.month,
        registrations: matchRegs,
      };
    }).sort(compareMatches);
  }

  // Mode: Only matches that have registrations in the scope
  const matchMap = new Map<string, MatchRowInfo>();

  filteredRegs.forEach(r => {
    // Try to find matching fixture to get exact matchTime and standard title
    const fixture = allFixtures.find(f => 
      (r.fixtureId && f.id === r.fixtureId) ||
      (f.matchDate === r.matchDate && f.league === r.league && (
        r.matchTitle.toLowerCase().includes(f.homeTeam.toLowerCase()) ||
        f.homeTeam.toLowerCase().includes(r.matchTitle.split('vs')[0]?.trim().toLowerCase() || '')
      ))
    );

    const league = fixture?.league || r.league;
    const matchDate = fixture?.matchDate || r.matchDate;
    const matchTime = fixture?.matchTime || '18:00';
    const matchTitle = fixture ? `${fixture.homeTeam} vs ${fixture.awayTeam}` : r.matchTitle;
    const stadium = fixture?.stadium || r.stadium;
    const matchKey = `${matchDate}_${league}_${matchTitle.trim().toLowerCase()}`;

    if (!matchMap.has(matchKey)) {
      matchMap.set(matchKey, {
        matchKey,
        league,
        matchDate,
        matchTime,
        matchTitle,
        stadium,
        month: r.month,
        registrations: [r],
      });
    } else {
      matchMap.get(matchKey)!.registrations.push(r);
    }
  });

  return Array.from(matchMap.values()).sort(compareMatches);
}

const LEAGUE_RANK: Record<string, number> = {
  'League 1': 1,
  'T1': 1,
  'League 2': 2,
  'T2': 2,
  'League 3': 3,
  'T3': 3,
};

function getLeagueRank(league: string): number {
  if (LEAGUE_RANK[league] !== undefined) return LEAGUE_RANK[league];
  const l = (league || '').trim().toLowerCase();
  if (l.includes('1') || l.includes('t1')) return 1;
  if (l.includes('2') || l.includes('t2')) return 2;
  if (l.includes('3') || l.includes('t3')) return 3;
  return 99;
}

function compareMatches(a: MatchRowInfo, b: MatchRowInfo): number {
  // 1. Group by League first so the same league rows stay together (League 1 -> League 2 -> League 3)
  const rankA = getLeagueRank(a.league);
  const rankB = getLeagueRank(b.league);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  if (a.league !== b.league) {
    return a.league.localeCompare(b.league);
  }

  // 2. Within the same league, sort chronologically by match date
  if (a.matchDate !== b.matchDate) {
    return a.matchDate.localeCompare(b.matchDate);
  }

  // 3. Within the same date, sort by match time
  if (a.matchTime !== b.matchTime) {
    return a.matchTime.localeCompare(b.matchTime);
  }

  // 4. Finally sort by match title
  return a.matchTitle.localeCompare(b.matchTitle);
}

/**
 * Generates and downloads the Excel workbook with:
 * Tab 1: "ออกบูธ" (Image 2)
 * Tab 2: "รับบัตร" (Image 3)
 */
export function exportToExcelTwoTabs(options: ExcelExportOptions): {
  success: boolean;
  matchCount: number;
  filename: string;
  blob?: Blob;
} {
  const {
    registrations,
    allFixturesMode = false,
    selectedMonth = 'All',
    selectedLeague = 'All',
    selectedBrand = 'All',
    brandColumnMode = 'single',
    startDate,
    endDate,
    filenamePrefix = 'thaileague_booth_ticket',
  } = options;

  if (!registrations || registrations.length === 0) {
    return { success: false, matchCount: 0, filename: '' };
  }

  const isSpecificBrand = selectedBrand && selectedBrand !== 'All';
  const targetBrandKey = isSpecificBrand ? normalizeBrandKey(selectedBrand) : '';

  // Determine active sponsor columns
  let activeSponsors: { key: string; label: string }[];
  if (isSpecificBrand && brandColumnMode === 'single') {
    // Single brand export for client verification: maintains standard header layout with that brand column
    activeSponsors = [{ key: targetBrandKey, label: selectedBrand.toLowerCase() }];
  } else {
    // All brands standard view
    const extraBrands: string[] = [];
    registrations.forEach(r => {
      const key = normalizeBrandKey(r.brand);
      const isStandard = SPONSOR_COLUMNS.some(c => c.key === key);
      if (!isStandard && key && !extraBrands.includes(key)) {
        extraBrands.push(key);
      }
    });

    activeSponsors = [
      ...SPONSOR_COLUMNS,
      ...extraBrands.map(b => ({ key: b, label: b })),
    ];
  }

  const matchRows = buildMatchRows(
    registrations,
    allFixturesMode,
    selectedMonth,
    selectedLeague,
    startDate,
    endDate,
    selectedBrand
  );

  // =========================================================================
  // TAB 1: "ออกบูธ"
  // Header Row 1: Merged F1:K1 "ชื่อ+เบอร์ติดต่อ ขอออกบูธ" + Remark Header
  // Header Row 2: ลีก | วันที่แข่งขัน | เวลา | คู่แข่งขัน | สนาม | byd | chang | castrol | coke | molten | เงินให้ใจ | สรุปหมายเหตุ (Remark)
  // =========================================================================
  const boothHeaderRow1: string[] = ['', '', '', '', ''];
  boothHeaderRow1.push('ชื่อ+เบอร์ติดต่อ ขอออกบูธ');
  for (let i = 1; i < activeSponsors.length; i++) {
    boothHeaderRow1.push(''); // fill empty for merge
  }
  boothHeaderRow1.push('หมายเหตุ');

  const boothHeaderRow2: string[] = [
    'ลีก',
    'วันที่แข่งขัน',
    'เวลา',
    'คู่แข่งขัน',
    'สนาม',
    ...activeSponsors.map(s => s.label),
    'สรุปหมายเหตุ (Remark)',
  ];

  const boothDataRows: (string | number)[][] = matchRows.map(match => {
    const row: (string | number)[] = [
      match.league,
      match.matchDate,
      match.matchTime,
      match.matchTitle,
      match.stadium,
    ];

    activeSponsors.forEach(sponsor => {
      const matchingRegs = match.registrations.filter(r => {
        const k = normalizeBrandKey(r.brand);
        const hasBooth = r.boothRequired && r.dealerName?.trim() !== '-' && r.dealerPhone?.trim() !== '-';
        return k === sponsor.key && hasBooth;
      });

      if (matchingRegs.length > 0) {
        const boothContact = matchingRegs.map(r => {
          const name = r.dealerName?.trim() && r.dealerName.trim() !== '-' ? r.dealerName.trim() : '';
          const phone = cleanContactText(r.dealerPhone, r.applicantName) || cleanContactText(r.applicantPhone, r.applicantName);
          if (name && phone) {
            return `${name} ${phone}`;
          }
          return name || phone || 'ขอออกบูธ';
        }).join('\n');
        row.push(boothContact);
      } else {
        row.push('');
      }
    });

    // Match Remarks Summary across brands for this match
    const matchRemarks = match.registrations
      .filter(r => r.remark && r.remark.trim() && r.remark.trim() !== '-')
      .map(r => `[${r.brand}]: ${r.remark!.trim()}`);
    row.push(Array.from(new Set(matchRemarks)).join('\n'));

    return row;
  });

  // Tab 1 Sub-section: สรุป Remark ของแต่ละแบรนด์ (Brand Remarks Summary)
  const scopedRemarks = matchRows
    .flatMap(m => m.registrations)
    .filter(r => r.remark && r.remark.trim() && r.remark.trim() !== '-')
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.matchDate.localeCompare(b.matchDate));

  const remarksSummaryHeaderRow1: (string | number)[] = ['สรุปหมายเหตุ / ความต้องการเพิ่มเติมของแต่ละแบรนด์ (Brand Remarks Summary)', '', '', '', '', '', ''];
  const remarksSummaryHeaderRow2: (string | number)[] = [
    'แบรนด์',
    'ลีก',
    'วันที่แข่งขัน',
    'คู่แข่งขัน',
    'สนาม',
    'ข้อความหมายเหตุ (Remark)',
    'ผู้ลงทะเบียน / เบอร์ติดต่อ',
  ];

  const remarksSummaryDataRows: (string | number)[][] = [];
  if (scopedRemarks.length > 0) {
    scopedRemarks.forEach(r => {
      remarksSummaryDataRows.push([
        r.brand,
        r.league,
        r.matchDate,
        r.matchTitle,
        r.stadium,
        r.remark!.trim(),
        `${r.applicantName} (${cleanContactText(r.applicantPhone, r.applicantName) || cleanContactText(r.applicantPhone) || '-'})`,
      ]);
    });
  } else {
    remarksSummaryDataRows.push([
      'ทุกแบรนด์',
      '-',
      '-',
      '-',
      '-',
      'ไม่มีการระบุหมายเหตุเพิ่มเติมในช่วงเวลานี้',
      '-',
    ]);
  }

  const boothAoa = [
    boothHeaderRow1,
    boothHeaderRow2,
    ...boothDataRows,
    [], // spacing
    remarksSummaryHeaderRow1,
    remarksSummaryHeaderRow2,
    ...remarksSummaryDataRows,
  ];
  const wsBooth = XLSX.utils.aoa_to_sheet(boothAoa);

  // Merges for Tab 1: F1 to K1 and Remarks Summary Title
  const summaryTitleRowIdx = 2 + boothDataRows.length + 1;
  wsBooth['!merges'] = [
    { s: { r: 0, c: 5 }, e: { r: 0, c: 5 + activeSponsors.length - 1 } },
    { s: { r: summaryTitleRowIdx, c: 0 }, e: { r: summaryTitleRowIdx, c: 6 } },
  ];

  // Column widths for Tab 1
  wsBooth['!cols'] = [
    { wch: 12 }, // ลีก
    { wch: 15 }, // วันที่แข่งขัน
    { wch: 10 }, // เวลา
    { wch: 38 }, // คู่แข่งขัน
    { wch: 28 }, // สนาม
    ...activeSponsors.map(() => ({ wch: 25 })), // sponsor columns
    { wch: 35 }, // สรุปหมายเหตุ (Remark)
  ];

  // =========================================================================
  // TAB 2: "รับบัตร"
  // Header Row 1: Merged F1:K1 "ชื่อ+เบอร์ติดต่อ+จำนวน ขอรับบัตร"
  // Header Row 2: ลีก | วันที่แข่งขัน | เวลา | คู่แข่งขัน | สนาม | byd | chang | castrol | coke | molten | เงินให้ใจ
  // =========================================================================
  const ticketHeaderRow1: string[] = ['', '', '', '', ''];
  ticketHeaderRow1.push('ชื่อ+เบอร์ติดต่อ+จำนวน ขอรับบัตร');
  for (let i = 1; i < activeSponsors.length; i++) {
    ticketHeaderRow1.push(''); // fill empty for merge
  }

  const ticketHeaderRow2: string[] = [
    'ลีก',
    'วันที่แข่งขัน',
    'เวลา',
    'คู่แข่งขัน',
    'สนาม',
    ...activeSponsors.map(s => s.label),
  ];

  const ticketDataRows: (string | number)[][] = matchRows.map(match => {
    const row: (string | number)[] = [
      match.league,
      match.matchDate,
      match.matchTime,
      match.matchTitle,
      match.stadium,
    ];

    activeSponsors.forEach(sponsor => {
      const matchingRegs = match.registrations.filter(r => {
        const k = normalizeBrandKey(r.brand);
        const hasTicket = r.ticketRequired && (r.ticketQuantity || 0) > 0 && r.ticketRequesterPhone?.trim() !== '-';
        return k === sponsor.key && hasTicket;
      });

      if (matchingRegs.length > 0) {
        const ticketContact = matchingRegs.map(r => {
          const phone = cleanContactText(r.ticketRequesterPhone, r.applicantName) || cleanContactText(r.applicantPhone, r.applicantName);
          const qty = r.ticketQuantity || 0;
          if (phone) {
            return `${phone} (${qty} ใบ)`;
          }
          return `${qty} ใบ`;
        }).join('\n');
        row.push(ticketContact);
      } else {
        row.push('');
      }
    });

    return row;
  });

  const ticketAoa = [ticketHeaderRow1, ticketHeaderRow2, ...ticketDataRows];
  const wsTicket = XLSX.utils.aoa_to_sheet(ticketAoa);

  // Merges for Tab 2: F1 to K1
  wsTicket['!merges'] = [
    { s: { r: 0, c: 5 }, e: { r: 0, c: 5 + activeSponsors.length - 1 } },
  ];

  // Column widths for Tab 2
  wsTicket['!cols'] = wsBooth['!cols'];

  // =========================================================================
  // Assemble Workbook
  // =========================================================================
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsBooth, 'ออกบูธ');
  XLSX.utils.book_append_sheet(wb, wsTicket, 'รับบัตร');

  // Trigger download in browser
  const dateStr = new Date().toISOString().slice(0, 10);
  const brandSuffix = isSpecificBrand ? `_${selectedBrand.toLowerCase()}` : '';
  const dateRangeSuffix = startDate && endDate ? `_${startDate}_to_${endDate}` : '';
  const filename = `${filenamePrefix}${brandSuffix}${dateRangeSuffix}_${dateStr}.xlsx`;

  // Write array buffer
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return {
    success: true,
    matchCount: matchRows.length,
    filename,
    blob,
  };
}

/**
 * Generates weekly consolidated Excel workbook for all brands into a single file with:
 * Tab 1: "ออกบูธ" (All Brands)
 * Tab 2: "รับบัตร" (All Brands)
 * Strictly adheres to the original table header layout.
 */
export function exportWeeklyAllBrandsExcel(options: {
  registrations: RegistrationRecord[];
  startDate: string;
  endDate: string;
  selectedLeague?: string;
  allFixturesMode?: boolean;
  filenamePrefix?: string;
  triggerDownload?: boolean;
}): {
  success: boolean;
  matchCount: number;
  filename: string;
  blob: Blob;
  totalBooths: number;
  totalTickets: number;
  totalTicketQty: number;
  participatingBrands: string[];
  remarksCount?: number;
  remarks?: { brand: string; matchTitle: string; matchDate: string; remark: string; applicantName: string }[];
} {
  const {
    registrations,
    startDate,
    endDate,
    selectedLeague = 'All',
    allFixturesMode = false,
    filenamePrefix = 'thaileague_weekly_all_brands',
    triggerDownload = true,
  } = options;

  // Filter registrations strictly within the week range
  const weekRegs = registrations.filter(r => r.matchDate >= startDate && r.matchDate <= endDate);

  // Compute key weekly metrics
  let totalBooths = 0;
  let totalTickets = 0;
  let totalTicketQty = 0;
  const brandSet = new Set<string>();

  weekRegs.forEach(r => {
    const hasBooth = r.boothRequired && r.dealerName?.trim() !== '-' && r.dealerPhone?.trim() !== '-';
    const hasTicket = r.ticketRequired && (r.ticketQuantity || 0) > 0 && r.ticketRequesterPhone?.trim() !== '-';
    if (hasBooth) totalBooths += 1;
    if (hasTicket) {
      totalTickets += 1;
      totalTicketQty += (r.ticketQuantity || 0);
    }
    if (hasBooth || hasTicket) {
      brandSet.add(r.brand);
    }
  });

  // Collect extra brands if present
  const extraBrands: string[] = [];
  weekRegs.forEach(r => {
    const key = normalizeBrandKey(r.brand);
    const isStandard = SPONSOR_COLUMNS.some(c => c.key === key);
    if (!isStandard && key && !extraBrands.includes(key)) {
      extraBrands.push(key);
    }
  });

  const activeSponsors = [
    ...SPONSOR_COLUMNS,
    ...extraBrands.map(b => ({ key: b, label: b })),
  ];

  const matchRows = buildMatchRows(
    registrations,
    allFixturesMode,
    'All',
    selectedLeague,
    startDate,
    endDate,
    'All'
  );

  // TAB 1: ออกบูธ
  const boothHeaderRow1: string[] = ['', '', '', '', ''];
  boothHeaderRow1.push('ชื่อ+เบอร์ติดต่อ ขอออกบูธ');
  for (let i = 1; i < activeSponsors.length; i++) {
    boothHeaderRow1.push('');
  }
  boothHeaderRow1.push('หมายเหตุ');

  const boothHeaderRow2: string[] = [
    'ลีก',
    'วันที่แข่งขัน',
    'เวลา',
    'คู่แข่งขัน',
    'สนาม',
    ...activeSponsors.map(s => s.label),
    'สรุปหมายเหตุ (Remark)',
  ];

  const boothDataRows: (string | number)[][] = matchRows.map(match => {
    const row: (string | number)[] = [
      match.league,
      match.matchDate,
      match.matchTime,
      match.matchTitle,
      match.stadium,
    ];

    activeSponsors.forEach(sponsor => {
      const matchingRegs = match.registrations.filter(r => {
        const k = normalizeBrandKey(r.brand);
        const hasBooth = r.boothRequired && r.dealerName?.trim() !== '-' && r.dealerPhone?.trim() !== '-';
        return k === sponsor.key && hasBooth;
      });

      if (matchingRegs.length > 0) {
        const boothContact = matchingRegs.map(r => {
          const name = r.dealerName?.trim() && r.dealerName.trim() !== '-' ? r.dealerName.trim() : '';
          const phone = cleanContactText(r.dealerPhone, r.applicantName) || cleanContactText(r.applicantPhone, r.applicantName);
          return name && phone ? `${name} ${phone}` : (name || phone || 'ขอออกบูธ');
        }).join('\n');
        row.push(boothContact);
      } else {
        row.push('');
      }
    });

    // Match Remarks Summary for this fixture
    const matchRemarks = match.registrations
      .filter(r => r.remark && r.remark.trim() && r.remark.trim() !== '-')
      .map(r => `[${r.brand}]: ${r.remark!.trim()}`);
    row.push(Array.from(new Set(matchRemarks)).join('\n'));

    return row;
  });

  // Tab 1 Sub-section: สรุป Remark ของแต่ละแบรนด์ (Brand Remarks Summary) สำหรับสัปดาห์นี้
  const weekRemarks = weekRegs
    .filter(r => r.remark && r.remark.trim() && r.remark.trim() !== '-')
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.matchDate.localeCompare(b.matchDate));

  const remarksSummaryHeaderRow1: (string | number)[] = ['สรุปหมายเหตุ / ความต้องการเพิ่มเติมของแต่ละแบรนด์ (Brand Remarks Summary)', '', '', '', '', '', ''];
  const remarksSummaryHeaderRow2: (string | number)[] = [
    'แบรนด์',
    'ลีก',
    'วันที่แข่งขัน',
    'คู่แข่งขัน',
    'สนาม',
    'ข้อความหมายเหตุ (Remark)',
    'ผู้ลงทะเบียน / เบอร์ติดต่อ',
  ];

  const remarksSummaryDataRows: (string | number)[][] = [];
  if (weekRemarks.length > 0) {
    weekRemarks.forEach(r => {
      remarksSummaryDataRows.push([
        r.brand,
        r.league,
        r.matchDate,
        r.matchTitle,
        r.stadium,
        r.remark!.trim(),
        `${r.applicantName} (${cleanContactText(r.applicantPhone, r.applicantName) || cleanContactText(r.applicantPhone) || '-'})`,
      ]);
    });
  } else {
    remarksSummaryDataRows.push([
      'ทุกแบรนด์',
      '-',
      '-',
      '-',
      '-',
      'ไม่มีการระบุหมายเหตุเพิ่มเติมในสัปดาห์นี้',
      '-',
    ]);
  }

  const wsBooth = XLSX.utils.aoa_to_sheet([
    boothHeaderRow1,
    boothHeaderRow2,
    ...boothDataRows,
    [], // spacing
    remarksSummaryHeaderRow1,
    remarksSummaryHeaderRow2,
    ...remarksSummaryDataRows,
  ]);

  const summaryTitleRowIdx = 2 + boothDataRows.length + 1;
  wsBooth['!merges'] = [
    { s: { r: 0, c: 5 }, e: { r: 0, c: 5 + activeSponsors.length - 1 } },
    { s: { r: summaryTitleRowIdx, c: 0 }, e: { r: summaryTitleRowIdx, c: 6 } },
  ];

  wsBooth['!cols'] = [
    { wch: 12 },
    { wch: 15 },
    { wch: 10 },
    { wch: 38 },
    { wch: 28 },
    ...activeSponsors.map(() => ({ wch: 25 })),
    { wch: 35 }, // สรุปหมายเหตุ (Remark)
  ];

  // TAB 2: รับบัตร
  const ticketHeaderRow1: string[] = ['', '', '', '', ''];
  ticketHeaderRow1.push('ชื่อ+เบอร์ติดต่อ+จำนวน ขอรับบัตร');
  for (let i = 1; i < activeSponsors.length; i++) {
    ticketHeaderRow1.push('');
  }

  const ticketHeaderRow2: string[] = [
    'ลีก',
    'วันที่แข่งขัน',
    'เวลา',
    'คู่แข่งขัน',
    'สนาม',
    ...activeSponsors.map(s => s.label),
  ];

  const ticketDataRows: (string | number)[][] = matchRows.map(match => {
    const row: (string | number)[] = [
      match.league,
      match.matchDate,
      match.matchTime,
      match.matchTitle,
      match.stadium,
    ];

    activeSponsors.forEach(sponsor => {
      const matchingRegs = match.registrations.filter(r => {
        const k = normalizeBrandKey(r.brand);
        const hasTicket = r.ticketRequired && (r.ticketQuantity || 0) > 0 && r.ticketRequesterPhone?.trim() !== '-';
        return k === sponsor.key && hasTicket;
      });

      if (matchingRegs.length > 0) {
        const ticketContact = matchingRegs.map(r => {
          const phone = cleanContactText(r.ticketRequesterPhone, r.applicantName) || cleanContactText(r.applicantPhone, r.applicantName);
          const qty = r.ticketQuantity || 0;
          if (phone) return `${phone} (${qty} ใบ)`;
          return `${qty} ใบ`;
        }).join('\n');
        row.push(ticketContact);
      } else {
        row.push('');
      }
    });

    return row;
  });

  const wsTicket = XLSX.utils.aoa_to_sheet([ticketHeaderRow1, ticketHeaderRow2, ...ticketDataRows]);
  wsTicket['!merges'] = [
    { s: { r: 0, c: 5 }, e: { r: 0, c: 5 + activeSponsors.length - 1 } },
  ];
  wsTicket['!cols'] = wsBooth['!cols'];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsBooth, 'ออกบูธ');
  XLSX.utils.book_append_sheet(wb, wsTicket, 'รับบัตร');

  const filename = `${filenamePrefix}_${startDate}_to_${endDate}.xlsx`;
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  if (triggerDownload) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return {
    success: true,
    matchCount: matchRows.length,
    filename,
    blob,
    totalBooths,
    totalTickets,
    totalTicketQty,
    participatingBrands: Array.from(brandSet),
    remarksCount: weekRemarks.length,
    remarks: weekRemarks.map(r => ({
      brand: r.brand,
      matchTitle: r.matchTitle,
      matchDate: r.matchDate,
      remark: r.remark!.trim(),
      applicantName: r.applicantName,
    })),
  };
}

export interface LineGroupExcelExportOptions {
  registrations: RegistrationRecord[];
  allFixturesMode?: boolean;
  startDate?: string;
  endDate?: string;
  selectedLeague?: string;
  selectedBrand?: string; // 'All' or specific brand e.g. 'BYD', 'Chang', etc.
  filenamePrefix?: string;
  triggerDownload?: boolean;
}

/**
 * Cleans contact strings and ensures applicant's name (ชื่อคนกรอกข้อมูล) is NOT included.
 */
function cleanContactText(contactStr?: string, applicantName?: string): string {
  if (!contactStr) return '';
  let result = contactStr.trim();
  if (!result || result === '-' || result === 'ไม่มี' || result === 'ไม่มีข้อมูล') {
    return '';
  }
  if (applicantName && applicantName.trim() && applicantName.trim() !== '-') {
    const appName = applicantName.trim();
    if (result.startsWith(appName)) {
      result = result.slice(appName.length).trim();
    }
  }
  return result;
}

/**
 * Exports a SINGLE-TAB Excel file for LINE Group notification
 * Combining both booth and ticket requests into 1 unified sheet.
 * Headers strictly match the user reference image:
 * [ลีก, วันที่แข่งขัน, เวลา, คู่แข่งขัน, สนาม, ชื่อดีลเลอร์ที่ขอออกบูธ, ชื่อ+เบอร์ติดต่อคนขอออกบูธ, จำนวนบัตร, ชื่อ+เบอร์ติดต่อคนขอรับบัตร]
 * 
 * Note: ไม่ใส่ชื่อคนกรอกข้อมูล (applicantName) ในช่องผู้ติดต่อ
 */
export function exportLineGroupSingleTabExcel(options: LineGroupExcelExportOptions): {
  success: boolean;
  matchCount: number;
  rowCount: number;
  filename: string;
  blob?: Blob;
  totalBooths: number;
  totalTickets: number;
  totalTicketQty: number;
} {
  const {
    registrations,
    allFixturesMode = false,
    startDate,
    endDate,
    selectedLeague = 'All',
    selectedBrand = 'All',
    filenamePrefix = 'thaileague_line_group',
    triggerDownload = true,
  } = options;

  if (!registrations || registrations.length === 0) {
    return {
      success: false,
      matchCount: 0,
      rowCount: 0,
      filename: '',
      totalBooths: 0,
      totalTickets: 0,
      totalTicketQty: 0,
    };
  }

  // Exact 10 columns including the customer's Remark
  const HEADERS: string[] = [
    'ลีก',
    'วันที่แข่งขัน',
    'เวลา',
    'คู่แข่งขัน',
    'สนาม',
    'ชื่อดีลเลอร์ที่ขอออกบูธ',
    'ชื่อ+เบอร์ติดต่อคนขอออกบูธ',
    'จำนวนบัตร',
    'ชื่อ+เบอร์ติดต่อคนขอรับบัตร',
    'หมายเหตุ (Remark)',
  ];

  const matchRows = buildMatchRows(
    registrations,
    allFixturesMode,
    'All',
    selectedLeague,
    startDate,
    endDate,
    selectedBrand
  );

  let totalBooths = 0;
  let totalTickets = 0;
  let totalTicketQty = 0;

  const dataRows: (string | number)[][] = [];

  matchRows.forEach(match => {
    if (match.registrations.length === 0) {
      if (allFixturesMode) {
        dataRows.push([
          match.league,
          match.matchDate,
          match.matchTime,
          match.matchTitle,
          match.stadium,
          '',
          '',
          '',
          '',
          '',
        ]);
      }
      return;
    }

    // Group registrations for this match by brand if multiple exist
    const brandMap = new Map<string, RegistrationRecord[]>();
    match.registrations.forEach(r => {
      const bKey = normalizeBrandKey(r.brand) || 'default';
      if (!brandMap.has(bKey)) {
        brandMap.set(bKey, []);
      }
      brandMap.get(bKey)!.push(r);
    });

    brandMap.forEach(regs => {
      if (regs.length === 1) {
        const r = regs[0];
        const hasBooth = r.boothRequired && r.dealerName?.trim() && r.dealerName.trim() !== '-';
        const dealerName = hasBooth ? r.dealerName!.trim() : '';

        let boothContact = '';
        if (hasBooth) {
          totalBooths += 1;
          // ไม่ใส่ชื่อคนกรอกข้อมูล (applicantName) ใส่เฉพาะเบอร์/ชื่อผู้ติดต่อออกบูธ
          const phone = cleanContactText(r.dealerPhone, r.applicantName) || cleanContactText(r.applicantPhone, r.applicantName);
          boothContact = phone;
        }

        const hasTicket = r.ticketRequired && (r.ticketQuantity || 0) > 0;
        let ticketQtyStr = '';
        let ticketContact = '';
        if (hasTicket) {
          totalTickets += 1;
          totalTicketQty += (r.ticketQuantity || 0);
          ticketQtyStr = `${r.ticketQuantity} ใบ`;
          // ไม่ใส่ชื่อคนกรอกข้อมูล (applicantName) ใส่เฉพาะเบอร์/ชื่อผู้ติดต่อรับบัตร
          const phone = cleanContactText(r.ticketRequesterPhone, r.applicantName) || cleanContactText(r.applicantPhone, r.applicantName);
          ticketContact = phone;
        }

        const baseRemark = r.remark?.trim() && r.remark.trim() !== '-' ? r.remark.trim() : '';
        const remark = baseRemark 
          ? (selectedBrand === 'All' && !baseRemark.startsWith(`[${r.brand}]`) ? `[${r.brand}] ${baseRemark}` : baseRemark)
          : '';

        if (hasBooth || hasTicket || allFixturesMode) {
          dataRows.push([
            match.league,
            match.matchDate,
            match.matchTime,
            match.matchTitle,
            match.stadium,
            dealerName,
            boothContact,
            ticketQtyStr,
            ticketContact,
            remark,
          ]);
        }
      } else {
        // Multiple registrations for the same brand in this match
        const boothOnly = regs.filter(r => r.boothRequired && !r.ticketRequired);
        const ticketOnly = regs.filter(r => r.ticketRequired && !r.boothRequired);
        const bothReqs = regs.filter(r => r.boothRequired && r.ticketRequired);

        // Process submissions with both requests first
        bothReqs.forEach(r => {
          const hasBooth = r.boothRequired && r.dealerName?.trim() && r.dealerName.trim() !== '-';
          const dealerName = hasBooth ? r.dealerName!.trim() : '';
          let boothContact = '';
          if (hasBooth) {
            totalBooths += 1;
            // ไม่ใส่ชื่อคนกรอกข้อมูล (applicantName)
            const phone = cleanContactText(r.dealerPhone, r.applicantName) || cleanContactText(r.applicantPhone, r.applicantName);
            boothContact = phone;
          }

          const hasTicket = r.ticketRequired && (r.ticketQuantity || 0) > 0;
          let ticketQtyStr = '';
          let ticketContact = '';
          if (hasTicket) {
            totalTickets += 1;
            totalTicketQty += (r.ticketQuantity || 0);
            ticketQtyStr = `${r.ticketQuantity} ใบ`;
            // ไม่ใส่ชื่อคนกรอกข้อมูล (applicantName)
            const phone = cleanContactText(r.ticketRequesterPhone, r.applicantName) || cleanContactText(r.applicantPhone, r.applicantName);
            ticketContact = phone;
          }

          const baseRemark = r.remark?.trim() && r.remark.trim() !== '-' ? r.remark.trim() : '';
          const remark = baseRemark 
            ? (selectedBrand === 'All' && !baseRemark.startsWith(`[${r.brand}]`) ? `[${r.brand}] ${baseRemark}` : baseRemark)
            : '';

          dataRows.push([
            match.league,
            match.matchDate,
            match.matchTime,
            match.matchTitle,
            match.stadium,
            dealerName,
            boothContact,
            ticketQtyStr,
            ticketContact,
            remark,
          ]);
        });

        // Pair up booth-only and ticket-only where applicable
        const maxPairs = Math.max(boothOnly.length, ticketOnly.length);
        for (let i = 0; i < maxPairs; i++) {
          const bReg = boothOnly[i];
          const tReg = ticketOnly[i];

          let dealerName = '';
          let boothContact = '';
          if (bReg) {
            const hasBooth = bReg.boothRequired && bReg.dealerName?.trim() && bReg.dealerName.trim() !== '-';
            if (hasBooth) {
              totalBooths += 1;
              dealerName = bReg.dealerName!.trim();
              // ไม่ใส่ชื่อคนกรอกข้อมูล (applicantName)
              const phone = cleanContactText(bReg.dealerPhone, bReg.applicantName) || cleanContactText(bReg.applicantPhone, bReg.applicantName);
              boothContact = phone;
            }
          }

          let ticketQtyStr = '';
          let ticketContact = '';
          if (tReg) {
            const hasTicket = tReg.ticketRequired && (tReg.ticketQuantity || 0) > 0;
            if (hasTicket) {
              totalTickets += 1;
              totalTicketQty += (tReg.ticketQuantity || 0);
              ticketQtyStr = `${tReg.ticketQuantity} ใบ`;
              // ไม่ใส่ชื่อคนกรอกข้อมูล (applicantName)
              const phone = cleanContactText(tReg.ticketRequesterPhone, tReg.applicantName) || cleanContactText(tReg.applicantPhone, tReg.applicantName);
              ticketContact = phone;
            }
          }

          const remarks: string[] = [];
          if (bReg?.remark?.trim() && bReg.remark.trim() !== '-') {
            const bTxt = bReg.remark.trim();
            remarks.push(selectedBrand === 'All' && !bTxt.startsWith(`[${bReg.brand}]`) ? `[${bReg.brand}] ${bTxt}` : bTxt);
          }
          if (tReg?.remark?.trim() && tReg.remark.trim() !== '-') {
            const tTxt = tReg.remark.trim();
            remarks.push(selectedBrand === 'All' && !tTxt.startsWith(`[${tReg.brand}]`) ? `[${tReg.brand}] ${tTxt}` : tTxt);
          }
          const remark = Array.from(new Set(remarks)).join('\n');

          if (dealerName || boothContact || ticketQtyStr || ticketContact || remark) {
            dataRows.push([
              match.league,
              match.matchDate,
              match.matchTime,
              match.matchTitle,
              match.stadium,
              dealerName,
              boothContact,
              ticketQtyStr,
              ticketContact,
              remark,
            ]);
          }
        }
      }
    });
  });

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...dataRows]);

  // Set column widths matching reference image proportions including 10th column for Remark
  ws['!cols'] = [
    { wch: 12 }, // ลีก
    { wch: 14 }, // วันที่แข่งขัน
    { wch: 10 }, // เวลา
    { wch: 42 }, // คู่แข่งขัน
    { wch: 28 }, // สนาม
    { wch: 28 }, // ชื่อดีลเลอร์ที่ขอออกบูธ
    { wch: 34 }, // ชื่อ+เบอร์ติดต่อคนขอออกบูธ
    { wch: 14 }, // จำนวนบัตร
    { wch: 34 }, // ชื่อ+เบอร์ติดต่อคนขอรับบัตร
    { wch: 32 }, // หมายเหตุ (Remark)
  ];

  // Single-sheet workbook: 1 tab only!
  const wb = XLSX.utils.book_new();
  const sheetName = selectedBrand && selectedBrand !== 'All'
    ? `${selectedBrand}_ออกบูธและรับบัตร`.slice(0, 31)
    : 'ออกบูธและรับบัตร';

  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const dateSuffix = startDate && endDate ? `_${startDate}_to_${endDate}` : `_${new Date().toISOString().slice(0, 10)}`;
  const filename = `${filenamePrefix}${dateSuffix}.xlsx`;
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  if (triggerDownload) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return {
    success: true,
    matchCount: matchRows.length,
    rowCount: dataRows.length,
    filename,
    blob,
    totalBooths,
    totalTickets,
    totalTicketQty,
  };
}
