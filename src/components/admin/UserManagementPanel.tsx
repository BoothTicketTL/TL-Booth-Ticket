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
  const [inputAssignedBrands, setInputAssignedBrands] = useState<string[]>(['BYD']);
  const [inputOrg, setInputOrg] = useState('');
  const [inputNote, setInputNote] = useState('');

  // Editing User Name & Info State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editOrgValue, setEditOrgValue] = useState('');
  const [editNoteValue, setEditNoteValue] = useState('');

  // Editing Brands for a specific user State
  const [managingBrandsUserId, setManagingBrandsUserId] = useState<string | null>(null);

  // Processing & Feedback
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsub = subscribeToAuthorizedUsers((list) => {
      setUsers(list);
    });
    return () => unsub();
  }, []);

  const toggleInputBrand = (brandId: string) => {
    setInputAssignedBrands(prev => {
      if (prev.includes(brandId)) {
        if (prev.length <= 1) return prev; // keep at least 1
        return prev.filter(b => b !== brandId);
      } else {
        return [...prev, brandId];
      }
    });
  };

  const handleBrandChange = async (user: AuthorizedUser, brandId: string) => {
    try {
      setIsProcessing(true);
      const currentBrands = Array.isArray(user.assignedBrands) && user.assignedBrands.length > 0
        ? user.assignedBrands
        : [brandId];
      const newBrands = currentBrands.includes(brandId) ? currentBrands : [...currentBrands, brandId];
      const res = await updateAuthorizedUser(user.id, {
        assignedBrand: brandId,
        assignedBrands: newBrands,
      });
      if (res.success) {
        refreshCurrentUserRoleAndBrand();
        setNotification({ 
          type: 'success', 
          message: `กำหนดให้แบรนด์ "${brandId}" เป็นแบรนด์หลักของ "${user.email}" เรียบร้อยแล้ว` 
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

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
      const targetBrands = inputRole === 'admin' ? ['All'] : inputAssignedBrands;
      const res = await addAuthorizedUser({
        email: inputEmail.trim(),
        name: inputName.trim() || inputEmail.split('@')[0],
        role: inputRole,
        assignedBrands: targetBrands,
        assignedBrand: targetBrands[0] || 'BYD',
        organization: inputOrg.trim() || (inputRole === 'admin' ? 'Plan B Media / Thai League' : `ตัวแทนแบรนด์ ${targetBrands.join(', ')}`),
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
        setInputAssignedBrands(['BYD']);
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
    const newBrands = newRole === 'admin' ? ['All'] : (user.assignedBrands && user.assignedBrands.length > 0 && !user.assignedBrands.includes('All') ? user.assignedBrands : ['BYD']);

    try {
      setIsProcessing(true);
      const res = await updateAuthorizedUser(user.id, {
        role: newRole,
        assignedBrands: newBrands,
        assignedBrand: newBrands[0],
      });
      if (res.success) {
        refreshCurrentUserRoleAndBrand();
        setNotification({ type: 'success', message: `เปลี่ยนบทบาทของ "${user.email}" เป็น ${newRole === 'admin' ? 'แอดมิน' : 'ลูกค้าแบรนด์'} เรียบร้อยแล้ว` });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleBrandForUser = async (user: AuthorizedUser, brandId: string) => {
    const currentBrands = Array.isArray(user.assignedBrands) && user.assignedBrands.length > 0
      ? user.assignedBrands
      : [user.assignedBrand || 'BYD'];

    let newBrands: string[];
    if (currentBrands.includes(brandId)) {
      if (currentBrands.length <= 1) {
        setNotification({ type: 'error', message: 'ผู้ใช้งานต้องมีแบรนด์ที่ดูแลอย่างน้อย 1 แบรนด์' });
        return;
      }
      newBrands = currentBrands.filter(b => b !== brandId);
    } else {
      newBrands = [...currentBrands, brandId];
    }

    try {
      setIsProcessing(true);
      const res = await updateAuthorizedUser(user.id, {
        assignedBrands: newBrands,
        assignedBrand: newBrands[0] || 'BYD',
      });
      if (res.success) {
        refreshCurrentUserRoleAndBrand();
        setNotification({ 
          type: 'success', 
          message: `กำหนดสิทธิ์ E-mail "${user.email}" ดูแลแบรนด์: [ ${newBrands.join(', ')} ] เรียบร้อยแล้ว` 
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
          name: 'pakawan.pl (BYD & Molten Client)',
          role: 'user', 
          assignedBrand: 'BYD',
          assignedBrands: ['BYD', 'Molten'],
          organization: 'Plan B Media / Brand Client',
          note: 'ลูกค้าแบรนด์ BYD และ Molten (ล็อคสิทธิ์เฉพาะข้อมูลและคำขอของ BYD และ Molten)',
        });
      } else {
        await addAuthorizedUser({
          email: 'pakawan.pl@planbmedia.co.th',
          name: 'pakawan.pl (BYD & Molten Client)',
          role: 'user',
          assignedBrand: 'BYD',
          assignedBrands: ['BYD', 'Molten'],
          organization: 'Plan B Media / Brand Client',
          addedBy: 'Admin Reset',
          note: 'ลูกค้าแบรนด์ BYD และ Molten (ล็อคสิทธิ์เฉพาะข้อมูลและคำขอของ BYD และ Molten)',
        });
      }

      refreshCurrentUserRoleAndBrand();
      setNotification({ 
        type: 'success', 
        message: 'รีเซ็ตบัญชีตัวอย่างเรียบร้อย: pakawan.pl (ดูแลทั้งแบรนด์ BYD และ Molten) และ chitipat.ja (ดูแล BYD)' 
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
              <div className="sm:col-span-2 lg:col-span-3 bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>แบรนด์ที่ล็อคสิทธิ์ให้ดูแล (สามารถเลือกได้หลายแบรนด์)</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInputAssignedBrands(brands.map(b => b.id))}
                      className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                    >
                      เลือกทุกแบรนด์
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setInputAssignedBrands(['BYD'])}
                      className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
                    >
                      รีเซ็ตเป็น BYD
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-600 mb-2.5">
                  คลิกเพื่อเลือกแบรนด์ที่ต้องการมอบสิทธิ์ — สามารถเลือกได้มากกว่า 1 แบรนด์ เช่น ทั้ง BYD และ Molten
                </p>

                <div className="flex flex-wrap gap-2">
                  {brands.map(b => {
                    const isSelected = inputAssignedBrands.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleInputBrand(b.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5 text-white" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-300" />}
                        <span>{b.id}</span>
                        <span className={`text-[10px] ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>({b.name})</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 pt-2 border-t border-emerald-200/60 flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700">แบรนด์ที่เลือกไว้ ({inputAssignedBrands.length}):</span>
                  <div className="flex flex-wrap gap-1">
                    {inputAssignedBrands.map(bId => (
                      <span key={bId} className="px-2 py-0.5 rounded-md bg-white border border-emerald-300 text-emerald-900 font-black text-[11px] shadow-2xs">
                        {bId}
                      </span>
                    ))}
                  </div>
                </div>
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
                  <>
                    {/* Standard User Row */}
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

                      {/* Assigned Brands Multi-Selector (Admin can manage multiple brands) */}
                      {user.role === 'user' ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Badges of currently assigned brands */}
                          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                            <span className="text-[11px] font-semibold text-slate-500">แบรนด์ที่ดูแล:</span>
                            <div className="flex flex-wrap items-center gap-1">
                              {(Array.isArray(user.assignedBrands) && user.assignedBrands.length > 0 
                                ? user.assignedBrands 
                                : [user.assignedBrand || 'BYD']
                              ).map((bId) => (
                                <span 
                                  key={bId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-900 text-[11px] font-black shadow-2xs"
                                >
                                  <span>{bId}</span>
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Button to toggle Brand Management popover */}
                          <button
                            type="button"
                            onClick={() => setManagingBrandsUserId(managingBrandsUserId === user.id ? null : user.id)}
                            disabled={isProcessing}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                              managingBrandsUserId === user.id
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                            }`}
                            title="คลิกเพื่อเพิ่ม/ลดแบรนด์ที่ผู้ใช้งานนี้ได้รับสิทธิ์ (เลือกได้หลายแบรนด์)"
                          >
                            <Tag className="w-3 h-3" />
                            <span>{managingBrandsUserId === user.id ? 'ปิดการตั้งค่า' : '+ จัดการแบรนด์'}</span>
                          </button>

                          {/* Primary brand selector if user has > 1 brand */}
                          {(user.assignedBrands && user.assignedBrands.length > 1) && (
                            <div className="flex items-center gap-1 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-0.5">
                              <span className="text-slate-400 font-medium">หลัก:</span>
                              <select
                                value={user.assignedBrand || user.assignedBrands[0]}
                                onChange={(e) => handleBrandChange(user, e.target.value)}
                                disabled={isProcessing}
                                className="font-bold text-slate-800 bg-transparent border-0 focus:outline-none cursor-pointer"
                                title="เลือกแบรนด์เริ่มต้นเมื่อเข้าสู่ระบบ"
                              >
                                {user.assignedBrands.map(bId => (
                                  <option key={bId} value={bId}>
                                    {bId}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic px-2 py-1">
                          (เข้าถึงข้อมูลได้ทุกแบรนด์)
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

                  {/* Inline Multi-Brand Management Drawer for this user */}
                  {managingBrandsUserId === user.id && user.role === 'user' && (
                    <div className="p-4 bg-emerald-50/70 border-t border-emerald-200 space-y-3 animate-in fade-in slide-in-from-top-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4 text-emerald-700" />
                          <span className="text-xs font-bold text-slate-900">
                            กำหนดแบรนด์ที่ <span className="text-emerald-800 font-extrabold">{user.email}</span> สามารถเข้าถึงได้:
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setManagingBrandsUserId(null)}
                          className="text-xs text-slate-500 hover:text-slate-800 font-bold px-2.5 py-1 rounded-lg hover:bg-emerald-100 cursor-pointer"
                        >
                          ✕ ปิดการตั้งค่า
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-600">
                        💡 คลิกที่กล่องแบรนด์เพื่อเปิด/ปิดสิทธิ์ทันที เมื่อผู้ใช้เข้าสู่ระบบด้วยอีเมลนี้ ระบบจะมี Dropdown ให้สลับแบรนด์ได้เฉพาะแบรนด์ที่ Admin เลือกไว้
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {brands.map(b => {
                          const isAssigned = (Array.isArray(user.assignedBrands) && user.assignedBrands.length > 0 
                            ? user.assignedBrands 
                            : [user.assignedBrand || 'BYD']
                          ).includes(b.id);
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => handleToggleBrandForUser(user, b.id)}
                              disabled={isProcessing}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                                isAssigned
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {isAssigned ? <Check className="w-3.5 h-3.5 text-white" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-300" />}
                              <span>{b.id}</span>
                              <span className={`text-[10px] ${isAssigned ? 'text-emerald-100' : 'text-slate-400'}`}>({b.name})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
