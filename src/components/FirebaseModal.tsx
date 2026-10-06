import React, { useState } from 'react';
import { Database, X, Check, Save, Sparkles, Shield, AlertCircle } from 'lucide-react';
import { 
  DEFAULT_FIREBASE_PROJECT_ID, 
  getSavedFirebaseConfig, 
  saveFirebaseConfig, 
  FirebaseConfigType 
} from '../lib/firebase';

interface FirebaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirebaseModal: React.FC<FirebaseModalProps> = ({ isOpen, onClose }) => {
  const currentConfig = getSavedFirebaseConfig() || {};
  const [projectId, setProjectId] = useState(currentConfig.projectId || DEFAULT_FIREBASE_PROJECT_ID);
  const [apiKey, setApiKey] = useState(currentConfig.apiKey || '');
  const [authDomain, setAuthDomain] = useState(currentConfig.authDomain || `${DEFAULT_FIREBASE_PROJECT_ID}.firebaseapp.com`);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveFirebaseConfig({
      projectId: projectId.trim(),
      apiKey: apiKey.trim(),
      authDomain: authDomain.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-amber-100 text-amber-700">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              ตั้งค่าฐานข้อมูล Firebase
            </h2>
            <p className="text-xs text-slate-500">
              โครงการ: <span className="font-semibold text-slate-800">Thaileague 2026-27</span>
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 mb-4 space-y-1">
          <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>สถานะระบบ: เชื่อมต่อและซิงค์ข้อมูล Real-Time พร้อมใช้งาน</span>
          </div>
          <p className="text-[11px] text-slate-500">
            ระบบจัดเก็บข้อมูลลง collection: <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">thaileague_registrations</code> พร้อมการสำรองข้อมูลอัตโนมัติ
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Firebase Project ID
            </label>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="Thaileague 2026-27"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Auth Domain
            </label>
            <input
              type="text"
              value={authDomain}
              onChange={(e) => setAuthDomain(e.target.value)}
              placeholder="thaileague-2026-27.firebaseapp.com"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Web API Key (Optional)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>บันทึกการตั้งค่า</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
