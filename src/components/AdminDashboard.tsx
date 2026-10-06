import React, { useState, useMemo, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Check, 
  X, 
  Trash2, 
  FileSpreadsheet, 
  Building2, 
  Ticket, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Download,
  Eye,
  Info,
  ExternalLink,
  Phone,
  MessageSquare,
  Edit3,
  Printer,
  ArrowRight,
  Lock,
  RotateCcw,
  Sparkles,
  Shield,
  Users,
  Mail,
  AlertTriangle,
  Store,
  Zap
} from 'lucide-react';
import { RegistrationRecord, LeagueType, RegistrationStatus, BrandType, UserProfile } from '../types';
import { LEAGUE_COLOR_MAP, MONTH_LIST, SPONSOR_BRANDS } from '../data/fixtures';
import { updateRegistration, deleteRegistration, deleteAllRegistrations, advanceSimulatedDate, getSimulatedDate } from '../lib/firebase';
import { getSponsorBrands, subscribeToBrands, SponsorBrandItem, calculateBrandQuota, formatMaxTicketsPerMatch } from '../lib/brandService';
import { getActiveRegistrationSeason, subscribeToActiveSeason } from '../lib/seasonService';
import { SingleDeleteModal, DeleteAllModal } from './admin/DeleteConfirmModals';
import { BrandManagementPanel } from './admin/BrandManagementPanel';
import { UserManagementPanel } from './admin/UserManagementPanel';
import { ClubCrestsManagementPanel } from './admin/ClubCrestsManagementPanel';
import { WeeklyEmailExportModal } from './WeeklyEmailExportModal';
import { LineGroupExportModal } from './LineGroupExportModal';
import { N8nSettingsModal } from './N8nSettingsModal';
import { getN8nConfig, subscribeToN8nConfig, N8nConfig } from '../lib/n8nService';

interface AdminDashboardProps {
  records: RegistrationRecord[];
  currentUser?: UserProfile | null;
  onOpenSheetsModal: () => void;
  onNavigateToContacts?: () => void;
  onResetData?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  records,
  currentUser,
  onOpenSheetsModal,
  onNavigateToContacts,
  onResetData,
}) => {
  const [adminSection, setAdminSection] = useState<'registrations' | 'brands' | 'users' | 'crests'>('registrations');
  const [dynamicBrands, setDynamicBrands] = useState<SponsorBrandItem[]>(getSponsorBrands());

  // Delete Confirmation Modals
  const [recordToDelete, setRecordToDelete] = useState<RegistrationRecord | null>(null);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [deleteAllScope, setDeleteAllScope] = useState<'filtered' | 'all'>('filtered');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterLeague, setFilterLeague] = useState<LeagueType | 'All'>('All');
  const [filterBrand, setFilterBrand] = useState<BrandType | 'All'>('All');
  const [filterMonth, setFilterMonth] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<RegistrationStatus | 'All'>('All');
  
  // Selected detail modal
  const [selectedRecord, setSelectedRecord] = useState<RegistrationRecord | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportNotification, setExportNotification] = useState('');

  // Weekly Consolidated Email Export Modal State
  const [isWeeklyEmailModalOpen, setIsWeeklyEmailModalOpen] = useState(false);

  // Line Group Automated Export Modal State (Per Brand & All Brands)
  const [isLineGroupModalOpen, setIsLineGroupModalOpen] = useState(false);

  // n8n Webhook Automation Modal State (Email & LINE dispatch)
  const [isN8nModalOpen, setIsN8nModalOpen] = useState(false);
  const [n8nConfig, setN8nConfig] = useState<N8nConfig>(getN8nConfig());

  useEffect(() => {
    return subscribeToN8nConfig(cfg => setN8nConfig(cfg));
  }, []);

  // Admin Edit Record Behind-the-scenes State ("แอดมินแก้ไขให้เองหลังบ้าน")
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RegistrationRecord | null>(null);
  const [editDealerName, setEditDealerName] = useState('');
  const [editDealerPhone, setEditDealerPhone] = useState('');
  const [editBoothRequired, setEditBoothRequired] = useState(true);
  const [editTicketQuantity, setEditTicketQuantity] = useState(10);
  const [editTicketRequesterPhone, setEditTicketRequesterPhone] = useState('');
  const [editTicketRequired, setEditTicketRequired] = useState(true);
  const [editRemark, setEditRemark] = useState('');
  const [editStatus, setEditStatus] = useState<RegistrationStatus>('approved');
  const [editAdminNote, setEditAdminNote] = useState('');

  // Filtered list
  const filteredList = useMemo(() => {
    return records.filter(r => {
      // Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchSearch = 
          (r.organization && r.organization.toLowerCase().includes(term)) ||
          (r.dealerName && r.dealerName.toLowerCase().includes(term)) ||
          r.applicantName.toLowerCase().includes(term) ||
          r.applicantEmail.toLowerCase().includes(term) ||
          r.matchTitle.toLowerCase().includes(term) ||
          r.stadium.toLowerCase().includes(term) ||
          (r.remark && r.remark.toLowerCase().includes(term)) ||
          (r.brand && r.brand.toLowerCase().includes(term));
        if (!matchSearch) return false;
      }

      // League
      if (filterLeague !== 'All' && r.league !== filterLeague) return false;

      // Brand
      if (filterBrand !== 'All' && r.brand !== filterBrand) return false;

      // Month
      if (filterMonth !== 'All' && r.month !== filterMonth) return false;

      // Status
      if (filterStatus !== 'All' && r.status !== filterStatus) return false;

      return true;
    });
  }, [records, searchTerm, filterLeague, filterBrand, filterMonth, filterStatus]);

  // Available extra brands for the brand dropdown
  const availableExtraBrands = useMemo(() => {
    const list: string[] = [];
    records.forEach(r => {
      if (r.brand && !SPONSOR_BRANDS.includes(r.brand as any) && !list.includes(r.brand)) {
        list.push(r.brand);
      }
    });
    return list;
  }, [records]);

  // Aggregate Metrics for Admin
  const metrics = useMemo(() => {
    let approvedCount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;

    let totalBooths = 0;
    let approvedBooths = 0;

    let totalTickets = 0;
    let approvedTickets = 0;

    let l1Count = 0;
    let l2Count = 0;
    let l3Count = 0;

    records.forEach(r => {
      if (r.status === 'approved') approvedCount++;
      else if (r.status === 'rejected') rejectedCount++;
      else pendingCount++;

      if (r.boothRequired) {
        totalBooths++;
        if (r.status === 'approved') approvedBooths++;
      }

      if (r.ticketRequired) {
        totalTickets += (r.ticketQuantity || 0);
        if (r.status === 'approved') approvedTickets += (r.ticketQuantity || 0);
      }

      if (r.league === 'League 1') l1Count++;
      if (r.league === 'League 2') l2Count++;
      if (r.league === 'League 3') l3Count++;
    });

    return {
      total: records.length,
      approvedCount,
      pendingCount,
      rejectedCount,
      totalBooths,
      approvedBooths,
      totalTickets,
      approvedTickets,
      l1Count,
      l2Count,
      l3Count,
    };
  }, [records]);

  // Handle Approve / Reject
  const handleUpdateStatus = async (id: string, newStatus: RegistrationStatus, note?: string) => {
    try {
      setIsProcessing(true);
      await updateRegistration(id, {
        status: newStatus,
        adminNote: note !== undefined ? note : (newStatus === 'approved' ? 'อนุมัติเรียบร้อยโดยแอดมิน' : 'ไม่ผ่านการอนุมัติ'),
        approvedAt: newStatus === 'approved' ? new Date().toISOString().slice(0, 16).replace('T', ' ') : undefined,
        reviewedBy: 'Admin Thaileague 2026-27',
      });
      if (selectedRecord && selectedRecord.id === id) {
        setSelectedRecord(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const [activeSeason, setActiveSeason] = useState<string>(() => getActiveRegistrationSeason());

  useEffect(() => {
    const unsub = subscribeToActiveSeason((s) => {
      setActiveSeason(s);
    });
    return () => unsub();
  }, []);

  const activeFilteredBrandItem = useMemo(() => {
    if (filterBrand === 'All') return null;
    return dynamicBrands.find(b => b.id.toLowerCase() === filterBrand.toLowerCase()) || null;
  }, [filterBrand, dynamicBrands]);

  const activeFilteredBrandQuota = useMemo(() => {
    if (!activeFilteredBrandItem) return null;
    return calculateBrandQuota(activeFilteredBrandItem, records, activeSeason);
  }, [activeFilteredBrandItem, records, activeSeason]);

  useEffect(() => {
    const unsub = subscribeToBrands((list) => {
      setDynamicBrands(list);
    });
    return () => unsub();
  }, []);

  const handleDelete = (id: string) => {
    const rec = records.find(r => r.id === id);
    if (rec) {
      setRecordToDelete(rec);
    }
  };

  const confirmSingleDelete = async () => {
    if (!recordToDelete) return;
    try {
      setIsProcessing(true);
      await deleteRegistration(recordToDelete.id);
      if (selectedRecord?.id === recordToDelete.id) {
        setSelectedRecord(null);
      }
      setExportNotification(`ลบรายการคำขอของ ${recordToDelete.applicantName} (${recordToDelete.brand}) เรียบร้อยแล้ว`);
    } catch (e: any) {
      console.error(e);
      setExportNotification('เกิดข้อผิดพลาดในการลบ: ' + (e?.message || 'โปรดลองใหม่อีกครั้ง'));
    } finally {
      setIsProcessing(false);
      setRecordToDelete(null);
    }
  };

  const confirmDeleteAll = async () => {
    try {
      setIsProcessing(true);
      if (deleteAllScope === 'filtered') {
        const ids = filteredList.map(r => r.id);
        await deleteAllRegistrations(ids);
        setExportNotification(`ลบคำขอที่เลือก ${ids.length} รายการเรียบร้อยแล้ว`);
      } else {
        await deleteAllRegistrations();
        setExportNotification(`ล้างคำขอทั้งหมดในระบบเรียบร้อยแล้ว (${records.length} รายการ)`);
      }
      setIsDeleteAllModalOpen(false);
      setSelectedRecord(null);
    } catch (e: any) {
      console.error(e);
      setExportNotification('เกิดข้อผิดพลาดในการลบ: ' + (e?.message || 'โปรดลองใหม่อีกครั้ง'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Open Admin Edit Modal
  const handleOpenEditModal = (rec: RegistrationRecord) => {
    setEditingRecord(rec);
    setEditDealerName(rec.dealerName || '');
    setEditDealerPhone(rec.dealerPhone || '');
    setEditBoothRequired(rec.boothRequired);
    setEditTicketQuantity(rec.ticketQuantity || 10);
    setEditTicketRequesterPhone(rec.ticketRequesterPhone || rec.applicantPhone || '');
    setEditTicketRequired(rec.ticketRequired);
    setEditRemark(rec.remark || '');
    setEditStatus(rec.status);
    setEditAdminNote(rec.adminNote || '');
    setIsEditModalOpen(true);
  };

  // Save Admin Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    try {
      setIsProcessing(true);
      await updateRegistration(editingRecord.id, {
        dealerName: editDealerName.trim(),
        dealerPhone: editDealerPhone.trim(),
        boothRequired: editBoothRequired,
        ticketQuantity: Number(editTicketQuantity) || 0,
        ticketRequesterPhone: editTicketRequesterPhone.trim(),
        ticketRequired: editTicketRequired,
        remark: editRemark.trim() || undefined,
        status: editStatus,
        adminNote: editAdminNote.trim(),
      });
      setIsEditModalOpen(false);
      setEditingRecord(null);
      setExportNotification('บันทึกการแก้ไขข้อมูลหลังบ้านเรียบร้อยแล้ว');
      setTimeout(() => setExportNotification(''), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-blue-100 text-blue-800">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              แผงควบคุมผู้ดูแลระบบ (Admin Console)
            </span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs text-slate-500 font-medium">
              Firebase Project: Thaileague 2026-27
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            แดชบอร์ดสรุปยอดลงทะเบียนสำหรับแอดมิน
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            ตรวจสอบข้อมูลออกบูธดีลเลอร์และรับบัตรเข้าชมฟุตบอล อนุมัติสิทธิ์ และส่งออกข้อมูลไปยัง Google Sheets
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onNavigateToContacts && (
            <button
              id="btn-admin-manage-contacts"
              onClick={onNavigateToContacts}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors"
            >
              <Phone className="w-4 h-4 text-emerald-400" />
              <span>จัดการเบอร์ติดต่อหน้าสนาม</span>
            </button>
          )}

          <button
            id="btn-admin-auto-email-weekly"
            onClick={() => setIsWeeklyEmailModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <Mail className="w-4 h-4 text-sky-200" />
            <span>Export ส่ง E-mail อัตโนมัติ (ทั้งสัปดาห์ ทุกแบรนด์)</span>
          </button>

          <button
            id="btn-admin-export-line-group"
            onClick={() => setIsLineGroupModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
            title="Export ส่ง Line Group แยกตามแบรนด์ เพื่อให้ลูกค้ายืนยันข้อมูล"
          >
            <MessageSquare className="w-4 h-4 text-white" />
            <span>Export ส่ง Line Group</span>
          </button>

          <button
            id="btn-admin-n8n-settings"
            onClick={() => setIsN8nModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#ea4b71] to-[#ff6d5a] hover:from-[#d63e63] hover:to-[#f05845] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
            title="ตั้งค่าเชื่อมต่อ n8n สำหรับส่งออกข้อมูลอัตโนมัติทั้งทาง LINE และ E-mail"
          >
            <Zap className="w-4 h-4 fill-white" />
            <span>เชื่อมต่อ n8n (LINE & E-mail)</span>
            {n8nConfig.enabled && n8nConfig.webhookUrl && (
              <span className="w-2 h-2 rounded-full bg-emerald-300 ring-2 ring-white/30 animate-pulse" title="n8n Webhook Active" />
            )}
          </button>

          <button
            id="btn-admin-google-sheets"
            onClick={onOpenSheetsModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>เชื่อมต่อ Google Sheets</span>
          </button>
        </div>
      </div>

      {/* Success/Action Notification */}
      {exportNotification && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{exportNotification}</span>
          </div>
          <button
            onClick={() => setExportNotification('')}
            className="text-emerald-700 hover:text-emerald-950 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Admin Section Tabs: Registrations / Brands / Users */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-slate-100 border border-slate-200">
        <button
          type="button"
          id="tab-admin-registrations"
          onClick={() => setAdminSection('registrations')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminSection === 'registrations'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>อนุมัติ & จัดการคำขอลงทะเบียน</span>
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-extrabold">
            {records.length}
          </span>
        </button>

        <button
          type="button"
          id="tab-admin-brands"
          onClick={() => setAdminSection('brands')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminSection === 'brands'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Building2 className="w-4 h-4 text-emerald-600" />
          <span>จัดการแบรนด์ผู้สนับสนุน (Sponsor Brands)</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
            {dynamicBrands.length} แบรนด์
          </span>
        </button>

        <button
          type="button"
          id="tab-admin-users"
          onClick={() => setAdminSection('users')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminSection === 'users'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Users className="w-4 h-4 text-purple-600" />
          <span>จัดการสิทธิ์ & บัญชีผู้ใช้งาน (User & Role Access)</span>
          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-extrabold">
            กำหนด E-mail
          </span>
        </button>

        <button
          type="button"
          id="tab-admin-crests"
          onClick={() => setAdminSection('crests')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminSection === 'crests'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Shield className="w-4 h-4 text-indigo-600" />
          <span>จัดการตราสโมสร (Club Crests)</span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-extrabold">
            103 สโมสร
          </span>
        </button>
      </div>

      {adminSection === 'brands' && (
        <BrandManagementPanel records={records} />
      )}

      {adminSection === 'users' && (
        <UserManagementPanel currentUser={currentUser || null} />
      )}

      {adminSection === 'crests' && (
        <ClubCrestsManagementPanel />
      )}

      {adminSection === 'registrations' && (
        <>
      {/* Admin KPI Stat Cards with 3-Colors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total applications */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">คำขอลงทะเบียนทั้งหมด</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">{metrics.total}</span>
            <span className="text-xs text-slate-500">รายการ</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
              รอตรวจ {metrics.pendingCount}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
              อนุมัติแล้ว {metrics.approvedCount}
            </span>
          </div>
        </div>

        {/* Booth stats */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs">
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>พื้นที่ออกบูธดีลเลอร์</span>
            <Building2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-700">{metrics.totalBooths}</span>
            <span className="text-xs text-slate-500">บูธที่ขอรับ</span>
          </div>
          <div className="mt-3 text-[11px] text-slate-600">
            อนุมัติจัดตั้งแล้ว <span className="font-bold text-emerald-700">{metrics.approvedBooths}</span> บูธ
          </div>
        </div>

        {/* Ticket stats */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs">
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>บัตรดูบอลทั้งหมด</span>
            <Ticket className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-blue-700">{metrics.totalTickets}</span>
            <span className="text-xs text-slate-500">ใบ</span>
          </div>
          <div className="mt-3 text-[11px] text-slate-600">
            อนุมัติโควตาแล้ว <span className="font-bold text-blue-700">{metrics.approvedTickets}</span> ใบ
          </div>
        </div>

        {/* League distribution (3 Colors: เขียว แดง น้ำเงิน) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs">
          <div className="text-xs font-medium text-slate-500 mb-1">
            สัดส่วนตามลีก (3 สี)
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-rose-700 font-medium">
                <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                <span>League 1 (แดง)</span>
              </span>
              <span className="font-bold text-slate-800">{metrics.l1Count}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-blue-700 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                <span>League 2 (น้ำเงิน)</span>
              </span>
              <span className="font-bold text-slate-800">{metrics.l2Count}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>League 3 (เขียว)</span>
              </span>
              <span className="font-bold text-slate-800">{metrics.l3Count}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              id="admin-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาดีลเลอร์, แบรนด์, แมตช์..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          {/* Brand Filter */}
          <div>
            <select
              id="admin-filter-brand"
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white font-medium"
            >
              <option value="All">ทุกแบรนด์ (BYD, Chang, Castrol...)</option>
              {dynamicBrands.map(b => (
                <option key={b.id} value={b.id}>{b.name.split(' ')[0]}</option>
              ))}
            </select>
          </div>

          {/* League Filter */}
          <div>
            <select
              id="admin-filter-league"
              value={filterLeague}
              onChange={(e) => setFilterLeague(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white font-medium"
            >
              <option value="All">ทุกลีก (League 1, 2, 3)</option>
              <option value="League 1">League 1 (แถบสีแดง)</option>
              <option value="League 2">League 2 (แถบสีน้ำเงิน)</option>
              <option value="League 3">League 3 (แถบสีเขียว)</option>
            </select>
          </div>

          {/* Month Filter */}
          <div>
            <select
              id="admin-filter-month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white"
            >
              <option value="All">ทุกเดือน (ฤดูกาล 2026-27)</option>
              {MONTH_LIST.map(m => (
                <option key={m.key} value={m.key}>{m.nameThai}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              id="admin-filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white"
            >
              <option value="All">ทุกสถานะ (All Status)</option>
              <option value="pending">รอการอนุมัติ (Pending)</option>
              <option value="approved">อนุมัติแล้ว (Approved)</option>
              <option value="rejected">ปฏิเสธ / ไม่อนุมัติ (Rejected)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
          <div className="flex items-center gap-3">
            <span>พบข้อมูลทั้งหมด {filteredList.length} จาก {records.length} รายการ</span>
            {records.length > 0 && (
              <button
                type="button"
                id="btn-admin-delete-all-toolbar"
                onClick={() => {
                  setDeleteAllScope(filteredList.length < records.length ? 'filtered' : 'all');
                  setIsDeleteAllModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 font-bold transition-colors shadow-2xs cursor-pointer"
                title="ลบคำขอลงทะเบียนออกจากระบบ"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ลบคำขอ... ({filteredList.length < records.length ? `ตามตัวกรอง ${filteredList.length}` : `ทั้งหมด ${records.length}`})</span>
              </button>
            )}
          </div>
          {(searchTerm || filterLeague !== 'All' || filterBrand !== 'All' || filterMonth !== 'All' || filterStatus !== 'All') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterLeague('All');
                setFilterBrand('All');
                setFilterMonth('All');
                setFilterStatus('All');
              }}
              className="text-blue-600 hover:underline text-xs"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      </div>

      {/* Brand Rights & Season Quota Card (Admin Back-Office Dashboard) */}
      {activeFilteredBrandItem && activeFilteredBrandQuota && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white border border-slate-700 shadow-sm space-y-3 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span 
                className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white shadow-xs"
                style={{ backgroundColor: activeFilteredBrandItem.color }}
              >
                {activeFilteredBrandItem.logoText.slice(0, 3)}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs sm:text-sm">{activeFilteredBrandItem.name}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/10 text-slate-200">
                    ฤดูกาล {activeSeason}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">
                  สิทธิประโยชน์และโควต้าที่ได้รับตามสัญญา (ระบบหลังบ้านแอดมิน)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                activeFilteredBrandQuota.remainingBoothMatches === 0
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : activeFilteredBrandQuota.remainingBoothMatches <= 2
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              }`}>
                <span>ออกบูธเหลือ:</span>
                <strong className="underline underline-offset-2">{activeFilteredBrandQuota.remainingBoothMatches} ครั้ง</strong>
              </span>

              <span className={`text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                activeFilteredBrandQuota.remainingTicketMatches === 0
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : activeFilteredBrandQuota.remainingTicketMatches <= 3
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}>
                <span>รับบัตรเหลือ:</span>
                <strong className="underline underline-offset-2">{activeFilteredBrandQuota.remainingTicketMatches} ครั้ง</strong>
              </span>
            </div>
          </div>

          {/* Quota Progress Bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Booth Quota Bar */}
            <div className="space-y-1.5 bg-white/5 p-3 rounded-xl border border-white/10">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-blue-400" />
                  <span>ขอออกบูธไปแล้ว:</span>
                  <strong className="text-white">{activeFilteredBrandQuota.usedBoothMatches} / {activeFilteredBrandQuota.quotaBoothMatches} ครั้ง</strong>
                </span>
                <span className="text-slate-400 text-[10px]">
                  {activeFilteredBrandItem.allowedBoothLeagues.length < 3 
                    ? `(${activeFilteredBrandItem.allowedBoothLeagues.map(l => l === 'League 1' ? 'T1' : l === 'League 2' ? 'T2' : 'T3').join('+')} รวมกัน)` 
                    : 'ทุกรายการ'}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-700/80 overflow-hidden">
                <div 
                  className={`h-full transition-all rounded-full ${
                    activeFilteredBrandQuota.isBoothLimitReached ? 'bg-rose-500' : activeFilteredBrandQuota.isBoothNearLimit ? 'bg-amber-400' : 'bg-blue-400'
                  }`}
                  style={{ width: `${activeFilteredBrandQuota.boothUsagePercent}%` }}
                />
              </div>
            </div>

            {/* Ticket Quota Bar */}
            <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/10">
              <div className="flex flex-wrap items-center justify-between text-xs font-semibold gap-1">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ขอรับบัตรไปแล้ว:</span>
                  <strong className="text-white">{activeFilteredBrandQuota.usedTotalTickets} / {activeFilteredBrandQuota.quotaTotalTickets} ใบ</strong>
                  <span className="text-slate-400 text-[11px]">({activeFilteredBrandQuota.usedTicketMatches}/{activeFilteredBrandQuota.quotaTicketMatches} นัด)</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {activeFilteredBrandQuota.hasExcessTickets ? (
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                      <span>เกินโควต้า +{activeFilteredBrandQuota.excessTotalTickets} ใบ</span>
                    </span>
                  ) : (
                    <span className="text-emerald-400 text-[10px]">
                      เหลือ {activeFilteredBrandQuota.remainingTotalTickets} ใบ
                    </span>
                  )}
                  <span className="text-slate-400 text-[10px]">
                    • เพดาน: {formatMaxTicketsPerMatch(activeFilteredBrandItem)}
                  </span>
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-700/80 overflow-hidden">
                <div 
                  className={`h-full transition-all rounded-full ${
                    activeFilteredBrandQuota.hasExcessTickets
                      ? 'bg-rose-500' 
                      : activeFilteredBrandQuota.usedTotalTickets >= activeFilteredBrandQuota.quotaTotalTickets * 0.8
                        ? 'bg-amber-400' 
                        : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, activeFilteredBrandQuota.totalTicketsUsagePercent)}%` }}
                />
              </div>
              {activeFilteredBrandQuota.hasExcessTickets && (
                <div className="text-[11px] text-rose-300 bg-rose-500/15 px-2.5 py-1.5 rounded-lg border border-rose-500/20 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>แบรนด์นี้ขอรับบัตรเกินโควต้าประจำฤดูกาลแล้ว <strong>+{activeFilteredBrandQuota.excessTotalTickets} ใบ</strong> (มีค่าใช้จ่ายซื้อบัตรเพิ่มจากสโมสร)</span>
                </div>
              )}
            </div>
          </div>

          {/* League Permissions Info */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
            <div className="flex flex-wrap items-center gap-3 text-slate-300 text-[11px]">
              <span>🏢 สิทธิ์ออกบูธ: <strong className="text-white">{activeFilteredBrandItem.allowedBoothLeagues.map(l => l === 'League 1' ? 'Thai League 1' : l === 'League 2' ? 'Thai League 2' : 'Thai League 3').join(', ') || 'ไม่มีสิทธิ์'}</strong></span>
              <span>•</span>
              <span>🎟️ สิทธิ์รับบัตร: <strong className="text-white">{activeFilteredBrandItem.allowedTicketLeagues.map(l => l === 'League 1' ? 'Thai League 1' : l === 'League 2' ? 'Thai League 2' : 'Thai League 3').join(', ') || 'ไม่มีสิทธิ์'}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Main Admin Data Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">ลีก & แบรนด์</th>
                <th className="py-3.5 px-4">แมตช์ & สนาม</th>
                <th className="py-3.5 px-4">ออกบูธ (ดีลเลอร์ & เบอร์โทร)</th>
                <th className="py-3.5 px-4">รับตั๋ว (จำนวน & เบอร์ผู้ขอ)</th>
                <th className="py-3.5 px-4 text-center">สถานะ</th>
                <th className="py-3.5 px-4 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 text-xs">
                    ไม่พบรายการลงทะเบียนที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              ) : (
                filteredList.map((rec) => {
                  const colorMeta = LEAGUE_COLOR_MAP[rec.league];
                  const brandMeta = SPONSOR_BRANDS.find(b => b.id === rec.brand);
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* League & Brand */}
                      <td className="py-3.5 px-4 align-top">
                        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded border ${colorMeta.badgeBg}`}>
                          {rec.league}
                        </span>
                        <div className="mt-1">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${brandMeta?.badgeClass || 'bg-slate-100 text-slate-700'}`}>
                            {rec.brand || 'ทั่วไป'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{rec.month}</span>
                        </div>
                      </td>

                      {/* Match & Stadium */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-slate-800">{rec.matchTitle}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {rec.stadium}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          ผู้ลงทะเบียน: {rec.applicantName} ({rec.applicantPhone})
                        </div>
                        {rec.remark && (
                          <div className="mt-1.5 text-[11px] text-amber-900 bg-amber-50 rounded-lg px-2 py-1 border border-amber-200 flex items-start gap-1 font-medium">
                            <MessageSquare className="w-3 h-3 text-amber-700 shrink-0 mt-0.5" />
                            <span className="line-clamp-2" title={rec.remark}>Remark: {rec.remark}</span>
                          </div>
                        )}
                      </td>

                      {/* Booth: Dealer name & phone */}
                      <td className="py-3.5 px-4 align-top">
                        {rec.boothRequired ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-emerald-800 text-xs">
                              {rec.dealerName || 'ระบุชื่อดีลเลอร์'}
                            </div>
                            <div className="text-[11px] text-slate-600 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span className="font-mono">{rec.dealerPhone || '-'}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">ไม่รับบูธ</span>
                        )}
                      </td>

                      {/* Ticket: Quantity & Requester phone */}
                      <td className="py-3.5 px-4 align-top">
                        {rec.ticketRequired ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-blue-800 text-xs">
                                {rec.ticketQuantity} ใบ
                              </span>
                              {rec.adminNote?.includes('เกินโควต้า') && (
                                <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-200" title="คำขอนี้มีบัตรเกินโควต้าประจำฤดูกาล (มีค่าใช้จ่ายซื้อเพิ่มจากสโมสร)">
                                  เกินโควต้า
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span className="font-mono">{rec.ticketRequesterPhone || rec.applicantPhone}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">ไม่รับตั๋ว</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 align-top text-center">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                          rec.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rec.status === 'rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {rec.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                          {rec.status === 'pending' && <Clock className="w-3 h-3" />}
                          {rec.status === 'rejected' && <XCircle className="w-3 h-3" />}
                          {rec.status === 'approved' ? 'อนุมัติแล้ว' : rec.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอตรวจสอบ'}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 align-top text-right space-x-1 whitespace-nowrap">
                        {rec.status !== 'approved' && (
                          <button
                            id={`btn-approve-${rec.id}`}
                            onClick={() => handleUpdateStatus(rec.id, 'approved')}
                            title="อนุมัติการลงทะเบียน"
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {rec.status !== 'rejected' && (
                          <button
                            id={`btn-reject-${rec.id}`}
                            onClick={() => handleUpdateStatus(rec.id, 'rejected')}
                            title="ปฏิเสธคำขอ"
                            className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          id={`btn-edit-${rec.id}`}
                          onClick={() => handleOpenEditModal(rec)}
                          title="แก้ไขข้อมูลหลังบ้าน (Admin Edit)"
                          className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          id={`btn-view-${rec.id}`}
                          onClick={() => {
                            setSelectedRecord(rec);
                            setAdminNoteInput(rec.adminNote || '');
                          }}
                          title="ดูรายละเอียดฉบับเต็ม"
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          id={`btn-delete-${rec.id}`}
                          onClick={() => handleDelete(rec.id)}
                          title="ลบข้อมูล"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${LEAGUE_COLOR_MAP[selectedRecord.league].badgeBg}`}>
                  {selectedRecord.league}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  รายละเอียดการลงทะเบียน (แบรนด์: {selectedRecord.brand || '-'})
                </h3>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                <div className="font-semibold text-slate-800">แมตช์การแข่งขัน:</div>
                <div className="text-slate-700 font-bold">{selectedRecord.matchTitle}</div>
                <div className="text-slate-500">สนาม {selectedRecord.stadium} | วันที่ {selectedRecord.matchDate}</div>
              </div>

              {/* Booth Details */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5">
                <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-700" />
                  <span>ข้อมูลการออกบูธดีลเลอร์:</span>
                </div>
                <div>ขอพื้นที่บูธ: <span className="font-semibold">{selectedRecord.boothRequired ? 'ใช่' : 'ไม่ขอรับ'}</span></div>
                {selectedRecord.boothRequired && (
                  <>
                    <div>ชื่อดีลเลอร์: <span className="font-bold text-slate-900">{selectedRecord.dealerName}</span></div>
                    <div>เบอร์ติดต่อดีลเลอร์: <span className="font-mono font-bold text-emerald-800">{selectedRecord.dealerPhone}</span></div>
                  </>
                )}
              </div>

              {/* Ticket Details */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1.5">
                <div className="font-bold text-blue-900 flex items-center gap-1.5">
                  <Ticket className="w-4 h-4 text-blue-700" />
                  <span>ข้อมูลการรับบัตรดูบอล:</span>
                </div>
                <div>ขอรับตั๋ว: <span className="font-semibold">{selectedRecord.ticketRequired ? 'ใช่' : 'ไม่ขอรับ'}</span></div>
                {selectedRecord.ticketRequired && (
                  <>
                    <div>จำนวนบัตร: <span className="font-bold text-slate-900">{selectedRecord.ticketQuantity} ใบ</span></div>
                    <div>เบอร์ติดต่อของคนขอบัตร: <span className="font-mono font-bold text-blue-800">{selectedRecord.ticketRequesterPhone || selectedRecord.applicantPhone}</span></div>
                  </>
                )}
              </div>

              {/* Client Remark Details */}
              {selectedRecord.remark ? (
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1">
                  <div className="font-bold text-amber-900 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-amber-700" />
                    <span>หมายเหตุ / ความต้องการเพิ่มเติมจากลูกค้า (Remark):</span>
                  </div>
                  <div className="text-slate-800 font-medium pl-5 whitespace-pre-line leading-relaxed">
                    {selectedRecord.remark}
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 italic text-[11px] flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-300" />
                  <span>ไม่มีการระบุหมายเหตุ / คำขอเพิ่มเติม (Remark)</span>
                </div>
              )}

              {/* Contact info */}
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="font-semibold text-slate-700">ผู้ประสานงานหลัก (Gmail):</div>
                <div>{selectedRecord.applicantName} ({selectedRecord.applicantPhone})</div>
                <div className="text-blue-600 font-mono">{selectedRecord.applicantEmail}</div>
              </div>

              {/* Admin Note field */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  บันทึกเพิ่มเติมจากแอดมิน (Admin Note):
                </label>
                <input
                  type="text"
                  value={adminNoteInput}
                  onChange={(e) => setAdminNoteInput(e.target.value)}
                  placeholder="เช่น มอบหมายจุดบูธ Gate 1, รับบัตรที่ซุ้มอำนวยการ"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  selectedRecord.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {selectedRecord.status === 'approved' ? 'อนุมัติแล้ว (ล็อคข้อมูล)' : 'รอตรวจสอบ'}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    const rec = selectedRecord;
                    setSelectedRecord(null);
                    handleOpenEditModal(rec);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-bold flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>แก้ไขข้อมูลหลังบ้าน</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const rec = selectedRecord;
                    setSelectedRecord(null);
                    setRecordToDelete(rec);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 text-xs font-bold flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ลบคำขอนี้</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleUpdateStatus(selectedRecord.id, 'rejected', adminNoteInput)}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold hover:bg-rose-100"
                >
                  ปฏิเสธ
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedRecord.id, 'approved', adminNoteInput)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-xs"
                >
                  อนุมัติทันที
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Edit Record Modal ("แก้ไขให้เองหลังบ้าน") */}
      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-blue-100 text-blue-800">
                  <Edit3 className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    แก้ไขข้อมูลลงทะเบียนหลังบ้าน (Admin Edit)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    แอดมินสามารถปรับปรุงข้อมูลให้ลูกค้าได้แม้สถานะจะอนุมัติแล้ว
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingRecord(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Match info pill */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-900">{editingRecord.matchTitle}</div>
              <div className="text-slate-500">
                สนาม {editingRecord.stadium} • แบรนด์ {editingRecord.brand || '-'} ({editingRecord.league})
              </div>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              {/* Booth section */}
              <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-bold text-emerald-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editBoothRequired}
                      onChange={(e) => setEditBoothRequired(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <Building2 className="w-4 h-4 text-emerald-700" />
                    <span>ขอพื้นที่ออกบูธดีลเลอร์</span>
                  </label>
                </div>

                {editBoothRequired && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        ชื่อดีลเลอร์:
                      </label>
                      <input
                        type="text"
                        value={editDealerName}
                        onChange={(e) => setEditDealerName(e.target.value)}
                        placeholder="ระบุชื่อดีลเลอร์"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        เบอร์ติดต่อดีลเลอร์:
                      </label>
                      <input
                        type="tel"
                        value={editDealerPhone}
                        onChange={(e) => setEditDealerPhone(e.target.value)}
                        placeholder="เช่น 081-xxx-xxxx"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none bg-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Ticket section */}
              <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-bold text-blue-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editTicketRequired}
                      onChange={(e) => setEditTicketRequired(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <Ticket className="w-4 h-4 text-blue-700" />
                    <span>ขอรับบัตรดูบอล</span>
                  </label>
                </div>

                {editTicketRequired && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        จำนวนบัตร (ใบ):
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={editTicketQuantity}
                        onChange={(e) => setEditTicketQuantity(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        เบอร์โทรคนขอรับบัตร:
                      </label>
                      <input
                        type="tel"
                        value={editTicketRequesterPhone}
                        onChange={(e) => setEditTicketRequesterPhone(e.target.value)}
                        placeholder="เช่น 089-xxx-xxxx"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Client Remark in Edit Modal */}
              <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200 space-y-2">
                <label className="flex items-center gap-1.5 font-bold text-amber-950">
                  <MessageSquare className="w-4 h-4 text-amber-700" />
                  <span>หมายเหตุ / ความต้องการเพิ่มเติมจากลูกค้า (Remark):</span>
                </label>
                <textarea
                  rows={2}
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                  placeholder="ระบุสิ่งที่ลูกค้าต้องการขอเพิ่มเติมสำหรับแมตช์นี้..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white resize-none font-normal"
                />
              </div>

              {/* Status & Admin Note */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    สถานะการอนุมัติ:
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as RegistrationStatus)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none font-bold"
                  >
                    <option value="approved">✅ อนุมัติแล้ว (Approved)</option>
                    <option value="pending">⏳ รอตรวจสอบ (Pending)</option>
                    <option value="rejected">❌ ปฏิเสธ (Rejected)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    หมายเหตุแอดมิน / โซนบูธ / ประตู:
                  </label>
                  <input
                    type="text"
                    value={editAdminNote}
                    onChange={(e) => setEditAdminNote(e.target.value)}
                    placeholder="เช่น ซุ้ม Gate 1 หรือ อนุมัติตามคำร้อง"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingRecord(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isProcessing ? 'กำลังบันทึก...' : 'บันทึกการแก้ไขหลังบ้าน'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modals */}
      <SingleDeleteModal
        isOpen={!!recordToDelete}
        onClose={() => setRecordToDelete(null)}
        record={recordToDelete}
        onConfirm={confirmSingleDelete}
        isProcessing={isProcessing}
      />

      <DeleteAllModal
        isOpen={isDeleteAllModalOpen}
        onClose={() => setIsDeleteAllModalOpen(false)}
        totalRecordsCount={records.length}
        filteredCount={filteredList.length}
        scope={deleteAllScope}
        setScope={setDeleteAllScope}
        onConfirm={confirmDeleteAll}
        isProcessing={isProcessing}
        onResetSampleData={onResetData}
      />

      {/* Weekly Consolidated All-Brands Email Export Modal */}
      <WeeklyEmailExportModal
        isOpen={isWeeklyEmailModalOpen}
        onClose={() => setIsWeeklyEmailModalOpen(false)}
        registrations={records}
        currentUserEmail={currentUser?.email}
        onDateAdvanced={() => {
          setExportNotification('จัดส่งรายงาน E-mail สำเร็จ และรันเลื่อนรอบการแข่งขันไป 1 สัปดาห์ถัดไป (+7 วัน) เรียบร้อยแล้ว');
          setTimeout(() => setExportNotification(''), 6000);
        }}
      />

      {/* Automated Line Group Export Modal (Per Brand & All Brands) */}
      <LineGroupExportModal
        isOpen={isLineGroupModalOpen}
        onClose={() => setIsLineGroupModalOpen(false)}
        registrations={records}
        onDateAdvanced={() => {
          setExportNotification('จัดส่งข้อมูลเข้า Line Group สำเร็จ และรันเลื่อนรอบการแข่งขันไป 1 สัปดาห์ถัดไป (+7 วัน) เรียบร้อยแล้ว');
          setTimeout(() => setExportNotification(''), 6000);
        }}
      />

      {/* n8n Automation & Webhook Integration Modal */}
      <N8nSettingsModal
        isOpen={isN8nModalOpen}
        onClose={() => setIsN8nModalOpen(false)}
        onConfigUpdated={(updated) => {
          setN8nConfig(updated);
          if (updated.enabled) {
            setExportNotification('บันทึกการตั้งค่า n8n Webhook เรียบร้อยแล้ว พร้อมส่งข้อมูลไปยัง LINE และ E-mail');
            setTimeout(() => setExportNotification(''), 5000);
          }
        }}
      />
    </div>
  );
};
