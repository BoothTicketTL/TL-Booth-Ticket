/**
 * n8n Automation & Webhook Integration Service
 * 
 * Provides unified webhook routing for Thai League Sponsor Management to trigger
 * automated workflows in n8n, enabling simultaneous multi-channel dispatch:
 *  1. E-mail (via Gmail / Outlook / SMTP node in n8n)
 *  2. LINE (via LINE Messaging API / LINE Notify / HTTP Request node in n8n)
 *  3. Google Sheets / Slack / Database recording
 */

export interface N8nConfig {
  webhookUrl: string;
  enabled: boolean;
  enableEmail: boolean;
  enableLine: boolean;
  customSecretToken?: string;
  autoTriggerOnWeeklyExport: boolean;
  autoTriggerOnLineExport: boolean;
  autoTriggerOnSubmission: boolean;
  lastTestedAt?: string;
  lastStatus?: 'success' | 'error';
  lastStatusMessage?: string;
}

export interface N8nExportRecordItem {
  id?: string;
  matchId: string;
  league: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  brand: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  organization?: string;
  boothRequired: boolean;
  boothDealerName?: string;
  boothActivityDescription?: string;
  ticketRequired: boolean;
  ticketQuantity: number;
  ticketRequesterName?: string;
  ticketRequesterPhone?: string;
  ticketTargetZone?: string;
  ticketSeatingPreference?: string;
  status?: string;
}

export interface N8nExportPayload {
  event: 'weekly_email_export' | 'line_group_export' | 'monthly_export' | 'new_registration' | 'test_ping';
  timestamp: string;
  system: 'Thai League Sponsor Management Portal';
  channels: ('email' | 'line')[];
  brand: string;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  summary: {
    matchCount: number;
    boothCount: number;
    ticketCount: number;
    totalTicketQty: number;
    participatingBrands?: string[];
  };
  recipients?: {
    email?: string;
    ccEmail?: string;
    lineGroupName?: string;
  };
  emailData: {
    subject: string;
    htmlBody: string;
    plainText: string;
  };
  lineData: {
    messageText: string;
    targetGroupName?: string;
  };
  records: N8nExportRecordItem[];
  metadata?: Record<string, any>;
}

const STORAGE_KEY = 'thaileague_n8n_config_v1';

const DEFAULT_CONFIG: N8nConfig = {
  webhookUrl: '',
  enabled: false,
  enableEmail: true,
  enableLine: true,
  customSecretToken: '',
  autoTriggerOnWeeklyExport: true,
  autoTriggerOnLineExport: true,
  autoTriggerOnSubmission: false,
};

// Memory cache
let cachedConfig: N8nConfig = { ...DEFAULT_CONFIG };
let isLoaded = false;
const listeners: Array<(config: N8nConfig) => void> = [];

export function getN8nConfig(): N8nConfig {
  if (isLoaded) return cachedConfig;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cachedConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[n8nService] Failed to read localStorage', e);
  }
  isLoaded = true;
  return cachedConfig;
}

export function saveN8nConfig(updates: Partial<N8nConfig>): N8nConfig {
  const current = getN8nConfig();
  const next: N8nConfig = {
    ...current,
    ...updates,
  };
  cachedConfig = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[n8nService] Failed to write localStorage', e);
  }
  listeners.forEach(fn => {
    try { fn(next); } catch {}
  });
  return next;
}

export function subscribeToN8nConfig(callback: (config: N8nConfig) => void): () => void {
  listeners.push(callback);
  callback(getN8nConfig());
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/**
 * Trigger n8n Webhook via our backend proxy to prevent CORS issues
 */
export async function triggerN8nWebhook(
  payload: N8nExportPayload,
  overrideUrl?: string
): Promise<{ success: boolean; message: string; refId?: string; rawResponse?: any }> {
  const config = getN8nConfig();
  const targetUrl = (overrideUrl || config.webhookUrl || '').trim();

  if (!targetUrl) {
    return {
      success: false,
      message: 'ยังไม่ได้ระบุ n8n Webhook URL กรุณาตั้งค่าในเมนูเชื่อมต่อ n8n',
    };
  }

  try {
    const response = await fetch('/api/n8n/trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhookUrl: targetUrl,
        secretToken: config.customSecretToken || undefined,
        payload,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || `Server responded with status ${response.status}`);
    }

    // Update last status
    saveN8nConfig({
      lastTestedAt: new Date().toISOString(),
      lastStatus: 'success',
      lastStatusMessage: 'ส่งข้อมูลเข้า n8n สำเร็จ',
    });

    return {
      success: true,
      message: data.message || 'ส่งข้อมูลไปยัง n8n สำเร็จเรียบร้อยแล้ว',
      refId: data.refId || `N8N-${Date.now().toString(36).toUpperCase()}`,
      rawResponse: data.n8nResponse,
    };
  } catch (err: any) {
    console.error('[n8nService] Trigger error:', err);

    saveN8nConfig({
      lastTestedAt: new Date().toISOString(),
      lastStatus: 'error',
      lastStatusMessage: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ n8n',
    });

    return {
      success: false,
      message: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ n8n',
    };
  }
}

/**
 * Send a lightweight test ping to n8n Webhook
 */
export async function testN8nConnection(testUrl?: string): Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
  response?: any;
}> {
  const config = getN8nConfig();
  const urlToTest = (testUrl || config.webhookUrl || '').trim();

  if (!urlToTest) {
    return {
      success: false,
      message: 'กรุณากรอก Webhook URL ของ n8n ก่อนทดสอบ',
    };
  }

  const startTime = Date.now();
  const testPayload: N8nExportPayload = {
    event: 'test_ping',
    timestamp: new Date().toISOString(),
    system: 'Thai League Sponsor Management Portal',
    channels: ['email', 'line'],
    brand: 'BYD',
    summary: {
      matchCount: 1,
      boothCount: 1,
      ticketCount: 1,
      totalTicketQty: 4,
      participatingBrands: ['BYD'],
    },
    recipients: {
      email: 'siriprapa.po@planbmedia.co.th',
      lineGroupName: 'Thai League BYD Coordinators',
    },
    emailData: {
      subject: '[Test n8n Webhook] ทดสอบการเชื่อมต่อระบบ Thai League Sponsor Portal',
      htmlBody: `<h3>ทดสอบการส่งข้อมูลจาก Thai League Sponsor Portal ไปยัง n8n</h3><p>ระบบสามารถรับและกระจายข้อมูลไปยัง E-mail และ LINE ได้สมบูรณ์</p>`,
      plainText: 'ทดสอบการส่งข้อมูลจาก Thai League Sponsor Portal ไปยัง n8n สำเร็จเรียบร้อยแล้ว',
    },
    lineData: {
      messageText: '🔔 [Thai League Portal] ทดสอบการส่งข้อมูลเข้า n8n Webhook สำเร็จ พร้อมส่งต่อเข้า LINE และ E-mail',
      targetGroupName: 'Thai League BYD Coordinators',
    },
    records: [
      {
        matchId: 'TEST-001',
        league: 'League 1',
        matchDate: '2026-09-25',
        homeTeam: 'บุรีรัมย์ ยูไนเต็ด',
        awayTeam: 'การท่าเรือ เอฟซี',
        stadium: 'ช้าง อารีนา',
        brand: 'BYD',
        applicantName: 'ทดสอบระบบ',
        applicantEmail: 'siriprapa.po@planbmedia.co.th',
        applicantPhone: '081-234-5678',
        boothRequired: true,
        boothDealerName: 'BYD Buriram Dealer',
        ticketRequired: true,
        ticketQuantity: 4,
        ticketRequesterName: 'คุณสมชาย (BYD)',
        ticketRequesterPhone: '089-999-8888',
      },
    ],
  };

  const result = await triggerN8nWebhook(testPayload, urlToTest);
  const latencyMs = Date.now() - startTime;

  return {
    success: result.success,
    message: result.success
      ? `เชื่อมต่อ n8n สำเร็จ! (ตอบกลับภายใน ${latencyMs} ms)`
      : `การเชื่อมต่อล้มเหลว: ${result.message}`,
    latencyMs,
    response: result.rawResponse,
  };
}

/**
 * Generates an importable n8n workflow template JSON
 * with a Webhook node -> Switch -> Gmail Node & LINE Node
 */
export function generateN8nSampleWorkflowJson(): string {
  const workflow = {
    name: "Thai League Sponsor Portal - Email & LINE Notification Flow",
    nodes: [
      {
        parameters: {
          httpMethod: "POST",
          path: "thaileague-sponsor-webhook",
          responseMode: "onReceived",
          responseData: "allEntries",
          options: {}
        },
        id: "webhook-trigger",
        name: "Thai League Webhook",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [240, 300]
      },
      {
        parameters: {
          conditions: {
            string: [
              {
                value1: "={{ $json.body.channels }}",
                operation: "contains",
                value2: "email"
              }
            ]
          }
        },
        id: "check-channels",
        name: "Has Email Channel?",
        type: "n8n-nodes-base.if",
        typeVersion: 1,
        position: [480, 200]
      },
      {
        parameters: {
          toEmail: "={{ $json.body.recipients.email }}",
          subject: "={{ $json.body.emailData.subject }}",
          emailType: "html",
          html: "={{ $json.body.emailData.htmlBody }}",
          options: {
            ccEmail: "={{ $json.body.recipients.ccEmail || '' }}"
          }
        },
        id: "send-email-node",
        name: "Send Email (Gmail/SMTP)",
        type: "n8n-nodes-base.gmail",
        typeVersion: 2.1,
        position: [720, 160]
      },
      {
        parameters: {
          method: "POST",
          url: "https://notify-api.line.me/api/notify",
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
          sendBody: true,
          bodyParameters: {
            parameters: [
              {
                name: "message",
                value: "={{ $json.body.lineData.messageText }}"
              }
            ]
          }
        },
        id: "send-line-node",
        name: "Send LINE (Notify / Group)",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.1,
        position: [720, 380]
      }
    ],
    connections: {
      "Thai League Webhook": {
        main: [
          [
            { node: "Has Email Channel?", type: "main", index: 0 },
            { node: "Send LINE (Notify / Group)", type: "main", index: 0 }
          ]
        ]
      },
      "Has Email Channel?": {
        main: [
          [
            { node: "Send Email (Gmail/SMTP)", type: "main", index: 0 }
          ]
        ]
      }
    }
  };

  return JSON.stringify(workflow, null, 2);
}

/**
 * Generates an n8n workflow template JSON for scheduled LINE reminders:
 * Every Thursday 10:00, Monday 10:00, and Tuesday 13:00
 */
export function generateN8nScheduleReminderWorkflowJson(): string {
  const workflow = {
    name: "Thai League Sponsor Portal - Scheduled LINE Reminders (Thu 10:00, Mon 10:00, Tue 13:00)",
    nodes: [
      {
        parameters: {
          rule: {
            interval: [
              {
                field: "cronExpression",
                expression: "0 10 * * 4"
              },
              {
                field: "cronExpression",
                expression: "0 13 * * 1"
              },
              {
                field: "cronExpression",
                expression: "0 13 * * 2"
              }
            ]
          }
        },
        id: "schedule-trigger-weekly",
        name: "Schedule: Thu 10:00 (D-15), Mon 13:00 (D-11), Tue 13:00 (D-10)",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [240, 300]
      },
      {
        parameters: {
          jsCode: `// Determine which reminder to send based on current day of week and hour
const now = new Date();
const day = now.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 4 = Thu
const hour = now.getHours();

let reminderTitle = "📢 แจ้งเตือนลงทะเบียนขอออกบูธและรับบัตรเข้าชมฟุตบอล Thai League 2026/27";
let reminderSubtitle = "";

if (day === 4) {
  // Thursday 10:00 AM (ล่วงหน้า 15 วัน)
  reminderSubtitle = "✨ [แจ้งเตือนครั้งที่ 1 - ล่วงหน้า 15 วัน] ขอเรียนเชิญผู้แทนแบรนด์และดีลเลอร์ทุกท่าน เข้าสู่ระบบเพื่อแจ้งความประสงค์ขอออกบูธกิจกรรมและรับบัตรเข้าชมฟุตบอลประจำสัปดาห์ครับ";
} else if (day === 1) {
  // Monday 13:00 PM (ล่วงหน้า 11 วัน)
  reminderSubtitle = "⚠️ [แจ้งเตือนครั้งที่ 2 - ล่วงหน้า 11 วัน] สรุปยอดคำขอออกบูธและรับบัตรประจำสัปดาห์ ท่านใดยังไม่ได้ลงทะเบียน สามารถเข้าสู่ระบบเพื่อยืนยันข้อมูลได้เลยครับ";
} else if (day === 2) {
  // Tuesday 13:00 PM (ล่วงหน้า 10 วัน)
  reminderSubtitle = "🚨 [แจ้งเตือนครั้งที่ 3 / Final Call - ล่วงหน้า 10 วัน] ระบบจะทำการสรุปยอดเพื่อจัดส่งรายชื่อให้แก่สโมสรและสนามแข่งขัน กรุณาตรวจสอบความถูกต้องของข้อมูลบูธและจำนวนบัตรเป็นรอบสุดท้ายครับ";
} else {
  reminderSubtitle = "🔔 ขอแจ้งเตือนลงทะเบียนขอออกบูธและรับบัตรเข้าชมฟุตบอลประจำสัปดาห์";
}

const message = \`\${reminderTitle}
-----------------------------------------
\${reminderSubtitle}

⚽ ลิงก์เข้าสู่ระบบลงทะเบียน:
https://your-thaileague-portal.web.app

📌 ติดต่อสอบถามทีมงานประสานงานสปอนเซอร์:
โทร. 02-xxx-xxxx / LINE Group ประจำแบรนด์
-----------------------------------------\`;

return [{ json: { message, scheduledDay: day, scheduledHour: hour } }];`
        },
        id: "format-reminder-message",
        name: "Format Reminder Text",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [480, 300]
      },
      {
        parameters: {
          method: "POST",
          url: "https://notify-api.line.me/api/notify",
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
          sendBody: true,
          bodyParameters: {
            parameters: [
              {
                name: "message",
                value: "={{ $json.message }}"
              }
            ]
          }
        },
        id: "send-line-reminder",
        name: "Send LINE Notification",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.1,
        position: [720, 300]
      }
    ],
    connections: {
      "Schedule: Thu 10:00, Mon 10:00, Tue 13:00": {
        main: [
          [
            { node: "Format Reminder Text", type: "main", index: 0 }
          ]
        ]
      },
      "Format Reminder Text": {
        main: [
          [
            { node: "Send LINE Notification", type: "main", index: 0 }
          ]
        ]
      }
    }
  };

  return JSON.stringify(workflow, null, 2);
}
