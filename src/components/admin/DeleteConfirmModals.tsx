import React from 'react';
import { Trash2, AlertTriangle, X, Check, RefreshCw } from 'lucide-react';
import { RegistrationRecord } from '../../types';

interface SingleDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: RegistrationRecord | null;
  onConfirm: () => Promise<void>;
  isProcessing: boolean;
}

export const SingleDeleteModal: React.FC<SingleDeleteModalProps> = ({
  isOpen,
  onClose,
  record,
  onConfirm,
  isProcessing,
}) => {
  if (!isOpen || !record) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
        <button
          onClick={onClose}
          disabled={isProcessing}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-rose-100 text-rose-600">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">ยืนยันการลบคำขอนี้?</h3>
            <p className="text-xs text-slate-500">ข้อมูลจะถูกลบออกจากระบบและไม่สามารถกู้คืนได้</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2 mb-6">
          <div className="flex justify-between">
            <span className="text-slate-500">ผู้ขอ / ดีลเลอร์:</span>
            <span className="font-bold text-slate-800">{record.applicantName} {record.dealerName ? `(${record.dealerName})` : ''}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">แบรนด์ผู้สนับสนุน:</span>
            <span className="font-bold text-slate-900 px-2 py-0.5 rounded bg-white border border-slate-200">{record.brand}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">คู่แข่งขัน:</span>
            <span className="font-medium text-slate-700 truncate max-w-[200px]">{record.matchTitle}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">วันที่แข่งขัน:</span>
            <span className="font-medium text-slate-700">{record.matchDate}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200/80 pt-2">
            <span className="text-slate-500">สิทธิ์ที่ขอ:</span>
            <span className="font-bold text-emerald-700">
              {record.boothRequired ? 'ขอออกบูธ 1 จุด ' : ''}
              {record.ticketRequired ? `+ บัตร ${record.ticketQuantity} ใบ` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-sm"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>กำลังลบข้อมูล...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>ยืนยันลบรายการนี้</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

interface DeleteAllModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalRecordsCount: number;
  filteredCount: number;
  scope: 'filtered' | 'all';
  setScope: (s: 'filtered' | 'all') => void;
  onConfirm: () => Promise<void>;
  isProcessing: boolean;
  onResetSampleData?: () => void;
}

export const DeleteAllModal: React.FC<DeleteAllModalProps> = ({
  isOpen,
  onClose,
  totalRecordsCount,
  filteredCount,
  scope,
  setScope,
  onConfirm,
  isProcessing,
  onResetSampleData,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-100 relative">
        <button
          onClick={onClose}
          disabled={isProcessing}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-rose-100 text-rose-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">ลบคำขอลงทะเบียน (Delete All)</h3>
            <p className="text-xs text-slate-500">เลือกขอบเขตคำขอที่ต้องการลบออกจากระบบฐานข้อมูล</p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <label 
            onClick={() => setScope('filtered')}
            className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
              scope === 'filtered' 
                ? 'bg-rose-50/50 border-rose-300 ring-2 ring-rose-200' 
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <input 
              type="radio" 
              name="deleteScope" 
              checked={scope === 'filtered'} 
              onChange={() => setScope('filtered')}
              className="mt-0.5 text-rose-600"
            />
            <div>
              <div className="text-xs font-bold text-slate-900">
                ลบเฉพาะรายการที่ผ่านการกรองอยู่ในขณะนี้ ({filteredCount} รายการ)
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                ลบเฉพาะรายการตามผลการค้นหา/ตัวกรองแบรนด์หรือลีกที่เลือกไว้
              </p>
            </div>
          </label>

          <label 
            onClick={() => setScope('all')}
            className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
              scope === 'all' 
                ? 'bg-rose-50/50 border-rose-300 ring-2 ring-rose-200' 
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <input 
              type="radio" 
              name="deleteScope" 
              checked={scope === 'all'} 
              onChange={() => setScope('all')}
              className="mt-0.5 text-rose-600"
            />
            <div>
              <div className="text-xs font-bold text-rose-900">
                ลบคำขอทั้งหมดในระบบทุกสถานะ ({totalRecordsCount} รายการ)
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                ล้างข้อมูลคำขอออกบูธและรับบัตรทั้งหมดในฐานข้อมูล (เคลียร์ระบบเพื่อเริ่มฤดูกาลใหม่หรือเริ่มบันทึกใหม่)
              </p>
            </div>
          </label>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2 mb-6">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            คำเตือน: การลบนี้จะล้างข้อมูลออกจาก Firebase Firestore และ Local Storage ทันที
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {onResetSampleData && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onResetSampleData();
              }}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 underline"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>หรือต้องการโหลดข้อมูลตัวอย่างใหม่อีกครั้ง?</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isProcessing || (scope === 'filtered' ? filteredCount === 0 : totalRecordsCount === 0)}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังดำเนินการ...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ยืนยันลบ {scope === 'filtered' ? `${filteredCount} รายการ` : `ทั้งหมด ${totalRecordsCount} รายการ`}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
