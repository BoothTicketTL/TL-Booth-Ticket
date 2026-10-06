import React from 'react';
import { 
  LogOut, 
  LogIn, 
  ShieldAlert, 
  ShieldCheck, 
  Sparkles, 
  Radio, 
  RefreshCw,
  SlidersHorizontal,
  Mail,
  Home
} from 'lucide-react';
import { UserProfile } from '../types';

interface NavbarProps {
  currentUser: UserProfile | null;
  onOpenLoginModal: () => void;
  onSignOut: () => void;
  onSwitchRole: () => void;
  isRealtimeConnected: boolean;
  onResetData: () => void;
  onGoToHub?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onOpenLoginModal,
  onSignOut,
  onSwitchRole,
  isRealtimeConnected,
  onResetData,
  onGoToHub,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* 3-Color sports top gradient hairline */}
      <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-rose-500 to-blue-600" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left side title & Home Hub button */}
        <div className="flex items-center gap-3">
          {onGoToHub && (
            <button
              onClick={onGoToHub}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-transform hover:scale-105 cursor-pointer"
              title="กลับไปหน้าหลักเพื่อเลือกเมนูและลีก"
            >
              <Home className="w-4 h-4 text-emerald-400" />
              <span>🏠 เมนูหลัก / เลือกลีก</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Real-Time Sync</span>
            </span>

            <span className="text-xs text-slate-400">|</span>

            <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
              <span>Firebase:</span>
              <span className="font-semibold text-slate-700">Thaileague 2026-27</span>
            </div>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* Quick Demo Reset Data (เฉพาะ Admin) */}
          {currentUser?.role === 'admin' && (
            <button
              id="btn-reset-demo-data"
              onClick={onResetData}
              title="รีเซ็ตข้อมูลตัวอย่างฤดูกาล 2026-27"
              className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>รีเซ็ตข้อมูล</span>
            </button>
          )}

          {/* User Auth Info */}
          {currentUser ? (
            <div className="flex items-center gap-2">
              {/* Role Toggle Switch for convenient previewing */}
              <button
                id="btn-toggle-role"
                onClick={onSwitchRole}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border shadow-2xs transition-all cursor-pointer ${
                  currentUser.role === 'admin'
                    ? 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                }`}
                title="คลิกที่นี่เพื่อสลับบทบาทดูหน้าจอระหว่าง แอดมิน (Admin) กับ ผู้ใช้งานทั่วไป (Client/Brand)"
              >
                {currentUser.role === 'admin' ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>บทบาท: แอดมิน (Admin)</span>
                    <span className="text-[10px] bg-blue-200/80 text-blue-900 px-1.5 py-0.5 rounded font-semibold ml-0.5">
                      สลับเป็นผู้ใช้ทั่วไป ⇄
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>บทบาท: ผู้ใช้งานทั่วไป</span>
                    <span className="text-[10px] bg-emerald-200/80 text-emerald-900 px-1.5 py-0.5 rounded font-semibold ml-0.5">
                      สลับเป็นแอดมิน ⇄
                    </span>
                  </>
                )}
              </button>

              {/* User Email Pill */}
              <div className="hidden sm:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
                <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-[10px]">
                  G
                </div>
                <span className="text-slate-700 font-medium truncate max-w-[170px]" title={currentUser.email}>
                  {currentUser.email}
                </span>
              </div>

              {/* Logout Button */}
              <button
                id="btn-logout"
                onClick={onSignOut}
                title="ออกจากระบบ"
                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                id="btn-preview-user-mode"
                onClick={onSwitchRole}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 text-xs font-bold transition-all cursor-pointer"
                title="ทดลองดูหน้าจอในมุมมองผู้ใช้งานทั่วไป (Client/Brand)"
              >
                <ShieldAlert className="w-4 h-4 text-emerald-600" />
                <span>ดูมุมมองผู้ใช้ทั่วไป</span>
              </button>
              <button
                id="btn-open-login"
                onClick={onOpenLoginModal}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs font-semibold hover:from-blue-700 hover:to-blue-800 shadow-xs transition-all cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>เข้าสู่ระบบด้วย Gmail</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
