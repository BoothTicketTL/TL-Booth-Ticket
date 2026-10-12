import React, { useState, useEffect } from 'react';
import { 
  X, 
  PhoneCall, 
  Save, 
  RotateCcw, 
  AlertCircle, 
  CheckCircle2, 
  FileSpreadsheet,
  Building,
  Ticket,
  MapPin,
  Calendar,
  Clock,
  User,
  Phone
} from 'lucide-react';
import { FixtureItem, UserProfile } from '../types';
import { 
  StadiumContactLookupResult, 
  saveMatchContactOverride, 
  deleteMatchContactOverride,
  formatPhoneNumber
} from '../lib/stadiumContactsService';

interface EditMatchContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: FixtureItem | null;
  currentContact: StadiumContactLookupResult | null;
  currentUser: UserProfile | null;
  onSuccess: (message: string) => void;
}

export const EditMatchContactModal: React.FC<EditMatchContactModalProps> = ({
  isOpen,
  onClose,
  match,
  currentContact,
  currentUser,
  onSuccess,
}) => {
  const [boothName, setBoothName] = useState('');
  const [boothPhone, setBoothPhone] = useState('');
  const [ticketName, setTicketName] = useState('');
  const [ticketPhone, setTicketPhone] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Initialize form state when match or currentContact changes
  useEffect(() => {
    if (currentContact) {
      setBoothName(currentContact.boothCoordinatorName || '');
      setBoothPhone(currentContact.boothCoordinatorPhone || '');
      setTicketName(currentContact.ticketCoordinatorName || '');
      setTicketPhone(currentContact.ticketCoordinatorPhone || '');
      setPickupLocation(currentContact.ticketPickupLocation || currentContact.remark || '');
    }
  }, [currentContact, isOpen]);

  if (!isOpen || !match || !currentContact) return null;

  const isCurrentlyOverridden = Boolean(currentContact.isOverridden);

  // Fill form with original Google Sheet values
  const handleCopyFromSheet = () => {
    setBoothName(currentContact.sheetBoothCoordinatorName || '');
    setBoothPhone(currentContact.sheetBoothCoordinatorPhone || '');
    setTicketName(currentContact.sheetTicketCoordinatorName || '');
    setTicketPhone(currentContact.sheetTicketCoordinatorPhone || '');
    setPickupLocation(currentContact.sheetRemark || '');
  };

  // Save temporary override
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const now = new Date();
      const thaiTime = now.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      await saveMatchContactOverride({
        id: match.id,
        fixtureId: match.id,
        matchDate: match.matchDate,
        league: match.league,
        homeClub: match.homeTeam,
        awayTeam: match.awayTeam,
        stadiumName: match.stadium,
        boothCoordinatorName: boothName.trim(),
        boothCoordinatorPhone: formatPhoneNumber(boothPhone.trim()),
        ticketCoordinatorName: ticketName.trim(),
        ticketCoordinatorPhone: formatPhoneNumber(ticketPhone.trim()),
        ticketPickupLocation: pickupLocation.trim(),
        remark: pickupLocation.trim(),
        updatedAt: `${thaiTime} น.`,
        updatedBy: currentUser?.displayName || currentUser?.email || 'Admin',
      });

      onSuccess(`✅ บันทึกเบอร์ติดต่อชั่วคราวสำหรับ ${match.homeTeam} vs ${match.awayTeam} เรียบร้อยแล้ว`);
      onClose();
    } catch (err: any) {
      alert(`บันทึกไม่สำเร็จ: ${err.message || 'เกิดข้อผิดพลาด'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset back to Google Sheet baseline
  const handleResetToSheet = async () => {
    if (!window.confirm(`ต้องการยกเลิกการแก้ไข และรีเซ็ตเบอร์ติดต่อของแมตช์นี้กลับไปใช้ข้อมูลหลักจาก Google Sheet ใช่หรือไม่?`)) {
      return;
    }
    setIsResetting(true);
    try {
      await deleteMatchContactOverride({
        fixtureId: match.id,
        matchDate: match.matchDate,
        homeClub: match.homeTeam,
      });

      onSuccess(`🔄 รีเซ็ตเบอร์ติดต่อของแมตช์ ${match.homeTeam} vs ${match.awayTeam} กลับเป็นค่าจาก Google Sheet เรียบร้อยแล้ว`);
      onClose();
    } catch (err: any) {
      alert(`รีเซ็ตไม่สำเร็จ: ${err.message || 'เกิดข้อผิดพลาด'}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div 
        className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-3 bg-gradient-to-r from-slate-50 to-white">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-rose-100 text-[#ff0033] flex items-center justify-center shrink-0">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  แก้ไขเบอร์ติดต่อหน้าสนาม (ชั่วคราว)
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  เฉพาะแมตช์: <span className="font-bold text-slate-800">{match.homeTeam}</span> vs <span className="font-bold text-slate-800">{match.awayTeam}</span>
                </p>
              </div>
            </div>
            
            {/* Match Context Badges */}
            <div className="flex items-center gap-2 pt-1 flex-wrap text-[11px]">
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500" />
                <span>{match.matchDate}</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>{match.matchTime || '18:00'} น.</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-500" />
                <span>{match.stadium}</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-rose-50 text-[#ff0033] font-bold border border-rose-200">
                {match.league}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Notice Banner: Google Sheet Priority */}
          <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-black text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>หลักการทำงาน: เบื้องต้นยึดข้อมูลจาก Google Sheet เป็นหลัก</span>
            </div>
            <p className="text-amber-800 leading-relaxed text-[11px]">
              หากในวันแข่งขันจริง เบอร์ติดต่อหน้าสนามมีการเปลี่ยนแปลงชั่วคราว สามารถพิมพ์แก้ไขที่นี่ได้ทันที 
              และเมื่อต้องการกลับไปใช้เบอร์เดิม สามารถกดปุ่ม <strong>"รีเซ็ตเป็นค่าจาก Google Sheet"</strong> ได้ทุกเมื่อ
            </p>
          </div>

          {/* Current Status Indicator */}
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-slate-600 font-medium">
                สถานะข้อมูลปัจจุบัน:
              </span>
              {isCurrentlyOverridden ? (
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-black border border-amber-300">
                  📝 แก้ไขชั่วคราว ({currentContact.overriddenAt || '-'} โดย {currentContact.overriddenBy || 'Admin'})
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black border border-emerald-300">
                  📊 ใช้ข้อมูลมาตรฐานจาก Google Sheet
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleCopyFromSheet}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
              title="ดึงค่าจาก Google Sheet มาใส่ในช่องฟอร์ม"
            >
              <span>📋 เติมค่าจาก Google Sheet</span>
            </button>
          </div>

          {/* Section 1: Booth Contact */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3.5 shadow-2xs">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Building className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-slate-900">
                  1. ผู้ประสานงานออกบูธหน้าสนาม (Booth Coordinator)
                </h4>
                <p className="text-[11px] text-slate-500">
                  สำหรับแบรนด์ที่ส่งคำขอออกบูธในแมตช์นี้
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  <span>ชื่อผู้ประสานงานออกบูธ</span>
                </label>
                <input
                  type="text"
                  value={boothName}
                  onChange={(e) => setBoothName(e.target.value)}
                  placeholder="เช่น คุณสมชาย"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-medium bg-slate-50 focus:bg-white transition-all"
                />
                <p className="text-[10px] text-slate-400 mt-1 truncate" title={currentContact.sheetBoothCoordinatorName}>
                  ค่าจาก Sheet: <span className="font-semibold text-slate-600">{currentContact.sheetBoothCoordinatorName || '(ไม่มีข้อมูล)'}</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>เบอร์โทรติดต่อออกบูธ</span>
                </label>
                <input
                  type="tel"
                  value={boothPhone}
                  onChange={(e) => setBoothPhone(e.target.value)}
                  placeholder="เช่น 081-234-5678"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-medium bg-slate-50 focus:bg-white transition-all font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1 truncate" title={currentContact.sheetBoothCoordinatorPhone}>
                  ค่าจาก Sheet: <span className="font-semibold text-slate-600">{currentContact.sheetBoothCoordinatorPhone || '(ไม่มีข้อมูล)'}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Ticket Contact */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3.5 shadow-2xs">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Ticket className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-slate-900">
                  2. ผู้ประสานงานรับบัตรหน้าสนาม (Ticket Coordinator)
                </h4>
                <p className="text-[11px] text-slate-500">
                  สำหรับแบรนด์ที่ส่งคำขอรับบัตรในแมตช์นี้
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  <span>ชื่อผู้ประสานงานรับบัตร</span>
                </label>
                <input
                  type="text"
                  value={ticketName}
                  onChange={(e) => setTicketName(e.target.value)}
                  placeholder="เช่น คุณวิภา"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-medium bg-slate-50 focus:bg-white transition-all"
                />
                <p className="text-[10px] text-slate-400 mt-1 truncate" title={currentContact.sheetTicketCoordinatorName}>
                  ค่าจาก Sheet: <span className="font-semibold text-slate-600">{currentContact.sheetTicketCoordinatorName || '(ไม่มีข้อมูล)'}</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>เบอร์โทรติดต่อรับบัตร</span>
                </label>
                <input
                  type="tel"
                  value={ticketPhone}
                  onChange={(e) => setTicketPhone(e.target.value)}
                  placeholder="เช่น 089-876-5432"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-medium bg-slate-50 focus:bg-white transition-all font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1 truncate" title={currentContact.sheetTicketCoordinatorPhone}>
                  ค่าจาก Sheet: <span className="font-semibold text-slate-600">{currentContact.sheetTicketCoordinatorPhone || '(ไม่มีข้อมูล)'}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Ticket Pickup Location / Remark */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3.5 shadow-2xs">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-slate-900">
                  3. จุดรับบัตร / หมายเหตุ (Pickup Location & Remark)
                </h4>
                <p className="text-[11px] text-slate-500">
                  สถานที่หรือจุดนัดรับบัตรหน้าสนาม
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                รายละเอียดจุดรับบัตร / หมายเหตุ
              </label>
              <input
                type="text"
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                placeholder="เช่น จุดรับบัตรหน้าห้องแถลงข่าว ชั้น 1, ประตู 1 ก่อนเวลาแข่ง 1 ชม."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-medium bg-slate-50 focus:bg-white transition-all"
              />
              <p className="text-[10px] text-slate-400 mt-1 truncate" title={currentContact.sheetRemark}>
                ค่าจาก Sheet: <span className="font-semibold text-slate-600">{currentContact.sheetRemark || '(ไม่มีข้อมูล)'}</span>
              </p>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div>
            {isCurrentlyOverridden && (
              <button
                type="button"
                onClick={handleResetToSheet}
                disabled={isResetting || isSaving}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>รีเซ็ตกลับเป็นค่าจาก Google Sheet</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isResetting}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isResetting}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs shadow-md transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5 text-amber-300" />
              <span>{isSaving ? 'กำลังบันทึก...' : '💾 บันทึกการแก้ไข (มีผลทันที)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
