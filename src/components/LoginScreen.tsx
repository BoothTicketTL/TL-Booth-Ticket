import React, { useState } from 'react';
import { Check, AlertCircle, Sparkles, Shield, Lock } from 'lucide-react';
import { LeagueBadge } from './common/LeagueBadge';
import { findAuthorizedUserByEmail, isEmailAuthorized } from '../lib/userManagementService';
import { signInWithGoogle } from '../lib/firebase';
import { UserProfile } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [emailInput, setEmailInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const email = emailInput.trim();
    if (!email) {
      setErrorMessage('กรุณากรอก E-mail เพื่อเข้าสู่ระบบ');
      return;
    }

    if (!email.includes('@')) {
      setErrorMessage('รูปแบบ E-mail ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Strict check against authorized accounts stored in User Management system
      const authorizedUser = findAuthorizedUserByEmail(email);

      if (!authorizedUser) {
        setErrorMessage(
          'อีเมลนี้ยังไม่ได้ลงทะเบียนในระบบจัดการสิทธิ์ & บัญชีผู้ใช้งาน บุคคลภายนอกไม่สามารถเข้าได้ กรุณาติดต่อผู้ดูแลระบบ Plan B Media'
        );
        setIsSubmitting(false);
        return;
      }

      // 2. Perform login with the matched profile
      const user = await signInWithGoogle(
        authorizedUser.email,
        authorizedUser.name,
        authorizedUser.role
      );

      setIsSubmitting(false);
      onLoginSuccess(user);
    } catch (err) {
      console.error('Login error:', err);
      setErrorMessage('เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center p-4 sm:p-8 bg-gradient-to-br from-[#021f24] via-[#05383f] to-[#011417] text-white select-none">
      {/* Background glowing aurora rings and decorative ambient curves */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Soft glowing ambient orbs */}
        <div className="absolute top-1/4 left-1/5 w-96 h-96 rounded-full bg-emerald-500/15 blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute top-1/3 right-1/5 w-80 h-80 rounded-full bg-teal-400/15 blur-3xl" />

        {/* Decorative thin white curved lines (as seen in Mockup 1) */}
        <svg className="absolute inset-0 w-full h-full opacity-35" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
          <path d="M 1150 0 C 1220 300 1350 650 1440 900" stroke="#ffffff" strokeWidth="1.5" />
          <path d="M 1250 0 C 1330 350 1400 680 1440 850" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" />
        </svg>
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center text-center space-y-8 sm:space-y-12">
        {/* Title: TL Booths & Tickets System */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
            TL Booths & Tickets System
          </h1>
          <p className="text-xs sm:text-sm font-semibold tracking-wide text-teal-200/80 uppercase">
            Plan B Media • Official Thai League Partner Portal
          </p>
        </div>

        {/* 3 League Official Badges (Mockup 1 - Large & cohesive) */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-3 my-2 sm:my-4 max-w-full">
          {/* League 1 Badge */}
          <div className="flex flex-col items-center group cursor-pointer transition-transform hover:scale-105 drop-shadow-xl">
            <LeagueBadge league="League 1" size="2xl" />
          </div>

          {/* League 2 Badge */}
          <div className="flex flex-col items-center group cursor-pointer transition-transform hover:scale-105 drop-shadow-xl">
            <LeagueBadge league="League 2" size="2xl" />
          </div>

          {/* League 3 Badge */}
          <div className="flex flex-col items-center group cursor-pointer transition-transform hover:scale-105 drop-shadow-xl">
            <LeagueBadge league="League 3" size="2xl" />
          </div>
        </div>

        {/* Email Input Form with Green Submit Checkmark Button (Mockup 1) */}
        <div className="w-full max-w-xl space-y-4">
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="กรอก E-mail เพื่อเข้าสู่ระบบ"
              className="w-full h-14 sm:h-16 pl-6 pr-16 rounded-full bg-white text-slate-800 text-sm sm:text-base font-semibold shadow-2xl focus:outline-none focus:ring-4 focus:ring-emerald-400/40 transition-all placeholder:text-slate-400"
              autoFocus
            />

            {/* Circular Green Checkmark Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#10b981] hover:bg-[#059669] text-white flex items-center justify-center shadow-md hover:shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
              title="เข้าสู่ระบบ"
            >
              <Check className="w-6 h-6 stroke-[3]" />
            </button>
          </form>

          {/* Error Feedback if email is not authorized */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs sm:text-sm font-medium flex items-center gap-3 text-left shadow-lg animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Security Note */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] sm:text-xs text-teal-200/70 pt-2 font-medium">
            <Lock className="w-3.5 h-3.5 text-teal-300" />
            <span>ระบบจำกัดการเข้าถึงเฉพาะ E-mail ที่ได้รับอนุญาตจาก Plan B Media เท่านั้น</span>
          </div>
        </div>
      </div>
    </div>
  );
};
