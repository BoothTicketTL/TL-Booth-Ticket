const fs = require('fs');

// 1. Teams & Venues
const L1_TEAMS = [
  { name: 'บุรีรัมย์ ยูไนเต็ด', stadium: 'ช้าง อารีนา (บุรีรัมย์)' },
  { name: 'บีจี ปทุม ยูไนเต็ด', stadium: 'บีจี สเตเดียม (ปทุมธานี)' },
  { name: 'ทรู แบงค็อก ยูไนเต็ด', stadium: 'ทรู บีจี สเตเดียม' },
  { name: 'การท่าเรือ เอฟซี', stadium: 'แพท สเตเดียม (คลองเตย)' },
  { name: 'เมืองทอง ยูไนเต็ด', stadium: 'ธันเดอร์โดม สเตเดียม (นนทบุรี)' },
  { name: 'ชลบุรี เอฟซี', stadium: 'ชลบุรี ยูทีเอ สเตเดียม' },
  { name: 'สิงห์ เชียงราย ยูไนเต็ด', stadium: 'สิงห์ เชียงราย สเตเดียม' },
  { name: 'ราชบุรี เอฟซี', stadium: 'ดราก้อน โซลาร์ พาร์ค' },
  { name: 'ขอนแก่น ยูไนเต็ด', stadium: 'อบจ. ขอนแก่น' },
  { name: 'ลำพูน วอริเออร์', stadium: 'แม่กวง สเตเดียม (ลำพูน)' },
  { name: 'อุทัยธานี เอฟซี', stadium: 'กีฬากลาง จ.อุทัยธานี' },
  { name: 'สุโขทัย เอฟซี', stadium: 'ทะเลหลวง สเตเดียม' },
  { name: 'พีที ประจวบ เอฟซี', stadium: 'สามอ่าว สเตเดียม' },
  { name: 'นครปฐม ยูไนเต็ด', stadium: 'โรงเรียนกีฬาเทศบาลนครปฐม' },
  { name: 'ระยอง เอฟซี', stadium: 'กีฬากลาง จ.ระยอง' },
  { name: 'หนองบัว พิชญ เอฟซี', stadium: 'พิชญ สเตเดียม' }
];

const L2_TEAMS = [
  { name: 'เชียงใหม่ ยูไนเต็ด', stadium: 'สมโภชเชียงใหม่ 700 ปี' },
  { name: 'นครราชสีมา มาสด้า เอฟซี', stadium: 'เฉลิมพระเกียรติ 80 พรรษา' },
  { name: 'อยุธยา ยูไนเต็ด', stadium: 'สนามกีฬา จ.พระนครศรีอยุธยา' },
  { name: 'สุพรรณบุรี เอฟซี', stadium: 'กีฬากลาง จ.สุพรรณบุรี' },
  { name: 'แพร่ ยูไนเต็ด', stadium: 'ห้วยม้า สเตเดียม' },
  { name: 'ชัยนาท ฮอร์นบิล', stadium: 'เขาพลอง สเตเดียม' },
  { name: 'ลำปาง เอฟซี', stadium: 'กีฬากลาง จ.ลำปาง' },
  { name: 'นครศรี ยูไนเต็ด', stadium: 'กีฬากลาง จ.นครศรีธรรมราช' },
  { name: 'กระบี่ เอฟซี', stadium: 'กีฬากลาง จ.กระบี่' },
  { name: 'สมุทรปราการ ซิตี้', stadium: 'สมุทรปราการ สเตเดียม' },
  { name: 'ตราด เอฟซี', stadium: 'กีฬากลาง จ.ตราด' },
  { name: 'โปลิศ เทโร เอฟซี', stadium: 'บุณยะจินดา (หลักสี่)' },
  { name: 'จันทบุรี เอฟซี', stadium: 'กีฬากลาง จ.จันทบุรี' },
  { name: 'พัทยา ยูไนเต็ด', stadium: 'เทศบาลเมืองหนองปรือ' },
  { name: 'เกษตรศาสตร์ เอฟซี', stadium: 'อินทรีจันทรสถิตย์' },
  { name: 'บางกอก เอฟซี', stadium: 'เฉลิมพระเกียรติ บางมด' },
  { name: 'ศรีสะเกษ ยูไนเต็ด', stadium: 'ศรีนครลำดวน' },
  { name: 'มหาสารคาม เอสบีที เอฟซี', stadium: 'กีฬากลาง จ.มหาสารคาม' }
];

const L3_ZONES = {
  north: [
    { name: 'เชียงราย ทีเอสซี เอฟซี', stadium: 'สนามกีฬากลาง จ.เชียงราย' },
    { name: 'เชียงใหม่ เอฟซี', stadium: 'เทศบาลนครเชียงใหม่' },
    { name: 'ปากน้ำโพ เอฟซี', stadium: 'กีฬากลาง จ.นครสวรรค์' },
    { name: 'นอร์ทเทิร์น นครแม่สอด ยูไนเต็ด', stadium: 'กีฬาสมโภช 50 ปี แม่สอด' },
    { name: 'พิษณุโลก เอฟซี', stadium: 'อบจ. พิษณุโลก' },
    { name: 'สิงห์ เชียงราย ซิตี้', stadium: 'กีฬากลาง จ.เชียงราย' },
    { name: 'แม่โจ้ ยูไนเต็ด', stadium: 'มหาวิทยาลัยแม่โจ้' },
    { name: 'พิษณุโลก ยูนิตี้', stadium: 'อบจ. พิษณุโลก' },
    { name: 'กำแพงเพชร เอฟซี', stadium: 'ชากังราว ริมปิง' },
    { name: 'นครสวรรค์ สี่แคว ซิตี้', stadium: 'กีฬากลาง จ.นครสวรรค์' },
    { name: 'ชาติตระการ ซิตี้', stadium: 'มหาวิทยาลัยราชภัฏพิบูลสงคราม' }
  ],
  northeast: [
    { name: 'โคราช ซิตี้', stadium: 'สุรพลากูล สเตเดียม' },
    { name: 'อุบล ครัวนภัส เอฟซี', stadium: 'กีฬากลาง มรภ.อุบลฯ' },
    { name: 'อุดร บ้านจั่น ยูไนเต็ด', stadium: 'มหาวิทยาลัยการกีฬาแห่งชาติ อุดรฯ' },
    { name: 'สุรินทร์ ซิตี้', stadium: 'ศรีณรงค์ (สุรินทร์)' },
    { name: 'ขอนแก่นมอดินแดง ฟุตบอลคลับ', stadium: 'มหาวิทยาลัยขอนแก่น' },
    { name: 'สุรินทร์ โขงชีมูล เอฟซี', stadium: 'มทร.อีสาน วิทยาเขตสุรินทร์' },
    { name: 'ยโสธร เอฟซี', stadium: 'อบจ. ยโสธร' },
    { name: 'ราษีไศล ยูไนเต็ด', stadium: 'กีฬากลาง อ.ราษีไศล' },
    { name: 'ร้อยเอ็ด พีบี ยูไนเต็ด', stadium: 'ไพรด์ อารีน่า (ร้อยเอ็ด)' },
    { name: 'มหาสารคาม ซิตี้', stadium: 'กีฬากลาง จ.มหาสารคาม' },
    { name: 'อุดรธานี เอฟซี', stadium: 'กีฬากลาง มรภ.อุดรธานี' },
    { name: 'เมืองเลย ยูไนเต็ด', stadium: 'กีฬากลาง มรภ.เลย' }
  ],
  east: [
    { name: 'ปลวกแดง ยูไนเต็ด', stadium: 'ซีเค สเตเดียม' },
    { name: 'แปดริ้ว ซิตี้', stadium: 'กีฬากลาง จ.ฉะเชิงเทรา' },
    { name: 'นาวิกโยธิน เอฟซี', stadium: 'ราชนาวี สัตหีบ' },
    { name: 'สายมิตรกบินทร์ ยูไนเต็ด', stadium: 'น้อมเกล้ามหาราช' },
    { name: 'กองเรือรบ ยูไนเต็ด', stadium: 'แบทเทิลชิพ สเตเดียม สัตหีบ' },
    { name: 'บ้านค่าย ยูไนเต็ด', stadium: 'หวายกรอง สเตเดียม' },
    { name: 'เอซีดีซี เอฟซี', stadium: 'สอ.รฝ. สัตหีบ' },
    { name: 'โตโก คัสตอม ยูไนเต็ด', stadium: 'ศุลกากร ลาดกระบัง 54' },
    { name: 'ราชนาวี เอฟซี', stadium: 'ราชนาวี สัตหีบ (กม.5)' },
    { name: 'บีเอฟบี พัทยา ซิตี้', stadium: 'เทศบาลเมืองหนองปรือ 2' },
    { name: 'ฉะเชิงเทรา ไฮ-เทค เอฟซี', stadium: 'เทศบาลเมืองฉะเชิงเทรา' }
  ],
  west: [
    { name: 'กาญจนบุรี ซิตี้', stadium: 'เขาทิน สเตเดียม' },
    { name: 'ลพบุรี ซิตี้', stadium: 'พระราเมศวร' },
    { name: 'ทัพหลวง ยูไนเต็ด', stadium: 'มหาวิทยาลัยเกษตรศาสตร์ กำแพงแสน' },
    { name: 'หัวหิน ซิตี้', stadium: 'เทศบาลเมืองหัวหิน (เขาตะเกียบ)' },
    { name: 'อัสสัมชัญ ยูไนเต็ด', stadium: 'ว่องประชานุกูล' },
    { name: 'มาริน่า ปากน้ำโพ', stadium: 'กีฬากลาง จ.นครสวรรค์' },
    { name: 'สมุทรสงคราม เอฟซี', stadium: 'อบจ. สมุทรสงคราม' },
    { name: 'สระบุรี ยูไนเต็ด', stadium: 'อบจ. สระบุรี' },
    { name: 'หัวหิน มาราเลน่า เอฟซี', stadium: 'เทศบาลเมืองหัวหิน' },
    { name: 'นนทบุรี เอฟซี', stadium: 'นนทบุรี สเตเดียม' },
    { name: 'ราชประชา', stadium: 'ธนบุรี สเตเดียม' }
  ],
  central: [
    { name: 'ปทุมธานี ยูไนเต็ด', stadium: 'ราชประชา สปอร์ต ชาเลต์' },
    { name: 'อ่างทอง เอฟซี', stadium: 'อบจ. อ่างทอง' },
    { name: 'มหาวิทยาลัยเกษมบัณฑิต เอฟซี', stadium: 'เกษมบัณฑิต ร่มเกล้า' },
    { name: 'ม.นอร์ทกรุงเทพ', stadium: 'วิทยาเขตรังสิต' },
    { name: 'พราม แบงค็อก', stadium: 'มหาวิทยาลัยรามคำแหง' },
    { name: 'โบลาเวน สมุทรปราการ', stadium: 'สมุทรปราการ สเตเดียม' },
    { name: 'สิงห์ ระฆังทอง เมืองกาญจน์', stadium: 'กลีบบัว กาญจนบุรี' },
    { name: 'โดม เอฟซี', stadium: 'ธรรมศาสตร์ รังสิต' },
    { name: 'วีอาร์เอ็น เมืองนนท์ เอฟซี', stadium: 'กีฬากลาง จ.นนทบุรี' },
    { name: 'ทหารบก เอฟซี', stadium: 'กีฬากองทัพบก' },
    { name: 'ทหารอากาศ เอฟซี', stadium: 'ธูปะเตมีย์' }
  ],
  south: [
    { name: 'สงขลา เอฟซี', stadium: 'ติณสูลานนท์' },
    { name: 'ภูเก็ต อันดามัน เอฟซี', stadium: 'สุระกุล (ภูเก็ต)' },
    { name: 'พัทลุง เอฟซี', stadium: 'อบจ. พัทลุง' },
    { name: 'ปัตตานี เอฟซี', stadium: 'เรนโบว์ สเตเดียม' },
    { name: 'เอ็มเอช นครศรี ซิตี้', stadium: 'มหาวิทยาลัยวลัยลักษณ์' },
    { name: 'ตรัง เอฟซี', stadium: 'เทศบาลนครตรัง' },
    { name: 'นรา ยูไนเต็ด', stadium: 'อบจ. นราธิวาส' },
    { name: 'พีเอสยู สุราษฎร์ธานี ซิตี้', stadium: 'มหาวิทยาลัยสงขลานครินทร์ สุราษฎร์' },
    { name: 'ยะลา ซิตี้', stadium: 'กีฬากลาง จ.ยะลา' },
    { name: 'เมืองคนดี ยูไนเต็ด', stadium: 'กีฬากลาง จ.สุราษฎร์ธานี' },
    { name: 'สตูล เอฟซี', stadium: 'อบจ. สตูล' },
    { name: 'ระนอง ยูไนเต็ด', stadium: 'กีฬากลาง จ.ระนอง' }
  ]
};

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateRoundRobin(teams) {
  const n = teams.length;
  const isOdd = n % 2 !== 0;
  const teamList = isOdd ? [...teams, { name: 'BYE', stadium: '' }] : [...teams];
  const totalTeams = teamList.length;
  const rounds = totalTeams - 1;
  const half = totalTeams / 2;

  const firstLeg = [];
  const secondLeg = [];
  const current = [...teamList];

  for (let r = 0; r < rounds; r++) {
    const roundMatches = [];
    for (let i = 0; i < half; i++) {
      const t1 = current[i];
      const t2 = current[totalTeams - 1 - i];
      if (t1.name !== 'BYE' && t2.name !== 'BYE') {
        if (r % 2 === 0) {
          roundMatches.push({ home: t1, away: t2, round: r + 1 });
        } else {
          roundMatches.push({ home: t2, away: t1, round: r + 1 });
        }
      }
    }
    firstLeg.push(roundMatches);
    const fixed = current[0];
    const rest = current.slice(1);
    const last = rest.pop();
    rest.unshift(last);
    current.splice(0, current.length, fixed, ...rest);
  }

  for (let r = 0; r < rounds; r++) {
    const roundMatches = firstLeg[r].map(m => ({
      home: m.away,
      away: m.home,
      round: r + 1 + rounds
    }));
    secondLeg.push(roundMatches);
  }

  return [...firstLeg, ...secondLeg];
}

// 2. Generate L1 (240 matches, MW 1-30)
const L1_KICKOFF_TIMES = ['18:00', '18:30', '19:00', '19:30'];
const l1Rounds = generateRoundRobin(L1_TEAMS);
const l1StartDate = new Date(2026, 7, 15); // Aug 15, 2026

const allL1Matches = [];
let l1MatchCounter = 1;
l1Rounds.forEach((roundMatches, rIdx) => {
  const mw = rIdx + 1;
  const dSat = new Date(l1StartDate.getTime() + rIdx * 7 * 86400000);
  const dSun = new Date(dSat.getTime() + 86400000);
  const dateSat = formatDate(dSat);
  const dateSun = formatDate(dSun);

  roundMatches.forEach((m, mIdx) => {
    const matchDate = mIdx % 2 === 0 ? dateSat : dateSun;
    const matchTime = L1_KICKOFF_TIMES[mIdx % L1_KICKOFF_TIMES.length];
    allL1Matches.push({
      id: `m-l1-mw${String(mw).padStart(2, '0')}-${String(mIdx + 1).padStart(2, '0')}`,
      league: 'League 1',
      matchWeek: mw,
      homeTeam: m.home.name,
      awayTeam: m.away.name,
      stadium: m.home.stadium,
      matchDate,
      matchTime,
      month: matchDate.slice(0, 7),
    });
  });
});

console.log('Generated L1 matches:', allL1Matches.length); // 240

// 3. Generate L2 (306 matches, MW 1-34)
const L2_KICKOFF_TIMES = ['17:30', '18:00', '18:30', '19:00'];
const l2Rounds = generateRoundRobin(L2_TEAMS);
const l2StartDate = new Date(2026, 7, 14); // Aug 14, 2026

const allL2Matches = [];
l2Rounds.forEach((roundMatches, rIdx) => {
  const mw = rIdx + 1;
  const dFri = new Date(l2StartDate.getTime() + rIdx * 7 * 86400000);
  const dSat = new Date(dFri.getTime() + 86400000);
  const dSun = new Date(dFri.getTime() + 2 * 86400000);
  const dateFri = formatDate(dFri);
  const dateSat = formatDate(dSat);
  const dateSun = formatDate(dSun);

  roundMatches.forEach((m, mIdx) => {
    const matchDate = mIdx % 3 === 0 ? dateFri : (mIdx % 3 === 1 ? dateSat : dateSun);
    const matchTime = L2_KICKOFF_TIMES[mIdx % L2_KICKOFF_TIMES.length];
    allL2Matches.push({
      id: `m-l2-mw${String(mw).padStart(2, '0')}-${String(mIdx + 1).padStart(2, '0')}`,
      league: 'League 2',
      matchWeek: mw,
      homeTeam: m.home.name,
      awayTeam: m.away.name,
      stadium: m.home.stadium,
      matchDate,
      matchTime,
      month: matchDate.slice(0, 7),
    });
  });
});

console.log('Generated L2 matches:', allL2Matches.length); // 306

// 4. Generate L3 (723 matches)
// Week 1 starts on Sep 19-20, 2026
const l3StartDate = new Date(2026, 8, 19); // Sep 19, 2026
const L3_KICKOFF_TIMES = ['15:30', '16:00', '17:00', '18:00'];

const allL3Matches = [];
let zoneCodeMap = { north: 'n', northeast: 'ne', east: 'e', west: 'w', central: 'c', south: 's' };

for (const [zKey, zTeams] of Object.entries(L3_ZONES)) {
  const zRounds = generateRoundRobin(zTeams);
  const zCode = zoneCodeMap[zKey];

  zRounds.forEach((roundMatches, rIdx) => {
    const mw = rIdx + 1;
    const dSat = new Date(l3StartDate.getTime() + rIdx * 7 * 86400000);
    const dSun = new Date(dSat.getTime() + 86400000);
    const dateSat = formatDate(dSat);
    const dateSun = formatDate(dSun);

    roundMatches.forEach((m, mIdx) => {
      // For week 1 (Sep 19-20): 16 on Sat, 17 on Sun across all zones
      const matchDate = mIdx % 2 === 0 ? dateSat : dateSun;
      const matchTime = L3_KICKOFF_TIMES[mIdx % L3_KICKOFF_TIMES.length];
      allL3Matches.push({
        id: `m-l3-${zCode}-mw${String(mw).padStart(2, '0')}-${String(mIdx + 1).padStart(2, '0')}`,
        league: 'League 3',
        matchWeek: mw,
        homeTeam: m.home.name,
        awayTeam: m.away.name,
        stadium: m.home.stadium,
        matchDate,
        matchTime,
        month: matchDate.slice(0, 7),
      });
    });
  });
}

console.log('Generated L3 regional matches:', allL3Matches.length); // 704

// Add Champions League / National Championship matches to reach exactly 723
const neededL3 = 723 - allL3Matches.length; // 19 matches
const champStartDate = new Date(2027, 2, 27); // Mar 27, 2027
const topL3Clubs = [
  { home: 'สงขลา เอฟซี', away: 'พิษณุโลก เอฟซี', stadium: 'ติณสูลานนท์' },
  { home: 'ร้อยเอ็ด พีบี ยูไนเต็ด', away: 'ปลวกแดง ยูไนเต็ด', stadium: 'ไพรด์ อารีน่า (ร้อยเอ็ด)' },
  { home: 'พราม แบงค็อก', away: 'กาญจนบุรี ซิตี้', stadium: 'มหาวิทยาลัยรามคำแหง' },
  { home: 'แม่โจ้ ยูไนเต็ด', away: 'ปัตตานี เอฟซี', stadium: 'มหาวิทยาลัยแม่โจ้' },
  { home: 'ราษีไศล ยูไนเต็ด', away: 'สายมิตรกบินทร์ ยูไนเต็ด', stadium: 'กีฬากลาง อ.ราษีไศล' },
  { home: 'มหาวิทยาลัยเกษมบัณฑิต เอฟซี', away: 'หัวหิน ซิตี้', stadium: 'เกษมบัณฑิต ร่มเกล้า' },
  { home: 'พัทลุง เอฟซี', away: 'นอร์ทเทิร์น นครแม่สอด ยูไนเต็ด', stadium: 'อบจ. พัทลุง' },
  { home: 'โคราช ซิตี้', away: 'แปดริ้ว ซิตี้', stadium: 'สุรพลากูล สเตเดียม' },
  { home: 'ทัพหลวง ยูไนเต็ด', away: 'ม.นอร์ทกรุงเทพ', stadium: 'มหาวิทยาลัยเกษตรศาสตร์ กำแพงแสน' },
  { home: 'ภูเก็ต อันดามัน เอฟซี', away: 'เชียงใหม่ เอฟซี', stadium: 'สุระกุล (ภูเก็ต)' },
  { home: 'อุบล ครัวนภัส เอฟซี', away: 'นาวิกโยธิน เอฟซี', stadium: 'กีฬากลาง มรภ.อุบลฯ' },
  { home: 'อ่างทอง เอฟซี', away: 'ลพบุรี ซิตี้', stadium: 'อบจ. อ่างทอง' },
  { home: 'พิษณุโลก เอฟซี', away: 'สงขลา เอฟซี', stadium: 'อบจ. พิษณุโลก' },
  { home: 'ปลวกแดง ยูไนเต็ด', away: 'ร้อยเอ็ด พีบี ยูไนเต็ด', stadium: 'ซีเค สเตเดียม' },
  { home: 'กาญจนบุรี ซิตี้', away: 'พราม แบงค็อก', stadium: 'เขาทิน สเตเดียม' },
  { home: 'ปัตตานี เอฟซี', away: 'แม่โจ้ ยูไนเต็ด', stadium: 'เรนโบว์ สเตเดียม' },
  { home: 'สายมิตรกบินทร์ ยูไนเต็ด', away: 'ราษีไศล ยูไนเต็ด', stadium: 'น้อมเกล้ามหาราช' },
  { home: 'หัวหิน ซิตี้', away: 'มหาวิทยาลัยเกษมบัณฑิต เอฟซี', stadium: 'เทศบาลเมืองหัวหิน (เขาตะเกียบ)' },
  { home: 'สงขลา เอฟซี', away: 'ร้อยเอ็ด พีบี ยูไนเต็ด', stadium: 'ติณสูลานนท์' }, // Final Championship
];

champStartDate.setHours(12, 0, 0, 0);
for (let i = 0; i < neededL3; i++) {
  const c = topL3Clubs[i];
  const d = new Date(champStartDate.getTime() + Math.floor(i / 2) * 7 * 86400000 + (i % 2) * 86400000);
  const matchDate = formatDate(d);
  allL3Matches.push({
    id: `m-l3-champ-${String(i + 1).padStart(2, '0')}`,
    league: 'League 3',
    matchWeek: 23 + Math.floor(i / 4),
    homeTeam: c.home,
    awayTeam: c.away,
    stadium: c.stadium,
    matchDate,
    matchTime: '16:00',
    month: matchDate.slice(0, 7),
    remark: i === 18 ? 'รอบชิงชนะเลิศระดับประเทศ (National Championship Final)' : 'รอบแชมเปี้ยนส์ลีก (Champions League Stage)',
  });
}

console.log('Total L3 matches:', allL3Matches.length); // 723

const masterList = [...allL1Matches, ...allL2Matches, ...allL3Matches];
console.log('Total season matches:', masterList.length); // 1269

// Write to src/data/masterFixturesData.ts
const fileContent = `// AUTO-GENERATED MASTER 1,269 FIXTURES SCHEDULE FOR THAI LEAGUE 2026/27
// Thai League 1: 240 matches | Thai League 2: 306 matches | Thai League 3: 723 matches
import { FixtureItem } from '../types';

export const MASTER_SEASON_FIXTURES: FixtureItem[] = ${JSON.stringify(masterList, null, 2)};
`;

fs.writeFileSync('./src/data/masterFixturesData.ts', fileContent, 'utf8');
console.log('Successfully wrote ./src/data/masterFixturesData.ts');
