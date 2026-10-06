import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  ClipboardPenLine, 
  CalendarDays, 
  ShieldCheck, 
  Layers, 
  Database,
  FileSpreadsheet,
  CheckCircle2,
  Trophy,
  PhoneCall,
  Lock,
  Users,
  Home
} from 'lucide-react';
import { LeagueType, UserProfile } from '../types';
import { 
  subscribeToActiveSeason, 
  getSeasonShort, 
  getActiveRegistrationSeason 
} from '../lib/seasonService';

interface SidebarProps {
  activeTab: 'register' | 'monthly' | 'contacts' | 'admin' | 'attendance';
  setActiveTab: (tab: 'register' | 'monthly' | 'contacts' | 'admin' | 'attendance') => void;
  selectedLeagueFilter: LeagueType | 'All';
  setSelectedLeagueFilter: (league: LeagueType | 'All') => void;
  currentUser: UserProfile | null;
  onOpenSheetsModal: (tab?: 'fixtures' | 'contacts' | 'export') => void;
  onOpenFirebaseModal: () => void;
  activeSeason?: string;
  onGoToHub?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  selectedLeagueFilter,
  setSelectedLeagueFilter,
  currentUser,
  onOpenSheetsModal,
  onOpenFirebaseModal,
  activeSeason,
  onGoToHub,
}) => {
  const [currentSeason, setCurrentSeason] = useState<string>(activeSeason || getActiveRegistrationSeason());

  useEffect(() => {
    if (activeSeason) {
      setCurrentSeason(activeSeason);
    }
  }, [activeSeason]);

  useEffect(() => {
    const unsub = subscribeToActiveSeason((newSeason) => {
      setCurrentSeason(newSeason);
    });
    return () => unsub();
  }, []);

  const seasonShort = getSeasonShort(currentSeason);
  return (
    <aside 
      id="sidebar-navigation"
      className="w-full lg:w-72 bg-slate-900 text-slate-100 flex flex-col shrink-0 border-r border-slate-800 relative z-20 shadow-xl"
    >
      {/* 
        3-Color Mixed Brand Header (เขียว แดง น้ำเงิน)
        Combining Green (Emerald), Red (Rose/Crimson), and Blue (Royal)
      */}
      <div className="p-5 border-b border-slate-800/80 bg-slate-950/40">
        {/* Tricolor top vibrant highlight bar */}
        <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-emerald-500 via-rose-500 to-blue-600 mb-4 shadow-sm" />
        
        <div className="flex items-center gap-3">
          <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-emerald-600 via-rose-600 to-blue-700 shadow-md text-white">
            <Trophy className="w-6 h-6" />
            {/* 3 color micro dots */}
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 border border-slate-900"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-wide text-white">THAI LEAGUE</span>
              <span 
                id="sidebar-season-label"
                key={seasonShort}
                title={`ฤดูกาลเปิดรับลงทะเบียน: ${currentSeason}`}
                className="text-xs px-1.5 py-0.5 rounded bg-gradient-to-r from-emerald-500 via-rose-500 to-blue-600 text-white font-semibold shadow-xs transition-all duration-300 transform"
              >
                {seasonShort}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-normal">
              ลงทะเบียนบูธ & ตั๋วบอลรายเดือน
            </p>
          </div>
        </div>

        {/* 3-Color Badges indicator */}
        <div className="mt-4 grid grid-cols-3 gap-1.5 text-[11px] font-medium">
          <div className="flex items-center justify-center gap-1 px-2 py-1 rounded bg-rose-950/60 border border-rose-600/40 text-rose-300">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
            <span>League 1</span>
          </div>
          <div className="flex items-center justify-center gap-1 px-2 py-1 rounded bg-blue-950/60 border border-blue-600/40 text-blue-300">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
            <span>League 2</span>
          </div>
          <div className="flex items-center justify-center gap-1 px-2 py-1 rounded bg-emerald-950/60 border border-emerald-600/40 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span>League 3</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="p-4 flex-1 space-y-1.5 overflow-y-auto">
        {onGoToHub && (
          <button
            onClick={onGoToHub}
            className="w-full mb-3 flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white shadow-md cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-white/20 text-white group-hover:scale-110 transition-transform">
                <Home className="w-4 h-4" />
              </div>
              <div>
                <div className="font-black text-white">🏠 เมนูหลัก / เลือกลีก</div>
                <div className="text-[10px] text-emerald-100 font-medium">กลับหน้า 3 ปุ่ม 3 ลีก</div>
              </div>
            </div>
          </button>
        )}

        <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase px-3 py-1">
          เมนูหลัก (Main Navigation)
        </div>

        {/* Tab 1: ลงทะเบียน (ออกบูธ + รับบัตร) */}
        <button
          id="nav-tab-register"
          onClick={() => setActiveTab('register')}
          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all group text-left ${
            activeTab === 'register'
              ? 'bg-gradient-to-r from-slate-800 to-slate-800/80 text-white shadow-md border-l-4 border-l-emerald-500'
              : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg transition-colors ${
              activeTab === 'register' 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-slate-800 text-slate-400 group-hover:text-emerald-400'
            }`}>
              <ClipboardPenLine className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-slate-100">ลงทะเบียนบูธ & บัตรบอล</div>
              <div className="text-xs text-slate-400">เลือกแบรนด์ & แมตช์ 7 วันข้างหน้า</div>
            </div>
          </div>
          {activeTab === 'register' && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          )}
        </button>

        {/* Tab 2: เบอร์ติดต่อหน้าสนาม (อยู่ต่อกับแท็บ ลงทะเบียนบูธ & บัตรบอล) */}
        <button
          id="nav-tab-contacts"
          onClick={() => setActiveTab('contacts')}
          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all group text-left ${
            activeTab === 'contacts'
              ? 'bg-gradient-to-r from-slate-800 to-slate-800/80 text-white shadow-md border-l-4 border-l-emerald-400'
              : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg transition-colors ${
              activeTab === 'contacts' 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-slate-800 text-slate-400 group-hover:text-emerald-400'
            }`}>
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-slate-100">เบอร์ติดต่อหน้าสนาม</div>
              <div className="text-xs text-slate-400">จุดรับตั๋ว & พิกัดออกบูธ</div>
            </div>
          </div>
          {activeTab === 'contacts' && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          )}
        </button>

        {/* Tab 3: ยอดผู้ชมสนาม (สถิติผู้ชม & Score การแข่งขัน - ลูกค้าดูได้) */}
        <button
          id="nav-tab-attendance"
          onClick={() => setActiveTab('attendance')}
          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all group text-left ${
            activeTab === 'attendance'
              ? 'bg-gradient-to-r from-slate-800 to-slate-800/80 text-white shadow-md border-l-4 border-l-cyan-400'
              : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg transition-colors ${
              activeTab === 'attendance' 
                ? 'bg-cyan-500/20 text-cyan-400' 
                : 'bg-slate-800 text-slate-400 group-hover:text-cyan-400'
            }`}>
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                <span>ยอดผู้ชมสนาม</span>
                <span className="text-[10px] bg-cyan-950/80 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-800/60 font-semibold">
                  ใหม่
                </span>
              </div>
              <div className="text-xs text-slate-400">สถิติผู้ชม & Score การแข่งขัน</div>
            </div>
          </div>
          {activeTab === 'attendance' && (
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
          )}
        </button>

        {/* Tab 4: สรุปยอดแยกรายเดือน */}
        <button
          id="nav-tab-monthly"
          onClick={() => setActiveTab('monthly')}
          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all group text-left ${
            activeTab === 'monthly'
              ? 'bg-gradient-to-r from-slate-800 to-slate-800/80 text-white shadow-md border-l-4 border-l-rose-500'
              : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg transition-colors ${
              activeTab === 'monthly' 
                ? 'bg-rose-500/20 text-rose-400' 
                : 'bg-slate-800 text-slate-400 group-hover:text-rose-400'
            }`}>
              <CalendarDays className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                <span>สรุปยอดแยกรายเดือน</span>
                {currentUser?.role !== 'admin' && (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 text-slate-400" />
                    <span>Admin</span>
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">สรุปฤดูกาล & รายเดือน (5–10 ปี)</div>
            </div>
          </div>
          {activeTab === 'monthly' && (
            <span className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
          )}
        </button>

        {/* Tab 4: แดชบอร์ดแอดมิน */}
        <button
          id="nav-tab-admin"
          onClick={() => setActiveTab('admin')}
          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all group text-left ${
            activeTab === 'admin'
              ? 'bg-gradient-to-r from-slate-800 to-slate-800/80 text-white shadow-md border-l-4 border-l-blue-500'
              : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg transition-colors ${
              activeTab === 'admin' 
                ? 'bg-blue-500/20 text-blue-400' 
                : 'bg-slate-800 text-slate-400 group-hover:text-blue-400'
            }`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                <span>แดชบอร์ดแอดมิน</span>
                {currentUser?.role !== 'admin' && (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 text-slate-400" />
                    <span>Admin</span>
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">อนุมัติคำขอ & ตราสโมสร & แบรนด์</div>
            </div>
          </div>
          {activeTab === 'admin' && (
            <span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
          )}
        </button>

        {/* League Selector filter in sidebar */}
        <div className="pt-6 pb-2">
          <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase px-3 py-1 flex items-center justify-between">
            <span>เลือกลีกที่ต้องการดู</span>
            <Layers className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="mt-2 space-y-1">
            <button
              id="sidebar-filter-all"
              onClick={() => setSelectedLeagueFilter('All')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectedLeagueFilter === 'All'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-400 via-rose-500 to-blue-500"></span>
                <span>ทุกลีก (All Leagues)</span>
              </div>
              {selectedLeagueFilter === 'All' && <CheckCircle2 className="w-3.5 h-3.5 text-slate-300" />}
            </button>

            {/* League 1 (แดง) */}
            <button
              id="sidebar-filter-league1"
              onClick={() => setSelectedLeagueFilter('League 1')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectedLeagueFilter === 'League 1'
                  ? 'bg-rose-950/80 text-rose-200 border border-rose-700/60 font-semibold'
                  : 'text-slate-400 hover:bg-rose-950/30 hover:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]"></span>
                <span>Thai League 1</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300">แดง</span>
            </button>

            {/* League 2 (น้ำเงิน) */}
            <button
              id="sidebar-filter-league2"
              onClick={() => setSelectedLeagueFilter('League 2')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectedLeagueFilter === 'League 2'
                  ? 'bg-blue-950/80 text-blue-200 border border-blue-700/60 font-semibold'
                  : 'text-slate-400 hover:bg-blue-950/30 hover:text-blue-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.8)]"></span>
                <span>Thai League 2</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300">น้ำเงิน</span>
            </button>

            {/* League 3 (เขียว) */}
            <button
              id="sidebar-filter-league3"
              onClick={() => setSelectedLeagueFilter('League 3')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectedLeagueFilter === 'League 3'
                  ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-700/60 font-semibold'
                  : 'text-slate-400 hover:bg-emerald-950/30 hover:text-emerald-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"></span>
                <span>Thai League 3</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300">เขียว</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer / Database Status (เฉพาะ Admin) */}
      {currentUser?.role === 'admin' && (
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 space-y-2">
          <div className="flex items-center justify-between">
            <button
              id="btn-open-firebase-settings"
              onClick={onOpenFirebaseModal}
              className="flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-medium">Firebase: Thaileague 2026-27</span>
            </button>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </div>

          <div className="space-y-1.5">
            <button
              id="btn-open-sheets-sidebar"
              onClick={() => onOpenSheetsModal('fixtures')}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-300 text-xs font-medium border border-emerald-800/50 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>เชื่อมต่อ Google Sheets (ตารางแข่ง)</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
