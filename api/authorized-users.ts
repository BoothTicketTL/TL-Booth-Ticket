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
  {
    id: 'user-tleague-admin',
    email: 'admin@thaileague.co.th',
    name: 'admin@thaileague.co.th (Thai League Admin)',
    role: 'admin',
    assignedBrand: 'All',
    assignedBrands: ['All'],
    organization: 'Thai League Co., Ltd.',
    addedAt: '2026-08-01 09:00',
    addedBy: 'System',
  },
  {
    id: 'user-client-chitipat-byd',
    email: 'chitipat.ja@planbmedia.co.th',
    name: 'chitipat.ja (BYD Client)',
    role: 'user',
    assignedBrand: 'BYD',
    assignedBrands: ['BYD'],
    organization: 'Plan B Media / BYD Client',
    addedAt: '2026-09-01 09:00',
    addedBy: 'siriprapa.po@planbmedia.co.th',
  },
  {
    id: 'user-client-pakawan-molten',
    email: 'pakawan.pl@planbmedia.co.th',
    name: 'pakawan.pl (BYD & Molten Client)',
    role: 'user',
    assignedBrand: 'BYD',
    assignedBrands: ['BYD', 'Molten'],
    organization: 'Plan B Media / Brand Client',
    addedAt: '2026-09-01 09:00',
    addedBy: 'siriprapa.po@planbmedia.co.th',
    note: 'ลูกค้าแบรนด์ BYD และ Molten (ล็อคสิทธิ์เฉพาะข้อมูลและคำขอของ BYD และ Molten)',
  },
  {
    id: 'user-client-byd',
    email: 'client.byd@thaileague.com',
    name: 'client.byd (BYD Client)',
    role: 'user',
    assignedBrand: 'BYD',
    assignedBrands: ['BYD'],
    organization: 'BYD Rever Automotive',
    addedAt: '2026-08-15 10:30',
    addedBy: 'siriprapa.po@planbmedia.co.th',
  },
  {
    id: 'user-client-chang',
    email: 'client.chang@thaileague.com',
    name: 'client.chang (Chang Client)',
    role: 'user',
    assignedBrand: 'Chang',
    assignedBrands: ['Chang'],
    organization: 'Thai Beverage PLC',
    addedAt: '2026-08-15 10:30',
    addedBy: 'siriprapa.po@planbmedia.co.th',
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
      if (Array.isArray(users) && users.length > 0) {
        const map = new Map<string, any>();
        serverlessUsersStore.forEach(u => {
          if (u?.email) map.set(u.email.toLowerCase().trim(), u);
        });
        users.forEach(u => {
          if (u?.email) map.set(u.email.toLowerCase().trim(), u);
        });
        serverlessUsersStore = Array.from(map.values());
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
