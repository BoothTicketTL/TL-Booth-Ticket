import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Search, 
  Save, 
  Check, 
  Phone, 
  Ticket, 
  FileText, 
  Building2, 
  ShieldAlert, 
  Plus, 
  Trash2, 
  AlertCircle,
  Sparkles,
  BookOpen,
  MapPin,
  Lock,
  RefreshCw,
  Download,
  Upload,
  Link as LinkIcon,
  Loader2,
  FileSpreadsheet
} from 'lucide-react';
import { LeagueType, UserProfile } from '../types';
import { 
  ClubPhonebookEntry, 
  getMasterClubPhonebook, 
  saveClubPhonebookEntry, 
  saveAllClubPhonebookEntries, 
  addClubPhonebookEntry, 
  deleteClubPhonebookEntry,
  changeClubLeague,
  subscribeToClubPhonebook,
  syncClubPhonebookFromGoogleSheet,
  importClubsFromCsvText
} from '../lib/clubPhonebookService';
import {
  getStadiumContactsSheetUrl,
  setStadiumContactsSheetUrl
} from '../lib/stadiumContactsService';

interface AdminClubPhonebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
  onRequireAdminLogin?: () => void;
  defaultLeague?: LeagueType;
}

export const AdminClubPhonebookModal: React.FC<AdminClubPhonebookModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRequireAdminLogin,
  defaultLeague = 'League 1',
}) => {
  const isUserAdmin = currentUser?.role === 'admin';

  const [activeLeague, setActiveLeague] = useState<LeagueType>(defaultLeague);
  const [clubs, setClubs] = useState<ClubPhonebookEntry[]>(getMasterClubPhonebook());
  const [searchQuery, setSearchQuery] = useState('');
  
  // Google Sheet Sync state for "เบอร์ติดต่อหน้าสนาม"
  const [sheetUrl, setSheetUrl] = useState<string>(() => getStadiumContactsSheetUrl());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // CSV Import Modal state
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvInputText, setCsvInputText] = useState('');
  const [csvTargetLeague, setCsvTargetLeague] = useState<LeagueType>(defaultLeague);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local edit state per club (key: club.id)
  const [editForms, setEditForms] = useState<Record<string, {
    boothContact: string;
    ticketContact: string;
    remark: string;
    clubName: string;
    stadiumName: string;
    province: string;
  }>>({});

  const [savedClubIds, setSavedClubIds] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // In-app delete confirmation state (prevents iframe alert/confirm issues)
  const [clubToDelete, setClubToDelete] = useState<ClubPhonebookEntry | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  // New club inline modal state
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newStadiumName, setNewStadiumName] = useState('');
  const [newProvince, setNewProvince] = useState('');
  const [newBoothContact, setNewBoothContact] = useState('');
  const [newTicketContact, setNewTicketContact] = useState('');
  const [newRemark, setNewRemark] = useState('');

  // Sync clubs from service
  // Sync clubs and initialize editForms when modal is opened
  useEffect(() => {
    if (!isOpen) return;

    setSheetUrl(getStadiumContactsSheetUrl());
    const initial = getMasterClubPhonebook();
    setClubs(initial);

    // Initialize edit forms when modal opens
    const map: Record<string, any> = {};
    initial.forEach(c => {
      map[c.id] = {
        boothContact: c.boothContact || '',
        ticketContact: c.ticketContact || '',
        remark: c.remark || '',
        clubName: c.clubName || '',
        stadiumName: c.stadiumName || '',
        province: c.province || '',
      };
    });
    setEditForms(map);

    const unsub = subscribeToClubPhonebook((list) => {
      setClubs(list);
      setEditForms(prev => {
        const next = { ...prev };
        list.forEach(c => {
          if (!next[c.id]) {
            next[c.id] = {
              boothContact: c.boothContact || '',
              ticketContact: c.ticketContact || '',
              remark: c.remark || '',
              clubName: c.clubName || '',
              stadiumName: c.stadiumName || '',
              province: c.province || '',
            };
          } else if (c.updatedBy?.includes('Google Sheet') || c.updatedBy?.includes('CSV')) {
            next[c.id] = {
              ...next[c.id],
              boothContact: c.boothContact || '',
              ticketContact: c.ticketContact || '',
              remark: c.remark || '',
              clubName: c.clubName || next[c.id].clubName,
              stadiumName: c.stadiumName || next[c.id].stadiumName,
              province: c.province || next[c.id].province,
            };
          }
        });
        return next;
      });
    });

    return () => unsub();
  }, [isOpen]);

  // Filter clubs by league & search
  const filteredClubs = useMemo(() => {
    return clubs.filter(c => {
      if (c.league !== activeLeague) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        c.clubName?.toLowerCase().includes(q) ||
        c.stadiumName?.toLowerCase().includes(q) ||
        c.province?.toLowerCase().includes(q) ||
        c.boothContact?.toLowerCase().includes(q) ||
        c.ticketContact?.toLowerCase().includes(q)
      );
    });
  }, [clubs, activeLeague, searchQuery]);

  // Check if search matches clubs in other leagues
  const clubsInOtherLeagues = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return clubs.filter(c => {
      if (c.league === activeLeague) return false;
      return (
        c.clubName?.toLowerCase().includes(q) ||
        c.stadiumName?.toLowerCase().includes(q) ||
        c.province?.toLowerCase().includes(q) ||
        c.boothContact?.toLowerCase().includes(q) ||
        c.ticketContact?.toLowerCase().includes(q)
      );
    });
  }, [clubs, activeLeague, searchQuery]);

  // Counts per league
  const leagueCounts = useMemo(() => {
    return {
      'League 1': clubs.filter(c => c.league === 'League 1').length,
      'League 2': clubs.filter(c => c.league === 'League 2').length,
      'League 3': clubs.filter(c => c.league === 'League 3').length,
    };
  }, [clubs]);

  if (!isOpen) return null;

  // Non-admin permission block
  if (!isUserAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl border border-rose-100">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">พื้นที่เฉพาะผู้ดูแลระบบ (Admin Only)</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              เมนู <strong>"สมุดโทรศัพท์ประจำสโมสร"</strong> ถูกจำกัดสิทธิ์ไว้สำหรับ Admin เท่านั้น เพื่อความถูกต้องในการจัดการข้อมูลเบอร์ติดต่อออกบูธและรับบัตร
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            {onRequireAdminLogin ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequireAdminLogin();
                }}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>เข้าสู่ระบบด้วยบัญชี Admin</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle single club save
  const handleSaveSingleClub = (clubId: string) => {
    const club = clubs.find(c => c.id === clubId);
    const form = editForms[clubId] || {
      boothContact: club?.boothContact || '',
      ticketContact: club?.ticketContact || '',
      remark: club?.remark || '',
      clubName: club?.clubName || '',
      stadiumName: club?.stadiumName || '',
      province: club?.province || '',
    };

    const targetClubName = (form.clubName || club?.clubName || '').trim();

    const saved = saveClubPhonebookEntry({
      id: clubId,
      league: club?.league || activeLeague,
      clubName: targetClubName,
      stadiumName: (form.stadiumName || club?.stadiumName || '').trim(),
      province: (form.province || club?.province || '').trim(),
      boothContact: (form.boothContact || '').trim(),
      ticketContact: (form.ticketContact || '').trim(),
      remark: (form.remark || '').trim(),
    }, currentUser?.email || 'Admin');

    // Update editForms for this specific club with saved values
    setEditForms(prev => ({
      ...prev,
      [clubId]: {
        boothContact: saved.boothContact,
        ticketContact: saved.ticketContact,
        remark: saved.remark,
        clubName: saved.clubName,
        stadiumName: saved.stadiumName,
        province: saved.province,
      }
    }));

    setSavedClubIds(prev => ({ ...prev, [clubId]: true }));
    setTimeout(() => {
      setSavedClubIds(prev => ({ ...prev, [clubId]: false }));
    }, 2500);

    setToastMessage(`บันทึกข้อมูลสโมสร "${saved.clubName || targetClubName}" สำเร็จเรียบร้อย`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Handle save all in active league
  const handleSaveAllInLeague = () => {
    const toSave: ClubPhonebookEntry[] = filteredClubs.map(c => {
      const f = editForms[c.id];
      return {
        ...c,
        league: c.league || activeLeague,
        boothContact: f ? f.boothContact.trim() : (c.boothContact || '').trim(),
        ticketContact: f ? f.ticketContact.trim() : (c.ticketContact || '').trim(),
        remark: f ? f.remark.trim() : (c.remark || '').trim(),
        clubName: f ? f.clubName.trim() : c.clubName,
        stadiumName: f ? f.stadiumName.trim() : c.stadiumName,
        province: f ? f.province.trim() : c.province,
      };
    });

    saveAllClubPhonebookEntries(toSave, currentUser?.email || 'Admin');
    setToastMessage(`บันทึกข้อมูลสโมสรใน ${activeLeague} ทั้งหมด ${toSave.length} แห่งเรียบร้อยแล้ว`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Handle add new club
  const handleAddNewClub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClubName.trim()) {
      setAddError('กรุณากรอกชื่อสโมสร (ทีมเหย้า)');
      return;
    }
    setAddError(null);

    const created = addClubPhonebookEntry({
      league: activeLeague,
      clubName: newClubName.trim(),
      stadiumName: newStadiumName.trim() || undefined,
      province: newProvince.trim() || undefined,
      boothContact: newBoothContact.trim(),
      ticketContact: newTicketContact.trim(),
      remark: newRemark.trim(),
    }, currentUser?.email || 'Admin');

    // Immediately sync clubs and form dictionary
    const updatedClubs = getMasterClubPhonebook();
    setClubs(updatedClubs);
    setEditForms(prev => ({
      ...prev,
      [created.id]: {
        boothContact: created.boothContact || '',
        ticketContact: created.ticketContact || '',
        remark: created.remark || '',
        clubName: created.clubName || '',
        stadiumName: created.stadiumName || '',
        province: created.province || '',
      }
    }));

    // Clear search so the newly added club is visible in the list immediately
    setSearchQuery('');

    setNewClubName('');
    setNewStadiumName('');
    setNewProvince('');
    setNewBoothContact('');
    setNewTicketContact('');
    setNewRemark('');
    setIsAddingNew(false);

    setToastMessage(`เพิ่มสโมสร "${created.clubName}" ใน ${activeLeague} สำเร็จเรียบร้อยแล้ว`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Handle request delete club (opens in-app confirmation modal)
  const handleRequestDeleteClub = (club: ClubPhonebookEntry) => {
    setClubToDelete(club);
  };

  // Handle execute delete
  const handleConfirmDelete = () => {
    if (!clubToDelete) return;
    const { id, clubName, league } = clubToDelete;
    deleteClubPhonebookEntry(id, clubName, league);
    setClubs(prev => prev.filter(c => c.id !== id));
    setEditForms(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setToastMessage(`ลบสโมสร "${clubName}" ออกจาก ${league} เรียบร้อยแล้ว`);
    setClubToDelete(null);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Handle move league
  const handleMoveLeague = (club: ClubPhonebookEntry, targetLeague: LeagueType) => {
    if (club.league === targetLeague) return;
    changeClubLeague(club.id, targetLeague, currentUser?.email || 'Admin');
    setClubs(prev => prev.map(c => c.id === club.id ? { ...c, league: targetLeague } : c));
    setToastMessage(`ย้ายสโมสร "${club.clubName}" ไปยัง ${targetLeague} สำเร็จ`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Handle Sync from Google Sheet "เบอร์ติดต่อหน้าสนาม"
  // League 1 -> แท็บ League 1
  // League 2 -> แท็บ League 2
  // League 3 -> แท็บ League 3
  const handleSyncFromSheet = async (leagueTarget: 'all' | LeagueType = 'all') => {
    const targetUrl = sheetUrl.trim();
    if (!targetUrl) {
      setSyncError('กรุณากรอกลิงก์ Google Sheet "เบอร์ติดต่อหน้าสนาม"');
      setToastMessage('กรุณากรอกลิงก์ Google Sheet "เบอร์ติดต่อหน้าสนาม"');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    try {
      setIsSyncing(true);
      setSyncError(null);
      setSyncStatusMsg(
        leagueTarget === 'all'
          ? 'กำลังดึงข้อมูลคอลัมน์ [สโมสรทีมเหย้า], [ชื่อ+เบอร์ติดต่อสำหรับออกบูธ], [ชื่อ+เบอร์ติดต่อสำหรับรับบัตร], [Remark] จากชีต "เบอร์ติดต่อหน้าสนาม" (แท็บ League 1, League 2, League 3)...'
          : `กำลังดึงข้อมูล ${leagueTarget} จากชีต "เบอร์ติดต่อหน้าสนาม"...`
      );

      setStadiumContactsSheetUrl(targetUrl);

      const res = await syncClubPhonebookFromGoogleSheet(targetUrl, leagueTarget);

      if (res.success) {
        setSyncError(null);
        const latest = getMasterClubPhonebook();
        setClubs(latest);

        // Update editForms with newly synced values
        const newForms: Record<string, any> = {};
        latest.forEach(c => {
          newForms[c.id] = {
            boothContact: c.boothContact || '',
            ticketContact: c.ticketContact || '',
            remark: c.remark || '',
            clubName: c.clubName || '',
            stadiumName: c.stadiumName || '',
            province: c.province || '',
          };
        });
        setEditForms(newForms);

        setToastMessage(res.message);
        setTimeout(() => setToastMessage(null), 6000);
      } else {
        const errMsg = res.error || res.message;
        setSyncError(errMsg);
        setToastMessage(`เกิดข้อผิดพลาด: ${errMsg}`);
        setTimeout(() => setToastMessage(null), 8000);
      }
    } catch (err: any) {
      const errMsg = err.message || 'ไม่สามารถติดต่อ Google Sheet ได้';
      setSyncError(errMsg);
      setToastMessage(`เกิดข้อผิดพลาดในการดึงข้อมูล: ${errMsg}`);
      setTimeout(() => setToastMessage(null), 8000);
    } finally {
      setIsSyncing(false);
      setSyncStatusMsg(null);
    }
  };

  // Handle direct CSV import
  const handleImportCsv = () => {
    if (!csvInputText.trim()) return;
    const res = importClubsFromCsvText(csvInputText, csvTargetLeague, `CSV Import (${csvTargetLeague})`);
    if (res.success) {
      const latest = getMasterClubPhonebook();
      setClubs(latest);
      const newForms: Record<string, any> = {};
      latest.forEach(c => {
        newForms[c.id] = {
          boothContact: c.boothContact || '',
          ticketContact: c.ticketContact || '',
          remark: c.remark || '',
          clubName: c.clubName || '',
          stadiumName: c.stadiumName || '',
          province: c.province || '',
        };
      });
      setEditForms(newForms);
      setIsCsvModalOpen(false);
      setCsvInputText('');
      setToastMessage(`นำเข้าข้อมูลสโมสรใน ${csvTargetLeague} สำเร็จ ${res.count} รายการ`);
      setTimeout(() => setToastMessage(null), 4000);
    } else {
      setAddError(res.error || 'รูปแบบ CSV ไม่ถูกต้อง');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvInputText(text);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header Banner */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 border-b border-white/10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[11px] font-bold border border-emerald-400/30">
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>สมุดโทรศัพท์ประจำสโมสร (Admin Phonebook Directory)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              จัดการเบอร์ติดต่อประจำสโมสร (แยกตามลีก)
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              ดึงข้อมูลจาก Google Sheet ชื่อ <strong>"เบอร์ติดต่อหน้าสนาม"</strong> หรือบันทึกเบอร์ติดต่อออกบูธ, เบอร์ติดต่อรับบัตร และ Remark โดยระบบจะ<strong>จดจำเบอร์ที่กรอก/ซิงค์นี้เป็นข้อมูลหลัก</strong>ในการแสดงผลบนเว็บไซต์โดยอัตโนมัติ
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={handleSaveAllInLeague}
              className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              title="บันทึกข้อมูลทั้งหมดในลีกที่เลือก"
            >
              <Save className="w-4 h-4 text-slate-950" />
              <span>บันทึกทั้งหมดในลีกนี้</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* GOOGLE SHEETS "เบอร์ติดต่อหน้าสนาม" SYNC CONTROL BAR */}
        <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-700/80 text-white shrink-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            
            {/* Input area */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                  <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                  ดึงจาก Google Sheet: "เบอร์ติดต่อหน้าสนาม"
                </span>
                <span className="text-[11px] text-slate-300">
                  (รองรับทั้งแบบแยกแท็บ <strong>League 1, League 2, League 3</strong> หรือรวมในแผ่นงานเดียว)
                </span>
              </div>

              {/* Exact Column Detection Requirements */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[10px]">
                <span className="text-slate-400 font-semibold">ตรวจจับ 4 คอลัมน์หลัก:</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 border border-emerald-500/30 font-mono font-bold">สโมสรทีมเหย้า</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-teal-300 border border-teal-500/30 font-mono font-bold">ชื่อ+เบอร์ติดต่อสำหรับออกบูธ</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-cyan-500/30 font-mono font-bold">ชื่อ+เบอร์ติดต่อสำหรับรับบัตร</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-amber-500/30 font-mono font-bold">Remark</span>
                <span className="text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded border border-rose-500/30 font-medium">ห้ามสร้าง mock data ทุกกรณี</span>
              </div>

              <div className="relative pt-1">
                <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-3.5 text-slate-400" />
                <input
                  type="text"
                  value={sheetUrl}
                  onChange={(e) => {
                    setSheetUrl(e.target.value);
                    if (syncError) setSyncError(null);
                  }}
                  placeholder="วางลิงก์ Google Sheet ชื่อ เบอร์ติดต่อหน้าสนาม (เช่น https://docs.google.com/spreadsheets/d/...)"
                  className="w-full pl-8 pr-24 py-1.5 text-xs rounded-xl border border-slate-700 bg-slate-800/90 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    setStadiumContactsSheetUrl(sheetUrl.trim());
                    setToastMessage('บันทึกลิงก์ Google Sheet เรียบร้อยแล้ว');
                    setTimeout(() => setToastMessage(null), 2500);
                  }}
                  className="absolute right-1 top-2 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-200 font-bold transition-colors cursor-pointer"
                >
                  บันทึกลิงก์
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => handleSyncFromSheet('all')}
                disabled={isSyncing}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                title="ดึงข้อมูลจากแท็บ League 1, League 2, League 3 พร้อมกัน"
              >
                {isSyncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-slate-950" />
                )}
                <span>ดึงจากชีต (League 1 - 3)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSyncFromSheet(activeLeague)}
                disabled={isSyncing}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 text-slate-200 hover:text-white font-bold text-xs border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                title={`ดึงเฉพาะแท็บ ${activeLeague}`}
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>ดึงเฉพาะ {activeLeague}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCsvTargetLeague(activeLeague);
                  setIsCsvModalOpen(true);
                }}
                className="px-2.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                title="วางหรืออัปโหลด CSV โดยตรง (กรณีลิงก์ติดสิทธิ์)"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>วาง CSV</span>
              </button>
            </div>
          </div>

          {/* Sync in-progress banner */}
          {syncStatusMsg && (
            <div className="mt-2 text-[11px] text-emerald-300 flex items-center gap-2 animate-pulse bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/30">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
              <span>{syncStatusMsg}</span>
            </div>
          )}

          {/* Explicit Error Banner: shown when sync fails */}
          {syncError && (
            <div className="mt-2 p-3 rounded-xl bg-rose-950/90 border-2 border-rose-500 text-rose-100 text-xs flex items-start justify-between gap-3 animate-fade-in shadow-lg">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-black text-rose-300 text-xs">
                    ข้อผิดพลาดในการดึงข้อมูลจากชีต "เบอร์ติดต่อหน้าสนาม"
                  </div>
                  <div className="text-[11px] leading-relaxed text-rose-100">
                    {syncError}
                  </div>
                  <div className="text-[10px] text-rose-300/80">
                    *ระบบไม่มีการสร้าง mock data หรือข้อมูลสมมุติใดๆ กรุณาตรวจสอบสิทธิ์แชร์ชีต หรือใช้ปุ่ม <strong>"วาง CSV"</strong> แทน
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSyncError(null)}
                className="p-1 rounded-md text-rose-400 hover:text-white hover:bg-rose-900 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* League Selector Tabs (League 1 - 3) */}
        <div className="px-5 pt-4 pb-2 bg-slate-50 border-b border-slate-200 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/80 rounded-2xl">
            {(['League 1', 'League 2', 'League 3'] as LeagueType[]).map((league) => {
              const isCurrent = activeLeague === league;
              const count = leagueCounts[league];
              return (
                <button
                  key={league}
                  type="button"
                  onClick={() => setActiveLeague(league)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                    isCurrent
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <span>
                    {league === 'League 1' ? '🏆 Thai League 1' : league === 'League 2' ? '🥈 Thai League 2' : '🥉 Thai League 3'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isCurrent ? 'bg-emerald-400 text-slate-950' : 'bg-slate-300 text-slate-700'
                  }`}>
                    {count} สโมสร
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อสโมสร หรือ สนาม..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 font-medium"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsAddingNew(true)}
              className="px-3.5 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ เพิ่มสโมสร</span>
            </button>
          </div>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="mx-5 mt-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between shadow-xs animate-fade-in shrink-0">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-emerald-700 hover:text-emerald-950 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Add New Club Form (Collapsible) */}
        {isAddingNew && (
          <form onSubmit={handleAddNewClub} className="m-5 p-4 rounded-2xl bg-teal-50/80 border-2 border-teal-300 space-y-3 shrink-0 animate-fade-in">
            <div className="flex items-center justify-between border-b border-teal-200 pb-2">
              <h4 className="text-xs font-black text-teal-950 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-teal-700" />
                <span>เพิ่มสโมสรใหม่ใน {activeLeague}</span>
              </h4>
              <button
                type="button"
                onClick={() => {
                  setIsAddingNew(false);
                  setAddError(null);
                }}
                className="text-teal-700 hover:text-teal-950 text-xs"
              >
                ยกเลิก
              </button>
            </div>

            {addError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">ชื่อสโมสร (ทีมเหย้า)*</label>
                <input
                  type="text"
                  required
                  value={newClubName}
                  onChange={e => setNewClubName(e.target.value)}
                  placeholder="เช่น บุรีรัมย์ ยูไนเต็ด"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-teal-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">ชื่อสนามแข่งขัน</label>
                <input
                  type="text"
                  value={newStadiumName}
                  onChange={e => setNewStadiumName(e.target.value)}
                  placeholder="เช่น ช้าง อารีนา"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-teal-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">จังหวัด</label>
                <input
                  type="text"
                  value={newProvince}
                  onChange={e => setNewProvince(e.target.value)}
                  placeholder="เช่น จ.บุรีรัมย์"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-teal-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">เบอร์ติดต่อสำหรับออกบูธ</label>
                <input
                  type="text"
                  value={newBoothContact}
                  onChange={e => setNewBoothContact(e.target.value)}
                  placeholder="เช่น คุณใหม่ 096-206-0446"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-teal-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">เบอร์ติดต่อสำหรับรับบัตร</label>
                <input
                  type="text"
                  value={newTicketContact}
                  onChange={e => setNewTicketContact(e.target.value)}
                  placeholder="เช่น คุณใหม่ 096-206-0446"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-teal-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Remark (หมายเหตุ/จุดรับบัตร)</label>
                <input
                  type="text"
                  value={newRemark}
                  onChange={e => setNewRemark(e.target.value)}
                  placeholder="เช่น รับบัตรได้ที่ห้องขายตั๋ว"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-teal-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-teal-800 text-white text-xs font-black hover:bg-teal-700 shadow-xs"
              >
                บันทึกสโมสรใหม่
              </button>
            </div>
          </form>
        )}

        {/* Club List Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {filteredClubs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <Building2 className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold">ไม่พบรายชื่อสโมสรใน {activeLeague}</p>
              
              {clubsInOtherLeagues.length > 0 ? (
                <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 max-w-md mx-auto space-y-2 text-left">
                  <p className="text-xs font-bold text-teal-900">
                    💡 พบ "{searchQuery}" ในลีกอื่น ({clubsInOtherLeagues.length} สโมสร):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {clubsInOtherLeagues.map(oc => (
                      <button
                        key={oc.id}
                        type="button"
                        onClick={() => setActiveLeague(oc.league)}
                        className="px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>{oc.clubName}</span>
                        <span className="text-[10px] bg-teal-900/60 px-1.5 py-0.5 rounded-md">
                          สลับไปดู {oc.league} →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">คุณสามารถคลิกปุ่ม "+ เพิ่มสโมสร" ด้านบนเพื่อเพิ่มสโมสรใหม่ได้ทันที</p>
              )}
            </div>
          ) : (
            filteredClubs.map((club, index) => {
              const form = editForms[club.id] || {
                boothContact: club.boothContact || '',
                ticketContact: club.ticketContact || '',
                remark: club.remark || '',
                clubName: club.clubName || '',
                stadiumName: club.stadiumName || '',
                province: club.province || '',
              };
              const isSaved = savedClubIds[club.id];
              const hasAllData = Boolean(form.boothContact && form.ticketContact);

              return (
                <div
                  key={club.id}
                  className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white hover:border-teal-300 shadow-2xs hover:shadow-xs transition-all space-y-3.5"
                >
                  {/* Club Header Info */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs shrink-0">
                        {index + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-black text-slate-900">
                            {club.clubName}
                          </h4>
                          
                          {/* League Selector Badge */}
                          <div className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-lg border border-slate-200 transition-colors">
                            <span className="text-[10px] text-slate-500 font-bold">ลีก:</span>
                            <select
                              value={club.league}
                              onChange={(e) => handleMoveLeague(club, e.target.value as LeagueType)}
                              className="bg-transparent text-[11px] font-black text-slate-800 focus:outline-none cursor-pointer"
                              title="เปลี่ยนลีกของสโมสรนี้"
                            >
                              <option value="League 1">League 1</option>
                              <option value="League 2">League 2</option>
                              <option value="League 3">League 3</option>
                            </select>
                          </div>

                          {hasAllData ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300 flex items-center gap-1">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>มีเบอร์ครบถ้วน</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              <span>ยังไม่ได้กรอกเบอร์</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          {club.stadiumName && (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              <span>{club.stadiumName}</span>
                            </span>
                          )}
                          {club.province && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              <span>{club.province}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleSaveSingleClub(club.id)}
                        className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                          isSaved
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                        }`}
                      >
                        {isSaved ? <Check className="w-3.5 h-3.5 text-white" /> : <Save className="w-3.5 h-3.5" />}
                        <span>{isSaved ? 'บันทึกแล้ว ✓' : 'บันทึกสโมสรนี้'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRequestDeleteClub(club)}
                        title={`ลบสโมสร "${club.clubName}" ออกจากสมุดโทรศัพท์`}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 3 Main Input Fields for Booth, Ticket & Remark */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Booth Contact Input */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>เบอร์ติดต่อสำหรับออกบูธ:</span>
                      </label>
                      <input
                        type="text"
                        value={form.boothContact}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditForms(prev => ({
                            ...prev,
                            [club.id]: {
                              ...(prev[club.id] || form),
                              boothContact: val,
                            }
                          }));
                        }}
                        placeholder="เช่น คุณใหม่ 096-206-0446"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium text-slate-900"
                      />
                    </div>

                    {/* Ticket Contact Input */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Ticket className="w-3.5 h-3.5 text-blue-600" />
                        <span>เบอร์ติดต่อสำหรับรับบัตร:</span>
                      </label>
                      <input
                        type="text"
                        value={form.ticketContact}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditForms(prev => ({
                            ...prev,
                            [club.id]: {
                              ...(prev[club.id] || form),
                              ticketContact: val,
                            }
                          }));
                        }}
                        placeholder="เช่น คุณใหม่ 096-206-0446"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium text-slate-900"
                      />
                    </div>

                    {/* Remark Input */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-purple-600" />
                        <span>Remark (หมายเหตุ / จุดรับบัตร):</span>
                      </label>
                      <input
                        type="text"
                        value={form.remark}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditForms(prev => ({
                            ...prev,
                            [club.id]: {
                              ...(prev[club.id] || form),
                              remark: val,
                            }
                          }));
                        }}
                        placeholder="เช่น รับบัตรได้ที่ห้องขายตั๋วช่อง 5 เวลา 15:00-18:00 น."
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 font-medium text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>ข้อมูลทั้งหมดถูกบันทึกลงระบบทันที และเป็นข้อมูลหลักที่ใช้จับคู่กับแมตช์เหย้า-เยือน</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
            <button
              type="button"
              onClick={handleSaveAllInLeague}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>บันทึกทั้งหมด ({filteredClubs.length} สโมสร)</span>
            </button>
          </div>
        </div>

        {/* In-App Delete Confirmation Modal (Avoids browser confirm/alert iframe issues) */}
        {clubToDelete && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl border border-rose-200">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200 shadow-inner">
                <Trash2 className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-slate-900">
                  ยืนยันการลบสโมสร
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  คุณต้องการลบสโมสร <strong className="text-rose-600 font-bold">"{clubToDelete.clubName}"</strong> ออกจาก {clubToDelete.league} ใช่หรือไม่?
                </p>
                <p className="text-[11px] text-slate-400">
                  (ระบบจะนำสโมสรนี้ออกจากสมุดโทรศัพท์ทันที และจะไม่แสดงในรายการอีก)
                </p>
              </div>

              <div className="pt-2 flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setClubToDelete(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>ยืนยันการลบสโมสร</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CSV Import Modal (Fallback when Google Sheets link is restricted) */}
        {isCsvModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      นำเข้าข้อมูลสโมสรจาก CSV
                    </h3>
                    <p className="text-xs text-slate-500">
                      วางข้อความ CSV หรืออัปโหลดไฟล์จากแท็บ {csvTargetLeague}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCsvModalOpen(false)}
                  className="p-1 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {/* League Selector */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    เลือกลีกที่จะนำเข้าข้อมูล:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['League 1', 'League 2', 'League 3'] as LeagueType[]).map((lg) => (
                      <button
                        key={lg}
                        type="button"
                        onClick={() => setCsvTargetLeague(lg)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          csvTargetLeague === lg
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {lg}
                      </button>
                    ))}
                  </div>
                </div>

                {/* File Upload Option */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      อัปโหลดไฟล์ .CSV (ถ้ามี):
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv,text/plain"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>เลือกไฟล์ .csv จากเครื่อง</span>
                    </button>
                  </div>
                </div>

                {/* CSV Textarea */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    หรือวางข้อความตาราง CSV ที่นี่:
                  </label>
                  <textarea
                    rows={6}
                    value={csvInputText}
                    onChange={(e) => setCsvInputText(e.target.value)}
                    placeholder="สโมสรทีมเหย้า,ชื่อ+เบอร์ติดต่อสำหรับออกบูธ,ชื่อ+เบอร์ติดต่อสำหรับรับบัตร,Remark&#10;อยุธยา ยูไนเต็ด,คุณใหม่ 096-206-0446,คุณใหม่ 096-206-0446,รับบัตรหน้าสนาม&#10;บุรีรัมย์ ยูไนเต็ด,คุณมนัส 081-111-2222,คุณวิภา 082-222-3333,..."
                    className="w-full p-3 text-xs font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600 bg-slate-50"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    คอลัมน์ที่รองรับ: สโมสรทีมเหย้า / ชื่อ+เบอร์ติดต่อสำหรับออกบูธ / ชื่อ+เบอร์ติดต่อสำหรับรับบัตร / Remark
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCsvModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleImportCsv}
                  disabled={!csvInputText.trim()}
                  className="px-5 py-2 rounded-xl bg-teal-800 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold text-xs shadow-md cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>นำเข้าข้อมูลสโมสร ({csvTargetLeague})</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
