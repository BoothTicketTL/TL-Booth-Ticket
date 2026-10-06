import type { LeagueType } from '../types';
import { getCanonicalOfficialClub } from '../data/officialSeasonClubs';
import { CLUB_NAMES_EN_TO_TH } from '../data/clubNamesEn';

/** lower-case, no spaces / punctuation (keeps Thai letters and digits) so "Chiangrai  TSC FC" == "CHIANGRAI TSC FC" */
const key = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9\u0e00-\u0e7f]/g, '');

const enIndex: Record<string, Map<string, string>> = { 'League 1': new Map(), 'League 2': new Map(), 'League 3': new Map() };
(Object.keys(CLUB_NAMES_EN_TO_TH) as LeagueType[]).forEach(lg => {
  Object.entries(CLUB_NAMES_EN_TO_TH[lg]).forEach(([en, th]) => enIndex[lg].set(key(en), th));
});

/**
 * Official Thai club name for a name written in the Excel (Thai or English), or null when it is not known.
 * No fuzzy matching: either an exact official name / known alias / listed English spelling, or null.
 */
export function resolveOfficialClubName(raw: string, league: LeagueType): string | null {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const en = enIndex[league].get(key(text));
  if (en) return en;
  const thai = getCanonicalOfficialClub(text, league);
  return thai && thai.league === league ? thai.name : null;
}
