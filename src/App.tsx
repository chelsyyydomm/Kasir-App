import React, { useState } from 'react';
import {
  BarChart3,
  Bot,
  Boxes,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  ShoppingBag,
  Store,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { DashboardView } from './components/DashboardView';
import { PosView } from './components/PosView';
import { PaymentsView } from './components/PaymentsView';
import { ProductsRecipesView } from './components/ProductsRecipesView';
import { InventoryProcurementView } from './components/InventoryProcurementView';
import { OutletsFranchiseView } from './components/OutletsFranchiseView';
import { ReportsEmployeesView } from './components/ReportsEmployeesView';
import { AiAssistantView } from './components/AiAssistantView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { ROLE_LABELS, UserRole, isGlobalRole } from './lib/rbac';
import type { PermissionKey } from './lib/rbac';

interface NavItem {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: PermissionKey;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Beranda', icon: LayoutDashboard, permission: 'dashboard.view' },
  { id: 'pos', label: 'POS / Kasir', shortLabel: 'POS', icon: ShoppingBag, permission: 'pos.operate' },
  { id: 'payments', label: 'Pembayaran', shortLabel: 'Bayar', icon: CreditCard, permission: 'payments.view' },
  { id: 'products', label: 'Menu & Resep HPP', shortLabel: 'Menu', icon: UtensilsCrossed, permission: 'products.view' },
  { id: 'inventory', label: 'Stok & Pembelian', shortLabel: 'Stok', icon: Boxes, permission: 'inventory.view' },
  { id: 'franchise', label: 'Outlet & Franchise', shortLabel: 'Outlet', icon: Store, permission: 'outlets.view' },
  { id: 'reports', label: 'Laporan & Karyawan', shortLabel: 'Laporan', icon: BarChart3, permission: 'reports.view' },
  { id: 'assistant', label: 'Asisten Bisnis AI', shortLabel: 'AI', icon: Bot, permission: 'ai.assistant' },
];

const WorkspaceShell: React.FC = () => {
  const {
    firebaseUser,
    appUser,
    business,
    outlets,
    activeOutletId,
    setActiveOutletId,
    loading,
    signOut,
    can,
  } = useAuth();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="font-display text-lg font-bold text-slate-900">KulinaHub</p>
          <p className="text-xs text-slate-500">Memuat ruang kerja operasional...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !appUser) {
    return (
      <>
        <LoginScreen />
        <OfflineIndicator />
      </>
    );
  }

  const visibleNav = NAV_ITEMS.filter((item) => can(item.permission));
  const currentTab = visibleNav.some((n) => n.id === activeTab)
    ? activeTab
    : visibleNav[0]?.id || 'dashboard';

  // Fallback tab if user only has employees.view without reports.view
  const showEmployeesTabDirectly = !can('reports.view') && can('employees.view');

  const mobilePrimaryTabs = visibleNav.slice(0, 4);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-slate-900 text-slate-100 border-r border-slate-800 no-print">
        <div className="px-6 py-5 border-b border-slate-800">
          <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
            KulinaHub
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            {business?.name || 'Kopi & Kuliner Nusantara'}
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full min-h-[42px] px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-3 transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
          {showEmployeesTabDirectly && (
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`w-full min-h-[42px] px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-3 transition-colors whitespace-nowrap cursor-pointer ${
                currentTab === 'reports'
                  ? 'bg-emerald-700 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Karyawan &amp; Audit</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <div>
            <p className="text-xs font-medium text-white truncate">{appUser.fullName}</p>
            <p className="text-[11px] text-slate-400 truncate">
              {ROLE_LABELS[appUser.role as UserRole] || appUser.role}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen pb-20 lg:pb-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden font-display text-base font-bold text-slate-900 whitespace-nowrap">
              KulinaHub
            </span>
            <select
              aria-label="Pilih Outlet Aktif"
              value={activeOutletId ?? ''}
              onChange={(e) => setActiveOutletId(e.target.value ? Number(e.target.value) : null)}
              disabled={!isGlobalRole(appUser.role) && outlets.length <= 1}
              className="min-h-[38px] max-w-[220px] sm:max-w-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 truncate"
            >
              {isGlobalRole(appUser.role) && <option value="">Semua Outlet ({outlets.length})</option>}
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton />
            <span className="hidden md:inline text-xs text-slate-500">
              {appUser.email} · {ROLE_LABELS[appUser.role as UserRole] || appUser.role}
            </span>
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {currentTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
          {currentTab === 'pos' && <PosView />}
          {currentTab === 'payments' && <PaymentsView />}
          {currentTab === 'products' && <ProductsRecipesView />}
          {currentTab === 'inventory' && <InventoryProcurementView />}
          {currentTab === 'franchise' && <OutletsFranchiseView />}
          {currentTab === 'reports' && (
            <ReportsEmployeesView initialSubTab={showEmployeesTabDirectly ? 'employees' : 'reports'} />
          )}
          {currentTab === 'assistant' && <AiAssistantView />}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (Thumb Zone) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center no-print">
        {mobilePrimaryTabs.map((item) => {
          const Icon = item.icon;
          const active = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`h-full flex flex-col items-center justify-center gap-1 text-[10px] font-medium cursor-pointer ${
                active ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-[64px]">{item.shortLabel}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="h-full flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-slate-500 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
          <span>Lainnya</span>
        </button>
      </nav>

      {/* Mobile Full Navigation Sheet */}
      {mobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/50 flex justify-end">
          <div className="w-72 bg-slate-900 text-slate-100 h-full p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <p className="font-display text-base font-bold text-white">KulinaHub</p>
                  <p className="text-[11px] text-slate-400">{appUser.fullName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-300 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 space-y-1">
                {visibleNav.map((item) => {
                  const Icon = item.icon;
                  const active = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileDrawerOpen(false);
                      }}
                      className={`w-full min-h-[44px] px-3 rounded-lg text-xs font-medium flex items-center gap-3 cursor-pointer ${
                        active ? 'bg-emerald-700 text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={signOut}
              className="w-full min-h-[44px] rounded-lg border border-slate-700 text-xs font-medium text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceShell />
    </AuthProvider>
  );
}
