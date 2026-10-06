// Mock localStorage for node
(global as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

import { parseMatchContactsFromFixtureTab, teamsMatch } from './src/lib/stadiumContactsService.ts';
import { normalizeDate } from './src/lib/fixturesService.ts';

// Test Screenshot 3 (T3-(THA))
// Row 1: MATCH SCHEDULE FOR THAI LEAGUE 3 2026-2027
// Row 2: MW,Match No.,DAY,DATE,TIME,HOME,AWAY,STADIUM,เบอร์ติดต่อสำหรับออกบูธรับบัตรเข้า,Remark
// Row: ,,,27 ก.ย. 2569,18:00,ร้อยเอ็ด พีบี ยูไนเต็ด,มหาวิทยาลัยการจัดการและเทคโนโลยีอีสเทิร์น,ไพรด์ อารีน่า,คุณคชา 096-0842296,

const csvT3 = `MATCH SCHEDULE FOR THAI LEAGUE 3 2026-2027,,,,,,,,,
MW,Match No.,DAY,DATE,TIME,HOME,AWAY,STADIUM,เบอร์ติดต่อสำหรับออกบูธรับบัตรเข้า,Remark
,,,27 ก.ย. 2569,18:00,ร้อยเอ็ด พีบี ยูไนเต็ด,มหาวิทยาลัยการจัดการและเทคโนโลยีอีสเทิร์น,ไพรด์ อารีน่า,คุณคชา 096-0842296,
`;

const res = parseMatchContactsFromFixtureTab(csvT3, 'League 3', 'T3-(THA)');
console.log('T3 parsed count:', res.contacts.length);
if (res.contacts.length > 0) {
  const c = res.contacts[0];
  console.log('c:', {
    matchDate: c.matchDate,
    homeClub: c.homeClub,
    awayTeam: c.awayTeam,
    boothCoordinatorPhone: c.boothCoordinatorPhone,
    ticketCoordinatorPhone: c.ticketCoordinatorPhone,
    hasUpdatedContact: c.hasUpdatedContact,
    sourceTab: c.sourceTab
  });

  // Now test matching with fixture f:
  const f = {
    matchDate: '2026-09-27',
    homeTeam: 'ร้อยเอ็ด พีบี ยูไนเต็ด',
    awayTeam: 'มหาวิทยาลัยการจัดการ',
  };

  const match = teamsMatch(c.homeClub, f.homeTeam) && 
    teamsMatch(c.awayTeam, f.awayTeam) &&
    (!c.matchDate || !f.matchDate || normalizeDate(c.matchDate) === normalizeDate(f.matchDate));
  console.log('Does c match f?', match);
}


