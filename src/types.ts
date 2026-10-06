export type LeagueType = 'League 1' | 'League 2' | 'League 3';

export type BrandType = 'BYD' | 'Chang' | 'Castrol' | 'Coke' | 'Molten' | 'เงินให้ใจ' | 'อื่น ๆ' | string;

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface FixtureItem {
  id: string;
  league: LeagueType;
  matchWeek: number;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  matchDate: string; // YYYY-MM-DD
  matchTime: string; // HH:mm
  month: string;     // YYYY-MM (e.g. "2026-09")
  remark?: string;   // Optional remark from sheet
}

export interface RegistrationRecord {
  id: string;
  createdAt: string; // ISO string or readable date
  timestamp: number;
  
  // League separation
  league: LeagueType;
  
  // Brand from Dropdown
  brand: BrandType;
  
  // Match & Fixture
  fixtureId: string;
  matchTitle: string;
  stadium: string;
  matchDate: string;
  month: string; // e.g. "2026-09"
  season?: string; // e.g. "2026/27", "2027/28"
  
  // Applicant / Contact
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  organization?: string;
  
  // Booth Section (Dealer Name & Phone)
  boothRequired: boolean;
  dealerName?: string;
  dealerPhone?: string;
  
  // Ticket Section (Quantity & Requester Phone)
  ticketRequired: boolean;
  ticketQuantity: number;
  ticketRequesterPhone?: string;
  
  // Remark / Additional Client Request
  remark?: string;
  
  // Status & Administration
  status: RegistrationStatus;
  adminNote?: string;
  approvedAt?: string;
  reviewedBy?: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: 'admin' | 'user';
  organization?: string;
  assignedBrand?: string; // e.g. 'BYD', 'Chang', or 'All'
}

export interface StadiumContact {
  id: string;
  stadiumName: string;
  league: LeagueType;
  homeClub: string;
  locationProvince: string;
  // On-site Booth contact
  boothCoordinatorName: string;
  boothCoordinatorPhone: string;
  boothSetupLocation: string;
  // On-site Ticket contact
  ticketCoordinatorName: string;
  ticketCoordinatorPhone: string;
  ticketPickupLocation: string;
  // Hours
  operatingHours: string;
  note?: string;
  remark?: string;
  hasUpdatedContact?: boolean;
  sourceTab?: string;
}

export interface MatchStadiumContact {
  id: string;
  fixtureId: string;
  matchTitle: string;
  matchDate: string;
  stadiumName: string;
  league: LeagueType;
  homeClub?: string;
  awayTeam?: string;
  locationProvince?: string;
  // Booth Coordinator for this match
  boothCoordinatorName: string;
  boothCoordinatorPhone: string;
  boothSetupLocation: string;
  // Ticket Coordinator for this match
  ticketCoordinatorName: string;
  ticketCoordinatorPhone: string;
  ticketPickupLocation: string;
  operatingHours: string;
  note?: string;
  remark?: string;
  updatedAt?: string;
  updatedBy?: string;
  hasUpdatedContact?: boolean;
  sourceTab?: string;
}

export interface MonthlySummary {
  monthKey: string; // e.g. "2026-09"
  monthNameThai: string; // e.g. "กันยายน 2569"
  shortThai?: string;
  totalRegistrations: number;
  totalBooths: number;
  totalTickets: number;
  byLeague: {
    'League 1': { registrations: number; booths: number; tickets: number };
    'League 2': { registrations: number; booths: number; tickets: number };
    'League 3': { registrations: number; booths: number; tickets: number };
  };
  byBrand: Record<string, number>;
  byStatus: {
    approved: number;
    pending: number;
    rejected: number;
  };
}

export interface SeasonInfo {
  id: string; // e.g. "2026/27"
  label: string; // e.g. "ฤดูกาล 2026/27 (ปัจจุบัน)"
  startYear: number;
  endYear: number;
  isCurrent?: boolean;
}

export interface SeasonBrandStats {
  brand: BrandType | string;
  totalRegistrations: number;
  totalBooths: number;
  totalTickets: number;
  approvedBooths: number;
  approvedTickets: number;
  byLeague: {
    'League 1': { booths: number; tickets: number };
    'League 2': { booths: number; tickets: number };
    'League 3': { booths: number; tickets: number };
  };
}

export interface SeasonSummary {
  seasonId: string;
  seasonLabel: string;
  totalRegistrations: number;
  totalBooths: number;
  totalTickets: number;
  approvedRegistrations: number;
  byLeague: {
    'League 1': { registrations: number; booths: number; tickets: number };
    'League 2': { registrations: number; booths: number; tickets: number };
    'League 3': { registrations: number; booths: number; tickets: number };
  };
  brandStats: SeasonBrandStats[];
  monthlyBreakdown: {
    monthKey: string;
    monthNameThai: string;
    shortThai: string;
    totalRegistrations: number;
    totalBooths: number;
    totalTickets: number;
  }[];
}

export interface StadiumAttendanceRecord {
  id: string;
  league: LeagueType;
  matchWeek: number; // e.g. 1, 2, 3...
  matchDate: string; // YYYY-MM-DD
  matchTime?: string; // HH:mm
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  province?: string;
  attendance: number; // Spectator count
  capacity?: number; // Stadium capacity
  occupancyRate?: number; // % (attendance / capacity * 100)
  score?: string; // e.g. "2 - 1"
  homeScore?: number; // คะแนนฝั่งทีมเหย้า
  awayScore?: number; // คะแนนฝั่งทีมเยือน
  season?: string; // e.g. "2026/27"
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ClubAttendanceRanking {
  clubName: string;
  league: LeagueType;
  stadium: string;
  province?: string;
  matchesPlayed: number;
  totalAttendance: number;
  averageAttendance: number;
  highestAttendance: number;
  capacity?: number;
  averageOccupancy?: number;
}

export interface AttendanceImportSummary {
  totalRows: number;
  validRows: number;
  leagueCounts: Record<LeagueType, number>;
  weekRange: { min: number; max: number };
  totalAttendance: number;
  averageAttendance: number;
  parsedRecords: StadiumAttendanceRecord[];
  errors?: string[];
}

export interface TabSyncSummary {
  name: string;
  gid?: string;
  count: number;
}

