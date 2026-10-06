import { FixtureItem, BrandType } from '../types';
import { MASTER_SEASON_FIXTURES } from './masterFixturesData';

export const SPONSOR_BRANDS: { id: BrandType; name: string; color: string; badgeClass: string; logoText: string }[] = [
  { id: 'BYD', name: 'BYD (บีวายดี รถยนต์พลังงานไฟฟ้า)', color: '#0284c7', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200', logoText: 'BYD' },
  { id: 'Chang', name: 'Chang (เครื่องดื่มตราช้าง)', color: '#059669', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', logoText: 'CHANG' },
  { id: 'Castrol', name: 'Castrol (น้ำมันเครื่องคาสตรอล)', color: '#16a34a', badgeClass: 'bg-green-50 text-green-700 border-green-200', logoText: 'CASTROL' },
  { id: 'Coke', name: 'Coke (โคคา-โคล่า)', color: '#dc2626', badgeClass: 'bg-red-50 text-red-700 border-red-200', logoText: 'COKE' },
  { id: 'Molten', name: 'Molten (ลูกฟุตบอลมอลเทน)', color: '#d97706', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200', logoText: 'MOLTEN' },
  { id: 'เงินให้ใจ', name: 'เงินให้ใจ (สินเชื่อเงินให้ใจ)', color: '#7c3aed', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200', logoText: 'เงินให้ใจ' },
];

// Current reference date in Thai League 2026-27 season: 2026-10-09
export const CURRENT_SIMULATED_DATE = '2026-10-09';

// Fixtures are loaded from the official Google Sheets at runtime (no built-in schedule).
export const THAI_LEAGUE_FIXTURES: FixtureItem[] = MASTER_SEASON_FIXTURES;

export const MONTH_LIST = [
  { key: '2026-08', nameThai: 'สิงหาคม 2569 (Aug 2026)', shortThai: 'ส.ค. 69' },
  { key: '2026-09', nameThai: 'กันยายน 2569 (Sep 2026)', shortThai: 'ก.ย. 69' },
  { key: '2026-10', nameThai: 'ตุลาคม 2569 (Oct 2026)', shortThai: 'ต.ค. 69' },
  { key: '2026-11', nameThai: 'พฤศจิกายน 2569 (Nov 2026)', shortThai: 'พ.ย. 69' },
  { key: '2026-12', nameThai: 'ธันวาคม 2569 (Dec 2026)', shortThai: 'ธ.ค. 69' },
  { key: '2027-01', nameThai: 'มกราคม 2570 (Jan 2027)', shortThai: 'ม.ค. 70' },
  { key: '2027-02', nameThai: 'กุมภาพันธ์ 2570 (Feb 2027)', shortThai: 'ก.พ. 70' },
  { key: '2027-03', nameThai: 'มีนาคม 2570 (Mar 2027)', shortThai: 'มี.ค. 70' },
  { key: '2027-04', nameThai: 'เมษายน 2570 (Apr 2027)', shortThai: 'เม.ย. 70' },
  { key: '2027-05', nameThai: 'พฤษภาคม 2570 (May 2027)', shortThai: 'พ.ค. 70' },
];

export const LEAGUE_COLOR_MAP = {
  'League 1': {
    name: 'Thai League 1',
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
    accentColor: '#dc2626', // Red
    border: 'border-rose-500',
    activeTab: 'bg-rose-600 text-white shadow-rose-500/20',
    label: 'แดง (Red)',
  },
  'League 2': {
    name: 'Thai League 2',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    accentColor: '#2563eb', // Blue
    border: 'border-blue-500',
    activeTab: 'bg-blue-600 text-white shadow-blue-500/20',
    label: 'น้ำเงิน (Blue)',
  },
  'League 3': {
    name: 'Thai League 3',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    accentColor: '#059669', // Green
    border: 'border-emerald-500',
    activeTab: 'bg-emerald-600 text-white shadow-emerald-500/20',
    label: 'เขียว (Green)',
  },
};
