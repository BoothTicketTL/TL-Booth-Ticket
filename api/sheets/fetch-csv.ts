import { fetchExport, fetchGviz, getKnownTabs, looksLikeFixtureCsv, resolveTab, setJson, setText } from '../_googleSheets';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return setJson(res, 405, { error: 'Method not allowed' });
  const sheetId = String(req.query?.sheetId || '').trim();
  const sheetName = String(req.query?.sheetName || '').trim();
  const gid = String(req.query?.gid || '').trim();
  const tabIndex = req.query?.tabIndex !== undefined ? Number(req.query.tabIndex) : NaN;
  if (!sheetId) return setJson(res, 400, { error: 'Missing sheetId' });

  const attempts: string[] = [];
  try {
    // 1) Explicit GID is the most reliable path when supplied.
    if (gid) {
      attempts.push(`gviz:gid:${gid}`);
      const byGid = await fetchGviz(sheetId, undefined, gid);
      if (byGid) return setText(res, 200, byGid);
      attempts.push(`export:gid:${gid}`);
      const exported = await fetchExport(sheetId, gid);
      if (exported) return setText(res, 200, exported);
    }

    // 2) Exact tab name through GViz.
    if (sheetName) {
      attempts.push(`gviz:sheet:${sheetName}`);
      const text = await fetchGviz(sheetId, sheetName);
      if (text) return setText(res, 200, text);

      // 3) Resolve the tab to its actual GID and use both endpoints.
      const resolved = await resolveTab(sheetId, sheetName);
      if (resolved?.gid) {
        attempts.push(`gviz:resolved-gid:${resolved.gid}`);
        const byGid = await fetchGviz(sheetId, undefined, resolved.gid);
        if (byGid) return setText(res, 200, byGid);
        attempts.push(`export:resolved-gid:${resolved.gid}`);
        const exported = await fetchExport(sheetId, resolved.gid);
        if (exported) return setText(res, 200, exported);
      }
      return setJson(res, 404, {
        error: `Google Sheet tab not readable: ${sheetName}`,
        sheetId,
        sheetName,
        attempts,
        knownTabs: getKnownTabs(sheetId),
      });
    }

    // 4) Tab index fallback (useful for generic callers).
    if (Number.isInteger(tabIndex) && tabIndex >= 0) {
      const tab = getKnownTabs(sheetId)[tabIndex];
      if (tab?.gid) {
        const byGid = await fetchGviz(sheetId, undefined, tab.gid);
        if (byGid) return setText(res, 200, byGid);
        const exported = await fetchExport(sheetId, tab.gid);
        if (exported) return setText(res, 200, exported);
      }
    }

    // 5) Default first-sheet fallback.
    const text = await fetchGviz(sheetId);
    if (text) return setText(res, 200, text);
    const exported = await fetchExport(sheetId);
    if (exported) return setText(res, 200, exported);

    return setJson(res, 404, { error: 'Unable to read Google Sheet', sheetId, attempts });
  } catch (err: any) {
    return setJson(res, 502, {
      error: err?.message || 'Google Sheets fetch failed',
      sheetId,
      sheetName: sheetName || undefined,
      attempts,
      hint: 'Google must allow the deployment to read the spreadsheet. If the sheet is restricted to signed-in users, a public CSV export or authorized API is required.',
    });
  }
}
