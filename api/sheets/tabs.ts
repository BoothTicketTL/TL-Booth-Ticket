import { getKnownTabs, setJson } from '../_googleSheets.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return setJson(res, 405, { error: 'Method not allowed' });
  const sheetId = String(req.query?.sheetId || '').trim();
  if (!sheetId) return setJson(res, 400, { error: 'Missing sheetId' });

  // These are the exact official fixture tabs supplied by the site owner.
  // We intentionally return names even when GIDs are unavailable because the fetch endpoint
  // can query Google Visualization directly by sheet name.
  const tabs = getKnownTabs(sheetId);
  return setJson(res, 200, { success: true, sheetId, tabs });
}
