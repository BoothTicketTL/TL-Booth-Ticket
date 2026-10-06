import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Shield, 
  Upload, 
  FolderUp, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Trash2, 
  Search, 
  Filter, 
  Sparkles, 
  RefreshCw, 
  Eye, 
  Check, 
  FileText, 
  Layers, 
  ArrowRight,
  Download,
  Info
} from 'lucide-react';
import { LeagueType } from '../../types';
import { 
  OFFICIAL_LEAGUE_1_CLUBS, 
  OFFICIAL_LEAGUE_2_CLUBS, 
  OFFICIAL_LEAGUE_3_CLUBS,
  OFFICIAL_CLUBS_BY_LEAGUE
} from '../../data/officialSeasonClubs';
import { L3_ZONES_DATA } from '../../lib/l3SeasonFixturesGenerator';
import { 
  ClubCrestItem, 
  getClubCrest, 
  saveClubCrest, 
  deleteClubCrest, 
  clearLeagueCrests, 
  subscribeToClubCrests,
  matchFilesToLeagueClubs,
  readFileAsDataUrl,
  FileMatchResultItem,
  UnmatchedFileItem
} from '../../lib/clubCrestService';
import { ClubCrest } from '../common/ClubCrest';
import { LeagueBadge } from '../common/LeagueBadge';
import { saveLeagueLogo, resetLeagueLogo, hasCustomLeagueLogo } from '../../lib/leagueLogoService';

export const ClubCrestsManagementPanel: React.FC = () => {
  const [activeLeague, setActiveLeague] = useState<LeagueType>('League 1');
  const [activeL3Zone, setActiveL3Zone] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'has_crest' | 'missing_crest'>('all');
  const [crestsCache, setCrestsCache] = useState<Map<string, ClubCrestItem>>(new Map());

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // Folder Match Review Modal
  const [matchReviewModalOpen, setMatchReviewModalOpen] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<FileMatchResultItem[]>([]);
  const [pendingUnmatched, setPendingUnmatched] = useState<UnmatchedFileItem[]>([]);
  const [targetLeagueForBatch, setTargetLeagueForBatch] = useState<LeagueType>('League 1');

  // Single club upload ref
  const singleFileInputRef = useRef<HTMLInputElement>(null);
  const [singleUploadClub, setSingleUploadClub] = useState<string | null>(null);

  // Folder inputs
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to changes in crests cache
  useEffect(() => {
    const unsub = subscribeToClubCrests((newCache) => {
      setCrestsCache(new Map(newCache));
    });
    return () => unsub();
  }, []);

  // Stats calculation
  const stats = useMemo(() => {
    const l1Total = OFFICIAL_LEAGUE_1_CLUBS.length;
    const l2Total = OFFICIAL_LEAGUE_2_CLUBS.length;
    const l3Total = OFFICIAL_LEAGUE_3_CLUBS.length;

    let l1Count = 0;
    let l2Count = 0;
    let l3Count = 0;

    OFFICIAL_LEAGUE_1_CLUBS.forEach(c => {
      if (getClubCrest(c, 'League 1')) l1Count++;
    });
    OFFICIAL_LEAGUE_2_CLUBS.forEach(c => {
      if (getClubCrest(c, 'League 2')) l2Count++;
    });
    OFFICIAL_LEAGUE_3_CLUBS.forEach(c => {
      if (getClubCrest(c, 'League 3')) l3Count++;
    });

    return {
      l1: { total: l1Total, uploaded: l1Count, percent: Math.round((l1Count / l1Total) * 100) },
      l2: { total: l2Total, uploaded: l2Count, percent: Math.round((l2Count / l2Total) * 100) },
      l3: { total: l3Total, uploaded: l3Count, percent: Math.round((l3Count / l3Total) * 100) },
      all: { 
        total: l1Total + l2Total + l3Total, 
        uploaded: l1Count + l2Count + l3Count, 
        percent: Math.round(((l1Count + l2Count + l3Count) / (l1Total + l2Total + l3Total)) * 100) 
      }
    };
  }, [crestsCache]);

  // Clubs for current view
  const currentClubs = useMemo(() => {
    let list: readonly string[] = OFFICIAL_CLUBS_BY_LEAGUE[activeLeague];

    // If League 3 and zone selected
    if (activeLeague === 'League 3' && activeL3Zone !== 'all') {
      const zoneData = L3_ZONES_DATA[activeL3Zone];
      if (zoneData) {
        const zoneClubNames = zoneData.clubs.map(c => c.name);
        list = list.filter(c => zoneClubNames.includes(c));
      }
    }

    // Filter by search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(c => c.toLowerCase().includes(q));
    }

    // Filter by crest status
    if (statusFilter === 'has_crest') {
      list = list.filter(c => Boolean(getClubCrest(c, activeLeague)));
    } else if (statusFilter === 'missing_crest') {
      list = list.filter(c => !getClubCrest(c, activeLeague));
    }

    return list;
  }, [activeLeague, activeL3Zone, searchTerm, statusFilter, crestsCache]);

  // Handle files selected via folder input or drag-drop
  const handleFilesSelected = (files: FileList | File[], league: LeagueType) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Filter image files
    const imageFiles = fileArray.filter(f => 
      f.type.startsWith('image/') || f.name.match(/\.(png|jpe?g|webp|svg|gif)$/i)
    );

    if (imageFiles.length === 0) {
      setNotification({
        type: 'warning',
        message: 'ไม่พบไฟล์รูปภาพ (.png, .jpg, .webp, .svg) ในโฟลเดอร์ที่เลือก'
      });
      return;
    }

    // Match files specifically to target league clubs
    const { matched, unmatched } = matchFilesToLeagueClubs(imageFiles, league);

    setTargetLeagueForBatch(league);
    setPendingMatches(matched);
    setPendingUnmatched(unmatched);
    setMatchReviewModalOpen(true);
  };

  // Confirm saving matched files to IndexedDB
  const handleConfirmBatchSave = async () => {
    if (pendingMatches.length === 0) {
      setMatchReviewModalOpen(false);
      return;
    }

    setIsProcessing(true);
    let successCount = 0;

    try {
      for (const item of pendingMatches) {
        const dataUrl = await readFileAsDataUrl(item.file, 512);
        await saveClubCrest(
          item.league,
          item.clubName,
          dataUrl,
          item.file.name,
          item.file.size
        );
        successCount++;
      }

      setNotification({
        type: 'success',
        message: `บันทึกตราสโมสรสำหรับ ${targetLeagueForBatch} สำเร็จแล้ว ${successCount} สโมสร!`
      });
    } catch (err) {
      console.error('Batch save error:', err);
      setNotification({
        type: 'error',
        message: 'เกิดข้อผิดพลาดในการประมวลผลไฟล์รูปภาพ กรุณาลองใหม่อีกครั้ง'
      });
    } finally {
      setIsProcessing(false);
      setMatchReviewModalOpen(false);
      setPendingMatches([]);
      setPendingUnmatched([]);
    }
  };

  // Single club individual upload
  const triggerSingleUpload = (clubName: string) => {
    setSingleUploadClub(clubName);
    if (singleFileInputRef.current) {
      singleFileInputRef.current.value = '';
      singleFileInputRef.current.click();
    }
  };

  const handleSingleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !singleUploadClub) return;

    try {
      const dataUrl = await readFileAsDataUrl(file, 512);
      await saveClubCrest(
        activeLeague,
        singleUploadClub,
        dataUrl,
        file.name,
        file.size
      );
      setNotification({
        type: 'success',
        message: `อัปเดตรูปตราสโมสร "${singleUploadClub}" เรียบร้อยแล้ว`
      });
    } catch (err) {
      console.error('Failed to upload single crest:', err);
      setNotification({
        type: 'error',
        message: 'ไม่สามารถอ่านไฟล์รูปภาพได้ กรุณาตรวจสอบรูปแบบไฟล์'
      });
    } finally {
      setSingleUploadClub(null);
    }
  };

  // League Logo Upload Ref & State
  const leagueLogoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLeagueLogoTarget, setUploadingLeagueLogoTarget] = useState<LeagueType | null>(null);

  const triggerLeagueLogoUpload = (league: LeagueType) => {
    setUploadingLeagueLogoTarget(league);
    if (leagueLogoInputRef.current) {
      leagueLogoInputRef.current.value = '';
      leagueLogoInputRef.current.click();
    }
  };

  const handleLeagueLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingLeagueLogoTarget) return;

    try {
      const dataUrl = await readFileAsDataUrl(file, 600);
      await saveLeagueLogo(uploadingLeagueLogoTarget, dataUrl);
      setNotification({
        type: 'success',
        message: `อัปเดตโลโก้ประจำลีก ${uploadingLeagueLogoTarget} เรียบร้อยแล้ว`
      });
    } catch (err) {
      console.error('Failed to save league logo:', err);
      setNotification({
        type: 'error',
        message: 'ไม่สามารถอัปโหลดโลโก้ลีกได้ กรุณาตรวจสอบไฟล์รูปภาพ'
      });
    } finally {
      setUploadingLeagueLogoTarget(null);
    }
  };

  const handleResetLeagueLogo = async (league: LeagueType) => {
    if (confirm(`คุณต้องการรีเซ็ตโลโก้ของ ${league} กลับเป็นโลโก้ทางการค่าเริ่มต้นหรือไม่?`)) {
      await resetLeagueLogo(league);
      setNotification({
        type: 'success',
        message: `รีเซ็ตโลโก้ของ ${league} กลับเป็นค่าเริ่มต้นเรียบร้อยแล้ว`
      });
    }
  };

  // Delete crest
  const handleDeleteCrest = async (clubName: string) => {
    if (confirm(`คุณต้องการลบรูปตราสโมสร "${clubName}" หรือไม่?`)) {
      await deleteClubCrest(activeLeague, clubName);
      setNotification({
        type: 'success',
        message: `ลบรูปตราสโมสร "${clubName}" เรียบร้อยแล้ว`
      });
    }
  };

  // Clear league
  const handleClearLeague = async () => {
    if (confirm(`⚠️ ยืนยันการลบรูปตราสโมสรทั้งหมดของ ${activeLeague} หรือไม่? (ข้อมูลภาพทั้งหมดของลีกนี้จะถูกล้าง)`)) {
      await clearLeagueCrests(activeLeague);
      setNotification({
        type: 'warning',
        message: `ล้างรูปตราสโมสรทั้งหมดของ ${activeLeague} เรียบร้อยแล้ว`
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden Inputs */}
      <input
        type="file"
        ref={singleFileInputRef}
        onChange={handleSingleFileChange}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
      />

      {/* Hidden League Logo Input */}
      <input
        type="file"
        ref={leagueLogoInputRef}
        onChange={handleLeagueLogoFileChange}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
      />
      
      {/* Folder input with webkitdirectory for directory upload */}
      <input
        type="file"
        ref={folderInputRef}
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        multiple
        onChange={(e) => {
          if (e.target.files) {
            handleFilesSelected(e.target.files, activeLeague);
          }
        }}
        className="hidden"
      />

      {/* Toast Notification */}
      {notification && (
        <div 
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-2 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : notification.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="p-1 rounded hover:bg-black/5 text-slate-500 hover:text-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Overview Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  จัดการตราสโมสรทางการ (Official Club Crests)
                </h2>
                <p className="text-xs text-slate-500">
                  อัปโหลดโฟลเดอร์รูปภาพแยกตามลีก ระบบจะจับคู่ชื่อไฟล์ภาพกับ 103 สโมสรทางการของไทยลีกโดยอัตโนมัติ 100%
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">ภาพรวมทั้งระบบ:</span>
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-black text-slate-800 flex items-center gap-2">
              <span className="text-emerald-600">{stats.all.uploaded}</span>
              <span className="text-slate-400">/</span>
              <span>{stats.all.total} สโมสร</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-extrabold">
                {stats.all.percent}%
              </span>
            </div>
          </div>
        </div>

        {/* 3-League Summary Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* League 1 Card */}
          <button
            type="button"
            onClick={() => setActiveLeague('League 1')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
              activeLeague === 'League 1'
                ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                : 'bg-white hover:bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-blue-600 text-white shadow-2xs">
                Thai League 1
              </span>
              <span className="text-xs font-black text-blue-700">
                {stats.l1.uploaded} / {stats.l1.total} ทีม
              </span>
            </div>
            <div className="text-xs text-slate-600 mb-2 font-medium">
              ลีกสูงสุด (16 สโมสรทางการ)
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${stats.l1.percent}%` }}
              />
            </div>
          </button>

          {/* League 2 Card */}
          <button
            type="button"
            onClick={() => setActiveLeague('League 2')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
              activeLeague === 'League 2'
                ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                : 'bg-white hover:bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-600 text-white shadow-2xs">
                Thai League 2
              </span>
              <span className="text-xs font-black text-emerald-700">
                {stats.l2.uploaded} / {stats.l2.total} ทีม
              </span>
            </div>
            <div className="text-xs text-slate-600 mb-2 font-medium">
              ลีกพระรอง (18 สโมสรทางการ)
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-emerald-600 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${stats.l2.percent}%` }}
              />
            </div>
          </button>

          {/* League 3 Card */}
          <button
            type="button"
            onClick={() => setActiveLeague('League 3')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
              activeLeague === 'League 3'
                ? 'bg-purple-50/80 border-purple-500 ring-2 ring-purple-500/20 shadow-xs'
                : 'bg-white hover:bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-purple-600 text-white shadow-2xs">
                Thai League 3
              </span>
              <span className="text-xs font-black text-purple-700">
                {stats.l3.uploaded} / {stats.l3.total} ทีม
              </span>
            </div>
            <div className="text-xs text-slate-600 mb-2 font-medium">
              ลีกภูมิภาค 6 โซน (69 สโมสรทางการ)
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-purple-600 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${stats.l3.percent}%` }}
              />
            </div>
          </button>
        </div>

        {/* Section: Official League Logos (Mockup 3, 4, 5 Requirement) */}
        <div className="pt-4 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>จัดการโลโก้ประจำลีก (Official League Logos)</span>
              </div>
              <p className="text-xs text-slate-500">
                โลโก้นี้จะนำไปแสดงเป็นตราประจำลีกส่วนหัวของหน้าลงทะเบียน, เบอร์ติดต่อหน้าสนาม และยอดผู้ชม (อัปโหลดรูปใหม่ หรือใช้โลโก้ทางการค่าเริ่มต้น)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(['League 1', 'League 2', 'League 3'] as LeagueType[]).map((lg) => {
              const isCustom = hasCustomLeagueLogo(lg);
              const titleMap = {
                'League 1': 'BYD SEALION 6 LEAGUE I',
                'League 2': 'BYD SEAL 5 LEAGUE II',
                'League 3': 'BYD DOLPHIN LEAGUE III',
              };

              return (
                <div key={lg} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col items-center text-center justify-between space-y-3 shadow-2xs">
                  <div className="flex flex-col items-center gap-2">
                    <LeagueBadge league={lg} size="md" />
                    <div>
                      <div className="text-xs font-black text-slate-900">{lg}</div>
                      <div className="text-[11px] font-semibold text-slate-600">{titleMap[lg]}</div>
                      <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isCustom ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isCustom ? '✦ โลโก้ที่อัปโหลดเอง' : '✓ โลโก้ทางการค่าเริ่มต้น'}
                      </span>
                    </div>
                  </div>

                  <div className="w-full flex items-center gap-2 pt-2 border-t border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => triggerLeagueLogoUpload(lg)}
                      className="flex-1 py-1.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{isCustom ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}</span>
                    </button>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => handleResetLeagueLogo(lg)}
                        className="py-1.5 px-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-[11px] font-bold transition-colors cursor-pointer border border-slate-200"
                        title="รีเซ็ตกลับเป็นค่าเริ่มต้น"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* League 1, 2, 3 Active Section */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
        {/* Active League Header & Folder Upload Banner */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900">
                รายชื่อสโมสร {activeLeague}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                {OFFICIAL_CLUBS_BY_LEAGUE[activeLeague].length} สโมสรทางการ
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              แยกจัดการเฉพาะลีกนี้ ไม่มีการสับสนหรือปะปนกับลีกอื่น
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="btn-upload-folder-active-league"
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black shadow-xs hover:shadow-md transition-all cursor-pointer"
            >
              <FolderUp className="w-4 h-4" />
              <span>อัปโหลดโฟลเดอร์ {activeLeague}</span>
            </button>

            {crestsCache.size > 0 && (
              <button
                type="button"
                onClick={handleClearLeague}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                title={`ล้างรูปตราสโมสรทั้งหมดของ ${activeLeague}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ล้างรูปใน {activeLeague}</span>
              </button>
            )}
          </div>
        </div>

        {/* Dropzone for Active League */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files) {
              handleFilesSelected(e.dataTransfer.files, activeLeague);
            }
          }}
          className={`border-2 border-dashed rounded-3xl p-6 text-center transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-50/70 scale-[1.01]'
              : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
          }`}
        >
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white text-blue-600 flex items-center justify-center mx-auto shadow-2xs border border-slate-200">
              <FolderUp className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-black text-slate-800">
                ลากโฟลเดอร์รูปภาพของ {activeLeague} มาวางที่นี่
              </div>
              <div className="text-xs text-slate-500 mt-1">
                หรือคลิกปุ่มด้านบนเพื่อเลือกโฟลเดอร์จากเครื่องของคุณ (รองรับ .png, .jpg, .webp, .svg)
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 text-[11px] font-semibold border border-blue-200">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>ระบบจะจับคู่ชื่อไฟล์ภาพกับสโมสรของ {activeLeague} เท่านั้น ไม่ข้ามลีก 100%</span>
            </div>
          </div>
        </div>

        {/* League 3 Regional Zone Sub-tabs */}
        {activeLeague === 'League 3' && (
          <div className="space-y-2 pt-2">
            <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-600" />
              <span>เลือกกรองตาม 6 โซนภูมิภาคของ Thai League 3:</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveL3Zone('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeL3Zone === 'all'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                ทุกลูกโซน (69 สโมสร)
              </button>
              {Object.values(L3_ZONES_DATA).map(zone => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => setActiveL3Zone(zone.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    activeL3Zone === zone.id
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {zone.nameThai} ({zone.clubs.length})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {/* Search box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อสโมสร..."
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600 w-full sm:w-auto justify-center">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                ทั้งหมด ({currentClubs.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('has_crest')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === 'has_crest' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                มีรูปแล้ว
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('missing_crest')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === 'missing_crest' ? 'bg-white text-amber-800 shadow-2xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                ยังไม่มีรูป
              </button>
            </div>
          </div>
        </div>

        {/* Club Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
          {currentClubs.map((clubName) => {
            const crestDataUrl = getClubCrest(clubName, activeLeague);
            const hasCrest = Boolean(crestDataUrl);

            return (
              <div
                key={clubName}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  hasCrest
                    ? 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                    : 'bg-slate-50/80 border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Preview Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ClubCrest
                        clubName={clubName}
                        league={activeLeague}
                        size="lg"
                        showTooltip
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-900 truncate" title={clubName}>
                          {clubName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {hasCrest ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>มีรูปแล้ว</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              <span>ยังไม่มีรูป</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center gap-2 pt-3 mt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => triggerSingleUpload(clubName)}
                    className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3 h-3 text-slate-500" />
                    <span>{hasCrest ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}</span>
                  </button>

                  {hasCrest && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCrest(clubName)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title={`ลบรูปของ ${clubName}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {currentClubs.length === 0 && (
          <div className="text-center py-12 text-slate-400 space-y-2">
            <Shield className="w-8 h-8 mx-auto text-slate-300" />
            <div className="text-xs font-semibold">ไม่พบสโมสรที่ตรงกับเงื่อนไขการค้นหา</div>
          </div>
        )}
      </div>

      {/* Folder Match Review Modal */}
      {matchReviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <FolderUp className="w-5 h-5 text-blue-600" />
                  <span>ตรวจสอบผลการจับคู่ไฟล์ภาพ ({targetLeagueForBatch})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ตรวจสอบความถูกต้องก่อนบันทึกลงในระบบ
                </p>
              </div>
              <button
                onClick={() => setMatchReviewModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Match summary stats */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>จับคู่ตรงกับสโมสรสำเร็จ</span>
                </div>
                <div className="text-lg font-black text-emerald-700 mt-1">
                  {pendingMatches.length} ไฟล์
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>ไม่ตรงกับสโมสรในลีกนี้</span>
                </div>
                <div className="text-lg font-black text-amber-700 mt-1">
                  {pendingUnmatched.length} ไฟล์
                </div>
              </div>
            </div>

            {/* Scrollable list of matched and unmatched */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Matched list */}
              {pendingMatches.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>รายการที่จับคู่ได้ ({pendingMatches.length}):</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50">
                    {pendingMatches.map((m, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs bg-white">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-mono text-[10px] text-slate-400">📄 {m.file.name}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-bold text-slate-900 truncate">{m.clubName}</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 shrink-0">
                          {m.matchType === 'exact' ? 'ตรงเป๊ะ' : m.matchType === 'alias' ? 'ชื่อย่อ' : 'คำใกล้เคียง'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmatched list */}
              {pendingUnmatched.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>ไฟล์ที่ไม่ตรงกับ 103 สโมสรของ {targetLeagueForBatch} ({pendingUnmatched.length}):</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-amber-200 rounded-2xl overflow-hidden bg-amber-50/30">
                    {pendingUnmatched.map((u, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs bg-white">
                        <span className="font-mono text-slate-700 truncate">{u.file.name}</span>
                        <span className="text-[10px] text-amber-700 shrink-0">{u.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setMatchReviewModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isProcessing || pendingMatches.length === 0}
                onClick={handleConfirmBatchSave}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black shadow-md cursor-pointer flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>กำลังบันทึกรูปภาพ...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>ยืนยันบันทึกภาพ ({pendingMatches.length} สโมสร)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
