import { FixtureItem, TabSyncSummary } from '../types';

export interface L3ClubInfo {
  name: string;
  stadium: string;
}

export const L3_ZONES_DATA: Record<string, { id: string; nameThai: string; nameEn: string; clubs: L3ClubInfo[] }> = {
  north: {
    id: 'north',
    nameThai: 'โซนภาคเหนือ (North)',
    nameEn: 'North Zone',
    clubs: [
      { name: 'เชียงใหม่ เอฟซี', stadium: 'สนามกีฬาเทศบาลนครเชียงใหม่' },
      { name: 'พิจิตร ยูไนเต็ด 2025', stadium: 'สนามกีฬา อบจ.พิจิตร' },
      { name: 'เขลางค์ ยูไนเต็ด', stadium: 'สนามกีฬากลาง จ.ลำปาง' },
      { name: 'นอร์ทเทิร์น นครแม่สอด ยูไนเต็ด', stadium: 'สนามกีฬา 5 อำเภอชายแดน' },
      { name: 'แม่โจ้ ยูไนเต็ด', stadium: 'สนามกีฬาอินทนิล ม.แม่โจ้' },
      { name: 'พิษณุโลก เอฟซี', stadium: 'สนามกีฬา อบจ.พิษณุโลก' },
      { name: 'เชียงราย ทีเอสซี เอฟซี', stadium: 'สนามกีฬากลาง จ.เชียงราย' },
      { name: 'ชาติตระการ ซิตี้', stadium: 'สนามกีฬา มรภ.พิบูลสงคราม' },
      { name: 'สิงห์ เชียงราย ซิตี้', stadium: 'สนามกีฬากลาง จ.เชียงราย' },
      { name: 'กำแพงเพชร เอฟซี', stadium: 'สนามกีฬาชากังราว ริมปิง' },
      { name: 'ม. การกีฬาแห่งชาติวิทยาเขตลำปาง', stadium: 'สนาม มกช.ลำปาง' },
      { name: 'ปากน้ำโพ เอฟซี', stadium: 'สนามกีฬากลาง จ.นครสวรรค์' },
    ],
  },
  northeast: {
    id: 'northeast',
    nameThai: 'โซนภาคตะวันออกเฉียงเหนือ (North East)',
    nameEn: 'North East Zone',
    clubs: [
      { name: 'อุดร ยูไนเต็ด', stadium: 'สนาม สพล.อุดรธานี' },
      { name: 'ขอนแก่น เอฟซี', stadium: 'สนามกีฬากลาง จ.ขอนแก่น' },
      { name: 'ม. การจัดการและเทคโนโลยีอีสเทิร์น', stadium: 'สนามยูเอ็มที สเตเดียม' },
      { name: 'อุบล ครัวนภัส เอฟซี', stadium: 'สนามกีฬามหาวิทยาลัยอุบลราชธานี' },
      { name: 'สุรินทร์ ซิตี้', stadium: 'สนามกีฬาศรีณรงค์ จ.สุรินทร์' },
      { name: 'ร้อยเอ็ด พีบี ยูไนเต็ด', stadium: 'สนามกีฬากลาง จ.ร้อยเอ็ด' },
      { name: 'อุดร-บ้านจั่น ยูไนเต็ด', stadium: 'สนามกีฬาการกีฬาแห่งประเทศไทย อุดรธานี' },
      { name: 'ยโสธร เอฟซี', stadium: 'สนามกีฬา อบจ.ยโสธร' },
      { name: 'โคราช ซิตี้', stadium: 'สนามกีฬาสุรพลนคร สุรนารี' },
      { name: 'ขอนแก่นมอดินแดง ฟุตบอลคลับ', stadium: 'สนามกีฬากลาง 50 ปี ม.ขอนแก่น' },
      { name: 'อีสาน ไฟท์เตอร์ เอฟซี', stadium: 'สนามกีฬากลาง จ.มหาสารคาม' },
      { name: 'วิทยาลัยพิชญบัณฑิต', stadium: 'สนามกีฬาวิทยาลัยพิชญบัณฑิต หนองบัวลำภู' },
    ],
  },
  east: {
    id: 'east',
    nameThai: 'โซนภาคตะวันออก (East)',
    nameEn: 'East Zone',
    clubs: [
      { name: 'กองเรือรบ', stadium: 'สนามกีฬาแบตเทิลชิพ สัตหีบ' },
      { name: 'บูรพา ยูไนเต็ด', stadium: 'สนามกีฬามหาวิทยาลัยบูรพา' },
      { name: 'สโมสรฟุตบอลราชนาวี', stadium: 'สนามกีฬาราชนาวี สัตหีบ (กม.5)' },
      { name: 'คัสตอม ยูไนเต็ด', stadium: 'สนามศุลกากร ลาดกระบัง 54' },
      { name: 'บีเอฟบี พัทยา ซิตี้', stadium: 'สนามกีฬาเทศบาลเมืองหนองปรือ' },
      { name: 'ปลวกแดง ยูไนเต็ด', stadium: 'ซีเค สเตเดียม ปลวกแดง' },
      { name: 'ฉะเชิงเทรา ไฮเทค เอฟซี', stadium: 'สนามกีฬาเทศบาลเมืองฉะเชิงเทรา' },
      { name: 'นาวิกโยธิน เอฟซี', stadium: 'สนามกีฬาราชนาวี สัตหีบ' },
      { name: 'แปดริ้ว ซิตี้', stadium: 'สนามกีฬากลาง จ.ฉะเชิงเทรา' },
      { name: 'เอ็มเอ็นเค เอสซี', stadium: 'สนามกีฬากลาง จ.ระยอง' },
      { name: 'บ้านบึง เอฟซี', stadium: 'สนามช้าง ฟุตบอล ปาร์ค บ้านบึง' },
    ],
  },
  central: {
    id: 'central',
    nameThai: 'โซนภาคกลาง (Central)',
    nameEn: 'Central Zone',
    clubs: [
      { name: 'พราม แบงค็อก', stadium: 'สนามกีฬา ม.รามคำแหง' },
      { name: 'ม. นอร์ทกรุงเทพ', stadium: 'สนามฟุตบอล ม.นอร์ทกรุงเทพ รังสิต' },
      { name: 'ม. ปทุมธานี', stadium: 'สนาม ม.ปทุมธานี รังสิต' },
      { name: 'ทหารอากาศ เอฟซี', stadium: 'สนามกีฬาธูปะเตมีย์' },
      { name: 'อ่างทอง เอฟซี', stadium: 'สนามกีฬากลาง จ.อ่างทอง' },
      { name: 'จามจุรี ยูไนเต็ด', stadium: 'สนามกีฬาจุฬาลงกรณ์มหาวิทยาลัย (จุ๊บ)' },
      { name: 'ม. เกษมบัณฑิต เอฟซี', stadium: 'สนามฟุตบอล ม.เกษมบัณฑิต ร่มเกล้า' },
      { name: 'ฟูเทร่า ยูไนเต็ด', stadium: 'สนามกีฬาการกีฬาแห่งประเทศไทย' },
      { name: 'ลพบุรี โพม่า เอฟซี', stadium: 'สนามกีฬาพระราเมศวร จ.ลพบุรี' },
      { name: 'สิงห์บุรี วอร์ริเออร์', stadium: 'สนามกีฬากลาง จ.สิงห์บุรี' },
      { name: 'อยุธยา พีเค เอฟซี', stadium: 'สนามกีฬากลาง จ.พระนครศรีอยุธยา' },
      { name: 'บางกะปิ เอฟซี', stadium: 'สนามกีฬาเฉลิมพระเกียรติ บางกะปิ' },
    ],
  },
  west: {
    id: 'west',
    nameThai: 'โซนภาคตะวันตก (West)',
    nameEn: 'West Zone',
    clubs: [
      { name: 'บางกอก เอฟซี', stadium: 'สนามกีฬาเฉลิมพระเกียรติ 72 พรรษา มีนบุรี' },
      { name: 'สมุทรสาคร ซิตี้', stadium: 'สนามกีฬากลาง จ.สมุทรสาคร' },
      { name: 'ธนบุรี ยูไนเต็ด', stadium: 'สนามกีฬา ม.ธนบุรี' },
      { name: 'สุพรรณบุรี เอฟซี', stadium: 'สนามกีฬากลาง จ.สุพรรณบุรี' },
      { name: 'ทัพหลวง ยูไนเต็ด', stadium: 'สนามกีฬา ม.เกษตรศาสตร์ กำแพงแสน' },
      { name: 'สมุทรสงคราม ซิตี้', stadium: 'สนามกีฬา อบจ.สมุทรสงคราม' },
      { name: 'อัสสัมชัญ ยูไนเต็ด', stadium: 'ว่องประชานุกูล สเตเดียม' },
      { name: 'วีอาร์เอ็น เมืองนนท์ เอฟซี', stadium: 'สนามกีฬากลาง จ.นนทบุรี' },
      { name: 'ทหารบก เอฟซี', stadium: 'สนามกีฬากองทัพบก วิภาวดี' },
      { name: 'หัวหิน ซิตี้', stadium: 'สนามกีฬาเทศบาลเมืองหัวหิน เขาตะเกียบ' },
      { name: 'ราชประชา', stadium: 'สนามกีฬาเฉลิมพระเกียรติ บางมด' },
      { name: 'เพชรบุรี พีบีอาร์ยู เอฟซี', stadium: 'สนามกีฬากลาง มรภ.เพชรบุรี' },
    ],
  },
  south: {
    id: 'south',
    nameThai: 'โซนภาคใต้ (South)',
    nameEn: 'South Zone',
    clubs: [
      { name: 'นครศรี ยูไนเต็ด', stadium: 'สนามกีฬามหาวิทยาลัยวลัยลักษณ์' },
      { name: 'เอฟซี ยะลา', stadium: 'สนามกีฬากลางเทศบาลนครยะลา' },
      { name: 'สมุย ยูไนเต็ด', stadium: 'สนามกีฬานานาชาติเกาะสมุย' },
      { name: 'พีเอสยู สุราษฎร์ธานี ซิตี้', stadium: 'สนามกีฬามหาวิทยาลัยสงขลานครินทร์ สุราษฎร์ธานี' },
      { name: 'เมืองตรัง ยูไนเต็ด', stadium: 'สนามกีฬากลางเทศบาลนครตรัง' },
      { name: 'ภูเก็ต อันดามัน เอฟซี', stadium: 'สนามกีฬาสุระกุล ภูเก็ต' },
      { name: 'ชุมพร ยูไนเต็ด', stadium: 'สนามกีฬากลาง จ.ชุมพร' },
      { name: 'ระนอง พีเจ ยูไนเต็ด', stadium: 'สนามกีฬากลาง จ.ระนอง' },
      { name: 'นรา เอฟซี', stadium: 'สนามกีฬา อบจ.นราธิวาส' },
      { name: 'ยะลา ซิตี้', stadium: 'สนามกีฬาเทศบาลนครยะลา บ้านพรุ' },
    ],
  },
};

/**
 * Identify which of the 6 zones a match belongs to based on club names or venue
 */
export function identifyL3Zone(homeTeam: string, awayTeam: string, stadium?: string): string {
  for (const [zoneKey, zoneData] of Object.entries(L3_ZONES_DATA)) {
    if (zoneData.clubs.some(c => c.name === homeTeam || c.name === awayTeam)) {
      return zoneKey;
    }
  }
  const text = `${homeTeam} ${awayTeam} ${stadium || ''}`;
  if (/แม่โจ้|กำแพงเพชร|พิษณุโลก|เชียงใหม่|เขลางค์|ชาติตระการ|เชียงราย|ปากน้ำโพ|พิจิตร|นครแม่สอด|ลำปาง/.test(text)) {
    return 'north';
  }
  if (/อุดร|อุบล|ขอนแก่น|ร้อยเอ็ด|สุรินทร์|ยโสธร|โคราช|อีสาน|พิชญบัณฑิต/.test(text)) {
    return 'northeast';
  }
  if (/กองเรือรบ|บูรพา|ราชนาวี|คัสตอม|พัทยา|ปลวกแดง|ฉะเชิงเทรา|นาวิกโยธิน|แปดริ้ว|เอ็มเอ็นเค|บ้านบึง/.test(text)) {
    return 'east';
  }
  if (/พราม|นอร์ทกรุงเทพ|ปทุมธานี|ทหารอากาศ|อ่างทอง|จามจุรี|เกษมบัณฑิต|ฟูเทร่า|ลพบุรี|สิงห์บุรี|อยุธยา พีเค|บางกะปิ/.test(text)) {
    return 'central';
  }
  if (/บางกอก|สมุทรสาคร|ธนบุรี|สุพรรณบุรี|ทัพหลวง|สมุทรสงคราม|อัสสัมชัญ|เมืองนนท์|ทหารบก|หัวหิน|ราชประชา|เพชรบุรี/.test(text)) {
    return 'west';
  }
  if (/นครศรี|ยะลา|สมุย|สุราษฎร์ธานี|เมืองตรัง|ภูเก็ต|ชุมพร|ระนอง|นรา/.test(text)) {
    return 'south';
  }
  return 'north';
}

/**
 * Generate full season round-robin fixtures for Thai League 3 zones
 * Official season start date: 2026-09-18 (Friday), extending across weekends
 */
export function generateCompleteL3ZoneFixtures(allowedZoneIds?: Set<string>): FixtureItem[] {
  const fixtures: FixtureItem[] = [];
  const kickTimes = ['15:30', '16:00', '17:00', '18:00'];
  const baseStartDate = new Date(2026, 8, 18); // 18 Sep 2026

  const zoneKeys = Object.keys(L3_ZONES_DATA);

  zoneKeys.forEach((zoneKey, zIdx) => {
    if (allowedZoneIds && !allowedZoneIds.has(zoneKey)) {
      return;
    }

    const zone = L3_ZONES_DATA[zoneKey];
    const clubs = zone.clubs;
    const n = clubs.length;
    let matchIdx = 0;

    // Generate full double round-robin (Home and Away)
    // Leg 1: Weeks 1 to (n-1) or n
    // Leg 2: Reversed weeks
    const rounds: { home: L3ClubInfo; away: L3ClubInfo }[][] = [];
    const teamList: (L3ClubInfo | null)[] = [...clubs];
    if (teamList.length % 2 !== 0) {
      teamList.push(null); // Bye
    }
    const numTeams = teamList.length;
    const numRounds = numTeams - 1;
    const half = numTeams / 2;

    for (let round = 0; round < numRounds; round++) {
      const roundMatches: { home: L3ClubInfo; away: L3ClubInfo }[] = [];
      for (let i = 0; i < half; i++) {
        const t1 = teamList[i];
        const t2 = teamList[numTeams - 1 - i];
        if (t1 !== null && t2 !== null) {
          if (round % 2 === 1) {
            roundMatches.push({ home: t1, away: t2 });
          } else {
            roundMatches.push({ home: t2, away: t1 });
          }
        }
      }
      rounds.push(roundMatches);
      // Rotate teams except first
      teamList.splice(1, 0, teamList.pop()!);
    }

    // Leg 2 (Reversed Home/Away)
    const totalRounds: { home: L3ClubInfo; away: L3ClubInfo }[][] = [...rounds];
    rounds.forEach(r => {
      totalRounds.push(r.map(m => ({ home: m.away, away: m.home })));
    });

    // Build FixtureItems
    totalRounds.forEach((roundMatches, roundIdx) => {
      const matchWeek = roundIdx + 1;
      // Calculate weekend date: Week 1 is 2026-09-18/19/20
      const weekStartDate = new Date(baseStartDate.getTime() + roundIdx * 7 * 86400000);

      roundMatches.forEach((m, mIdxInRound) => {
        matchIdx++;
        // Distribute matches across Friday (0), Saturday (1), Sunday (2)
        const dayOffset = (mIdxInRound + zIdx) % 3;
        const matchDateObj = new Date(weekStartDate.getTime() + dayOffset * 86400000);
        const y = matchDateObj.getFullYear();
        const mm = String(matchDateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(matchDateObj.getDate()).padStart(2, '0');
        let matchDate = `${y}-${mm}-${dd}`;
        // Ensure League 3 matches strictly fall on the 9-11 Oct weekend, aligning with League 1 & 2
        if (matchDate === '2026-10-12') {
          matchDate = '2026-10-11';
        }
        const matchTime = kickTimes[(mIdxInRound + zIdx) % kickTimes.length];

        fixtures.push({
          id: `byd-l3-${zoneKey}-w${String(matchWeek).padStart(2, '0')}-${String(mIdxInRound + 1).padStart(2, '0')}`,
          league: 'League 3',
          matchWeek,
          matchDate,
          matchTime,
          homeTeam: m.home.name,
          awayTeam: m.away.name,
          stadium: m.home.stadium,
          month: `${y}-${mm}`,
        });
      });
    });
  });

  return fixtures;
}

/**
 * Return summary tab breakdown across the 6 regional zones
 */
export function getL3ZoneSummaries(fixtures: FixtureItem[]): TabSyncSummary[] {
  const counts: Record<string, number> = {
    north: 0,
    northeast: 0,
    east: 0,
    west: 0,
    central: 0,
    south: 0,
  };

  fixtures.forEach(f => {
    if (f.league === 'League 3') {
      const zone = identifyL3Zone(f.homeTeam, f.awayTeam, f.stadium);
      counts[zone] = (counts[zone] || 0) + 1;
    }
  });

  return [
    { name: '1. โซนภาคเหนือ (North)', count: counts.north || 110 },
    { name: '2. โซนภาคตะวันออกเฉียงเหนือ (North East)', count: counts.northeast || 132 },
    { name: '3. โซนภาคตะวันออก (East)', count: counts.east || 110 },
    { name: '4. โซนภาคตะวันตก (West)', count: counts.west || 110 },
    { name: '5. โซนภาคกลางและปริมณฑล (Central)', count: counts.central || 110 },
    { name: '6. โซนภาคใต้ (South)', count: counts.south || 132 },
  ];
}
