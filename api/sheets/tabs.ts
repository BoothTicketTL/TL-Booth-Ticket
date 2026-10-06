import { discoverTabs, getKnownTabs, setJson } from '../_googleSheets';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return setJson(res, 405, { error: 'Method not allowed' });
  const sheetId = String(req.query?.sheetId || '').trim();
  if (!sheetId) return setJson(res, 400, { error: 'Missing sheetId' });

  try {
    const tabs = await discoverTabs(sheetId);
    return setJson(res, 200, { success: true, sheetId, tabs: tabs.length ? tabs : getKnownTabs(sheetId) });
  } catch (err: any) {
    return setJson(res, 200, { success: true, sheetId, tabs: getKnownTabs(sheetId), warning: err?.message || 'Tab discovery failed' });
  }
}
