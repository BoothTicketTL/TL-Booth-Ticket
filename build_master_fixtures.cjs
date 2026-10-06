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

// Generate round-robin pairings
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
        // Alternate home/away by round
        if (r % 2 === 0) {
          roundMatches.push({ home: t1, away: t2, round: r + 1 });
        } else {
          roundMatches.push({ home: t2, away: t1, round: r + 1 });
        }
      }
    }
    firstLeg.push(roundMatches);
    // rotate
    const fixed = current[0];
    const rest = current.slice(1);
    const last = rest.pop();
    rest.unshift(last);
    current.splice(0, current.length, fixed, ...rest);
  }

  // Reverse fixtures for second leg
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

console.log('Testing round-robin counts...');
const l1Rounds = generateRoundRobin(L1_TEAMS);
const l1Matches = l1Rounds.flat();
console.log('L1 matches:', l1Matches.length); // 240

const l2Rounds = generateRoundRobin(L2_TEAMS);
const l2Matches = l2Rounds.flat();
console.log('L2 matches:', l2Matches.length); // 306

let l3Matches = [];
let zoneIndex = 1;
for (const [zKey, zTeams] of Object.entries(L3_ZONES)) {
  const zRounds = generateRoundRobin(zTeams);
  const zMatches = zRounds.flat();
  console.log(`Zone ${zKey} matches:`, zMatches.length);
  l3Matches.push(...zMatches);
}
console.log('L3 regional matches count:', l3Matches.length); // 704

// National Championship rounds to reach exact 723
const neededL3 = 723 - l3Matches.length;
console.log('Additional L3 matches needed for 723:', neededL3); // 19

