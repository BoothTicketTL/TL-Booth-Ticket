import { fetchExport, fetchGviz, getKnownTabs, setJson, setText } from '../_googleSheets.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return setJson(res, 405, { error: 'Method not allowed' });
  const sheetId = String(req.query?.sheetId || '').trim();
  const sheetName = String(req.query?.sheetName || '').trim();
  const gid = String(req.query?.gid || '').trim();
  const tabIndex = req.query?.tabIndex !== undefined ? Number(req.query.tabIndex) : NaN;
  if (!sheetId) return setJson(res, 400, { error: 'Missing sheetId' });

  try {
    // Exact tab name is the primary path. This avoids brittle HTML/GID discovery.
    if (sheetName) {
      const text = await fetchGviz(sheetId, sheetName);
      if (text) return setText(res, 200, text);
      // Resolve known tab names to a gid only as a fallback.
      const known = getKnownTabs(sheetId).find(t => t.name.toLowerCase() === sheetName.toLowerCase());
      if (known?.gid) {
        const byGid = await fetchGviz(sheetId, undefined, known.gid);
        if (byGid) return setText(res, 200, byGid);
        const exported = await fetchExport(sheetId, known.gid);
        if (exported) return setText(res, 200, exported);
      }
      return setJson(res, 404, { error: `Google Sheet tab not found or not readable: ${sheetName}` });
    }

    let targetGid = gid;
    if (!targetGid && Number.isInteger(tabIndex) && tabIndex >= 0) {
      targetGid = getKnownTabs(sheetId)[tabIndex]?.gid || '';
    }
    const text = await fetchGviz(sheetId, undefined, targetGid || undefined);
    if (text) return setText(res, 200, text);
    const exported = await fetchExport(sheetId, targetGid || undefined);
    if (exported) return setText(res, 200, exported);
    return setJson(res, 404, { error: 'Unable to read Google Sheet' });
  } catch (err: any) {
    return setJson(res, 500, { error: err?.message || 'Google Sheets fetch failed' });
  }
}
