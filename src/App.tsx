import React, { useState, useEffect } from 'react';
import { Lock, ShieldAlert, User } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { LoginScreen } from './components/LoginScreen';
import { MainHubView } from './components/MainHubView';
import { CleanRegistrationView } from './components/CleanRegistrationView';
import { CleanStadiumContactsView } from './components/CleanStadiumContactsView';
import { CleanStadiumAttendanceView } from './components/CleanStadiumAttendanceView';
import { RegistrationForm } from './components/RegistrationForm';
import { MonthlyDashboard } from './components/MonthlyDashboard';
import { StadiumContactsView } from './components/StadiumContactsView';
import { StadiumAttendanceView } from './components/StadiumAttendanceView';
import { AdminDashboard } from './components/AdminDashboard';
import { LoginModal } from './components/LoginModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { FirebaseModal } from './components/FirebaseModal';
import { 
  RegistrationRecord, 
  LeagueType, 
  UserProfile 
} from './types';
import { 
  subscribeToRegistrations, 
  subscribeToAuth, 
  signOutUser, 
  resetToMockData,
  signInWithGoogle,
  switchUserRole
} from './lib/firebase';
import { initFixturesAutoSync } from './lib/fixturesService';
import { initContactsAutoSync } from './lib/stadiumContactsService';

export default function App() {
  const [activeTab, setActiveTab] = useState<'register' | 'monthly' | 'contacts' | 'admin' | 'attendance'>('register');
  const [selectedLeagueFilter, setSelectedLeagueFilter] = useState<LeagueType | 'All'>('All');
  const [records, setRecords] = useState<RegistrationRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [viewMode, setViewMode] = useState<'hub' | 'content'>('hub');
  const [roleToast, setRoleToast] = useState<string | null>(null);

  // Modals
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [sheetsModalDefaultTab, setSheetsModalDefaultTab] = useState<'fixtures' | 'contacts' | 'export'>('fixtures');
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState(false);

  const handleOpenSheetsModal = (tab: 'fixtures' | 'contacts' | 'export' = 'fixtures') => {
    setSheetsModalDefaultTab(tab);
    setIsSheetsModalOpen(true);
  };

  // Real-time subscriptions
  useEffect(() => {
    const unsubRecords = subscribeToRegistrations((data) => {
      setRecords(data);
    });

    const unsubAuth = subscribeToAuth((user) => {
      setCurrentUser(user);
    });

    // Start background Auto-Check on page load and interval for Google Sheets
    const cleanupAutoSync = initFixturesAutoSync();
    // Contacts (เบอร์ติดต่อหน้าสนาม) follow the Google Sheet too: sync on open, then every 10 minutes
    const cleanupContactsSync = initContactsAutoSync();

    return () => {
      unsubRecords();
      unsubAuth();
      cleanupAutoSync();
      cleanupContactsSync();
    };
  }, []);

  // Handle switching role between Admin and User for testing
  const handleSwitchRole = () => {
    const updated = switchUserRole();
    if (updated) {
      const isNowAdmin = updated.role === 'admin';
      const roleText = isNowAdmin 
        ? '👑 สลับบทบาทเป็น: แอดมิน (Admin) เรียบร้อยแล้ว (เห็นทุกฟังก์ชัน สถิติ และแดชบอร์ด)' 
        : '👤 สลับบทบาทเป็น: ผู้ใช้งานทั่วไป (Client/Brand) เรียบร้อยแล้ว (หน้าจอในมุมมองลูกค้า)';
      setRoleToast(roleText);
      setTimeout(() => setRoleToast(null), 4500);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setCurrentUser(null);
    setViewMode('hub');
  };

  const handleResetData = () => {
    if (confirm('คุณต้องการรีเซ็ตข้อมูลตัวอย่างทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่?')) {
      resetToMockData();
    }
  };

  const handleSelectFeatureAndLeague = (feature: 'register' | 'contacts' | 'attendance', league: LeagueType) => {
    setActiveTab(feature);
    setSelectedLeagueFilter(league);
    setViewMode('content');
  };

  const handleOpenAdminFromHub = () => {
    setActiveTab('admin');
    setViewMode('content');
  };

  // 1. If not logged in -> Show Mockup 1 Login Screen (Strictly checks against Authorized Users)
  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setViewMode('hub');
        }}
      />
    );
  }

  // 2. If logged in and in 'hub' mode -> Show Mockup 2 Main Hub View
  if (viewMode === 'hub') {
    return (
      <MainHubView
        currentUser={currentUser}
        onSelectFeatureAndLeague={handleSelectFeatureAndLeague}
        onOpenAdmin={handleOpenAdminFromHub}
        onSignOut={handleSignOut}
        onSwitchRole={handleSwitchRole}
      />
    );
  }

  // 3. When in registration view -> Show Mockup 2 Clean Registration View (Image 2)
  // "แถบทั้งหมดที่อยู่ในรูปที่ 1 ที่แนบให้ตัดออกไปให้หมด แก้ไขหน้าตาให้เป็นแบบภาพที่ 2 ที่เรา Mockup ให้เลย เอาแบบนี้เป๊ะๆเลย"
  if (activeTab === 'register') {
    return (
      <CleanRegistrationView
        currentUser={currentUser}
        initialLeague={selectedLeagueFilter !== 'All' ? selectedLeagueFilter : 'League 1'}
        records={records}
        onBackToHub={() => setViewMode('hub')}
        onOpenAdmin={() => {
          setActiveTab('admin');
          setViewMode('content');
        }}
        onSwitchRole={handleSwitchRole}
      />
    );
  }

  // 4. When in stadium contacts view -> Show Mockup Clean Stadium Contacts View (Image 2)
  // "เรื่องต่อไปแก้หน้าเบอร์ติดต่อ แถบทั้งหมดที่อยู่ในรูปที่ 1 ที่แนบให้ตัดออกไปให้หมด แก้ไขหน้าตาให้เป็นแบบภาพที่ 2 ที่เรา Mockup ให้เลย เอาแบบนี้เป๊ะๆเลย"
  if (activeTab === 'contacts') {
    return (
      <CleanStadiumContactsView
        currentUser={currentUser}
        initialLeague={selectedLeagueFilter !== 'All' ? selectedLeagueFilter : 'League 1'}
        records={records}
        onBackToHub={() => setViewMode('hub')}
        onOpenAdmin={() => {
          setActiveTab('admin');
          setViewMode('content');
        }}
        onSwitchRole={handleSwitchRole}
        onNavigateToRegister={(league) => {
          setActiveTab('register');
          if (league) setSelectedLeagueFilter(league);
        }}
      />
    );
  }

  // 5. When in stadium attendance view -> Show Mockup Clean Stadium Attendance View (Image 2)
  // "เรื่องต่อไปแก้หน้ายอดผู้ชม แถบทั้งหมดที่อยู่ในรูปที่ 1 ที่แนบให้ตัดออกไปให้หมด แก้ไขหน้าตาให้เป็นแบบภาพที่ 2 ที่เรา Mockup ให้เลย เอาแบบนี้เป๊ะๆเลย ขอตราสโมสรใหญ่ๆเหมือนหน้าลงทะเบียน ขึ้นวันที่ เวลา แมตช์การแข่งขันให้เรียบร้อย และทั้ง 3 ลีกให้เป็นช่วงเวลาแมตช์แข่งขันเดียวกัน แก้หน่อย"
  if (activeTab === 'attendance') {
    return (
      <CleanStadiumAttendanceView
        currentUser={currentUser}
        initialLeague={selectedLeagueFilter !== 'All' ? selectedLeagueFilter : 'League 1'}
        onBackToHub={() => setViewMode('hub')}
        onOpenAdmin={() => {
          setActiveTab('admin');
          setViewMode('content');
        }}
        onSwitchRole={handleSwitchRole}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row text-slate-800 relative">
      {/* Role Switching Notification Toast */}
      {roleToast && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 max-w-md">
          <span className="text-xs font-semibold leading-relaxed">{roleToast}</span>
          <button 
            onClick={() => setRoleToast(null)} 
            className="text-slate-400 hover:text-white ml-2 text-xs font-bold p-1 rounded-lg hover:bg-slate-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* 
        Sidebar with 3-Colors blend (เขียว แดง น้ำเงิน)
        "แท็บข้างๆจากสีน้ำเงินล้วนเป็นมี 3 สีปนกัน เขียว แดง น้ำเงิน"
      */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedLeagueFilter={selectedLeagueFilter}
        setSelectedLeagueFilter={setSelectedLeagueFilter}
        currentUser={currentUser}
        onOpenSheetsModal={(tab) => handleOpenSheetsModal(tab || 'fixtures')}
        onOpenFirebaseModal={() => setIsFirebaseModalOpen(true)}
        onGoToHub={() => setViewMode('hub')}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          currentUser={currentUser}
          onOpenLoginModal={() => setIsLoginModalOpen(true)}
          onSignOut={handleSignOut}
          onSwitchRole={handleSwitchRole}
          isRealtimeConnected={true}
          onResetData={handleResetData}
          onGoToHub={() => setViewMode('hub')}
        />

        {/* View Switcher */}
        <main className="flex-1 overflow-y-auto pb-12">
          {activeTab === 'register' && (
            <RegistrationForm
              records={records}
              currentUser={currentUser}
              onOpenLoginModal={() => setIsLoginModalOpen(true)}
              onSuccessRegistered={() => {
                if (currentUser?.role === 'admin') {
                  setActiveTab('monthly');
                }
              }}
              initialLeague={selectedLeagueFilter !== 'All' ? selectedLeagueFilter : 'League 1'}
              onNavigateToContacts={() => setActiveTab('contacts')}
              onOpenSheetsModal={handleOpenSheetsModal}
            />
          )}

          {activeTab === 'monthly' && (
            currentUser?.role === 'admin' ? (
              <MonthlyDashboard
                records={records}
                selectedLeagueFilter={selectedLeagueFilter}
                onNavigateToRegister={() => setActiveTab('register')}
                currentUser={currentUser}
              />
            ) : (
              <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100 shadow-xs">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">พื้นที่เฉพาะผู้ดูแลระบบ Plan B Media & ไทยลีก</h2>
                <p className="text-xs text-slate-600 leading-relaxed max-w-lg mx-auto">
                  หน้าสรุปยอดแยกรายเดือนและสถิติภาพรวมฤดูกาล ถูกจำกัดสิทธิ์ไว้สำหรับผู้ดูแลระบบและทีมงาน Plan B Media เท่านั้น ลูกค้าทั่วไปหรือผู้แทนแบรนด์ไม่สามารถเข้าถึงข้อมูลสถิติภาพรวมนี้ได้
                </p>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs space-y-1.5 max-w-md mx-auto">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>สถานะบัญชีปัจจุบันของคุณ:</span>
                  </div>
                  <div className="text-slate-600">
                    • อีเมล: <strong className="text-slate-800">{currentUser?.email || 'ยังไม่ได้เข้าสู่ระบบ'}</strong>
                  </div>
                  <div className="text-slate-600">
                    • สิทธิ์: <span className="px-2 py-0.5 rounded bg-slate-200 font-semibold">{currentUser?.role || 'Guest'}</span>
                  </div>
                  {currentUser?.assignedBrand && (
                    <div className="text-slate-600">
                      • แบรนด์ที่ดูแล: <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">{currentUser.assignedBrand}</span>
                    </div>
                  )}
                </div>
                <div className="pt-2 flex items-center justify-center gap-3">
                  <button
                    onClick={() => setActiveTab('register')}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    กลับไปหน้าลงทะเบียน
                  </button>
                  <button
                    onClick={() => setIsLoginModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer flex items-center gap-2"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>เข้าสู่ระบบด้วยบัญชี Admin</span>
                  </button>
                </div>
              </div>
            )
          )}

          {activeTab === 'contacts' && (
            <StadiumContactsView
              records={records}
              selectedLeagueFilter={selectedLeagueFilter}
              currentUser={currentUser}
              onNavigateToRegister={(brand, league) => {
                if (league) setSelectedLeagueFilter(league);
                setActiveTab('register');
              }}
              onOpenSheetsModal={handleOpenSheetsModal}
            />
          )}

          {activeTab === 'attendance' && (
            <StadiumAttendanceView
              currentUser={currentUser}
              selectedLeagueFilter={selectedLeagueFilter}
            />
          )}

          {activeTab === 'admin' && (
            currentUser?.role === 'admin' ? (
              <AdminDashboard
                records={records}
                currentUser={currentUser}
                onOpenSheetsModal={() => handleOpenSheetsModal('export')}
                onNavigateToContacts={() => setActiveTab('contacts')}
                onResetData={handleResetData}
              />
            ) : (
              <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100 shadow-xs">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">พื้นที่เฉพาะผู้ดูแลระบบ Plan B Media & ไทยลีก</h2>
                <p className="text-xs text-slate-600 leading-relaxed max-w-lg mx-auto">
                  หน้านี้ถูกจำกัดสิทธิ์ไว้สำหรับการอนุมัติคำขอออกบูธและรับบัตร, จัดการแบรนด์ผู้สนับสนุน, กำหนดสิทธิ์ E-mail ผู้ใช้งาน และตรวจสอบสถิติเชิงลึก ลูกค้าทั่วไปหรือผู้แทนแบรนด์จะไม่สามารถเข้าถึงข้อมูลส่วนนี้ได้เพื่อความปลอดภัยสูงสุด
                </p>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs space-y-1.5 max-w-md mx-auto">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>สถานะบัญชีปัจจุบันของคุณ:</span>
                  </div>
                  <div className="text-slate-600">
                    • อีเมล: <strong className="text-slate-800">{currentUser?.email || 'ยังไม่ได้เข้าสู่ระบบ'}</strong>
                  </div>
                  <div className="text-slate-600">
                    • สิทธิ์: <span className="px-2 py-0.5 rounded bg-slate-200 font-semibold">{currentUser?.role || 'Guest'}</span>
                  </div>
                  {currentUser?.assignedBrand && (
                    <div className="text-slate-600">
                      • แบรนด์ที่ดูแล: <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">{currentUser.assignedBrand}</span>
                    </div>
                  )}
                </div>
                <div className="pt-2 flex items-center justify-center gap-3">
                  <button
                    onClick={() => setActiveTab('register')}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    กลับหน้าลงทะเบียน
                  </button>
                  <button
                    onClick={() => setIsLoginModalOpen(true)}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    เข้าสู่ระบบด้วยบัญชีแอดมิน
                  </button>
                </div>
              </div>
            )
          )}
        </main>
      </div>

      {/* Modals */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={(user) => setCurrentUser(user)}
      />

      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        records={records}
        defaultTab={sheetsModalDefaultTab}
        onNavigateToContacts={() => setActiveTab('contacts')}
      />

      <FirebaseModal
        isOpen={isFirebaseModalOpen}
        onClose={() => setIsFirebaseModalOpen(false)}
      />
    </div>
  );
}
