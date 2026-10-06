import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  RotateCcw, 
  Sparkles, 
  AlertCircle,
  Palette,
  Layers,
  ShieldCheck,
  Ticket,
  Store,
  Copy,
  CheckCircle2,
  BarChart3,
  Info,
  Sliders,
  AlertTriangle
} from 'lucide-react';
import { 
  getSponsorBrands, 
  subscribeToBrands, 
  addSponsorBrand, 
  updateSponsorBrand, 
  deleteSponsorBrand, 
  resetBrandsToDefault,
  calculateBrandQuota,
  SponsorBrandItem,
  ALL_LEAGUES,
  BrandQuotaUsage,
  formatMaxTicketsPerMatch,
  getMaxTicketsPerMatchForLeague
} from '../../lib/brandService';
import { RegistrationRecord, LeagueType } from '../../types';

interface BrandManagementPanelProps {
  records: RegistrationRecord[];
}

const COLOR_OPTIONS = [
  { id: 'sky', label: 'ฟ้า (Sky)', hex: '#0284c7', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'emerald', label: 'เขียวมรกต (Emerald)', hex: '#059669', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'green', label: 'เขียวเข้ม (Green)', hex: '#16a34a', badge: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'red', label: 'แดง (Red)', hex: '#dc2626', badge: 'bg-red-50 text-red-700 border-red-200' },
  { id: 'amber', label: 'ทอง/ส้ม (Amber)', hex: '#d97706', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'purple', label: 'ม่วง (Purple)', hex: '#7c3aed', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'cyan', label: 'ฟ้าคราม (Cyan)', hex: '#0891b2', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { id: 'rose', label: 'ชมพูเข้ม (Rose)', hex: '#e11d48', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'indigo', label: 'คราม (Indigo)', hex: '#4f46e5', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'slate', label: 'เทาเข้ม (Slate)', hex: '#475569', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
];

const LEAGUE_LABELS: Record<LeagueType, { short: string; full: string; badge: string }> = {
  'League 1': { short: 'T1', full: 'Thai League 1', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  'League 2': { short: 'T2', full: 'Thai League 2', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'League 3': { short: 'T3', full: 'Thai League 3', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
};

export const BrandManagementPanel: React.FC<BrandManagementPanelProps> = ({ records }) => {
  const [brands, setBrands] = useState<SponsorBrandItem[]>(getSponsorBrands());
  const [selectedSeason, setSelectedSeason] = useState<string>('2026/27');
  const [copiedBrandId, setCopiedBrandId] = useState<string | null>(null);

  // Add Brand Form State
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [newBrandId, setNewBrandId] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandLogoText, setNewBrandLogoText] = useState('');
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [newAllowedBoothLeagues, setNewAllowedBoothLeagues] = useState<LeagueType[]>(['League 1', 'League 2', 'League 3']);
  const [newAllowedTicketLeagues, setNewAllowedTicketLeagues] = useState<LeagueType[]>(['League 1', 'League 2', 'League 3']);
  const [newSeasonBoothQuotaMatches, setNewSeasonBoothQuotaMatches] = useState<number>(15);
  const [newSeasonTicketQuotaMatches, setNewSeasonTicketQuotaMatches] = useState<number>(20);
  const [newSeasonTicketQuotaTotalTickets, setNewSeasonTicketQuotaTotalTickets] = useState<number>(400);
  const [newMaxTicketsPerMatch, setNewMaxTicketsPerMatch] = useState<number>(50);
  const [newCustomLimitByLeague, setNewCustomLimitByLeague] = useState<boolean>(false);
  const [newMaxTicketsByLeague, setNewMaxTicketsByLeague] = useState<Record<LeagueType, number>>({
    'League 1': 50,
    'League 2': 100,
    'League 3': 50,
  });

  // Edit State
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editBrandName, setEditBrandName] = useState('');
  const [editBrandLogoText, setEditBrandLogoText] = useState('');
  const [editColorHex, setEditColorHex] = useState('');
  const [editAllowedBoothLeagues, setEditAllowedBoothLeagues] = useState<LeagueType[]>([]);
  const [editAllowedTicketLeagues, setEditAllowedTicketLeagues] = useState<LeagueType[]>([]);
  const [editSeasonBoothQuotaMatches, setEditSeasonBoothQuotaMatches] = useState<number>(15);
  const [editSeasonTicketQuotaMatches, setEditSeasonTicketQuotaMatches] = useState<number>(20);
  const [editSeasonTicketQuotaTotalTickets, setEditSeasonTicketQuotaTotalTickets] = useState<number>(400);
  const [editMaxTicketsPerMatch, setEditMaxTicketsPerMatch] = useState<number>(50);
  const [editCustomLimitByLeague, setEditCustomLimitByLeague] = useState<boolean>(false);
  const [editMaxTicketsByLeague, setEditMaxTicketsByLeague] = useState<Record<LeagueType, number>>({
    'League 1': 50,
    'League 2': 100,
    'League 3': 50,
  });

  // Notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const unsub = subscribeToBrands((updatedBrands) => {
      setBrands(updatedBrands);
    });
    return () => unsub();
  }, []);

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandId.trim()) {
      setNotification({ type: 'error', message: 'กรุณากรอกรหัสหรือชื่อย่อแบรนด์' });
      return;
    }

    try {
      setIsProcessing(true);
      const chosenColor = COLOR_OPTIONS[selectedColorIndex] || COLOR_OPTIONS[0];
      const maxTicketsPerMatchByLeague = newCustomLimitByLeague ? {
        'League 1': newAllowedTicketLeagues.includes('League 1') ? Number(newMaxTicketsByLeague['League 1']) || 50 : undefined,
        'League 2': newAllowedTicketLeagues.includes('League 2') ? Number(newMaxTicketsByLeague['League 2']) || 100 : undefined,
        'League 3': newAllowedTicketLeagues.includes('League 3') ? Number(newMaxTicketsByLeague['League 3']) || 50 : undefined,
      } : undefined;

      const res = await addSponsorBrand({
        id: newBrandId.trim(),
        name: newBrandName.trim() || newBrandId.trim(),
        logoText: newBrandLogoText.trim() || newBrandId.trim().toUpperCase(),
        color: chosenColor.hex,
        badgeClass: chosenColor.badge,
        allowedBoothLeagues: newAllowedBoothLeagues,
        allowedTicketLeagues: newAllowedTicketLeagues,
        seasonBoothQuotaMatches: Number(newSeasonBoothQuotaMatches) || 15,
        seasonTicketQuotaMatches: Number(newSeasonTicketQuotaMatches) || 20,
        seasonTicketQuotaTotalTickets: Number(newSeasonTicketQuotaTotalTickets) || 400,
        maxTicketsPerMatch: Number(newMaxTicketsPerMatch) || 50,
        maxTicketsPerMatchByLeague,
      } as any);

      if (res.success) {
        setNotification({ type: 'success', message: res.message });
        setNewBrandId('');
        setNewBrandName('');
        setNewBrandLogoText('');
        setNewAllowedBoothLeagues(['League 1', 'League 2', 'League 3']);
        setNewAllowedTicketLeagues(['League 1', 'League 2', 'League 3']);
        setNewSeasonBoothQuotaMatches(15);
        setNewSeasonTicketQuotaMatches(20);
        setNewSeasonTicketQuotaTotalTickets(400);
        setNewMaxTicketsPerMatch(50);
        setNewCustomLimitByLeague(false);
        setNewMaxTicketsByLeague({ 'League 1': 50, 'League 2': 100, 'League 3': 50 });
        setIsAddingBrand(false);
      } else {
        setNotification({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการเพิ่มแบรนด์' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartEdit = (brand: SponsorBrandItem) => {
    setEditingBrandId(brand.id);
    setEditBrandName(brand.name);
    setEditBrandLogoText(brand.logoText);
    setEditColorHex(brand.color);
    setEditAllowedBoothLeagues([...brand.allowedBoothLeagues]);
    setEditAllowedTicketLeagues([...brand.allowedTicketLeagues]);
    setEditSeasonBoothQuotaMatches(brand.seasonBoothQuotaMatches ?? 15);
    setEditSeasonTicketQuotaMatches(brand.seasonTicketQuotaMatches ?? 20);
    setEditSeasonTicketQuotaTotalTickets(brand.seasonTicketQuotaTotalTickets ?? 400);
    setEditMaxTicketsPerMatch(brand.maxTicketsPerMatch ?? 50);

    const hasPerLeague = !!(
      brand.maxTicketsPerMatchByLeague && 
      Object.keys(brand.maxTicketsPerMatchByLeague).some(k => typeof (brand.maxTicketsPerMatchByLeague as any)[k] === 'number')
    );
    setEditCustomLimitByLeague(hasPerLeague);
    setEditMaxTicketsByLeague({
      'League 1': brand.maxTicketsPerMatchByLeague?.['League 1'] ?? brand.maxTicketsPerMatch ?? 50,
      'League 2': brand.maxTicketsPerMatchByLeague?.['League 2'] ?? brand.maxTicketsPerMatch ?? 100,
      'League 3': brand.maxTicketsPerMatchByLeague?.['League 3'] ?? brand.maxTicketsPerMatch ?? 50,
    });
  };

  const toggleEditLeague = (type: 'booth' | 'ticket', league: LeagueType) => {
    if (type === 'booth') {
      setEditAllowedBoothLeagues(prev => 
        prev.includes(league) ? prev.filter(l => l !== league) : [...prev, league]
      );
    } else {
      setEditAllowedTicketLeagues(prev => 
        prev.includes(league) ? prev.filter(l => l !== league) : [...prev, league]
      );
    }
  };

  const toggleNewLeague = (type: 'booth' | 'ticket', league: LeagueType) => {
    if (type === 'booth') {
      setNewAllowedBoothLeagues(prev => 
        prev.includes(league) ? prev.filter(l => l !== league) : [...prev, league]
      );
    } else {
      setNewAllowedTicketLeagues(prev => 
        prev.includes(league) ? prev.filter(l => l !== league) : [...prev, league]
      );
    }
  };

  const handleSaveEdit = async (id: string) => {
    try {
      setIsProcessing(true);
      const colorMatch = COLOR_OPTIONS.find(c => c.hex.toLowerCase() === editColorHex.toLowerCase()) || COLOR_OPTIONS[0];

      const maxTicketsPerMatchByLeague = editCustomLimitByLeague ? {
        'League 1': editAllowedTicketLeagues.includes('League 1') ? Number(editMaxTicketsByLeague['League 1']) || 50 : undefined,
        'League 2': editAllowedTicketLeagues.includes('League 2') ? Number(editMaxTicketsByLeague['League 2']) || 100 : undefined,
        'League 3': editAllowedTicketLeagues.includes('League 3') ? Number(editMaxTicketsByLeague['League 3']) || 50 : undefined,
      } : undefined;

      const res = await updateSponsorBrand(id, {
        name: editBrandName.trim(),
        logoText: editBrandLogoText.trim() || id.toUpperCase(),
        color: editColorHex,
        badgeClass: colorMatch.badge,
        allowedBoothLeagues: editAllowedBoothLeagues,
        allowedTicketLeagues: editAllowedTicketLeagues,
        seasonBoothQuotaMatches: Number(editSeasonBoothQuotaMatches) || 15,
        seasonTicketQuotaMatches: Number(editSeasonTicketQuotaMatches) || 20,
        seasonTicketQuotaTotalTickets: Number(editSeasonTicketQuotaTotalTickets) || 400,
        maxTicketsPerMatch: Number(editMaxTicketsPerMatch) || 50,
        maxTicketsPerMatchByLeague,
      });

      if (res.success) {
        setNotification({ type: 'success', message: res.message });
        setEditingBrandId(null);
      } else {
        setNotification({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'เกิดข้อผิดพลาด' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteBrand = async (brand: SponsorBrandItem) => {
    const recordCount = records.filter(r => r.brand === brand.id).length;
    let confirmMsg = `คุณต้องการลบแบรนด์ "${brand.id}" หรือไม่?`;
    if (recordCount > 0) {
      confirmMsg += ` (มีประวัติคำขอลงทะเบียนของแบรนด์นี้อยู่ ${recordCount} รายการ)`;
    }
    
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsProcessing(true);
      const res = await deleteSponsorBrand(brand.id);
      if (res.success) {
        setNotification({ type: 'success', message: res.message });
      } else {
        setNotification({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'ไม่สามารถลบได้' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('คุณต้องการรีเซ็ตรายชื่อแบรนด์และสิทธิ์กลับเป็นค่าเริ่มต้นมาตรฐานใช่หรือไม่? (Castrol จะถูกตั้งค่าให้ไม่มีสิทธิ์ใน Thai League 3)')) {
      return;
    }
    try {
      setIsProcessing(true);
      await resetBrandsToDefault();
      setNotification({ type: 'success', message: 'รีเซ็ตรายชื่อแบรนด์และสิทธิ์กลับเป็นค่าเริ่มต้นมาตรฐานเรียบร้อย' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Copy summary message for client discussion
  const handleCopyClientSummary = (brand: SponsorBrandItem, quota: BrandQuotaUsage) => {
    const boothText = brand.allowedBoothLeagues.length === 3 
      ? 'ทุกรายการ (T1, T2, T3)' 
      : brand.allowedBoothLeagues.map(l => LEAGUE_LABELS[l]?.short).join(', ') || 'ไม่มีสิทธิ์';
    
    const ticketText = brand.allowedTicketLeagues.length === 3 
      ? 'ทุกรายการ (T1, T2, T3)' 
      : brand.allowedTicketLeagues.map(l => LEAGUE_LABELS[l]?.short).join(', ') || 'ไม่มีสิทธิ์';

    const boothBreakdown = brand.allowedBoothLeagues.length < 3
      ? `(${brand.allowedBoothLeagues.map(l => `${LEAGUE_LABELS[l]?.short}: ${quota.usedBoothMatchesByLeague[l] || 0} ครั้ง`).join(' + ')} รวมกัน)`
      : `(T1: ${quota.usedBoothMatchesByLeague['League 1'] || 0}, T2: ${quota.usedBoothMatchesByLeague['League 2'] || 0}, T3: ${quota.usedBoothMatchesByLeague['League 3'] || 0})`;

    let ticketLimitText = `- เพดานรับบัตรสูงสุด: ${quota.maxTicketsPerMatch} ใบ/แมตช์`;
    if (brand.maxTicketsPerMatchByLeague) {
      const parts: string[] = [];
      if (brand.allowedTicketLeagues.includes('League 1') && brand.maxTicketsPerMatchByLeague['League 1']) {
        parts.push(`ไทยลีก 1 (T1): สูงสุด ${brand.maxTicketsPerMatchByLeague['League 1']} ใบ/นัด`);
      }
      if (brand.allowedTicketLeagues.includes('League 2') && brand.maxTicketsPerMatchByLeague['League 2']) {
        parts.push(`ไทยลีก 2 (T2): สูงสุด ${brand.maxTicketsPerMatchByLeague['League 2']} ใบ/นัด`);
      }
      if (brand.allowedTicketLeagues.includes('League 3') && brand.maxTicketsPerMatchByLeague['League 3']) {
        parts.push(`ไทยลีก 3 (T3): สูงสุด ${brand.maxTicketsPerMatchByLeague['League 3']} ใบ/นัด`);
      }
      if (parts.length > 0) {
        ticketLimitText = `- เพดานรับบัตรสูงสุดแยกตามลีก:\n  • ${parts.join('\n  • ')}`;
      }
    }

    const text = `📊 [สรุปสิทธิ์และโควต้าสปอนเซอร์ไทยลีก ฤดูกาล ${selectedSeason}]
🏢 แบรนด์ผู้สนับสนุน: ${brand.name} (${brand.id})
• สิทธิ์ขอออกบูธ: ${boothText}
• สิทธิ์ขอรับบัตร: ${ticketText}

🎪 ข้อมูลโควต้าการออกบูธทั้งฤดูกาล:
- โควต้ารวม: ${quota.quotaBoothMatches} ครั้ง ${brand.id === 'Castrol' ? '(T1 + T2 รวมกันได้สูงสุด 15 ครั้ง)' : ''}
- ใช้สิทธิ์ไปแล้ว: ${quota.usedBoothMatches} ครั้ง ${boothBreakdown}
- โควต้าคงเหลือ: ${quota.remainingBoothMatches} ครั้ง

🎫 ข้อมูลโควต้าการรับบัตรทั้งฤดูกาล:
- โควต้าจำนวนบัตรทั้งหมด: ${quota.quotaTotalTickets} ใบ (โควต้าแมตช์: ${quota.quotaTicketMatches} ครั้ง)
- ขอรับบัตรไปแล้ว: ${quota.usedTotalTickets} ใบ (จาก ${quota.usedTicketMatches} ครั้ง)
${quota.hasExcessTickets 
  ? `🚨 สถานะ: ขอเกินโควต้าประจำฤดูกาลแล้ว +${quota.excessTotalTickets} ใบ (*จำนวนบัตรที่ขอเกินนี้มีค่าใช้จ่ายต้องซื้อบัตรเพิ่มจากสโมสร*)` 
  : `- โควต้าบัตรคงเหลือ: ${quota.remainingTotalTickets} ใบ (เหลือโควต้าแมตช์: ${quota.remainingTicketMatches} ครั้ง)`}
${ticketLimitText}

📌 ข้อมูลสรุป ณ วันที่ ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`;

    navigator.clipboard.writeText(text);
    setCopiedBrandId(brand.id);
    setTimeout(() => {
      setCopiedBrandId(null);
    }, 2500);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Info Banner */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-xs">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>จัดการแบรนด์ผู้สนับสนุน สิทธิ์การลงทะเบียน & โควต้าทั้งฤดูกาล</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                กำหนดสิทธิ์ขอออกบูธ-รับบัตรในแต่ละลีก (T1, T2, T3) และตั้งค่าโควต้ารับบัตรทั้งฤดูกาลเพื่อใช้ยืนยันและคุยกับลูกค้าได้ทันที
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={isProcessing}
              title="รีเซ็ตกลับเป็นค่าเริ่มต้นมาตรฐาน"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>รีเซ็ตค่ามาตรฐาน</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddingBrand(!isAddingBrand)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors"
            >
              {isAddingBrand ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{isAddingBrand ? 'ปิดฟอร์ม' : 'เพิ่มแบรนด์ใหม่'}</span>
            </button>
          </div>
        </div>

        {/* Notifications */}
        {notification && (
          <div className={`mt-4 p-3.5 rounded-2xl text-xs font-medium flex items-center justify-between animate-fadeIn ${
            notification.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
              <span>{notification.message}</span>
            </div>
            <button onClick={() => setNotification(null)} className="p-1 text-slate-500 hover:text-slate-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: QUOTA SUMMARY & DISCUSSION CARDS FOR TALKING TO CLIENTS */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-3xl p-6 border border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center border border-amber-400/30">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>สรุปโควต้ารับบัตร & สิทธิ์แต่ละแบรนด์ ทั้งฤดูกาล {selectedSeason}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  สำหรับคุยกับลูกค้า
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                ตรวจสอบว่าแต่ละแบรนด์ขอรับบัตรไปกี่ครั้ง และเหลือโควต้าอีกกี่ครั้ง พร้อมปุ่มคัดลอกข้อความสรุปส่งลูกค้าได้ทันที
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">ฤดูกาล:</span>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="2026/27">ฤดูกาล 2026/27</option>
              <option value="2025/26">ฤดูกาล 2025/26</option>
            </select>
          </div>
        </div>

        {/* Brand Quota Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
          {brands.map((brand) => {
            const quota = calculateBrandQuota(brand, records, selectedSeason);
            const isCastrol = brand.id.toLowerCase() === 'castrol';

            return (
              <div 
                key={brand.id}
                className="bg-slate-800/80 hover:bg-slate-800 rounded-2xl p-4 border border-slate-700/80 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div 
                        className="w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-xs text-white shadow-xs shrink-0"
                        style={{ backgroundColor: brand.color }}
                      >
                        {brand.logoText.slice(0, 3)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-white">{brand.id}</span>
                          {brand.isCustom && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-medium">
                              กำหนดเอง
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate max-w-[160px]" title={brand.name}>
                          {brand.name}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyClientSummary(brand, quota)}
                      title="คัดลอกข้อความสรุปส่งลูกค้า"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white text-[10px] font-semibold transition-colors"
                    >
                      {copiedBrandId === brand.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-300">คัดลอกแล้ว</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>คัดลอกสรุป</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* League Permissions Badges */}
                  <div className="bg-slate-900/70 rounded-xl p-2.5 mb-3 border border-slate-800 text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Store className="w-3 h-3 text-blue-400" />
                        <span>สิทธิ์ออกบูธ:</span>
                      </span>
                      <div className="flex items-center gap-1">
                        {ALL_LEAGUES.map(league => {
                          const allowed = brand.allowedBoothLeagues.includes(league);
                          return (
                            <span 
                              key={league}
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                allowed 
                                  ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50' 
                                  : 'bg-slate-800 text-slate-500 line-through'
                              }`}
                              title={allowed ? `มีสิทธิ์ใน ${league}` : `ไม่มีสิทธิ์ใน ${league}`}
                            >
                              {LEAGUE_LABELS[league].short}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Ticket className="w-3 h-3 text-emerald-400" />
                        <span>สิทธิ์รับบัตร:</span>
                      </span>
                      <div className="flex items-center gap-1">
                        {ALL_LEAGUES.map(league => {
                          const allowed = brand.allowedTicketLeagues.includes(league);
                          return (
                            <span 
                              key={league}
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                allowed 
                                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50' 
                                  : 'bg-slate-800 text-slate-500 line-through'
                              }`}
                              title={allowed ? `มีสิทธิ์ใน ${league}` : `ไม่มีสิทธิ์ใน ${league}`}
                            >
                              {LEAGUE_LABELS[league].short}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {isCastrol && (
                      <div className="pt-1 text-[10px] text-amber-300 flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3 h-3 shrink-0 text-amber-400" />
                        <span>ไม่มีสิทธิ์ออกบูธและรับบัตรใน Thai League 3</span>
                      </div>
                    )}
                  </div>

                  {/* Quota Progress & Metrics */}
                  <div className="space-y-2.5 pt-1">
                    {/* Booth Quota */}
                    <div className="space-y-1 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-300 font-medium flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-blue-400" />
                          <span>โควต้าออกบูธ:</span>
                        </span>
                        <span className="font-bold text-white text-xs">
                          <span className="text-blue-400">{quota.usedBoothMatches}</span> / {quota.quotaBoothMatches} ครั้ง
                        </span>
                      </div>

                      {/* Progress Bar Booth */}
                      <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
                        <div 
                          className={`h-full transition-all rounded-full ${
                            quota.isBoothLimitReached 
                              ? 'bg-rose-500' 
                              : quota.isBoothNearLimit 
                                ? 'bg-amber-400' 
                                : 'bg-blue-400'
                          }`}
                          style={{ width: `${quota.boothUsagePercent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-0.5">
                        <span className="text-slate-400">
                          {brand.allowedBoothLeagues.length < 3 
                            ? `(${brand.allowedBoothLeagues.map(l => `${LEAGUE_LABELS[l]?.short}: ${quota.usedBoothMatchesByLeague[l] || 0}`).join(' + ')} รวมกัน)`
                            : `T1: ${quota.usedBoothMatchesByLeague['League 1'] || 0} | T2: ${quota.usedBoothMatchesByLeague['League 2'] || 0} | T3: ${quota.usedBoothMatchesByLeague['League 3'] || 0}`}
                        </span>
                        <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                          quota.remainingBoothMatches === 0
                            ? 'bg-rose-900/50 text-rose-300 border border-rose-700'
                            : quota.remainingBoothMatches <= 2
                              ? 'bg-amber-900/50 text-amber-300 border border-amber-700'
                              : 'bg-blue-900/50 text-blue-300 border border-blue-700'
                        }`}>
                          เหลือ {quota.remainingBoothMatches} ครั้ง
                        </span>
                      </div>
                    </div>

                    {/* Ticket Quota */}
                    <div className="space-y-1 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-300 font-medium flex items-center gap-1.5">
                          <Ticket className="w-3.5 h-3.5 text-emerald-400" />
                          <span>โควต้ารับบัตร:</span>
                        </span>
                        <span className="font-bold text-white text-xs">
                          <span className="text-emerald-400">{quota.usedTicketMatches}</span> / {quota.quotaTicketMatches} ครั้ง
                        </span>
                      </div>

                      {/* Progress Bar Ticket */}
                      <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
                        <div 
                          className={`h-full transition-all rounded-full ${
                            quota.isLimitReached 
                              ? 'bg-rose-500' 
                              : quota.isNearLimit 
                                ? 'bg-amber-400' 
                                : 'bg-emerald-400'
                          }`}
                          style={{ width: `${quota.ticketUsagePercent}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] pt-0.5">
                        <span className="text-slate-400">
                          ขอไปแล้ว {quota.usedTotalTickets} ใบ จากโควต้า {quota.quotaTotalTickets} ใบ
                        </span>
                        <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                          quota.remainingTicketMatches === 0
                            ? 'bg-rose-900/50 text-rose-300 border border-rose-700'
                            : quota.remainingTicketMatches <= 3
                              ? 'bg-amber-900/50 text-amber-300 border border-amber-700'
                              : 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
                        }`}>
                          เหลือ {quota.remainingTicketMatches} ครั้ง
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Quick Note */}
                <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="font-medium text-slate-300">เพดาน: {formatMaxTicketsPerMatch(brand)}</span>
                  <button
                    type="button"
                    onClick={() => handleStartEdit(brand)}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>ปรับโควต้า & สิทธิ์</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: ADD NEW BRAND FORM */}
      {/* ========================================================================= */}
      {isAddingBrand && (
        <form onSubmit={handleCreateBrand} className="bg-white rounded-3xl p-6 border border-blue-200 shadow-sm space-y-5 animate-fadeIn">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">เพิ่มแบรนด์ผู้สนับสนุนใหม่ พร้อมกำหนดสิทธิ์และโควต้า</h3>
              <p className="text-xs text-slate-500">กรอกข้อมูลพื้นฐาน สิทธิ์การออกบูธ-รับบัตรในแต่ละลีก และโควต้าทั้งฤดูกาล</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                รหัส / ชื่อย่อแบรนด์ (ID) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newBrandId}
                onChange={e => setNewBrandId(e.target.value)}
                placeholder="เช่น TOYOTA, CP, AIRASIA"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 font-semibold"
                required
              />
              <span className="text-[10px] text-slate-400 mt-1 block">ใช้เป็นคีย์อ้างอิงในระบบ</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ชื่อทางการของแบรนด์ <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newBrandName}
                onChange={e => setNewBrandName(e.target.value)}
                placeholder="เช่น Toyota Motor Thailand หรือ โตโยต้า"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500"
                required
              />
              <span className="text-[10px] text-slate-400 mt-1 block">ชื่อที่จะแสดงในเมนูและใบสรุป</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ข้อความบนป้ายย่อ (Badge Text)
              </label>
              <input
                type="text"
                value={newBrandLogoText}
                onChange={e => setNewBrandLogoText(e.target.value)}
                placeholder="เช่น TOYOTA (ย่อ 4-6 ตัวอักษร)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Color Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              เลือกโทนสีประจำแบรนด์:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {COLOR_OPTIONS.map((c, idx) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedColorIndex(idx)}
                  className={`flex items-center gap-2 p-2 rounded-xl border text-left text-xs transition-all ${
                    selectedColorIndex === idx 
                      ? 'border-slate-900 bg-slate-50 ring-2 ring-slate-900/10 font-bold' 
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
                  <span className="truncate text-[11px]">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* League Permissions Checkboxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-blue-600" />
                <span>สิทธิ์ในการขอออกบูธ (Booth Rights by League):</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {ALL_LEAGUES.map(league => {
                  const isChecked = newAllowedBoothLeagues.includes(league);
                  return (
                    <label 
                      key={league}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                        isChecked 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-xs' 
                          : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleNewLeague('booth', league)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>{LEAGUE_LABELS[league].full} ({LEAGUE_LABELS[league].short})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5 text-emerald-600" />
                <span>สิทธิ์ในการขอรับบัตร (Ticket Rights by League):</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {ALL_LEAGUES.map(league => {
                  const isChecked = newAllowedTicketLeagues.includes(league);
                  return (
                    <label 
                      key={league}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                        isChecked 
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs' 
                          : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleNewLeague('ticket', league)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{LEAGUE_LABELS[league].full} ({LEAGUE_LABELS[league].short})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quota Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl bg-amber-50/50 border border-amber-200">
            <div>
              <label className="block text-xs font-bold text-blue-900 mb-1 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-blue-600" />
                <span>โควต้าออกบูธทั้งฤดูกาล (ครั้ง) <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={newSeasonBoothQuotaMatches}
                onChange={e => setNewSeasonBoothQuotaMatches(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-blue-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                required
              />
              <span className="text-[10px] text-blue-700 mt-1 block">เช่น Castrol 15 ครั้ง (รวม T1+T2)</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5 text-amber-600" />
                <span>โควต้ารับบัตรทั้งฤดูกาล (ครั้ง) <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={newSeasonTicketQuotaMatches}
                onChange={e => setNewSeasonTicketQuotaMatches(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-amber-300 text-xs bg-white focus:ring-2 focus:ring-amber-500 font-bold text-slate-800"
                required
              />
              <span className="text-[10px] text-amber-700 mt-1 block">เช่น 20 ครั้งต่อฤดูกาล</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-900 mb-1">
                โควต้าจำนวนบัตรรวมทั้งฤดูกาล (ใบ)
              </label>
              <input
                type="number"
                min={10}
                max={5000}
                value={newSeasonTicketQuotaTotalTickets}
                onChange={e => setNewSeasonTicketQuotaTotalTickets(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-amber-300 text-xs bg-white focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-[10px] text-amber-700 mt-1 block">เช่น 400 ใบรวมทั้งฤดูกาล</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-900 mb-1">
                เพดานรับบัตรต่อครั้ง (ใบ/แมตช์)
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={newMaxTicketsPerMatch}
                onChange={e => setNewMaxTicketsPerMatch(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-amber-300 text-xs bg-white focus:ring-2 focus:ring-amber-500 font-bold text-slate-800"
              />
              <span className="text-[10px] text-amber-700 mt-1 block">ค่ามาตรฐาน เช่น 50 ใบ/แมตช์</span>
            </div>

            {/* Per-League Ticket Quota Controls */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-4 bg-white/95 p-3.5 rounded-xl border border-amber-200 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                    <Sliders className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      กำหนดเพดานรับบัตรแยกตามลีก (T1, T2, T3)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      เช่น ไทยลีก 1 กำหนด 50 ใบ/นัด, ไทยลีก 2 กำหนด 100 ใบ/นัด
                    </span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={newCustomLimitByLeague} 
                    onChange={(e) => setNewCustomLimitByLeague(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  <span className="ml-2 text-xs font-semibold text-slate-700">
                    {newCustomLimitByLeague ? 'เปิดใช้แยกตามลีก' : 'ใช้เพดานรวมเท่ากันทุกรายการ'}
                  </span>
                </label>
              </div>

              {newCustomLimitByLeague && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-amber-100 animate-fadeIn">
                  {ALL_LEAGUES.map((league) => {
                    const isAllowed = newAllowedTicketLeagues.includes(league);
                    return (
                      <div key={league} className={`p-2.5 rounded-xl border ${isAllowed ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${LEAGUE_LABELS[league].badge}`}>
                              {LEAGUE_LABELS[league].short}
                            </span>
                            <span>{LEAGUE_LABELS[league].full}</span>
                          </span>
                          {!isAllowed && <span className="text-[9px] text-slate-400">(ไม่มีสิทธิ์)</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={500}
                            disabled={!isAllowed}
                            value={newMaxTicketsByLeague[league]}
                            onChange={(e) => setNewMaxTicketsByLeague({
                              ...newMaxTicketsByLeague,
                              [league]: Number(e.target.value) || 0
                            })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs bg-white font-bold text-slate-900 disabled:bg-slate-100"
                            placeholder="ใบ/นัด"
                          />
                          <span className="text-[11px] font-semibold text-slate-500 shrink-0">ใบ/นัด</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingBrand(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>บันทึกแบรนด์ใหม่</span>
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: BRANDS TABLE & PERMISSION SETTINGS */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-slate-700" />
            <span className="font-bold text-sm text-slate-900">การตั้งค่าสิทธิ์ออกบูธ-รับบัตร และโควต้าแต่ละแบรนด์</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
              {brands.length} แบรนด์
            </span>
          </div>
          <span className="text-xs text-slate-400">คลิกไอคอนดินสอเพื่อแก้ไขสิทธิ์ในแต่ละลีกและปรับโควต้า</span>
        </div>

        <div className="divide-y divide-slate-100">
          {brands.map((brand) => {
            const count = records.filter(r => r.brand === brand.id).length;
            const isEditing = editingBrandId === brand.id;
            const quota = calculateBrandQuota(brand, records, selectedSeason);
            const isCastrol = brand.id.toLowerCase() === 'castrol';

            if (isEditing) {
              return (
                <div key={brand.id} className="p-5 bg-blue-50/50 space-y-4 border-l-4 border-blue-600">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                      <Edit3 className="w-4 h-4 text-blue-600" />
                      <span>กำลังแก้ไขการตั้งค่าแบรนด์: {brand.id}</span>
                    </div>
                    <span className="text-[11px] text-blue-700 font-medium">บันทึกแล้วอัปเดตไปยังระบบทันที</span>
                  </div>

                  {/* Basic Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">ชื่อทางการ:</label>
                      <input
                        type="text"
                        value={editBrandName}
                        onChange={e => setEditBrandName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">ป้ายย่อ (Badge Text):</label>
                      <input
                        type="text"
                        value={editBrandLogoText}
                        onChange={e => setEditBrandLogoText(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">เลือกโทนสี:</label>
                      <select
                        value={editColorHex}
                        onChange={e => setEditColorHex(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white font-medium"
                      >
                        {COLOR_OPTIONS.map(c => (
                          <option key={c.id} value={c.hex}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* League Permissions Toggle */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-white border border-slate-200">
                    <div>
                      <label className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-blue-600" />
                        <span>สิทธิ์ขอออกบูธในแต่ละลีก:</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {ALL_LEAGUES.map(league => {
                          const isChecked = editAllowedBoothLeagues.includes(league);
                          return (
                            <button
                              key={league}
                              type="button"
                              onClick={() => toggleEditLeague('booth', league)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                isChecked 
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                                  : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              {isChecked ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              <span>{LEAGUE_LABELS[league].short} ({LEAGUE_LABELS[league].full})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                        <Ticket className="w-3.5 h-3.5 text-emerald-600" />
                        <span>สิทธิ์ขอรับบัตรในแต่ละลีก:</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {ALL_LEAGUES.map(league => {
                          const isChecked = editAllowedTicketLeagues.includes(league);
                          return (
                            <button
                              key={league}
                              type="button"
                              onClick={() => toggleEditLeague('ticket', league)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                isChecked 
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                                  : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              {isChecked ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              <span>{LEAGUE_LABELS[league].short} ({LEAGUE_LABELS[league].full})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Quota Settings */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
                    <div>
                      <label className="text-[11px] font-bold text-blue-900 block mb-1 flex items-center gap-1">
                        <Store className="w-3 h-3 text-blue-600" />
                        <span>โควต้าออกบูธ (จำนวนครั้ง):</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={editSeasonBoothQuotaMatches}
                        onChange={e => setEditSeasonBoothQuotaMatches(Number(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-lg border border-blue-300 text-xs bg-white font-bold text-blue-900"
                      />
                      <span className="text-[9px] text-blue-600 mt-0.5 block">เช่น Castrol รวม T1+T2 ได้ 15 ครั้ง</span>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-amber-900 block mb-1 flex items-center gap-1">
                        <Ticket className="w-3 h-3 text-amber-600" />
                        <span>โควต้ารับบัตร (จำนวนครั้ง):</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={editSeasonTicketQuotaMatches}
                        onChange={e => setEditSeasonTicketQuotaMatches(Number(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-lg border border-amber-300 text-xs bg-white font-bold text-amber-900"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-amber-900 block mb-1">
                        โควต้าบัตรรวมทั้งฤดูกาล (ใบ):
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={5000}
                        value={editSeasonTicketQuotaTotalTickets}
                        onChange={e => setEditSeasonTicketQuotaTotalTickets(Number(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-lg border border-amber-300 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-amber-900 block mb-1">
                        เพดานต่อครั้ง (ใบ/แมตช์):
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={editMaxTicketsPerMatch}
                        onChange={e => setEditMaxTicketsPerMatch(Number(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-lg border border-amber-300 text-xs bg-white font-bold text-slate-800"
                      />
                      <span className="text-[9px] text-amber-700 mt-0.5 block">ค่ามาตรฐาน</span>
                    </div>

                    {/* Per-League Ticket Quota Controls */}
                    <div className="col-span-1 sm:col-span-2 lg:col-span-4 bg-white/95 p-3 rounded-xl border border-amber-200 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center text-amber-700">
                            <Sliders className="w-3 h-3" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">
                              กำหนดเพดานรับบัตรแยกตามลีก (T1, T2, T3)
                            </span>
                            <span className="text-[10px] text-slate-500">
                              เช่น T1 กำหนด 50 ใบ/นัด, T2 กำหนด 100 ใบ/นัด
                            </span>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={editCustomLimitByLeague} 
                            onChange={(e) => setEditCustomLimitByLeague(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                          <span className="ml-2 text-xs font-semibold text-slate-700">
                            {editCustomLimitByLeague ? 'เปิดใช้แยกตามลีก' : 'ใช้เพดานรวมเท่ากันทุกรายการ'}
                          </span>
                        </label>
                      </div>

                      {editCustomLimitByLeague && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5 pt-2.5 border-t border-amber-100 animate-fadeIn">
                          {ALL_LEAGUES.map((league) => {
                            const isAllowed = editAllowedTicketLeagues.includes(league);
                            return (
                              <div key={league} className={`p-2 rounded-xl border ${isAllowed ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${LEAGUE_LABELS[league].badge}`}>
                                      {LEAGUE_LABELS[league].short}
                                    </span>
                                    <span>{LEAGUE_LABELS[league].full}</span>
                                  </span>
                                  {!isAllowed && <span className="text-[9px] text-slate-400">(ไม่มีสิทธิ์)</span>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={1}
                                    max={500}
                                    disabled={!isAllowed}
                                    value={editMaxTicketsByLeague[league]}
                                    onChange={(e) => setEditMaxTicketsByLeague({
                                      ...editMaxTicketsByLeague,
                                      [league]: Number(e.target.value) || 0
                                    })}
                                    className="w-full px-2.5 py-1 rounded-lg border border-amber-300 text-xs bg-white font-bold text-slate-900 disabled:bg-slate-100"
                                    placeholder="ใบ/นัด"
                                  />
                                  <span className="text-[10px] font-semibold text-slate-500 shrink-0">ใบ/นัด</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingBrandId(null)}
                      className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(brand.id)}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>บันทึกการแก้ไข</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={brand.id} className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors">
                {/* Brand Identity */}
                <div className="flex items-center gap-3.5">
                  <div 
                    className="w-10 h-10 rounded-2xl flex items-center justify-center font-extrabold text-xs shadow-xs text-white shrink-0"
                    style={{ backgroundColor: brand.color }}
                  >
                    {brand.logoText.slice(0, 3)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{brand.id}</span>
                      <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold border ${brand.badgeClass}`}>
                        {brand.logoText}
                      </span>
                      {brand.isCustom && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-medium">
                          กำหนดเอง
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {brand.name}
                    </p>
                  </div>
                </div>

                {/* League Permissions Display */}
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  {/* Booth Rights */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-[11px]">ออกบูธ:</span>
                    <div className="flex items-center gap-1">
                      {ALL_LEAGUES.map(league => {
                        const allowed = brand.allowedBoothLeagues.includes(league);
                        return (
                          <span 
                            key={league}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              allowed 
                                ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                : 'bg-slate-100 text-slate-400 line-through border border-slate-200'
                            }`}
                            title={allowed ? `มีสิทธิ์ออกบูธใน ${league}` : `ไม่มีสิทธิ์ออกบูธใน ${league}`}
                          >
                            {LEAGUE_LABELS[league].short}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Ticket Rights */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-[11px]">รับบัตร:</span>
                    <div className="flex items-center gap-1">
                      {ALL_LEAGUES.map(league => {
                        const allowed = brand.allowedTicketLeagues.includes(league);
                        return (
                          <span 
                            key={league}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              allowed 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-slate-100 text-slate-400 line-through border border-slate-200'
                            }`}
                            title={allowed ? `มีสิทธิ์รับบัตรใน ${league}` : `ไม่มีสิทธิ์รับบัตรใน ${league}`}
                          >
                            {LEAGUE_LABELS[league].short}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quota Status */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="bg-blue-50/80 px-2.5 py-1.5 rounded-xl border border-blue-200 text-[11px] flex items-center gap-1.5">
                      <span className="text-blue-700 font-semibold flex items-center gap-1">
                        <Store className="w-3 h-3 text-blue-600" />
                        <span>บูธ:</span>
                      </span>
                      <span className="font-bold text-slate-900">{quota.quotaBoothMatches} ครั้ง</span>
                      <span className="text-slate-500">
                        (ใช้ <strong className="text-blue-700">{quota.usedBoothMatches}</strong>, เหลือ <strong className="text-blue-900">{quota.remainingBoothMatches}</strong>)
                      </span>
                    </div>

                    <div className={`px-2.5 py-1.5 rounded-xl border text-[11px] flex flex-wrap items-center gap-1.5 ${
                      quota.hasExcessTickets 
                        ? 'bg-rose-50 border-rose-300 text-rose-900' 
                        : quota.usedTotalTickets >= quota.quotaTotalTickets * 0.8
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : 'bg-emerald-50/80 border-emerald-200 text-slate-800'
                    }`}>
                      <span className={`font-semibold flex items-center gap-1 ${quota.hasExcessTickets ? 'text-rose-700' : 'text-emerald-700'}`}>
                        <Ticket className="w-3 h-3" />
                        <span>บัตร:</span>
                      </span>
                      <strong className="text-slate-900">{quota.usedTotalTickets} / {quota.quotaTotalTickets} ใบ</strong>
                      <span className="text-slate-400 text-[10px]">({quota.usedTicketMatches}/{quota.quotaTicketMatches} นัด)</span>
                      {quota.hasExcessTickets ? (
                        <span className="px-1.5 py-0.2 rounded bg-rose-200 text-rose-900 font-bold text-[10px] flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5 text-rose-700" />
                          <span>เกิน +{quota.excessTotalTickets} ใบ (ซื้อเพิ่ม)</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">
                          (เหลือ <strong className="text-emerald-900">{quota.remainingTotalTickets}</strong> ใบ)
                        </span>
                      )}
                    </div>

                    <div className="bg-amber-50/80 px-2.5 py-1.5 rounded-xl border border-amber-200 text-[11px] flex items-center gap-1.5">
                      <span className="text-amber-800 font-semibold">เพดาน:</span>
                      <span className="font-bold text-amber-950">{formatMaxTicketsPerMatch(brand)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyClientSummary(brand, quota)}
                    className="p-2 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                    title="คัดลอกข้อความสรุปส่งลูกค้า"
                  >
                    {copiedBrandId === brand.id ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartEdit(brand)}
                    className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="แก้ไขสิทธิ์และโควต้าแบรนด์"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBrand(brand)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="ลบแบรนด์ออกจากระบบ"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
