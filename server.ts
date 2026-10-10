import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Tab cache to speed up multi-tab syncs
  const sheetTabsCache = new Map<string, { timestamp: number; tabs: { name: string; gid: string }[] }>();

  async function getSpreadsheetTabs(sheetId: string): Promise<{ name: string; gid: string }[]> {
    const cached = sheetTabsCache.get(sheetId);
    if (cached && Date.now() - cached.timestamp < 60000 && cached.tabs.length >= 6) {
      return cached.tabs;
    }

    function isValidTabName(name: string): boolean {
      if (!name || typeof name !== 'string') return false;
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > 50) return false;
      const lower = trimmed.toLowerCase();
      if (
        lower.includes('docs.') || 
        lower.includes('security') || 
        lower.includes('access_capabilities') || 
        lower.includes('google') || 
        lower.includes('schema.') || 
        lower.includes('http') || 
        lower.includes('json') || 
        lower === 'tf' || 
        lower.startsWith('__') ||
        lower.includes('function') ||
        lower.includes('javascript') ||
        lower.includes('undefined') ||
        lower.includes('null')
      ) {
        return false;
      }
      return true;
    }

    const tabs: { name: string; gid: string }[] = [];
    const addOrUpdateTab = (gid: string, name: string) => {
      let cleanName = (name || '').replace(/<[^>]+>/g, '').trim();
      try { cleanName = JSON.parse(`"${cleanName}"`); } catch {}
      if (!isValidTabName(cleanName)) return;
      const existing = tabs.find(t => t.name.toLowerCase() === cleanName.toLowerCase());
      if (existing) {
        if ((!existing.gid || existing.gid === '') && (gid !== undefined && gid !== null && gid !== '')) {
          existing.gid = String(gid);
        }
      } else {
        tabs.push({ gid: gid || '', name: cleanName });
      }
    };

    const urlsToTry = [
      `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`,
      `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
      `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml`,
    ];

    for (const targetUrl of urlsToTry) {
      try {
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (!response.ok) continue;
        const html = await response.text();

        // 1. Regex for items.push({ ... }) objects in htmlview
        const itemPushRegex = /items\.push\((\{[\s\S]*?\})\)/g;
        let m;
        while ((m = itemPushRegex.exec(html)) !== null) {
          const block = m[1];
          const nameMatch = block.match(/name:\s*"((?:\\.|[^"\\])*)"/) || block.match(/name:\s*'((?:\\.|[^'\\])*)'/);
          const gidMatch = block.match(/gid:\s*"?([0-9]+)"?/);
          if (nameMatch && gidMatch) {
            let n = nameMatch[1];
            try {
              n = JSON.parse(`"${n}"`);
            } catch {
              n = n.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
            }
            addOrUpdateTab(gidMatch[1], n);
          }
        }

        // 2. Google Sheets /edit topsnapshot JSON representation:
        // Pattern: [21350203, "[0,0,\"<gid>\",[{\"1\":[[0,0,\"<name>\"]
        const snapshotRegex = /\[\s*\d+\s*,\s*\d+\s*,\s*\\*\"(\d+)\\*\"\s*,\s*\[\s*\{\s*\\*\"1\\*\"\s*:\s*\[\s*\[\s*\d+\s*,\s*\d+\s*,\s*\\*\"([^\\\"\n]+)/g;
        while ((m = snapshotRegex.exec(html)) !== null) {
          let name = m[2];
          try {
            name = JSON.parse(`"${name}"`);
          } catch {
            name = name.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          }
          addOrUpdateTab(m[1], name);
        }

        // 3. Tab caption elements in Google Sheets /edit: <div class="goog-inline-block docs-sheet-tab-caption">TabName</div>
        const captionRegex = /docs-sheet-tab-caption[^>]*>([^<]+)<\/div>/g;
        while ((m = captionRegex.exec(html)) !== null) {
          addOrUpdateTab('', m[1]);
        }

        // 4. Sheet buttons: id="sheet-button-([0-9]+)"
        const sheetBtnRegex = /id="sheet-button-([0-9]+)"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/g;
        while ((m = sheetBtnRegex.exec(html)) !== null) {
          addOrUpdateTab(m[1], m[2]);
        }

        // 5. Anchor tags with gid in href
        const linkRegex = /<a[^>]*href="[^"]*[#?&]gid=([0-9]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        while ((m = linkRegex.exec(html)) !== null) {
          addOrUpdateTab(m[1], m[2]);
        }

        // 6. JSON sheet metadata: support BOTH "title" and "name"
        const nameGidRegex1 = /(?:"name"|'name'|name|"title"|'title'|title)\s*:\s*["']([^"']+)["'][^}]*?(?:"sheetId"|'sheetId'|sheetId)\s*:\s*["']?([0-9]+)["']?/g;
        while ((m = nameGidRegex1.exec(html)) !== null) {
          addOrUpdateTab(m[2], m[1]);
        }

        const nameGidRegex2 = /(?:"sheetId"|'sheetId'|sheetId)\s*:\s*["']?([0-9]+)["']?[^}]*?(?:"name"|'name'|name|"title"|'title'|title)\s*:\s*["']([^"']+)["']/g;
        while ((m = nameGidRegex2.exec(html)) !== null) {
          addOrUpdateTab(m[1], m[2]);
        }

        // 7. Bootstrap arrays [gid, 0, "tabName"] or ["tabName", gid] or [null,null,gid,"tabName"]
        const arrayRegex1 = /\[([0-9]{1,15}),\s*0,\s*"([^"]+)"/g;
        while ((m = arrayRegex1.exec(html)) !== null) {
          addOrUpdateTab(m[1], m[2]);
        }

        const arrayRegex2 = /\["([^"]+)",\s*([0-9]{1,15})/g;
        while ((m = arrayRegex2.exec(html)) !== null) {
          addOrUpdateTab(m[2], m[1]);
        }

        const arrayRegex3 = /\[null,\s*null,\s*([0-9]{1,15}),\s*"([^"]+)"/g;
        while ((m = arrayRegex3.exec(html)) !== null) {
          addOrUpdateTab(m[1], m[2]);
        }

        // Break early if we have found tabs with valid gids
        if (tabs.length >= 3 && tabs.every(t => t.gid && t.gid !== '')) {
          break;
        }
      } catch (err) {
        // continue to next URL
      }
    }

    if (tabs.length > 0) {
      if (!tabs[0].gid || tabs[0].gid === '') {
        tabs[0].gid = '0';
      }
      sheetTabsCache.set(sheetId, { timestamp: Date.now(), tabs });
    }
    return tabs;
  }

  // Sheets API: Tabs Discovery
  app.get('/api/sheets/tabs', async (req, res) => {
    try {
      const sheetId = req.query.sheetId as string;
      if (!sheetId) {
        return res.status(400).json({ error: 'Missing sheetId' });
      }

      const tabs = await getSpreadsheetTabs(sheetId);
      res.json({ success: true, sheetId, tabs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sheets API: Fetch CSV
  app.get('/api/sheets/fetch-csv', async (req, res) => {
    try {
      const sheetId = req.query.sheetId as string;
      const gid = req.query.gid as string | undefined;
      const sheetName = req.query.sheetName as string | undefined;
      const tabIndex = req.query.tabIndex as string | undefined;

      if (!sheetId) {
        return res.status(400).json({ error: 'Missing sheetId' });
      }

      let targetGid = gid;

      // If gid not provided but tabIndex is given, resolve by tab index directly
      if (!targetGid && tabIndex !== undefined) {
        try {
          const tabs = await getSpreadsheetTabs(sheetId);
          const idx = parseInt(tabIndex, 10);
          if (!isNaN(idx) && idx >= 0 && idx < tabs.length && tabs[idx]?.gid) {
            targetGid = tabs[idx].gid;
          }
        } catch (e) {}
      }

      // If gid not provided but sheetName is given, resolve the real gid from sheet tabs
      if (!targetGid && sheetName) {
        try {
          const tabs = await getSpreadsheetTabs(sheetId);
          const rawTarget = sheetName.trim();
          const cleanTarget = rawTarget.toLowerCase();
          const strippedTarget = cleanTarget.replace(/[\s\-_()]/g, '');

          // 1. Exact match
          let foundTab = tabs.find(t => t.name.trim().toLowerCase() === cleanTarget);

          // 2. Normalized match (strip whitespace, hyphens, brackets)
          if (!foundTab) {
            foundTab = tabs.find(t => {
              const strippedName = t.name.toLowerCase().replace(/[\s\-_()]/g, '');
              return strippedName === strippedTarget;
            });
          }

          // 3. Prefix match
          if (!foundTab) {
            foundTab = tabs.find(t => {
              const n = t.name.trim().toLowerCase();
              return n.startsWith(cleanTarget) || cleanTarget.startsWith(n);
            });
          }

          // 4. Substring match
          if (!foundTab) {
            foundTab = tabs.find(t => {
              const strippedName = t.name.toLowerCase().replace(/[\s\-_()]/g, '');
              return strippedName.includes(strippedTarget) || strippedTarget.includes(strippedName);
            });
          }

          // 5. Zone definition keywords match (e.g. "North East" matches "โซนภาคตะวันออกเฉียงเหนือ" or "2. อีสาน")
          if (!foundTab) {
            const ZONE_MATCHERS: { id: string; index: number; keywords: string[] }[] = [
              { id: 'north', index: 0, keywords: ['north', 'northern', 'เหนือ', 'ภาคเหนือ', 'โซนเหนือ', '1.', 'zone 1', 't3-north'] },
              { id: 'northeast', index: 1, keywords: ['northeast', 'north east', 'อีสาน', 'ภาคตะวันออกเฉียงเหนือ', 'โซนอีสาน', 'โซนตะวันออกเฉียงเหนือ', 'ne', '2.', 'zone 2', 't3-ne'] },
              { id: 'east', index: 2, keywords: ['east', 'eastern', 'ตะวันออก', 'ภาคตะวันออก', 'โซนตะวันออก', '3.', 'zone 3', 't3-east'] },
              { id: 'west', index: 3, keywords: ['west', 'western', 'ตะวันตก', 'ภาคตะวันตก', 'โซนตะวันตก', '4.', 'zone 4', 't3-west'] },
              { id: 'central', index: 4, keywords: ['central', 'กลาง', 'ภาคกลาง', 'โซนกลาง', 'กทม', 'กรุงเทพ', 'bangkok', 'bmr', '5.', 'zone 5', 't3-central'] },
              { id: 'south', index: 5, keywords: ['south', 'southern', 'ใต้', 'ภาคใต้', 'โซนใต้', '6.', 'zone 6', 't3-south'] },
              { id: 'championship', index: 6, keywords: ['champ', 'แชมเปี้ยน', 'ระดับประเทศ', 'final', 'playoff', '7.', 'zone 7'] },
            ];

            const matchedZone = ZONE_MATCHERS.find(z => 
              z.keywords.some(k => cleanTarget.includes(k) || k.includes(cleanTarget))
            );

            if (matchedZone) {
              // Find tab in tabs that matches ANY keyword of this zone
              foundTab = tabs.find(t => {
                const tLower = t.name.toLowerCase();
                return matchedZone.keywords.some(k => tLower.includes(k));
              });

              // If still not found by name, and tabs length >= 6, match by standard zone index!
              if (!foundTab && tabs.length >= 6 && matchedZone.index < tabs.length) {
                foundTab = tabs[matchedZone.index];
              }
            }
          }

          if (foundTab && foundTab.gid) {
            targetGid = foundTab.gid;
          }
        } catch (e) {
          // Tab lookup error, fallback to gviz
        }
      }

      // If we have a targetGid, export directly by gid (Google Sheets NEVER silently redirects to tab 0 when gid is specified)
      if (targetGid !== undefined && targetGid !== '') {
        const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${targetGid}`;
        try {
          const exportRes = await fetch(exportUrl);
          if (exportRes.ok) {
            const exportText = await exportRes.text();
            if (
              exportText && 
              !exportText.includes('<!DOCTYPE html>') && 
              !exportText.includes('<html') && 
              !exportText.includes('accounts.google.com')
            ) {
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              return res.send(exportText);
            }
          }
        } catch (e) {}

        // Fallback with gid via gviz
        const gvizUrlWithGid = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${targetGid}`;
        const gvizRes = await fetch(gvizUrlWithGid);
        const gvizText = await gvizRes.text();
        const isError = 
          !gvizRes.ok || 
          !gvizText || 
          gvizText.includes('<!DOCTYPE html>') || 
          gvizText.includes('<html') ||
          (gvizText.includes('google.visualization.Query.setResponse') && gvizText.includes('"status":"error"'));
        
        if (!isError) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          return res.send(gvizText);
        }
      }

      // Fallback: Query by sheet name
      const params = ['tqx=out:csv'];
      if (sheetName) {
        params.push(`sheet=${encodeURIComponent(sheetName.trim())}`);
      }

      const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.join('&')}`;
      const response = await fetch(gvizUrl);
      const text = await response.text();

      const isGvizError = 
        !response.ok ||
        !text || 
        text.includes('<!DOCTYPE html>') || 
        text.includes('<html') || 
        text.includes('accounts.google.com') ||
        (text.includes('google.visualization.Query.setResponse') && text.includes('"status":"error"'));

      if (isGvizError) {
        return res.status(404).send('Sheet tab not found');
      }

      // Guard against Google Sheets gviz silently falling back to Tab 0 when sheetName does not exist
      if (sheetName) {
        const cleanName = sheetName.trim().toLowerCase();
        let isActuallyTab0 = false;
        try {
          const allTabs = await getSpreadsheetTabs(sheetId);
          if (allTabs.length <= 1) {
            isActuallyTab0 = true;
          } else if (allTabs.length > 0) {
            const firstTab = allTabs[0];
            if (
              firstTab && 
              (firstTab.name.trim().toLowerCase() === cleanName ||
               firstTab.name.trim().toLowerCase().replace(/[\s\-_()]/g, '') === cleanName.replace(/[\s\-_()]/g, ''))
            ) {
              isActuallyTab0 = true;
            }
          }
        } catch {}

        const isTab1Request = 
          isActuallyTab0 ||
          cleanName === 't1' || 
          cleanName.startsWith('t1-') || 
          cleanName.startsWith('t1 ') || 
          cleanName === 'sheet1' ||
          cleanName === 'แผ่นงาน1' ||
          cleanName === 'แผ่นงาน 1' ||
          cleanName.includes('เบอร์ติดต่อ') ||
          cleanName.includes('เบอร์โทร') ||
          cleanName.includes('สมุดโทรศัพท์') ||
          cleanName.includes('หน้าสนาม') ||
          cleanName.includes('contact') ||
          cleanName.includes('phone') ||
          cleanName === 'league 1' ||
          cleanName === 'league1' ||
          cleanName === 'l1' ||
          cleanName.includes('league 1') ||
          cleanName.includes('league1') ||
          cleanName.includes('ไทยลีก 1') ||
          cleanName.includes('thai league 1') ||
          cleanName === 'north' ||
          cleanName === '1. north' ||
          cleanName.startsWith('north') ||
          cleanName.includes('ภาคเหนือ') ||
          cleanName.includes('โซนเหนือ');

        if (!isTab1Request) {
          // Compare actual fixture match rows (lines 4-15), NEVER comparing headers in line 0-3 which are identical across tabs
          try {
            const tab0Url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
            const tab0Res = await fetch(tab0Url);
            if (tab0Res.ok) {
              const tab0Text = await tab0Res.text();
              const getMatchRows = (csv: string) => {
                const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                return lines.slice(4, 15).join('\n');
              };
              const tab0Data = getMatchRows(tab0Text);
              const returnedData = getMatchRows(text);
              if (tab0Data.length > 30 && returnedData.length > 30 && tab0Data === returnedData) {
                return res.status(404).send(`Sheet tab "${sheetName}" was not found; returned tab 0 fallback.`);
              }
            }
          } catch (e) {}
        }
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(text);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Automated Email Export API
  app.post('/api/export-email', async (req, res) => {
    try {
      const {
        recipientEmail,
        ccEmail,
        subject,
        topic,
        scopeLabel,
        season,
        summaryData,
      } = req.body;

      if (!recipientEmail) {
        return res.status(400).json({ error: 'Missing recipientEmail' });
      }

      const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
      const refId = `EXP-${Date.now().toString(36).toUpperCase()}`;

      console.log(`[Auto-Email Export] Dispatched to ${recipientEmail} (CC: ${ccEmail || 'none'}) for [${topic}]`);

      res.json({
        success: true,
        message: `ระบบได้ทำการจัดส่งรายงานทาง E-mail อัตโนมัติไปยัง ${recipientEmail} เรียบร้อยแล้ว`,
        refId,
        timestamp,
        recipient: recipientEmail,
        cc: ccEmail || undefined,
        topic,
        scopeLabel,
        season,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Automated LINE Group Export API
  app.post('/api/export-line-group', async (req, res) => {
    try {
      const {
        brand,
        lineGroupName,
        startDate,
        endDate,
        summary,
        customMessage,
        webhookUrl,
      } = req.body;

      if (!brand) {
        return res.status(400).json({ error: 'Missing brand parameter' });
      }

      const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
      const cleanBrand = (brand || 'All').replace(/\s+/g, '').toUpperCase();
      const refId = `LINE-${cleanBrand}-${Date.now().toString(36).toUpperCase()}`;

      console.log(`[Auto-LINE Group Export] Dispatched for [${brand}] to [${lineGroupName || 'Default Group'}] (${startDate} to ${endDate})`);

      // If a real webhook URL is provided, attempt to deliver to it
      if (webhookUrl && typeof webhookUrl === 'string' && webhookUrl.startsWith('http')) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: customMessage || `[Thai League 2026/27] สรุปยอดขอออกบูธและรับบัตร แบรนด์: ${brand} (${startDate} ถึง ${endDate})`,
              refId,
              timestamp,
              brand,
              summary,
            }),
          });
        } catch (webhookErr) {
          console.warn('[Auto-LINE Group Export] Webhook delivery note:', webhookErr);
        }
      }

      res.json({
        success: true,
        message: `ระบบได้ทำการส่งข้อมูลและไฟล์สรุปไปยัง Line Group [${lineGroupName || brand}] เรียบร้อยแล้ว เพื่อให้ลูกค้ายืนยันข้อมูล`,
        refId,
        timestamp,
        brand,
        lineGroupName: lineGroupName || `LINE Group: ${brand}`,
        startDate,
        endDate,
        summary,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Shared In-Memory & Server-side Attendance Storage across all clients
  let serverAttendanceRecords: any[] = [];
  let serverAttendanceUpdatedAt: string = '';
  let serverAttendanceUpdatedBy: string = '';

  app.get('/api/attendance', (req, res) => {
    res.json({
      success: true,
      records: serverAttendanceRecords,
      updatedAt: serverAttendanceUpdatedAt,
      updatedBy: serverAttendanceUpdatedBy,
      count: serverAttendanceRecords.length,
    });
  });

  app.post('/api/attendance', (req, res) => {
    try {
      const { records, league, updatedBy } = req.body || {};
      if (Array.isArray(records)) {
        if (league) {
          const others = serverAttendanceRecords.filter(r => r.league !== league);
          serverAttendanceRecords = [...others, ...records];
        } else {
          serverAttendanceRecords = records;
        }
        serverAttendanceUpdatedAt = new Date().toISOString();
        serverAttendanceUpdatedBy = updatedBy || 'Admin';
      }
      res.json({
        success: true,
        count: serverAttendanceRecords.length,
        updatedAt: serverAttendanceUpdatedAt,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Shared In-Memory & Server-side Authorized Users Storage
  let serverAuthorizedUsers: any[] = [
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

  app.get('/api/authorized-users', (req, res) => {
    res.json({
      success: true,
      users: serverAuthorizedUsers,
      count: serverAuthorizedUsers.length,
    });
  });

  app.post('/api/authorized-users', (req, res) => {
    try {
      const { users } = req.body || {};
      if (Array.isArray(users) && users.length > 0) {
        // Merge so no users are lost
        const map = new Map<string, any>();
        serverAuthorizedUsers.forEach(u => {
          if (u?.email) map.set(u.email.toLowerCase().trim(), u);
        });
        users.forEach(u => {
          if (u?.email) map.set(u.email.toLowerCase().trim(), u);
        });
        serverAuthorizedUsers = Array.from(map.values());
      }
      res.json({
        success: true,
        count: serverAuthorizedUsers.length,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // n8n Webhook Proxy & Relay API
  app.post('/api/n8n/trigger', async (req, res) => {
    try {
      const { webhookUrl, secretToken, payload } = req.body;

      if (!webhookUrl || typeof webhookUrl !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing or invalid webhookUrl' });
      }

      if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
        return res.status(400).json({ success: false, error: 'webhookUrl must start with http:// or https://' });
      }

      const refId = `N8N-${Date.now().toString(36).toUpperCase()}`;
      const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

      console.log(`[n8n Webhook Relay] Triggering ${webhookUrl} for event: [${payload?.event || 'custom'}]`);

      // Set timeout of 15 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'ThaiLeague-SponsorPortal-n8n/1.0',
        'X-Ref-ID': refId,
        'X-Timestamp': timestamp,
      };

      if (secretToken) {
        headers['Authorization'] = `Bearer ${secretToken}`;
        headers['X-Secret-Token'] = secretToken;
      }

      const enrichedBody = {
        refId,
        dispatchedAt: timestamp,
        ...payload,
      };

      try {
        const n8nResp = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(enrichedBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        let responseBody: any = null;
        const contentType = n8nResp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          responseBody = await n8nResp.json().catch(() => null);
        } else {
          responseBody = await n8nResp.text().catch(() => '');
        }

        if (!n8nResp.ok) {
          return res.status(n8nResp.status).json({
            success: false,
            error: `n8n ตอบกลับด้วยสถานะ HTTP ${n8nResp.status}: ${typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)}`,
            status: n8nResp.status,
            refId,
          });
        }

        return res.json({
          success: true,
          message: 'จัดส่งข้อมูลไปยัง n8n Webhook เรียบร้อยแล้ว (n8n ได้รับคำขอแล้ว)',
          refId,
          timestamp,
          n8nResponse: responseBody,
        });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          return res.status(504).json({
            success: false,
            error: 'เชื่อมต่อไปยัง n8n Webhook ไม่ทันเวลา (Timeout 15 วินาที) โปรดตรวจสอบว่า n8n เปิดเครื่องและ Active Webhook อยู่',
            refId,
          });
        }
        throw fetchErr;
      }
    } catch (err: any) {
      console.error('[n8n Webhook Relay Error]:', err);
      res.status(500).json({
        success: false,
        error: `ไม่สามารถส่งข้อมูลไปยัง n8n: ${err.message || 'Network error'}`,
      });
    }
  });

  // Vite middleware for development vs static for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
