let serverlessAttendanceStore: any[] = [];
let serverlessUpdatedAt = '';
let serverlessUpdatedBy = '';

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      records: serverlessAttendanceStore,
      updatedAt: serverlessUpdatedAt,
      updatedBy: serverlessUpdatedBy,
      count: serverlessAttendanceStore.length,
    });
  }

  if (req.method === 'POST') {
    try {
      const { records, league, updatedBy } = req.body || {};
      if (Array.isArray(records)) {
        if (league) {
          const others = serverlessAttendanceStore.filter((r: any) => r.league !== league);
          serverlessAttendanceStore = [...others, ...records];
        } else {
          serverlessAttendanceStore = records;
        }
        serverlessUpdatedAt = new Date().toISOString();
        serverlessUpdatedBy = updatedBy || 'Admin';
      }
      return res.status(200).json({
        success: true,
        count: serverlessAttendanceStore.length,
        updatedAt: serverlessUpdatedAt,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
