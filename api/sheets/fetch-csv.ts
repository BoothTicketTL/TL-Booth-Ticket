import { fetchExport, fetchGviz, getKnownTabs, looksLikeFixtureCsv, resolveTab, setJson, setText } from '../_googleSheets';

function isUsableFixtureCsv(text: string | null): boolean {
  if (!text || text.length < 50) return false;
  return looksLikeFixtureCsv(text) &&
    /ทีมเหย้า|home/i.test(text) &&
    /ทีมเยือน|away/i.test(text) &&
    /สนามแข่งขัน|stadium/i.test(text) &&
    /เวลา|time/i.test(text);
}

function preview(text: string | null): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').slice(0, 240);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return setJson(res, 405, { error: 'Method not allowed' });
  const sheetId = String(req.query?.sheetId || '').trim();
  const sheetName = String(req.query?.sheetName || '').trim();
  const gid = String(req.query?.gid || '').trim();
  const tabIndex = req.query?.tabIndex !== undefined ? Number(req.query.tabIndex) : NaN;
  if (!sheetId) return setJson(res, 400, { error: 'Missing sheetId' });

  const attempts: string[] = [];
  const tryText = (label: string, text: string | null): string | null => {
    if (isUsableFixtureCsv(text)) return text;
    if (text) attempts.push(`${label}:wrong-content:${preview(text)}`);
    return null;
  };

  try {
    if (gid) {
      attempts.push(`gviz:gid:${gid}`);
      const byGid = tryText(`gviz:gid:${gid}`, await fetchGviz(sheetId, undefined, gid));
      if (byGid) return setText(res, 200, byGid);
      attempts.push(`export:gid:${gid}`);
      const exported = tryText(`export:gid:${gid}`, await fetchExport(sheetId, gid));
      if (exported) return setText(res, 200, exported);
    }

    if (sheetName) {
      attempts.push(`gviz:sheet:${sheetName}`);
      const byName = tryText(`gviz:sheet:${sheetName}`, await fetchGviz(sheetId, sheetName));
      if (byName) return setText(res, 200, byName);

      const resolved = await resolveTab(sheetId, sheetName);
      if (resolved?.gid) {
        attempts.push(`gviz:resolved-gid:${resolved.gid}`);
        const resolvedGviz = tryText(`gviz:resolved-gid:${resolved.gid}`, await fetchGviz(sheetId, undefined, resolved.gid));
        if (resolvedGviz) return setText(res, 200, resolvedGviz);
        attempts.push(`export:resolved-gid:${resolved.gid}`);
        const resolvedExport = tryText(`export:resolved-gid:${resolved.gid}`, await fetchExport(sheetId, resolved.gid));
        if (resolvedExport) return setText(res, 200, resolvedExport);
      }

      return setJson(res, 404, {
        error: `Google Sheet tab did not return a fixture table: ${sheetName}`,
        sheetId,
        sheetName,
        attempts,
        knownTabs: getKnownTabs(sheetId),
      });
    }

    if (Number.isInteger(tabIndex) && tabIndex >= 0) {
      const tab = getKnownTabs(sheetId)[tabIndex];
      if (tab?.gid) {
        attempts.push(`gviz:index:${tabIndex}:gid:${tab.gid}`);
        const byGid = tryText(`gviz:index:${tabIndex}:gid:${tab.gid}`, await fetchGviz(sheetId, undefined, tab.gid));
        if (byGid) return setText(res, 200, byGid);
        attempts.push(`export:index:${tabIndex}:gid:${tab.gid}`);
        const exported = tryText(`export:index:${tabIndex}:gid:${tab.gid}`, await fetchExport(sheetId, tab.gid));
        if (exported) return setText(res, 200, exported);
      }
    }

    attempts.push('gviz:default');
    const text = tryText('gviz:default', await fetchGviz(sheetId));
    if (text) return setText(res, 200, text);
    attempts.push('export:default');
    const exported = tryText('export:default', await fetchExport(sheetId));
    if (exported) return setText(res, 200, exported);

    return setJson(res, 404, { error: 'Unable to read a fixture table from Google Sheet', sheetId, attempts, knownTabs: getKnownTabs(sheetId) });
  } catch (err: any) {
    return setJson(res, 502, {
      error: err?.message || 'Google Sheets fetch failed',
      sheetId,
      sheetName: sheetName || undefined,
      attempts,
      hint: 'The endpoint must return a CSV containing fixture headers. If Google requires sign-in, the deployment cannot read a private sheet without an authorized API or public export.',
    });
  }
}
