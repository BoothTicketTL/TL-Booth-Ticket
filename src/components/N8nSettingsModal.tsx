import React, { useState, useEffect } from 'react';
import { 
  X, 
  Zap, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  Mail, 
  MessageSquare, 
  ExternalLink, 
  RefreshCw, 
  ShieldCheck, 
  Sliders, 
  Layers,
  ArrowRight,
  Code2
} from 'lucide-react';
import { 
  getN8nConfig, 
  saveN8nConfig, 
  testN8nConnection, 
  generateN8nSampleWorkflowJson,
  generateN8nScheduleReminderWorkflowJson,
  N8nConfig 
} from '../lib/n8nService';

interface N8nSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated?: (config: N8nConfig) => void;
}

export const N8nSettingsModal: React.FC<N8nSettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
}) => {
  const [config, setConfig] = useState<N8nConfig>(getN8nConfig());
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [customSecretToken, setCustomSecretToken] = useState<string>('');
  const [enableEmail, setEnableEmail] = useState<boolean>(true);
  const [enableLine, setEnableLine] = useState<boolean>(true);
  const [autoTriggerOnWeeklyExport, setAutoTriggerOnWeeklyExport] = useState<boolean>(true);
  const [autoTriggerOnLineExport, setAutoTriggerOnLineExport] = useState<boolean>(true);
  const [autoTriggerOnSubmission, setAutoTriggerOnSubmission] = useState<boolean>(false);

  // Testing states
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    latencyMs?: number;
  } | null>(null);

  const [copiedWorkflow, setCopiedWorkflow] = useState<boolean>(false);
  const [copiedScheduleWorkflow, setCopiedScheduleWorkflow] = useState<boolean>(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const current = getN8nConfig();
      setConfig(current);
      setWebhookUrl(current.webhookUrl || '');
      setCustomSecretToken(current.customSecretToken || '');
      setEnableEmail(current.enableEmail ?? true);
      setEnableLine(current.enableLine ?? true);
      setAutoTriggerOnWeeklyExport(current.autoTriggerOnWeeklyExport ?? true);
      setAutoTriggerOnLineExport(current.autoTriggerOnLineExport ?? true);
      setAutoTriggerOnSubmission(current.autoTriggerOnSubmission ?? false);
      setTestResult(null);
      setSaveSuccessNotice(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const updated = saveN8nConfig({
      webhookUrl: webhookUrl.trim(),
      customSecretToken: customSecretToken.trim() || undefined,
      enabled: Boolean(webhookUrl.trim()),
      enableEmail,
      enableLine,
      autoTriggerOnWeeklyExport,
      autoTriggerOnLineExport,
      autoTriggerOnSubmission,
    });
    setConfig(updated);
    setSaveSuccessNotice(true);
    if (onConfigUpdated) onConfigUpdated(updated);
    setTimeout(() => setSaveSuccessNotice(false), 3500);
  };

  const handleTest = async () => {
    if (!webhookUrl.trim()) {
      setTestResult({
        success: false,
        message: 'กรุณากรอก n8n Webhook URL ก่อนกดทดสอบ',
      });
      return;
    }
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await testN8nConnection(webhookUrl.trim());
      setTestResult({
        success: res.success,
        message: res.message,
        latencyMs: res.latencyMs,
      });
      if (res.success) {
        // Auto-save if test passed
        saveN8nConfig({
          webhookUrl: webhookUrl.trim(),
          enabled: true,
          lastStatus: 'success',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'การเชื่อมต่อล้มเหลว',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyWorkflow = () => {
    const jsonStr = generateN8nSampleWorkflowJson();
    navigator.clipboard.writeText(jsonStr);
    setCopiedWorkflow(true);
    setTimeout(() => setCopiedWorkflow(false), 3000);
  };

  const handleCopyScheduleWorkflow = () => {
    const jsonStr = generateN8nScheduleReminderWorkflowJson();
    navigator.clipboard.writeText(jsonStr);
    setCopiedScheduleWorkflow(true);
    setTimeout(() => setCopiedScheduleWorkflow(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        id="modal-n8n-settings"
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-[#1e293b] to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#ea4b71] to-[#ff6d5a] flex items-center justify-center text-white shadow-md">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight">
                  ตั้งค่าเชื่อมต่อ n8n (Webhook Automation)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#ea4b71]/20 text-[#ff8199] border border-[#ea4b71]/30 text-[10px] font-bold">
                  Email & LINE
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                ยิงข้อมูลอัตโนมัติจากระบบนี้ไปยัง n8n เพื่อส่งต่อไปยัง E-mail และ LINE พร้อมกัน
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-xs">
          {/* Architecture Visual Diagram */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 via-indigo-50/40 to-pink-50/30 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span>แผนผังการกระจายข้อมูลด้วย n8n (Multi-Channel Dispatch)</span>
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                ✓ รองรับทั้งคู่ 100%
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center pt-1">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col items-center justify-center gap-1">
                <div className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                  1. เว็บไซต์นี้
                </div>
                <div className="font-bold text-slate-800">กดปุ่ม Export / ส่งข้อมูล</div>
                <div className="text-[10px] text-slate-400">ยิง Webhook POST + JSON</div>
              </div>

              <div className="p-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-2xs flex flex-col items-center justify-center gap-1">
                <div className="text-[10px] font-extrabold text-rose-100 bg-black/20 px-2 py-0.5 rounded-md">
                  2. n8n Webhook Node
                </div>
                <div className="font-bold">รับก้อนข้อมูล & แยกสาย</div>
                <div className="text-[10px] text-rose-100">รองรับ Payload ครบถ้วน</div>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col items-center justify-center gap-1">
                <div className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  3. กระจาย 2 ช่องทาง
                </div>
                <div className="font-bold text-slate-800 flex items-center justify-center gap-2">
                  <span className="flex items-center gap-1 text-blue-600"><Mail className="w-3.5 h-3.5" /> Email</span>
                  <span>+</span>
                  <span className="flex items-center gap-1 text-[#06C755]"><MessageSquare className="w-3.5 h-3.5" /> LINE</span>
                </div>
                <div className="text-[10px] text-slate-400">ส่งตรงถึงลูกค้า & ทีมงาน</div>
              </div>
            </div>
          </div>

          {/* Webhook URL Input */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              n8n Webhook URL (Production หรือ Test URL) <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                id="input-n8n-webhook-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-n8n-instance.com/webhook/thaileague-sponsor"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white shadow-2xs"
              />
              <button
                type="button"
                id="btn-test-n8n"
                onClick={handleTest}
                disabled={isTesting || !webhookUrl.trim()}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังทดสอบ...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>ทดสอบยิง</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              * สามารถนำ URL ที่ได้จากโหนด <strong>Webhook (HTTP Method: POST)</strong> ใน n8n มาวางที่นี่ได้ทันที
            </p>
          </div>

          {/* Test Result Feedback */}
          {testResult && (
            <div className={`p-3.5 rounded-xl border animate-fadeIn flex items-start gap-2.5 ${
              testResult.success 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5 flex-1">
                <div className="font-bold text-xs">
                  {testResult.success ? '✓ ยิง Webhook สำเร็จ!' : '✕ ไม่สามารถส่ง Webhook ได้'}
                </div>
                <div className="text-[11px] leading-relaxed">
                  {testResult.message}
                  {testResult.latencyMs !== undefined && (
                    <span className="ml-1 text-slate-500 font-mono">
                      (Latency: {testResult.latencyMs}ms)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Optional Bearer / Security Secret */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-semibold text-slate-700">
              Secret Token / Bearer Key (ไม่บังคับ - กรณีตั้ง Header Auth ใน n8n)
            </label>
            <input
              type="password"
              id="input-n8n-secret"
              value={customSecretToken}
              onChange={(e) => setCustomSecretToken(e.target.value)}
              placeholder="เช่น secret_key_abc123 (ส่งผ่าน Authorization: Bearer ...)"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white"
            />
          </div>

          {/* Channel Selection & Automated Triggers */}
          <div className="pt-2 border-t border-slate-100 space-y-4">
            <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>ช่องทางปลายทางที่ต้องการให้ n8n ประมวลผล (Target Channels)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                enableEmail ? 'border-blue-300 bg-blue-50/60 shadow-2xs' : 'border-slate-200 bg-white'
              }`}>
                <input
                  type="checkbox"
                  checked={enableEmail}
                  onChange={(e) => setEnableEmail(e.target.checked)}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                />
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-blue-600" />
                    <span>ช่องทาง E-mail (Gmail / SMTP)</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    ส่งก้อน HTML Template และข้อมูลผู้รับไปให้โหนดส่งอีเมลใน n8n
                  </p>
                </div>
              </label>

              <label className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                enableLine ? 'border-emerald-300 bg-emerald-50/60 shadow-2xs' : 'border-slate-200 bg-white'
              }`}>
                <input
                  type="checkbox"
                  checked={enableLine}
                  onChange={(e) => setEnableLine(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-[#06C755]" />
                    <span>ช่องทาง LINE (Notify / Group)</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    ส่งข้อความสรุปยอดแมตช์-บูธ-บัตร แบบจัดข้อความพร้อมโพสต์เข้า LINE
                  </p>
                </div>
              </label>
            </div>

            {/* Event Triggers */}
            <div className="space-y-2 pt-2">
              <span className="font-semibold text-slate-700 block">
                จุดที่ต้องการให้ระบบสั่งยิงข้อมูลเข้า n8n อัตโนมัติ:
              </span>
              <div className="space-y-2 pl-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTriggerOnWeeklyExport}
                    onChange={(e) => setAutoTriggerOnWeeklyExport(e.target.checked)}
                    className="rounded text-slate-900 focus:ring-slate-800"
                  />
                  <span className="text-slate-700">
                    เมื่อกดปุ่ม <strong>"Export ส่ง E-mail อัตโนมัติ (ทั้งสัปดาห์ ทุกแบรนด์)"</strong>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTriggerOnLineExport}
                    onChange={(e) => setAutoTriggerOnLineExport(e.target.checked)}
                    className="rounded text-slate-900 focus:ring-slate-800"
                  />
                  <span className="text-slate-700">
                    เมื่อกดปุ่ม <strong>"Export ส่ง Line Group"</strong>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTriggerOnSubmission}
                    onChange={(e) => setAutoTriggerOnSubmission(e.target.checked)}
                    className="rounded text-slate-900 focus:ring-slate-800"
                  />
                  <span className="text-slate-700">
                    เมื่อมีลูกค้าส่งคำขอลงทะเบียนใหม่หน้าเว็บ (Real-time Submission Alert)
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Schedule Trigger Info & Template Box (Answering user inquiry) */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 text-white space-y-3 border border-emerald-500/30 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-800/40 pb-2.5">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs sm:text-sm">
                  <MessageSquare className="w-4 h-4 text-[#06C755]" />
                  <span>ตั้งค่าแจ้งเตือนเข้า LINE กลุ่มอัตโนมัติ (ตามรอบเวลา พฤหัส 10:00 / จันทร์ 10:00 / อังคาร 13:00)</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyScheduleWorkflow}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0 self-start sm:self-auto"
                >
                  {copiedScheduleWorkflow ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>คัดลอก Workflow แล้ว!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>คัดลอก Schedule Workflow JSON</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-[11px] text-slate-200 space-y-2 leading-relaxed">
                <div className="p-2.5 rounded-xl bg-emerald-900/30 border border-emerald-500/20 text-emerald-200">
                  <p className="font-semibold text-white mb-1">
                    💡 คำถาม: ตั้งค่าแจ้งเตือนนี้ใน "เว็บไซต์" หรือใน "n8n"?
                  </p>
                  <p>
                    <strong>คำตอบ: ต้องตั้งค่าใน "n8n" เป็นหลักครับ!</strong> เนื่องจากเว็บไซต์เป็น Web App ทำงานเฉพาะตอนมีคนเปิดหน้าจอเบราว์เซอร์ แต่ <strong>n8n เป็นระบบ Automation ที่รันอยู่บน Server 24 ชม.</strong> จึงสามารถปลุกตัวเองขึ้นมายิงแจ้งเตือนเข้ากลุ่ม LINE ได้ตรงตามวันและเวลาเป๊ะๆ แม้ไม่มีใครเปิดหน้าเว็บอยู่
                  </p>
                </div>

                <div className="space-y-1.5 pt-1">
                  <span className="font-bold text-white block">
                    ตารางเวลาที่ตั้งค่าไว้ใน Workflow สำเร็จรูป:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
                      <span className="font-bold text-amber-300 block text-xs">1. พฤหัสบดี 10:00 น.</span>
                      <span className="text-[10px] text-amber-400 font-semibold block">ล่วงหน้า 15 วัน (ครั้งแรก)</span>
                      <span className="text-[10px] text-slate-400 block font-mono">Cron: 0 10 * * 4</span>
                      <span className="text-[10px] text-slate-300 block">เตือนเปิดรับลงทะเบียนบูธ&บัตร</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
                      <span className="font-bold text-sky-300 block text-xs">2. จันทร์ 13:00 น.</span>
                      <span className="text-[10px] text-sky-400 font-semibold block">ล่วงหน้า 11 วัน (ครั้งที่ 2)</span>
                      <span className="text-[10px] text-slate-400 block font-mono">Cron: 0 13 * * 1</span>
                      <span className="text-[10px] text-slate-300 block">เตือนรอบ 2 ก่อนสรุปยอดสัปดาห์</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
                      <span className="font-bold text-rose-300 block text-xs">3. อังคาร 13:00 น.</span>
                      <span className="text-[10px] text-rose-400 font-semibold block">ล่วงหน้า 10 วัน (ครั้งที่ 3)</span>
                      <span className="text-[10px] text-slate-400 block font-mono">Cron: 0 13 * * 2</span>
                      <span className="text-[10px] text-slate-300 block">เตือนโค้งสุดท้ายก่อนปิดระบบ</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
                      <span className="font-bold text-emerald-300 block text-xs">4. วันที่ 1 ของเดือน</span>
                      <span className="text-[10px] text-emerald-400 font-semibold block">เวลา 08:00 น. (รายเดือน)</span>
                      <span className="text-[10px] text-slate-400 block font-mono">Cron: 0 8 1 * *</span>
                      <span className="text-[10px] text-slate-300 block">ดึงสถิติ 3 หัวข้อส่ง Email ทีม</span>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 italic pt-1">
                  * วิธีใช้งาน: กดปุ่ม "คัดลอก Schedule Workflow JSON" ด้านบน แล้วนำไปวาง (Ctrl+V) บนหน้าจอ n8n แล้วใส่ LINE Notify Token หรือ LINE Messaging API Token ก็พร้อมทำงานอัตโนมัติทันที
                </p>
              </div>
            </div>
          </div>

          {/* Workflow Template Copy Box */}
          <div className="pt-2 border-t border-slate-100">
            <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Code2 className="w-4 h-4" />
                  <span>ตัวอย่าง n8n Workflow สำเร็จรูป (Email + LINE Branch)</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyWorkflow}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold flex items-center gap-1 transition-all"
                >
                  {copiedWorkflow ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">คัดลอกแล้ว!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>คัดลอก JSON ไป Paste ใน n8n</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                คุณสามารถกดคัดลอก JSON ด้านบน แล้วเปิดโปรแกรม n8n จากนั้นกด <strong>Ctrl + V (วาง)</strong> บน Canvas หน้าจอ n8n ได้ทันที จะมีโหนด <strong>Webhook ➔ ตรวจสอบช่องทาง ➔ โหนด Gmail ➔ โหนด LINE</strong> ขึ้นมาให้ใช้งานได้ทันทีครับ
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {saveSuccessNotice && (
              <span className="text-xs text-emerald-700 font-bold flex items-center gap-1 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4" />
                <span>บันทึกการตั้งค่าเรียบร้อยแล้ว</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
            >
              ปิดหน้าต่าง
            </button>
            <button
              type="button"
              id="btn-save-n8n-config"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              บันทึกการตั้งค่า
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
