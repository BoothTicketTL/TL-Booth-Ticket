import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Shield, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Mail, 
  Building, 
  AlertCircle,
  Sparkles,
  Lock,
  Tag,
  RefreshCw
} from 'lucide-react';
import { 
  getAuthorizedUsers, 
  subscribeToAuthorizedUsers, 
  addAuthorizedUser, 
  updateAuthorizedUser, 
  deleteAuthorizedUser, 
  resetAllNamesToCleanEnglish,
  AuthorizedUser,
  INITIAL_AUTHORIZED_USERS
} from '../../lib/userManagementService';
import { getSponsorBrands, SponsorBrandItem } from '../../lib/brandService';
import { refreshCurrentUserRoleAndBrand } from '../../lib/firebase';
import { UserProfile } from '../../types';

interface UserManagementPanelProps {
  currentUser: UserProfile | null;
}

export const UserManagementPanel: React.FC<UserManagementPanelProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<AuthorizedUser[]>(getAuthorizedUsers());
  const [brands, setBrands] = useState<SponsorBrandItem[]>(getSponsorBrands());

  // Form State (New User)
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [inputEmail, setInputEmail] = useState('');
  const [inputName, setInputName] = useState('');
  const [inputRole, setInputRole] = useState<'admin' | 'user'>('user');
  const [inputAssignedBrand, setInputAssignedBrand] = useState('BYD');
  const [inputOrg, setInputOrg] = useState('');
  const [inputNote, setInputNote] = useState('');

  // Editing User Name & Info State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editOrgValue, setEditOrgValue] = useState('');
  const [editNoteValue, setEditNoteValue] = useState('');

  // Processing & Feedback
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsub = subscribeToAuthorizedUsers((list) => {
      setUsers(list);
    });
    return () => unsub();
  }, []);

  const handleStartEdit = (user: AuthorizedUser) => {
    setEditingUserId(user.id);
    setEditNameValue(user.name);
    setEditOrgValue(user.organization || '');
    setEditNoteValue(user.note || '');
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditNameValue('');
    setEditOrgValue('');
    setEditNoteValue('');
  };

  const handleSaveEdit = async (userId: string) => {
    if (!editNameValue.trim()) {
      setNotification({ type: 'error', message: 'กรุณากรอกชื่อผู้ใช้งาน' });
      return;
    }

    try {
      setIsProcessing(true);
      const res = await updateAuthorizedUser(userId, {
        name: editNameValue.trim(),
        organization: editOrgValue.trim() || undefined,
        note: editNoteValue.trim() || undefined,
      });

      if (res.success) {
        refreshCurrentUserRoleAndBrand();
        setNotification({ type: 'success', message: 'บันทึกการแก้ไขชื่อและข้อมูลผู้ใช้งานเรียบร้อยแล้ว' });
        setEditingUserId(null);
      } else {
        setNotification({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึกชื่อ' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetAllToEnglish = async () => {
    try {
      setIsProcessing(true);
      const res = await resetAllNamesToCleanEnglish();
      if (res.success) {
        refreshCurrentUserRoleAndBrand();
        setNotification({ 
          type: 'success', 
          message: 'เปลี่ยนชื่อผู้ใช้งานทั้งหมดเป็นชื่อภาษาอังกฤษตาม Email เรียบร้อยแล้ว (ไม่มีชื่อสะกดผิด)' 
        });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'เกิดข้อผิดพลาด' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputEmail.trim() || !inputEmail.includes('@')) {
      setNotification({ type: 'error', message: 'กรุณากรอก E-mail ที่ถูกต้อง' });
      return;
    }

    try {
      setIsProcessing(true);
      const res = await addAuthorizedUser({
        email: inputEmail.trim(),
        name: inputName.trim() || inputEmail.split('@')[0],
        role: inputRole,
        assignedBrand: inputRole === 'admin' ? 'All' : inputAssignedBrand,
        organization: inputOrg.trim() || (inputRole === 'admin' ? 'Plan B Media / Thai League' : `ตัวแทนแบรนด์ ${inputAssignedBrand}`),
        note: inputNote.trim() || undefined,
        addedBy: currentUser?.displayName || currentUser?.email || 'Admin',
      });

      if (res.success) {
        refreshCurrentUserRoleAndBrand();
        setNotification({ type: 'success', message: res.message });
        setInputEmail('');
        setInputName('');
        setInputOrg('');
        setInputNote('');
        setIsAddingUser(false);
      } else {
        setNotification({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleRole = async (user: AuthorizedUser) => {
    if (user.email === 'siriprapa.po@planbmedia.co.th') {
      setNotification({ type: 'error', message: 'ไม่สามารถเปลี่ยนบทบาทของ Super Admin หลักได้' });
      return;
    }

    const newRole: 'admin' | 'user' = user.role === 'admin' ? 'user' : 'admin';
    const newBrand = newRole === 'admin' ? 'All' : (user.assignedBrand === 'All' ? 'BYD' : user.assignedBrand || 'BYD');

    try {
      setIsProcessing(true);
      const res = await updateAuthorizedUser(user.id, {
        role: newRole,
        assignedBrand: newBrand,
      });
      if (res.success) {
        refreshCurrentUserRoleAndBrand();
        setNotification({ type: 'success', message: `เปลี่ยนบทบาทของ "${user.email}" เป็น ${newRole === 'admin' ? 'แอดมิน' : 'ลูกค้าแบรนด์'} เรียบร้อยแล้ว` });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBrandChange = async (user: AuthorizedUser, newBrand: string) => {
    try {
      setIsProcessing(true);
      const res = await updateAuthorizedUser(user.id, {
        assignedBrand: newBrand,
      });
      if (res.success) {
        refreshCurrentUserRoleAndBrand();
        setNotification({ 
          type: 'success', 
          message: `กำหนดสิทธิ์ E-mail "${user.email}" ให้เป็นลูกค้าแบรนด์ "${newBrand}" เรียบร้อยแล้ว` 
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = async (user: AuthorizedUser) => {
    if (user.email === 'siriprapa.po@planbmedia.co.th') {
      setNotification({ type: 'error', message: 'ไม่สามารถลบ Super Admin หลักของระบบได้' });
      return;
    }

    try {
      setIsProcessing(true);
      const res = await deleteAuthorizedUser(user.id);
      if (res.success) {
        refreshCurrentUserRoleAndBrand();
        setNotification({ type: 'success', message: res.message });
      } else {
        setNotification({ type: 'error', message: res.message });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetPresetUsers = async () => {
    try {
      setIsProcessing(true);
      // Ensure chitipat.ja is BYD and pakawan.pl is Molten with clean English names
      const chitipat = users.find(u => u.email.toLowerCase() === 'chitipat.ja@planbmedia.co.th');
      if (chitipat) {
        await updateAuthorizedUser(chitipat.id, { 
          name: 'chitipat.ja (BYD Client)',
          role: 'user', 
          assignedBrand: 'BYD' 
        });
      } else {
        await addAuthorizedUser({
          email: 'chitipat.ja@planbmedia.co.th',
          name: 'chitipat.ja (BYD Client)',
          role: 'user',
          assignedBrand: 'BYD',
          organization: 'Plan B Media / BYD Client',
          addedBy: 'Admin Reset',
        });
      }

      const pakawan = users.find(u => u.email.toLowerCase() === 'pakawan.pl@planbmedia.co.th');
      if (pakawan) {
        await updateAuthorizedUser(pakawan.id, { 
          name: 'pakawan.pl (Molten Client)',
          role: 'user', 
          assignedBrand: 'Molten' 
        });
      } else {
        await addAuthorizedUser({
          email: 'pakawan.pl@planbmedia.co.th',
          name: 'pakawan.pl (Molten Client)',
          role: 'user',
          assignedBrand: 'Molten',
          organization: 'Plan B Media / Molten Client',
          addedBy: 'Admin Reset',
        });
      }

      refreshCurrentUserRoleAndBrand();
      setNotification({ 
        type: 'success', 
        message: 'รีเซ็ตบัญชีตัวอย่าง: chitipat.ja (BYD) และ pakawan.pl (Molten) เรียบร้อยแล้ว' 
      });
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || 'เกิดข้อผิดพลาด' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">จัดการสิทธิ์และล็อคแบรนด์ตาม E-mail (Brand Lock Access)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Admin สามารถกำหนดได้ว่า E-mail ใดเป็นลูกค้าของแบรนด์อะไร เพื่อล็อคไม่ให้ลูกค้าเข้าดูหรือลงทะเบียนของแบรนด์อื่น
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleResetAllToEnglish}
              disabled={isProcessing}
              title="ล้างชื่อภาษาไทยที่สะกดผิดทั้งหมด และตั้งเป็นชื่อภาษาอังกฤษตาม Email"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50/80 hover:bg-amber-100 text-amber-900 text-xs font-semibold shadow-xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
              <span>ล้างชื่อสะกดผิดเป็นภาษาอังกฤษทั้งหมด</span>
            </button>

            <button
              type="button"
              onClick={handleResetPresetUsers}
              disabled={isProcessing}
              title="ตั้งค่า chitipat.ja@planbmedia.co.th (BYD) และ pakawan.pl@planbmedia.co.th (Molten)"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-xs transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>ซิงค์บัญชี BYD & Molten</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddingUser(!isAddingUser)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
            >
              {isAddingUser ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              <span>{isAddingUser ? 'ปิดฟอร์ม' : 'เพิ่มสิทธิ์ผู้ใช้งาน'}</span>
            </button>
          </div>
        </div>

        {/* Feature explanation card */}
        <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-blue-50/70 via-slate-50 to-emerald-50/70 border border-blue-100/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-slate-900">
                ระบบล็อคสิทธิ์ตาม E-mail (Brand Lock Security)
              </div>
              <div className="text-slate-600 text-[11px] mt-0.5">
                เมื่อผู้ใช้เข้าสู่ระบบด้วย Gmail ที่กำหนด ระบบจะล็อคหน้าลงทะเบียนบูธและบัตรบอลให้ใช้ได้เฉพาะแบรนด์ที่ Admin กำหนดเท่านั้น และไม่สามารถดูข้อมูลของแบรนด์อื่นได้
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-[11px] font-bold text-blue-900 shadow-2xs">
              🚗 chitipat.ja ➔ BYD
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-[11px] font-bold text-emerald-900 shadow-2xs">
              ⚽ pakawan.pl ➔ Molten
            </span>
          </div>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div className={`mt-4 p-3 rounded-xl text-xs flex items-center justify-between gap-2 ${
            notification.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
              <span className="font-medium">{notification.message}</span>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Add User Form */}
      {isAddingUser && (
        <form onSubmit={handleAddUser} className="bg-white rounded-3xl p-6 border border-emerald-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <UserPlus className="w-4 h-4 text-emerald-600" />
              <span>เพิ่มผู้ใช้งานและกำหนดแบรนด์ที่ดูแล (Add User & Assign Brand)</span>
            </div>
            <button 
              type="button" 
              onClick={() => setIsAddingUser(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                อีเมล Gmail ของผู้ใช้ <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={inputEmail}
                  onChange={e => setInputEmail(e.target.value)}
                  placeholder="เช่น chitipat.ja@planbmedia.co.th"
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ชื่อ-นามสกุล / ชื่อแสดง
              </label>
              <input
                type="text"
                value={inputName}
                onChange={e => setInputName(e.target.value)}
                placeholder="เช่น chitipat.ja หรือ คุณชิติพัทธ์"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                บทบาท (Role) <span className="text-rose-500">*</span>
              </label>
              <select
                value={inputRole}
                onChange={e => setInputRole(e.target.value as any)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="user">ลูกค้าแบรนด์ (Brand Client - ล็อคเฉพาะแบรนด์ตนเอง)</option>
                <option value="admin">แอดมิน (Admin - จัดการได้ทุกแบรนด์)</option>
              </select>
            </div>

            {inputRole === 'user' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  แบรนด์ที่ล็อคสิทธิ์ให้ดูแล (Assigned Brand) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={inputAssignedBrand}
                  onChange={e => setInputAssignedBrand(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-emerald-300 text-xs font-bold text-emerald-900 bg-emerald-50/50 focus:ring-2 focus:ring-emerald-500"
                >
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.id} ({b.name})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  ผู้ใช้นี้จะถูกล็อคให้ลงทะเบียนและดูข้อมูลได้เฉพาะแบรนด์นี้เท่านั้น
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                สังกัด / องค์กร
              </label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={inputOrg}
                  onChange={e => setInputOrg(e.target.value)}
                  placeholder="เช่น Plan B Media Co., Ltd. หรือ บีวายดี เรเว่"
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                หมายเหตุเพิ่มเติม (Note)
              </label>
              <input
                type="text"
                value={inputNote}
                onChange={e => setInputNote(e.target.value)}
                placeholder="เช่น ผู้ประสานงานสัญญารอบใหม่"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingUser(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>บันทึกสิทธิ์ผู้ใช้งาน</span>
            </button>
          </div>
        </form>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-slate-900">รายชื่อผู้ใช้งานและแบรนด์ที่ล็อคไว้ (User Brand Assignments)</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
              {users.length} บัญชี
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" /> แอดมิน ({users.filter(u => u.role === 'admin').length})
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 text-slate-700 font-semibold">
              <Users className="w-3.5 h-3.5" /> ลูกค้าแบรนด์ ({users.filter(u => u.role === 'user').length})
            </span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {users.map((user) => {
            const isSuperAdmin = user.email === 'siriprapa.po@planbmedia.co.th';
            const isEditing = editingUserId === user.id;

            return (
              <div key={user.id} className="transition-colors">
                {/* Inline Editing Form */}
                {isEditing ? (
                  <div className="p-5 bg-blue-50/60 border-l-4 border-blue-500 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Edit3 className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-bold text-slate-900">
                          แก้ไขชื่อผู้ใช้งานและข้อมูล: <span className="text-blue-700 font-semibold">{user.email}</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={isProcessing}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-bold text-slate-700">
                            ชื่อ-นามสกุล / ชื่อแสดง (Display Name) <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setEditNameValue(user.email.split('@')[0])}
                            className="text-[10px] text-blue-600 hover:underline font-semibold"
                          >
                            ใช้ชื่อตาม Email ({user.email.split('@')[0]})
                          </button>
                        </div>
                        <input
                          type="text"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          placeholder="เช่น pakawan.pl หรือ พิมพ์ชื่อภาษาไทยที่ถูกต้อง"
                          className="w-full px-3.5 py-2 rounded-xl border border-blue-300 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          💡 พิมพ์ชื่อภาษาไทยที่สะกดถูกต้อง หรือใช้ชื่อภาษาอังกฤษได้ตามต้องการ
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          สังกัด / องค์กร (Organization)
                        </label>
                        <input
                          type="text"
                          value={editOrgValue}
                          onChange={(e) => setEditOrgValue(e.target.value)}
                          placeholder="เช่น Plan B Media Co., Ltd. หรือ BYD Rever Automotive"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          หมายเหตุเพิ่มเติม (Note)
                        </label>
                        <input
                          type="text"
                          value={editNoteValue}
                          onChange={(e) => setEditNoteValue(e.target.value)}
                          placeholder="เช่น ลูกค้าแบรนด์ Molten ผู้ดูแลโควตาบัตรและบูธ"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={isProcessing}
                        className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(user.id)}
                        disabled={isProcessing}
                        className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>บันทึกชื่อ</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Standard User Row */
                  <div className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        user.role === 'admin' 
                          ? 'bg-blue-600 text-white shadow-xs' 
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {user.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">{user.name}</span>
                          {isSuperAdmin && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold border border-amber-200">
                              Super Admin (Plan B)
                            </span>
                          )}
                          {/* Edit Name Button */}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(user)}
                            disabled={isProcessing}
                            title="คลิกเพื่อแก้ไขชื่อผู้ใช้งาน หรือแก้ไขตัวสะกดภาษาไทย"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-colors shadow-2xs cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3 text-slate-500" />
                            <span>แก้ไขชื่อ</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                          <span className="font-semibold text-slate-700">{user.email}</span>
                          {user.organization && (
                            <>
                              <span>•</span>
                              <span>{user.organization}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Role Selector / Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleRole(user)}
                        disabled={isSuperAdmin || isProcessing}
                        title={isSuperAdmin ? 'Super Admin หลัก' : 'คลิกเพื่อสลับระหว่าง Admin กับ ลูกค้าแบรนด์'}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                          user.role === 'admin'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {user.role === 'admin' ? (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                            <span>แอดมิน (เข้าถึงทุกแบรนด์)</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5 text-emerald-600" />
                            <span>ลูกค้าแบรนด์ (ล็อคสิทธิ์)</span>
                          </>
                        )}
                      </button>

                      {/* Assigned Brand Selector (Admin can change at any time) */}
                      {user.role === 'user' ? (
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                          <span className="text-[11px] font-semibold text-slate-500">แบรนด์ที่ดูแล:</span>
                          <select
                            value={user.assignedBrand || 'BYD'}
                            onChange={(e) => handleBrandChange(user, e.target.value)}
                            disabled={isProcessing}
                            className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          >
                            {brands.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.id} ({b.name})
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic px-2 py-1">
                          (เห็นข้อมูลทุกแบรนด์)
                        </span>
                      )}

                      {/* Delete Button */}
                      {!isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user)}
                          disabled={isProcessing}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="ลบสิทธิ์ผู้ใช้งานนี้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
