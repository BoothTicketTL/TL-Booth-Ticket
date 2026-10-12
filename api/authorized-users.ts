let serverlessUsersStore: any[] = [
  {
    id: 'user-planb-admin',
    email: 'siriprapa.po@planbmedia.co.th',
    name: 'siriprapa.po (Super Admin)',
    role: 'admin',
    assignedBrand: 'All',
    assignedBrands: ['All'],
    organization: 'Plan B Media Co., Ltd.',
    addedAt: '2026-08-01 09:00',
    addedBy: 'System',
  },
];

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      users: serverlessUsersStore,
      count: serverlessUsersStore.length,
    });
  }

  if (req.method === 'POST') {
    try {
      const { users } = req.body || {};
      if (Array.isArray(users)) {
        const cleaned = users.filter((u: any) => {
          const email = (u?.email || '').toLowerCase().trim();
          return email && !email.includes('@thaileague') && !email.startsWith('client.') && !email.includes('example.com');
        });
        serverlessUsersStore = cleaned;
      }
      return res.status(200).json({
        success: true,
        count: serverlessUsersStore.length,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
