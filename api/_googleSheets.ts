const KNOWN_TABS: Record<string, Array<{ name: string; gid: string }>> = {
  // GIDs confirmed from the official source URLs. Other tab GIDs are discovered at runtime.
  '1qHdscqV7j2GB8UoF9c59UvV1Tw_eQqBV6nfJMn64Pfw': [
    { name: 'T1-(THA)', gid: '1540565395' },
    { name: 'T1-(ENG)', gid: '' },
    { name: 'T2-(THA)', gid: '' },
    { name: 'T2-(ENG)', gid: '' },
  ],
  '1ixW80nSPE5rZCsdUwZlapeJ4NhOzyS03rj_W1_4vu7c': [
    { name: 'NORTH', gid: '1149972876' },
    { name: 'NORTHEAST', gid: '' },
    { name: 'EAST', gid: '' },
    { name: 'CENTRAL', gid: '' },
    { name: 'WEST', gid: '' },
    { name: 'SOUTH', gid: '' },
  ],
};

const FETCH_TIMEOUT_MS = 12000;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0 Safari/537.36',
  Accept: 'text/html,text/plain,text/csv,*/*;q=0.8',
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

export function looksLikeFixtureCsv(text: string | null): boolean {
  if (!text) return false;
  const s = text.toLowerCase();
  return ['ทีมเหย้า', 'ทีมเยือน'].every(x => s.includes(x)) ||
    (s.includes('home') && s.includes('away')) ||
    s.includes('วันที่แข่งขัน') || s.includes('วัน เดือน ปี');
}

export function getKnownTabs(sheetId: string) {
  return (KNOWN_TABS[sheetId] || []).map(t => ({ ...t }));
}

export function cleanSheetName(name: string) {
  return (name || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function dedupeTabs(tabs: Array<{ name: string; gid: string }>) {
  const out: Array<{ name: string; gid: string }> = [];
  for (const tab of tabs) {
    const name = cleanSheetName(tab.name);
    const gid = String(tab.gid || '').trim();
    if (!name) continue;
    const existing = out.find(t => t.name.toLowerCase() === name.toLowerCase() || (gid && t.gid === gid));
    if (existing) {
      if (!existing.gid && gid) existing.gid = gid;
      continue;
    }
    out.push({ name, gid });
  }
  return out;
}

/**
 * Discover actual tab names/GIDs from Google Sheets HTML. This is only a fallback;
 * direct GViz-by-name and the GIDs in the official source URLs are preferred.
 */
export async function discoverTabs(sheetId: string): Promise<Array<{ name: string; gid: string }>> {
  const known = getKnownTabs(sheetId);
  const discovered: Array<{ name: string; gid: string }> = [];
  const urls = [
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit`,
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/htmlview`,
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/pubhtml`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' });
      if (!response.ok) continue;
      const html = await response.text();
      if (!html || /accounts\.google\.com/i.test(html)) continue;

      let match: RegExpExecArray | null;
      const topSnapshotRegex = /\[\s*[0-9]+\s*,\s*[0-9]+\s*,\\+?"([0-9]{1,15})"\\+?,\s*\[\{\\+?"1"\\+?:\s*\[\[\s*[0-9]+\s*,\s*[0-9]+\s*,\\+?"([^"\\]+)/g;
      while ((match = topSnapshotRegex.exec(html)) !== null) {
        let name = match[2].trim();
        try { name = JSON.parse(`"${name}"`); } catch {}
        if (name) discovered.push({ gid: match[1], name });
      }

      const itemsRegex = /items\.push\(\{[^}]*name:\s*"((?:\\.|[^"\\])*)"[^}]*gid:\s*"([0-9]+)"/g;
      while ((match = itemsRegex.exec(html)) !== null) {
        let name = match[1];
        try { name = JSON.parse(`"${name}"`); } catch {}
        if (name) discovered.push({ name, gid: match[2] });
      }

      const captionRegex = /docs-sheet-tab-caption[^>]*>([^<]+)<\/div>/g;
      while ((match = captionRegex.exec(html)) !== null) {
        const name = match[1].replace(/<[^>]+>/g, '').trim();
        if (name) discovered.push({ name, gid: '' });
      }

      const buttonRegex = /id="sheet-button-([0-9]+)"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/g;
      while ((match = buttonRegex.exec(html)) !== null) {
        const name = match[2].replace(/<[^>]+>/g, '').trim();
        if (name) discovered.push({ gid: match[1], name });
      }

      const merged = dedupeTabs([...known, ...discovered]);
      const knownNames = known.map(t => t.name.toLowerCase());
      const allKnownResolved = knownNames.length > 0 && knownNames.every(name => {
        const found = merged.find(t => t.name.toLowerCase() === name);
        return Boolean(found?.gid);
      });
      if (allKnownResolved) return merged;
    } catch {
      // Try the next public representation.
    }
  }
  return dedupeTabs([...known, ...discovered]);
}

async function fetchText(url: string): Promise<{ ok: boolean; text: string; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { ...FETCH_HEADERS, 'Cache-Control': 'no-cache' },
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await response.text();
    return { ok: response.ok, text, status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGviz(sheetId: string, sheetName?: string, gid?: string) {
  const params = new URLSearchParams({ tqx: 'out:csv' });
  if (gid) params.set('gid', gid);
  else if (sheetName) params.set('sheet', cleanSheetName(sheetName));
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?${params.toString()}`;
  const result = await fetchText(url);
  if (!result.ok || isBadResponse(result.text)) return null;
  return result.text;
}

export async function fetchExport(sheetId: string, gid?: string) {
  const params = new URLSearchParams({ format: 'csv' });
  if (gid) params.set('gid', gid);
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?${params.toString()}`;
  const result = await fetchText(url);
  if (!result.ok || isBadResponse(result.text)) return null;
  return result.text;
}

/** Find a known/discovered GID for a tab name. */
export async function resolveTab(sheetId: string, sheetName: string) {
  const wanted = cleanSheetName(sheetName).toLowerCase();
  const known = getKnownTabs(sheetId).find(t => t.name.toLowerCase() === wanted);
  if (known?.gid) return known;
  const tabs = await discoverTabs(sheetId);
  return tabs.find(t => t.name.toLowerCase() === wanted) || known || null;
}
