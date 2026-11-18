import React from 'react';
import { ShieldCheck, Store, CreditCard, BarChart3, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from './PWAControls';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, loading, authError } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="w-full border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between gap-8">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          KulinaHub
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-700 tracking-wide">
                Sistem Terpadu Multi-Outlet &amp; Mitra Franchise
              </p>
              <h1 className="mt-3 font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight text-balance">
                Kelola POS Kasir, Pembayaran, Bahan Baku, Resep HPP, dan Royalty dalam Satu Platform
              </h1>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed max-w-xl">
                Dirancang untuk operasional harian kasir di perangkat Android maupun pengawasan keuangan pusat oleh Owner, Admin Head Office, dan Mitra Franchise.
              </p>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg p-4">
                  <Store className="w-4 h-4 text-emerald-700" />
                  <h2 className="mt-2 text-sm font-semibold text-slate-900">Multi-Outlet &amp; RBAC</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Pembatasan data otomatis berdasarkan peran Owner, Manager, Kasir, Gudang, dan Mitra.
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-4">
                  <CreditCard className="w-4 h-4 text-emerald-700" />
                  <h2 className="mt-2 text-sm font-semibold text-slate-900">Pembayaran &amp; Rekonsiliasi</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Tunai, QRIS, Transfer Bank, E-Wallet, Kartu, Split Payment, serta jejak audit refund.
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-4">
                  <BarChart3 className="w-4 h-4 text-emerald-700" />
                  <h2 className="mt-2 text-sm font-semibold text-slate-900">Stok, Resep &amp; HPP</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Pengurangan stok otomatis dari transaksi POS dan perhitungan estimasi HPP per menu.
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-4">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <h2 className="mt-2 text-sm font-semibold text-slate-900">Kontrak &amp; Royalty Mitra</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Perhitungan kewajiban royalty bulanan otomatis dari omzet kotor outlet mitra.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-center">
            <h2 className="font-display text-xl font-bold text-slate-900">Masuk ke Workspace</h2>
            <p className="mt-2 text-sm text-slate-600">
              Gunakan akun Google Anda untuk mengakses sistem operasional KulinaHub sesuai hak akses yang ditetapkan.
            </p>

            {authError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={loading}
              className="mt-6 w-full min-h-[48px] px-4 py-3 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{loading ? 'Memverifikasi sesi...' : 'Masuk dengan Google'}</span>
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>

            <p className="mt-5 text-xs text-slate-500 leading-relaxed">
              Pengguna pertama yang masuk pada ruang kerja baru otomatis ditetapkan sebagai Owner untuk mengelola outlet, menu, staf, dan data awal.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
