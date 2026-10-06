(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

async function testLookup() {
  const { findContactForStadiumOrMatch } = await import('./src/lib/stadiumContactsService');
  const { INITIAL_MATCH_CONTACTS } = await import('./src/data/stadiumContacts');

  console.log('INITIAL_MATCH_CONTACTS length:', INITIAL_MATCH_CONTACTS.length);
  const foundInInitial = INITIAL_MATCH_CONTACTS.find(c => c.homeClub.includes('แบงค็อก') || c.matchTitle.includes('แบงค็อก'));
  console.log('Found in INITIAL_MATCH_CONTACTS:', foundInInitial);

  // Case A: customList is empty
  const resEmpty = findContactForStadiumOrMatch({
    stadiumName: 'ทรู บีจี สเตเดียม',
    homeClub: 'ทรู แบงค็อก ยูไนเต็ด',
    awayTeam: 'ศรีสะเกษ ยูไนเต็ด',
    matchDate: '2026-09-05',
    league: 'League 1',
    fixtureId: 'f-l1-0905-true-sisaket',
    customList: [],
  });
  console.log('\n--- Case A: customList is [] ---');
  console.log('hasUpdatedContact:', resEmpty.hasUpdatedContact);
  console.log('ticketCoordinatorPhone:', resEmpty.ticketCoordinatorPhone);
  console.log('ticketCoordinatorName:', resEmpty.ticketCoordinatorName);

  // Case B: customList has a stale unupdated contact from old localStorage or firestore
  const staleList = [
    {
      id: 'contact_League1_2026-09-05_ทรู แบงค็อก ยูไนเต็ด_ศรีสะเกษ ยูไนเต็ด',
      fixtureId: 'f-l1-0905-true-sisaket',
      matchTitle: 'ทรู แบงค็อก ยูไนเต็ด vs ศรีสะเกษ ยูไนเต็ด',
      matchDate: '2026-09-05',
      stadiumName: 'ทรู บีจี สเตเดียม',
      league: 'League 1' as any,
      homeClub: 'ทรู แบงค็อก ยูไนเต็ด',
      awayTeam: 'ศรีสะเกษ ยูไนเต็ด',
      locationProvince: 'ประจำสนามแข่งขัน',
      boothCoordinatorName: 'รออัปเดตจาก Google Sheet (Thai League 1 -3 FIXTURES 2026/27_DATA)',
      boothCoordinatorPhone: '',
      boothSetupLocation: '',
      ticketCoordinatorName: 'รออัปเดตจาก Google Sheet (Thai League 1 -3 FIXTURES 2026/27_DATA)',
      ticketCoordinatorPhone: '',
      ticketPickupLocation: '',
      operatingHours: '14:00 - 19:30 น. (วันแข่งขัน)',
      note: 'แมตช์ที่ 5 ตารางการแข่งขัน',
      updatedBy: 'Google Sheet [Thai League 1 -3]',
      hasUpdatedContact: false,
      updatedAt: '2026-09-05 10:00',
    }
  ];

  const resStale = findContactForStadiumOrMatch({
    stadiumName: 'ทรู บีจี สเตเดียม',
    homeClub: 'ทรู แบงค็อก ยูไนเต็ด',
    awayTeam: 'ศรีสะเกษ ยูไนเต็ด',
    matchDate: '2026-09-05',
    league: 'League 1',
    fixtureId: 'f-l1-0905-true-sisaket',
    customList: staleList,
  });
  console.log('\n--- Case B: customList has stale unupdated item ---');
  console.log('hasUpdatedContact:', resStale.hasUpdatedContact);
  console.log('ticketCoordinatorPhone:', resStale.ticketCoordinatorPhone);
  console.log('ticketCoordinatorName:', resStale.ticketCoordinatorName);

  // Case C: Sukhothai vs Buriram
  const resSukhothai = findContactForStadiumOrMatch({
    stadiumName: 'ทะเลหลวง สเตเดียม',
    homeClub: 'สุโขทัย เอฟซี',
    awayTeam: 'บุรีรัมย์ ยูไนเต็ด',
    matchDate: '2026-09-06',
    league: 'League 1',
    customList: [],
  });
  console.log('\n--- Case C: Sukhothai vs Buriram ---');
  console.log('hasUpdatedContact:', resSukhothai.hasUpdatedContact);
  console.log('ticketCoordinatorPhone:', resSukhothai.ticketCoordinatorPhone);
}

testLookup().catch(console.error);
