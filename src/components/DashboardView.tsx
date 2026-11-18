import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatDateTime, formatIDR, PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS } from '../lib/format';

interface DashboardData {
  kpis: {
    totalRevenue: number;
    transactionCount: number;
    pendingCount: number;
    estimatedHpp: number;
    grossProfit: number;
    totalExpenses: number;
    lowStockCount: number;
  };
  paymentBreakdown: Array<{ method: string; total: number; count: number }>;
  outletComparison: Array<{
    outletId: number;
    code: string;
    name: string;
    city: string;
    isFranchise: boolean;
    status: string;
    revenue: number;
    transactions: number;
    pendingCount: number;
  }>;
  lowStockItems: Array<{
    id: number;
    outletId: number;
    outletName: string;
    ingredientId: number;
    ingredientName: string;
    unit: string;
    quantity: number;
    minStock: number;
  }>;
  recentSales: Array<{
    id: number;
    receiptNumber: string;
    customerName: string;
    totalAmount: number;
    status: string;
    createdAt: string;
  }>;
}

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { activeOutletId, apiFetch, can } = useAuth();
  const [range, setRange] = useState<'today' | '7d' | '30d'>('30d');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const q = new URLSearchParams({ range });
      if (activeOutletId) q.set('outletId', String(activeOutletId));
      const res = await apiFetch<DashboardData>(`/api/dashboard?${q.toString()}`);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat dashboard.');
    } finally {
      setLoading(false);
    }
  }, [activeOutletId, apiFetch, range]);

  useEffect(() => {
    load();
  }, [load]);

  const maxMethodTotal = Math.max(
    1,
    ...(data?.paymentBreakdown.map((m) => m.total) || [1])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            Ringkasan Operasional Bisnis
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Penjualan terverifikasi, metode pembayaran, estimasi laba kotor, dan peringatan bahan baku.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200">
            {[
              { id: 'today', label: 'Hari Ini' },
              { id: '7d', label: '7 Hari' },
              { id: '30d', label: '30 Hari' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRange(item.id as 'today' | '7d' | '30d')}
                className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  range === item.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={load}
            aria-label="Muat ulang dashboard"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Omzet Penjualan (Lunas)</p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {loading || !data ? '—' : formatIDR(data.kpis.totalRevenue)}
          </p>
          <p className="mt-2 text-xs text-slate-500 tabular-nums">
            {data ? `${data.kpis.transactionCount} transaksi selesai` : 'Memuat...'}
            {data && data.kpis.pendingCount > 0 ? ` · ${data.kpis.pendingCount} pending` : ''}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">
            {can('dashboard.financials') ? 'Estimasi Laba Kotor (Gross)' : 'Volume Transaksi'}
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {loading || !data
              ? '—'
              : can('dashboard.financials')
              ? formatIDR(data.kpis.grossProfit)
              : `${data.kpis.transactionCount} Struk`}
          </p>
          <p className="mt-2 text-xs text-slate-500 tabular-nums">
            {data && can('dashboard.financials')
              ? `Estimasi HPP ${formatIDR(data.kpis.estimatedHpp)}`
              : 'Hak akses operasional outlet'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">
            {can('dashboard.financials') ? 'Biaya Operasional Tercatat' : 'Pembayaran Menunggu'}
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {loading || !data
              ? '—'
              : can('dashboard.financials')
              ? formatIDR(data.kpis.totalExpenses)
              : `${data.kpis.pendingCount} Transaksi`}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {can('dashboard.financials') ? 'Sewa, utilitas, pemasaran & gaji' : 'Menunggu verifikasi gateway'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Peringatan Stok Menipis</p>
          <p
            className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
              data && data.kpis.lowStockCount > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {loading || !data ? '—' : `${data.kpis.lowStockCount} Bahan`}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
          >
            <span>Periksa Gudang &amp; PO</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Middle grid: Payment Breakdown + Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Rekap Metode Pembayaran
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribusi nilai pembayaran berhasil per kanal
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="text-xs font-medium text-emerald-700 hover:underline whitespace-nowrap cursor-pointer"
            >
              Kelola Pembayaran
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {!data || data.paymentBreakdown.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                Belum ada pembayaran berhasil pada periode ini.
              </p>
            ) : (
              data.paymentBreakdown.map((item) => {
                const pct = Math.round((item.total / maxMethodTotal) * 100);
                return (
                  <div key={item.method} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">
                        {PAYMENT_METHOD_LABELS[item.method] || item.method}
                      </span>
                      <span className="font-mono text-slate-700 tabular-nums">
                        {formatIDR(item.total)} · {item.count} trx
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Stok di Bawah Batas Minimum
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Membutuhkan penerimaan barang atau transfer stok
              </p>
            </div>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {!data || data.lowStockItems.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">
                Semua stok bahan baku berada pada level aman.
              </p>
            ) : (
              data.lowStockItems.slice(0, 6).map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{item.ingredientName}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{item.outletName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-xs font-semibold text-amber-700 tabular-nums">
                      {item.quantity} {item.unit}
                    </p>
                    <p className="font-mono text-[11px] text-slate-400 tabular-nums">
                      Min {item.minStock} {item.unit}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Grid: Outlet Performance + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Perbandingan Performa Outlet
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('franchise')}
              className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
            >
              Lihat Outlet &amp; Mitra
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-medium">Outlet</th>
                  <th className="px-4 py-3 font-medium">Tipe</th>
                  <th className="px-4 py-3 font-medium text-right">Transaksi</th>
                  <th className="px-5 py-3 font-medium text-right">Omzet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.outletComparison.map((o) => (
                  <tr key={o.outletId} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{o.name}</p>
                      <p className="text-slate-500">{o.code} · {o.city}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {o.isFranchise ? 'Mitra Franchise' : 'Milik Pusat'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {o.transactions}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                      {formatIDR(o.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Transaksi Terbaru
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('pos')}
              className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
            >
              Buka POS Kasir
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {!data || data.recentSales.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">Belum ada transaksi.</p>
            ) : (
              data.recentSales.map((s) => {
                const st = SALE_STATUS_LABELS[s.status] || {
                  label: s.status,
                  tone: 'text-slate-600',
                };
                return (
                  <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium text-slate-900 truncate">
                        {s.receiptNumber}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {s.customerName} · {formatDateTime(s.createdAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                        {formatIDR(s.totalAmount)}
                      </p>
                      <p className={`text-[11px] font-medium ${st.tone}`}>{st.label}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
