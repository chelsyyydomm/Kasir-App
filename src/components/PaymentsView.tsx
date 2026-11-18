import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  formatDateTime,
  formatIDR,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  SALE_STATUS_LABELS,
} from '../lib/format';

interface PaymentRow {
  id: number;
  saleId: number;
  outletId: number;
  outletName: string;
  receiptNumber: string;
  customerName: string;
  cashierName: string;
  method: string;
  channelMode: string;
  amount: number;
  cashTendered: number;
  changeAmount: number;
  referenceNumber: string;
  providerStatus: string;
  reconciled: boolean;
  reconciledAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface SaleRecord {
  id: number;
  receiptNumber: string;
  outletName: string;
  customerName: string;
  cashierName: string;
  totalAmount: number;
  status: string;
  voidReason: string;
  createdAt: string;
  payments: PaymentRow[];
}

export const PaymentsView: React.FC = () => {
  const { activeOutletId, apiFetch, can } = useAuth();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'payments' | 'sales'>('payments');

  const [refundTarget, setRefundTarget] = useState<SaleRecord | null>(null);
  const [actionType, setActionType] = useState<'refund' | 'void'>('refund');
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const q = activeOutletId ? `?outletId=${activeOutletId}` : '';
      const res = await apiFetch<{ sales: SaleRecord[]; payments: PaymentRow[] }>(`/api/payments${q}`);
      setSales(res.sales || []);
      setPayments(res.payments || []);
    } finally {
      setLoading(false);
    }
  }, [activeOutletId, apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== 'all' && p.providerStatus !== statusFilter) return false;
      if (methodFilter !== 'all' && p.method !== methodFilter) return false;
      return true;
    });
  }, [payments, statusFilter, methodFilter]);

  const summary = useMemo(() => {
    const success = payments.filter((p) => p.providerStatus === 'success');
    const pending = payments.filter((p) => p.providerStatus === 'pending');
    const unreconciledNonCash = success.filter((p) => p.method !== 'cash' && !p.reconciled);
    return {
      totalSuccess: success.reduce((a, b) => a + b.amount, 0),
      pendingCount: pending.length,
      unreconciledCount: unreconciledNonCash.length,
      refundedTotal: payments
        .filter((p) => p.providerStatus === 'refunded')
        .reduce((a, b) => a + b.amount, 0),
    };
  }, [payments]);

  const handleVerifyGateway = async (paymentId: number, outcome: 'success' | 'failed') => {
    try {
      setBusyId(paymentId);
      await apiFetch(`/api/payments/${paymentId}/verify-gateway`, {
        method: 'POST',
        body: JSON.stringify({ outcome }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleReconcile = async (payment: PaymentRow) => {
    try {
      setBusyId(payment.id);
      await apiFetch(`/api/payments/${payment.id}/reconcile`, {
        method: 'PATCH',
        body: JSON.stringify({ reconciled: !payment.reconciled }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleVoidRefundSubmit = async () => {
    if (!refundTarget) return;
    if (!reason.trim()) {
      setActionError('Alasan wajib diisi sebagai bagian dari jejak audit.');
      return;
    }
    try {
      setBusyId(refundTarget.id);
      setActionError(null);
      await apiFetch(`/api/sales/${refundTarget.id}/void-refund`, {
        method: 'POST',
        body: JSON.stringify({ actionType, reason }),
      });
      setRefundTarget(null);
      setReason('');
      await load();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal memproses permintaan.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            Manajemen Pembayaran &amp; Rekonsiliasi
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Riwayat pembayaran tunai dan non-tunai, verifikasi gateway, rekonsiliasi settlement, serta refund/void berotorisasi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 bg-slate-100 border border-slate-200 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('payments')}
              className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'payments' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Log Pembayaran
            </button>
            <button
              type="button"
              onClick={() => setViewMode('sales')}
              className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'sales' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Transaksi &amp; Refund
            </button>
          </div>
          <button
            type="button"
            onClick={load}
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Pembayaran Berhasil</p>
          <p className="mt-1.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatIDR(summary.totalSuccess)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Menunggu Konfirmasi Gateway</p>
          <p className="mt-1.5 font-mono text-xl font-bold text-amber-700 tabular-nums">
            {summary.pendingCount} Pembayaran
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Non-Tunai Belum Rekonsiliasi</p>
          <p className="mt-1.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {summary.unreconciledCount} Transaksi
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Refund</p>
          <p className="mt-1.5 font-mono text-xl font-bold text-red-700 tabular-nums">
            {formatIDR(summary.refundedTotal)}
          </p>
        </div>
      </div>

      {viewMode === 'payments' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
              >
                <option value="all">Semua Status</option>
                <option value="success">Berhasil</option>
                <option value="pending">Menunggu</option>
                <option value="failed">Gagal</option>
                <option value="cancelled">Dibatalkan</option>
                <option value="refunded">Refund</option>
              </select>

              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
              >
                <option value="all">Semua Metode</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500 tabular-nums">
              Menampilkan {filteredPayments.length} catatan pembayaran
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-medium">Referensi &amp; Struk</th>
                  <th className="px-4 py-3 font-medium">Outlet &amp; Kasir</th>
                  <th className="px-4 py-3 font-medium">Metode</th>
                  <th className="px-4 py-3 font-medium text-right">Nominal</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Rekonsiliasi / Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                      Tidak ada data pembayaran sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p) => {
                    const st = PAYMENT_STATUS_LABELS[p.providerStatus] || {
                      label: p.providerStatus,
                      tone: 'text-slate-600',
                    };
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3">
                          <p className="font-mono font-medium text-slate-900">{p.receiptNumber}</p>
                          <p className="font-mono text-[11px] text-slate-500">{p.referenceNumber}</p>
                          <p className="text-[11px] text-slate-400">{formatDateTime(p.createdAt)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{p.outletName}</p>
                          <p className="text-slate-500">{p.cashierName}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">
                            {PAYMENT_METHOD_LABELS[p.method] || p.method}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {p.channelMode === 'gateway' ? 'Gateway' : 'Manual'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          <p className="font-semibold text-slate-900">{formatIDR(p.amount)}</p>
                          {p.changeAmount > 0 && (
                            <p className="text-[11px] text-slate-500">Kembali {formatIDR(p.changeAmount)}</p>
                          )}
                        </td>
                        <td className={`px-4 py-3 font-medium ${st.tone}`}>{st.label}</td>
                        <td className="px-5 py-3 text-right">
                          {p.providerStatus === 'pending' ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busyId === p.id}
                                onClick={() => handleVerifyGateway(p.id, 'success')}
                                className="px-2.5 py-1.5 rounded bg-emerald-700 text-white text-[11px] font-medium hover:bg-emerald-800 cursor-pointer"
                              >
                                Verifikasi Lunas
                              </button>
                              <button
                                type="button"
                                disabled={busyId === p.id}
                                onClick={() => handleVerifyGateway(p.id, 'failed')}
                                className="px-2.5 py-1.5 rounded border border-red-200 text-red-700 text-[11px] font-medium hover:bg-red-50 cursor-pointer"
                              >
                                Gagal
                              </button>
                            </div>
                          ) : p.providerStatus === 'success' && p.method !== 'cash' && can('payments.reconcile') ? (
                            <button
                              type="button"
                              disabled={busyId === p.id}
                              onClick={() => handleToggleReconcile(p)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded border text-[11px] font-medium cursor-pointer ${
                                p.reconciled
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <Check className="w-3 h-3" />
                              <span>{p.reconciled ? 'Terekonsiliasi' : 'Tandai Rekonsiliasi'}</span>
                            </button>
                          ) : (
                            <span className="text-slate-400">
                              {p.reconciled ? 'Terekonsiliasi' : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-medium">No. Struk</th>
                  <th className="px-4 py-3 font-medium">Outlet · Pelanggan</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Otorisasi Void / Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((s) => {
                  const st = SALE_STATUS_LABELS[s.status] || {
                    label: s.status,
                    tone: 'text-slate-600',
                  };
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <p className="font-mono font-medium text-slate-900">{s.receiptNumber}</p>
                        <p className="text-[11px] text-slate-400">{formatDateTime(s.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{s.outletName}</p>
                        <p className="text-slate-500">
                          {s.customerName} · Kasir {s.cashierName}
                        </p>
                        {s.voidReason && (
                          <p className="text-[11px] text-red-600 mt-0.5">Alasan: {s.voidReason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatIDR(s.totalAmount)}
                      </td>
                      <td className={`px-4 py-3 font-medium ${st.tone}`}>{st.label}</td>
                      <td className="px-5 py-3 text-right">
                        {can('pos.void_refund') && (s.status === 'paid' || s.status === 'pending_payment') ? (
                          <button
                            type="button"
                            onClick={() => {
                              setRefundTarget(s);
                              setActionType(s.status === 'paid' ? 'refund' : 'void');
                              setActionError(null);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{s.status === 'paid' ? 'Refund' : 'Batalkan'}</span>
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Authorized Void / Refund Modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-red-700">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="font-display text-base font-bold text-slate-900">
                  Otorisasi {actionType === 'refund' ? 'Refund Dana' : 'Pembatalan Transaksi'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Transaksi <strong className="font-mono">{refundTarget.receiptNumber}</strong> senilai{' '}
              <strong className="font-mono">{formatIDR(refundTarget.totalAmount)}</strong> akan dicatat pada Audit Log.
            </p>

            {actionError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {actionError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Alasan Wajib (Tercatat di Audit Log)
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Kesalahan input pesanan oleh kasir atau permintaan pengembalian pelanggan"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busyId === refundTarget.id}
                onClick={handleVoidRefundSubmit}
                className="min-h-[42px] px-4 py-2 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-800 cursor-pointer"
              >
                {busyId === refundTarget.id ? 'Memproses...' : 'Konfirmasi Otorisasi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
