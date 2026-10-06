import React, { useState } from 'react';
import { 
  Building2, 
  PhoneCall, 
  Users, 
  ChevronDown, 
  ChevronUp, 
  LogOut, 
  ShieldCheck, 
  Sparkles,
  ArrowRight,
  Shield
} from 'lucide-react';
import { LeagueType, UserProfile } from '../types';

interface MainHubViewProps {
  currentUser: UserProfile | null;
  onSelectFeatureAndLeague: (
    feature: 'register' | 'contacts' | 'attendance',
    league: LeagueType
  ) => void;
  onOpenAdmin: () => void;
  onSignOut: () => void;
  onSwitchRole?: () => void;
}

export const MainHubView: React.FC<MainHubViewProps> = ({
  currentUser,
  onSelectFeatureAndLeague,
  onOpenAdmin,
  onSignOut,
  onSwitchRole,
}) => {
  // State for which dropdown is currently expanded ('register' | 'contacts' | 'attendance' | null)
  // By default in mockup 2, they show the dropdowns
  const [openDropdowns, setOpenDropdowns] = useState<{
    register: boolean;
    contacts: boolean;
    attendance: boolean;
  }>({
    register: true,
    contacts: true,
    attendance: true,
  });

  const toggleDropdown = (key: 'register' | 'contacts' | 'attendance') => {
    setOpenDropdowns(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const leagues: { id: LeagueType; name: string; subtitle: string; colorClass: string; badgeText: string }[] = [
    { 
      id: 'League 1', 
      name: 'League 1', 
      subtitle: 'BYD Sealion 6 League I', 
      colorClass: 'hover:bg-rose-50 text-rose-800 border-rose-200', 
      badgeText: 'T1' 
    },
    { 
      id: 'League 2', 
      name: 'League 2', 
      subtitle: 'BYD Seal 5 League II', 
      colorClass: 'hover:bg-blue-50 text-blue-800 border-blue-200', 
      badgeText: 'T2' 
    },
    { 
      id: 'League 3', 
      name: 'League 3', 
      subtitle: 'BYD Dolphin League III', 
      colorClass: 'hover:bg-emerald-50 text-emerald-800 border-emerald-200', 
      badgeText: 'T3' 
    },
  ];

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col justify-between p-4 sm:p-8 lg:p-12 bg-gradient-to-br from-[#021f24] via-[#05383f] to-[#011417] text-white select-none">
      {/* Background glowing aurora rings and decorative ambient curves */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[32rem] h-[32rem] rounded-full bg-cyan-400/10 blur-3xl" />
        
        {/* Decorative thin white curved lines (Mockup 2) */}
        <svg className="absolute inset-0 w-full h-full opacity-35" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
          <path d="M 1150 0 C 1220 300 1350 650 1440 900" stroke="#ffffff" strokeWidth="1.5" />
          <path d="M 1250 0 C 1330 350 1400 680 1440 850" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" />
        </svg>
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 w-full max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* User Pill */}
        <div className="flex items-center gap-2 bg-slate-900/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-teal-500/30 text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-teal-100 font-semibold truncate max-w-[200px]" title={currentUser?.email}>
            {currentUser?.email || 'User'}
          </span>
          {currentUser?.assignedBrand && (
            <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold text-[10px] border border-teal-500/40">
              {currentUser.assignedBrand}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Switch Role Button */}
          {onSwitchRole && (
            <button
              onClick={onSwitchRole}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black shadow-lg border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                currentUser?.role === 'admin'
                  ? 'bg-amber-400 hover:bg-amber-500 text-slate-950 border-amber-300'
                  : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 border-amber-300'
              }`}
              title="คลิกเพื่อสลับบทบาทระหว่าง Admin กับ User ทันที"
            >
              <span>
                {currentUser?.role === 'admin' 
                  ? '👑 โหมด Admin (คลิกสลับเป็น User ⇄)' 
                  : '👑 สลับบทบาทเป็น Admin ทันที ⇄'}
              </span>
            </button>
          )}

          {currentUser?.role === 'admin' && (
            <button
              onClick={onOpenAdmin}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-600/90 hover:bg-blue-600 text-white text-xs font-bold shadow-lg border border-blue-400/40 transition-all cursor-pointer hover:scale-105"
            >
              <ShieldCheck className="w-4 h-4 text-amber-300" />
              <span>แดชบอร์ดแอดมิน</span>
            </button>
          )}

          <button
            onClick={onSignOut}
            title="ออกจากระบบ"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/60 hover:bg-rose-950/80 text-slate-300 hover:text-rose-200 text-xs font-medium border border-slate-700/50 hover:border-rose-500/50 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </div>
      </div>

      {/* Center Hero Section */}
      <div className="relative z-10 w-full max-w-6xl mx-auto my-auto py-8 sm:py-12 flex flex-col items-center text-center space-y-8 sm:space-y-12">
        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
            TL Booths & Tickets System
          </h1>
          <p className="text-xs sm:text-sm font-semibold tracking-wide text-teal-200/80">
            ระบบบริหารจัดการออกบูธ, รับบัตรดูบอล, เบอร์ติดต่อหน้าสนาม และสถิติผู้ชม
          </p>
        </div>

        {/* 3 Main Action Cards (Mockup 2 - Beautiful, Elevated Design) */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-start">
          
          {/* Card 1: ลงทะเบียนออกบูธ & รับบัตร (Red Theme) */}
          <div className="flex flex-col rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
            {/* Top Red Button */}
            <button
              type="button"
              onClick={() => toggleDropdown('register')}
              className="w-full p-5 sm:p-6 bg-gradient-to-br from-[#ff0033] via-[#e6002e] to-[#cc0029] text-white flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer shadow-lg relative group transition-all"
            >
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center mb-1 text-white shadow-inner">
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-base sm:text-lg font-black tracking-wide leading-tight">
                ลงทะเบียน
              </span>
              <span className="text-base sm:text-lg font-black tracking-wide leading-tight">
                ออกบูธ & รับบัตร
              </span>
              <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-white/90 underline underline-offset-4 group-hover:text-white">
                <span>คลิก</span>
                {openDropdowns.register ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </div>
            </button>

            {/* Dropdown Menu (Pink/Red tinted container as in Mockup 2) */}
            {openDropdowns.register && (
              <div className="bg-[#fce7e7] p-3 sm:p-4 space-y-2 border-t-2 border-rose-300 text-slate-800 transition-all animate-in fade-in">
                {leagues.map(lg => (
                  <button
                    key={lg.id}
                    onClick={() => onSelectFeatureAndLeague('register', lg.id)}
                    className="w-full p-3 rounded-2xl bg-white hover:bg-rose-500 hover:text-white text-slate-800 font-bold text-left flex items-center justify-between shadow-2xs border border-rose-200/80 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-rose-100 group-hover:bg-white group-hover:text-rose-600 text-rose-700 flex items-center justify-center font-extrabold text-xs">
                        {lg.badgeText}
                      </span>
                      <div>
                        <div className="text-sm font-black">- {lg.name}</div>
                        <div className="text-[10px] text-slate-500 group-hover:text-white/80 font-medium">
                          {lg.subtitle}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-transform" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Card 2: เบอร์ติดต่อหน้าสนาม (Blue Theme) */}
          <div className="flex flex-col rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
            {/* Top Blue Button */}
            <button
              type="button"
              onClick={() => toggleDropdown('contacts')}
              className="w-full p-5 sm:p-6 bg-gradient-to-br from-[#0055ff] via-[#0047d4] to-[#003bb3] text-white flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer shadow-lg relative group transition-all"
            >
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center mb-1 text-white shadow-inner">
                <PhoneCall className="w-5 h-5" />
              </div>
              <span className="text-base sm:text-lg font-black tracking-wide leading-tight">
                เบอร์ติดต่อหน้าสนาม
              </span>
              <span className="text-xs font-semibold text-blue-200 mt-0.5">
                จุดรับตั๋ว & พิกัดออกบูธ
              </span>
              <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-white/90 underline underline-offset-4 group-hover:text-white">
                <span>คลิก</span>
                {openDropdowns.contacts ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </div>
            </button>

            {/* Dropdown Menu (Soft Blue container as in Mockup 2) */}
            {openDropdowns.contacts && (
              <div className="bg-[#dbeafe] p-3 sm:p-4 space-y-2 border-t-2 border-blue-300 text-slate-800 transition-all animate-in fade-in">
                {leagues.map(lg => (
                  <button
                    key={lg.id}
                    onClick={() => onSelectFeatureAndLeague('contacts', lg.id)}
                    className="w-full p-3 rounded-2xl bg-white hover:bg-blue-600 hover:text-white text-slate-800 font-bold text-left flex items-center justify-between shadow-2xs border border-blue-200/80 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-blue-100 group-hover:bg-white group-hover:text-blue-600 text-blue-700 flex items-center justify-center font-extrabold text-xs">
                        {lg.badgeText}
                      </span>
                      <div>
                        <div className="text-sm font-black">- {lg.name}</div>
                        <div className="text-[10px] text-slate-500 group-hover:text-white/80 font-medium">
                          {lg.subtitle}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-transform" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Card 3: ยอดผู้ชมสนาม (Green/Emerald Theme) */}
          <div className="flex flex-col rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
            {/* Top Green Button */}
            <button
              type="button"
              onClick={() => toggleDropdown('attendance')}
              className="w-full p-5 sm:p-6 bg-gradient-to-br from-[#00cc88] via-[#00b377] to-[#009966] text-white flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer shadow-lg relative group transition-all"
            >
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center mb-1 text-white shadow-inner">
                <Users className="w-5 h-5" />
              </div>
              <span className="text-base sm:text-lg font-black tracking-wide leading-tight">
                ยอดผู้ชม
              </span>
              <span className="text-xs font-semibold text-emerald-100 mt-0.5">
                สถิติผู้ชม & ผลคะแนน
              </span>
              <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-white/90 underline underline-offset-4 group-hover:text-white">
                <span>คลิก</span>
                {openDropdowns.attendance ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </div>
            </button>

            {/* Dropdown Menu (Soft Green container as in Mockup 2) */}
            {openDropdowns.attendance && (
              <div className="bg-[#d1fae5] p-3 sm:p-4 space-y-2 border-t-2 border-emerald-300 text-slate-800 transition-all animate-in fade-in">
                {leagues.map(lg => (
                  <button
                    key={lg.id}
                    onClick={() => onSelectFeatureAndLeague('attendance', lg.id)}
                    className="w-full p-3 rounded-2xl bg-white hover:bg-emerald-600 hover:text-white text-slate-800 font-bold text-left flex items-center justify-between shadow-2xs border border-emerald-200/80 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-emerald-100 group-hover:bg-white group-hover:text-emerald-600 text-emerald-700 flex items-center justify-center font-extrabold text-xs">
                        {lg.badgeText}
                      </span>
                      <div>
                        <div className="text-sm font-black">- {lg.name}</div>
                        <div className="text-[10px] text-slate-500 group-hover:text-white/80 font-medium">
                          {lg.subtitle}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-transform" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Small explainer text at the bottom (Mockup 2) */}
        <div className="text-xs sm:text-sm font-medium text-teal-200/90 pt-4">
          คลิกปุ่มใหญ่แล้วจะมีแท็บ Dropdown ขึ้นมาให้เลือก League
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 w-full text-center text-[11px] text-teal-200/50">
        © 2026 Plan B Media Co., Ltd. & Thai League Co., Ltd. All Rights Reserved.
      </div>
    </div>
  );
};
