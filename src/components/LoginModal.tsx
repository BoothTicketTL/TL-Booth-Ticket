import React, { useState } from 'react';
import { Mail, X, Shield, CheckCircle2, User, Sparkles } from 'lucide-react';
import { signInWithGoogle } from '../lib/firebase';
import { UserProfile } from '../types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('admin');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  if (!isOpen) return null;

  const handleQuickSignIn = async (email: string, name: string, targetRole: 'admin' | 'user') => {
    try {
      setIsLoggingIn(true);
      const user = await signInWithGoogle(email, name, targetRole);
      setIsLoggingIn(false);
      onSuccess(user);
      onClose();
    } catch (e) {
      setIsLoggingIn(false);
      console.error(e);
    }
  };

  const handleCustomSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail || !customEmail.includes('@')) return;
    await handleQuickSignIn(customEmail, customName || customEmail.split('@')[0], role);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-100 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand & Gmail Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white shadow-md border border-slate-100 flex items-center justify-center mx-auto mb-3">
            {/* Google official multi-color "G" logo svg */}
            <svg className="w-8 h-8" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            เข้าสู่ระบบด้วย Gmail
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Thai League 2026-27 Registration & Real-Time Dashboard
          </p>
        </div>

        {/* Preset 1-Click Login Accounts for immediate testing */}
        <div className="space-y-2.5 mb-5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
            เลือกบัญชีสำหรับเข้าสู่ระบบแบบด่วน (Fast Sign-In)
          </div>

          {/* Account 1: Admin siriprapa.po@planbmedia.co.th */}
          <button
            type="button"
            id="btn-login-admin-preset"
            disabled={isLoggingIn}
            onClick={() => handleQuickSignIn(
              'siriprapa.po@planbmedia.co.th',
              'siriprapa.po (Admin Plan B)',
              'admin'
            )}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-100/60 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                SP
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                  <span>siriprapa.po</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-600 text-white font-medium">ทุกแบรนด์ (Admin)</span>
                </div>
                <div className="text-[11px] text-blue-700 truncate">
                  siriprapa.po@planbmedia.co.th
                </div>
              </div>
            </div>
            <Shield className="w-4 h-4 text-blue-600 shrink-0 group-hover:scale-110 transition-transform" />
          </button>

          {/* Account 2: chitipat.ja@planbmedia.co.th (BYD Client) */}
          <button
            type="button"
            id="btn-login-byd-preset"
            disabled={isLoggingIn}
            onClick={() => handleQuickSignIn(
              'chitipat.ja@planbmedia.co.th',
              'chitipat.ja (BYD Client)',
              'user'
            )}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/60 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                CJ
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                  <span>chitipat.ja</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-600 text-white font-medium">ล็อค: BYD</span>
                </div>
                <div className="text-[11px] text-emerald-700 truncate">
                  chitipat.ja@planbmedia.co.th
                </div>
              </div>
            </div>
            <User className="w-4 h-4 text-emerald-600 shrink-0 group-hover:scale-110 transition-transform" />
          </button>

          {/* Account 3: pakawan.pl@planbmedia.co.th (Molten Client) */}
          <button
            type="button"
            id="btn-login-molten-preset"
            disabled={isLoggingIn}
            onClick={() => handleQuickSignIn(
              'pakawan.pl@planbmedia.co.th',
              'pakawan.pl (Molten Client)',
              'user'
            )}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-100/60 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                PP
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                  <span>pakawan.pl</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-600 text-white font-medium">ล็อค: Molten</span>
                </div>
                <div className="text-[11px] text-amber-800 truncate">
                  pakawan.pl@planbmedia.co.th
                </div>
              </div>
            </div>
            <User className="w-4 h-4 text-amber-600 shrink-0 group-hover:scale-110 transition-transform" />
          </button>
        </div>

        {/* Divider */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-white px-2 text-slate-400 font-semibold">หรือระบุอีเมล Gmail ของคุณ</span>
          </div>
        </div>

        {/* Custom Email Form */}
        <form onSubmit={handleCustomSignIn} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">
              อีเมล Gmail
            </label>
            <input
              type="email"
              id="input-login-custom-email"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder="yourname@gmail.com"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                ชื่อแสดง
              </label>
              <input
                type="text"
                id="input-login-custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="ชื่อผู้ใช้งาน"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                บทบาท
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              >
                <option value="admin">แอดมิน (Admin)</option>
                <option value="user">ผู้ลงทะเบียนทั่วไป</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            id="btn-login-submit"
            disabled={isLoggingIn || !customEmail}
            className="w-full mt-2 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-xs"
          >
            {isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Gmail นี้'}
          </button>
        </form>

        <p className="text-[10px] text-slate-400 text-center mt-4">
          ระบบเชื่อมต่อกับ Firebase Authentication & Project: Thaileague 2026-27
        </p>
      </div>
    </div>
  );
};
