import { StadiumContact, MatchStadiumContact } from '../types';
import { 
  OFFICIAL_LEAGUE_1_CLUBS, 
  OFFICIAL_LEAGUE_2_CLUBS, 
  OFFICIAL_LEAGUE_3_CLUBS 
} from './officialSeasonClubs';
import { L3_ZONES_DATA } from '../lib/l3SeasonFixturesGenerator';

/**
 * Authoritative initial stadiums list strictly restricted to official season clubs (103 clubs).
 * PER USER INSTRUCTION: Absolutely NO mock data, synthetic names, or sample phone numbers.
 * Coordinator names, phone numbers, and remarks remain empty until fetched directly from
 * Google Sheet "เบอร์ติดต่อหน้าสนาม" or entered by authorized admin.
 */

// Helper to lookup stadium from L3_ZONES_DATA
const L3_STADIUM_MAP = new Map<string, string>();
Object.values(L3_ZONES_DATA).forEach(zone => {
  zone.clubs.forEach(c => {
    L3_STADIUM_MAP.set(c.name, c.stadium);
  });
});

const L1_STADIUM_MAP: Record<string, { stadium: string; province: string }> = {
  'บุรีรัมย์ ยูไนเต็ด': { stadium: 'ช้าง อารีนา (Chang Arena)', province: 'จ.บุรีรัมย์' },
  'การท่าเรือ เอฟซี': { stadium: 'แพท สเตเดียม (PAT Stadium)', province: 'กรุงเทพมหานคร' },
  'ราชบุรี เอฟซี': { stadium: 'ดราก้อน ซอลาร์ พาร์ค', province: 'จ.ราชบุรี' },
  'บีจี ปทุม ยูไนเต็ด': { stadium: 'บีจี สเตเดียม (BG Stadium)', province: 'จ.ปทุมธานี' },
  'ทรู แบงค็อก ยูไนเต็ด': { stadium: 'ทรู สเตเดียม (True Stadium)', province: 'จ.ปทุมธานี' },
  'พีที ประจวบ เอฟซี': { stadium: 'สามอ่าว สเตเดียม', province: 'จ.ประจวบคีรีขันธ์' },
  'สิงห์ เชียงราย ยูไนเต็ด': { stadium: 'สิงห์ เชียงราย สเตเดียม', province: 'จ.เชียงราย' },
  'ชลบุรี เอฟซี': { stadium: 'ชลบุรี ไดกิ้น สเตเดียม', province: 'จ.ชลบุรี' },
  'ระยอง เอฟซี': { stadium: 'ดับบลิวเอชเอ ระยอง สเตเดียม', province: 'จ.ระยอง' },
  'อยุธยา ยูไนเต็ด': { stadium: 'สนามกีฬาจังหวัดพระนครศรีอยุธยา', province: 'จ.พระนครศรีอยุธยา' },
  'อุทัยธานี เอฟซี': { stadium: 'สนามกีฬากลาง จ.อุทัยธานี', province: 'จ.อุทัยธานี' },
  'ลำพูน วอร์ริเออร์': { stadium: 'ลำพูน สเตเดียม', province: 'จ.ลำพูน' },
  'สุโขทัย เอฟซี': { stadium: 'ทะเลหลวง สเตเดียม', province: 'จ.สุโขทัย' },
  'ราษีไศล ยูไนเต็ด': { stadium: 'สนามกีฬาเทศบาลตำบลราษีไศล', province: 'จ.ศรีสะเกษ' },
  'ศรีสะเกษ ยูไนเต็ด': { stadium: 'สนามกีฬาศรีนครลำดวน', province: 'จ.ศรีสะเกษ' },
  'ปัตตานี เอฟซี': { stadium: 'สนามกีฬา อบจ.ปัตตานี (เรนโบว์ สเตเดียม)', province: 'จ.ปัตตานี' },
};

const L2_STADIUM_MAP: Record<string, { stadium: string; province: string }> = {
  'เชียงใหม่ ยูไนเต็ด': { stadium: 'สนามสมโภชเชียงใหม่ 700 ปี', province: 'จ.เชียงใหม่' },
  'แพร่ ยูไนเต็ด': { stadium: 'ห้วยม้า สเตเดียม', province: 'จ.แพร่' },
  'อุตรดิตถ์ เอฟซี': { stadium: 'สนามกีฬากลาง จ.อุตรดิตถ์ (หมอนไม้)', province: 'จ.อุตรดิตถ์' },
  'เมืองทอง ยูไนเต็ด': { stadium: 'ธันเดอร์โดม สเตเดียม', province: 'จ.นนทบุรี' },
  'โปลิศ เทโร เอฟซี': { stadium: 'สนามบุณยะจินดา', province: 'กรุงเทพมหานคร' },
  'ชัยนาท ฮอร์นบิล เอฟซี': { stadium: 'เขาพลอง สเตเดียม', province: 'จ.ชัยนาท' },
  'เกษตรศาสตร์ เอฟซี': { stadium: 'สนามอินทรีจันทรสถิตย์', province: 'กรุงเทพมหานคร' },
  'พัทยา ยูไนเต็ด': { stadium: 'สนามกีฬาเทศบาลเมืองหนองปรือ', province: 'จ.ชลบุรี' },
  'จันทบุรี เอฟซี': { stadium: 'สนามกีฬา อบจ.จันทบุรี', province: 'จ.จันทบุรี' },
  'นครราชสีมา มาสด้า เอฟซี': { stadium: 'สนามกีฬาเฉลิมพระเกียรติ 80 พรรษา', province: 'จ.นครราชสีมา' },
  'หนองบัว พิชญ เอฟซี': { stadium: 'พิชญ สเตเดียม', province: 'จ.หนองบัวลำภู' },
  'ขอนแก่น ยูไนเต็ด': { stadium: 'สนามกีฬา อบจ.ขอนแก่น', province: 'จ.ขอนแก่น' },
  'มหาสารคาม ซีซี เอฟซี': { stadium: 'สนามกีฬากลาง จ.มหาสารคาม', province: 'จ.มหาสารคาม' },
  'เมืองเลย ยูไนเต็ด': { stadium: 'มังกรฟ้า สเตเดียม (สนาม อบจ.เลย)', province: 'จ.เลย' },
  'พลังกาญจน์ เอฟซี': { stadium: 'สนามกีฬากลาง จ.กาญจนบุรี (กลีบบัว)', province: 'จ.กาญจนบุรี' },
  'สงขลา เอฟซี': { stadium: 'สนามกีฬาติณสูลานนท์', province: 'จ.สงขลา' },
  'พีที สตูล เอฟซี': { stadium: 'สนามกีฬา อบจ.สตูล', province: 'จ.สตูล' },
  'นครปฐม ยูไนเต็ด': { stadium: 'สนามโรงเรียนกีฬาเทศบาลนครนครปฐม', province: 'จ.นครปฐม' },
};

function buildOfficialStadiumContacts(): StadiumContact[] {
  const result: StadiumContact[] = [];

  // League 1 (16 clubs)
  OFFICIAL_LEAGUE_1_CLUBS.forEach((club, idx) => {
    const meta = L1_STADIUM_MAP[club];
    result.push({
      id: `sc-l1-${idx + 1}`,
      stadiumName: meta?.stadium || `สนามเหย้าสโมสร ${club}`,
      league: 'League 1',
      homeClub: club,
      locationProvince: meta?.province || 'ประจำสนามแข่งขัน',
      boothCoordinatorName: '',
      boothCoordinatorPhone: '',
      boothSetupLocation: 'ลานกิจกรรมหน้าทางเข้าหลัก',
      ticketCoordinatorName: '',
      ticketCoordinatorPhone: '',
      ticketPickupLocation: 'ซุ้มตั๋วผู้สนับสนุน / จุดรับบัตรหน้าสนาม',
      operatingHours: '14:00 - 19:30 น. (วันแข่งขัน)',
      note: '',
      remark: '',
      hasUpdatedContact: false,
      sourceTab: 'League 1',
    });
  });

  // League 2 (18 clubs)
  OFFICIAL_LEAGUE_2_CLUBS.forEach((club, idx) => {
    const meta = L2_STADIUM_MAP[club];
    result.push({
      id: `sc-l2-${idx + 1}`,
      stadiumName: meta?.stadium || `สนามเหย้าสโมสร ${club}`,
      league: 'League 2',
      homeClub: club,
      locationProvince: meta?.province || 'ประจำสนามแข่งขัน',
      boothCoordinatorName: '',
      boothCoordinatorPhone: '',
      boothSetupLocation: 'ลานกิจกรรมหน้าทางเข้าหลัก',
      ticketCoordinatorName: '',
      ticketCoordinatorPhone: '',
      ticketPickupLocation: 'ซุ้มตั๋วผู้สนับสนุน / จุดรับบัตรหน้าสนาม',
      operatingHours: '14:00 - 19:30 น. (วันแข่งขัน)',
      note: '',
      remark: '',
      hasUpdatedContact: false,
      sourceTab: 'League 2',
    });
  });

  // League 3 (69 clubs)
  OFFICIAL_LEAGUE_3_CLUBS.forEach((club, idx) => {
    const stadium = L3_STADIUM_MAP.get(club) || `สนามเหย้าสโมสร ${club}`;
    result.push({
      id: `sc-l3-${idx + 1}`,
      stadiumName: stadium,
      league: 'League 3',
      homeClub: club,
      locationProvince: 'ประจำสนามแข่งขัน',
      boothCoordinatorName: '',
      boothCoordinatorPhone: '',
      boothSetupLocation: 'ลานกิจกรรมหน้าทางเข้าหลัก',
      ticketCoordinatorName: '',
      ticketCoordinatorPhone: '',
      ticketPickupLocation: 'ซุ้มตั๋วผู้สนับสนุน / จุดรับบัตรหน้าสนาม',
      operatingHours: '14:00 - 19:30 น. (วันแข่งขัน)',
      note: '',
      remark: '',
      hasUpdatedContact: false,
      sourceTab: 'League 3',
    });
  });

  return result;
}

export const INITIAL_STADIUM_CONTACTS: StadiumContact[] = buildOfficialStadiumContacts();

// No hardcoded mock match contacts allowed. Real contacts come strictly from Google Sheet sync or admin entry.
export const INITIAL_MATCH_CONTACTS: MatchStadiumContact[] = [];
