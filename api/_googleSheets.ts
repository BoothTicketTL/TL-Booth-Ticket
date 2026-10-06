const KNOWN_TABS: Record<string, string[]> = {
  '1qHdscqV7j2GB8UoF9c59UvV1Tw_eQqBV6nfJMn64Pfw': ['T1-(THA)', 'T1-(ENG)', 'T2-(THA)', 'T2-(ENG)'],
  '1ixW80nSPE5rZCsdUwZlapeJ4NhOzyS03rj_W1_4vu7c': ['NORTH', 'NORTHEAST', 'EAST', 'CENTRAL', 'WEST', 'SOUTH'],
};

export function setJson(res: any, status: number, body: any) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

export function setText(res: any, status: number, text: string) {
  res.status(status)
    .setHeader('Content-Type', 'text/plain; charset=utf-8')
    .setHeader('Cache-Control', 'no-store')
    .send(text);
}

export function isBadResponse(text: string): boolean {
  const t = text || '';
  return !t || t.length < 20 || /<!DOCTYPE html>|<html|accounts\.google\.com/i.test(t) ||
    (t.includes('google.visualization.Query.setResponse') && /"status"\s*:\s*"error"/i.test(t));
}

export function getKnownTabs(sheetId: string) {
  return (KNOWN_TABS[sheetId] || []).map(name => ({ name, gid: '' }));
}

export function cleanSheetName(name: string) {
  return (name || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
}

export async function fetchGviz(sheetId: string, sheetName?: string, gid?: string) {
  const params = new URLSearchParams({ tqx: 'out:csv' });
  if (gid) params.set('gid', gid);
  else if (sheetName) params.set('sheet', cleanSheetName(sheetName));
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?${params.toString()}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ThaiLeagueFixtureSync/1.0)' },
  });
  const text = await response.text();
  if (!response.ok || isBadResponse(text)) return null;
  return text;
}

export async function fetchExport(sheetId: string, gid?: string) {
  const params = new URLSearchParams({ format: 'csv' });
  if (gid) params.set('gid', gid);
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?${params.toString()}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ThaiLeagueFixtureSync/1.0)' },
  });
  const text = await response.text();
  if (!response.ok || isBadResponse(text)) return null;
  return text;
}

export function looksLikeFixtureCsv(text: string | null): boolean {
  if (!text) return false;
  const s = text.toLowerCase();
  return ['ทีมเหย้า', 'ทีมเยือน'].every(x => s.includes(x)) ||
    (s.includes('home') && s.includes('away')) ||
    s.includes('วันที่แข่งขัน') || s.includes('วัน เดือน ปี');
}
