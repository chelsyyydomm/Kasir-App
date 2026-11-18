import React, { useCallback, useEffect, useState } from 'react';
import { Download, Plus, Shield, UserPlus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { downloadCSV, EXPENSE_CATEGORY_LABELS, formatDateTime, formatIDR } from '../lib/format';
import { ROLE_LABELS, ROLE_PERMISSIONS, UserRole } from '../lib/rbac';

interface ReportData {
  pnl: {
    grossSales: number;
    totalDiscounts: number;
    totalTax: number;
    netSales: number;
    totalHpp: number;
    grossProfit: number;
    totalOpex: number;
    estimatedNetProfit: number;
    totalPurchases: number;
  };
  salesByProduct: Array<{ productId: number; productName: string; qty: number; revenue: number; hpp: number }>;
  salesByCashier: Array<{ cashierUid: string; cashierName: string; transactions: number; revenue: number }>;
  expenses: Array<{
    id: number;
    outletName: string;
    category: string;
    description: string;
    amount: number;
    expenseDate: string;
  }>;
}

interface EmployeeRow {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  assignedOutletId: number | null;
  outletName: string;
  isActive: boolean;
}

interface AuditLogRow {
  id: number;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  detailsJson: string;
  createdAt: string;
}

export const ReportsEmployeesView: React.FC<{ initialSubTab?: 'reports' | 'employees' | 'audit' }> = ({
  initialSubTab = 'reports',
}) => {
  const { outlets, activeOutletId, apiFetch, can } = useAuth();
  const [subTab, setSubTab] = useState<'reports' | 'employees' | 'audit'>(initialSubTab);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expForm, setExpForm] = useState({
    outletId: activeOutletId || outlets[0]?.id || 1,
    category: 'utilities',
    description: '',
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
  });

  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empForm, setEmpForm] = useState({
    email: '',
    fullName: '',
    phone: '',
    role: 'cashier',
    assignedOutletId: '',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      if (can('reports.view')) {
        const q = activeOutletId ? `?outletId=${activeOutletId}` : '';
        const rep = await apiFetch<ReportData>(`/api/reports${q}`);
        setReportData(rep);
      }
      if (can('employees.view')) {
        const emp = await apiFetch<{ employees: EmployeeRow[]; auditLogs: AuditLogRow[] }>('/api/employees');
        setEmployees(emp.employees);
        setAuditLogs(emp.auditLogs);
      }
    } finally {
      setLoading(false);
    }
  }, [activeOutletId, apiFetch, can]);

  useEffect(() => {
    load();
  }, [load]);

  const exportPnlCsv = () => {
    if (!reportData) return;
    downloadCSV(
      `laporan-keuangan-kulinahub-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Komponen', 'Nilai (IDR)'],
      [
        ['Penjualan Kotor', reportData.pnl.grossSales],
        ['Diskon', -reportData.pnl.totalDiscounts],
        ['PPN Terkumpul', reportData.pnl.totalTax],
        ['Total Penjualan Bersih (Incl. PPN)', reportData.pnl.netSales],
        ['Estimasi HPP Bahan Baku', -reportData.pnl.totalHpp],
        ['Laba Kotor Estimasi', reportData.pnl.grossProfit],
        ['Pengeluaran Operasional', -reportData.pnl.totalOpex],
        ['Estimasi Laba Bersih Operasional', reportData.pnl.estimatedNetProfit],
      ]
    );
  };

  const exportProductCsv = () => {
    if (!reportData) return;
    downloadCSV(
      `penjualan-produk-kulinahub-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Produk', 'Qty Terjual', 'Omzet (IDR)', 'Estimasi HPP (IDR)'],
      reportData.salesByProduct.map((p) => [p.productName, p.qty, p.revenue, p.hpp])
    );
  };

  const submitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        outletId: Number(expForm.outletId),
        category: expForm.category,
        description: expForm.description,
        amount: Number(expForm.amount),
        expenseDate: expForm.expenseDate,
      }),
    });
    setShowAddExpense(false);
    setExpForm({ ...expForm, description: '', amount: '' });
    await load();
  };

  const submitEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/employees', {
      method: 'POST',
      body: JSON.stringify({
        ...empForm,
        assignedOutletId: empForm.assignedOutletId ? Number(empForm.assignedOutletId) : null,
      }),
    });
    setShowAddEmp(false);
    setEmpForm({ email: '', fullName: '', phone: '', role: 'cashier', assignedOutletId: '' });
    await load();
  };

  const updateEmployeeRole = async (empId: number, role: string, assignedOutletId: number | null) => {
    await apiFetch(`/api/employees/${empId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role, assignedOutletId }),
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            Laporan Keuangan, Karyawan &amp; Audit
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Estimasi laba rugi, penjualan per produk/kasir, pengeluaran operasional, ekspor CSV, manajemen peran RBAC, dan jejak audit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {subTab === 'reports' && can('reports.export') && (
            <>
              <button
                type="button"
                onClick={exportPnlCsv}
                className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor Laba Rugi CSV</span>
              </button>
              <button
                type="button"
                onClick={exportProductCsv}
                className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor Produk CSV</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="inline-flex p-1 bg-slate-100 border border-slate-200 rounded-lg">
        {can('reports.view') && (
          <button
            type="button"
            onClick={() => setSubTab('reports')}
            className={`px-3.5 py-1.5 min-h-[36px] text-xs font-medium rounded-md cursor-pointer ${
              subTab === 'reports' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Laporan &amp; Laba Rugi
          </button>
        )}
        {can('employees.view') && (
          <>
            <button
              type="button"
              onClick={() => setSubTab('employees')}
              className={`px-3.5 py-1.5 min-h-[36px] text-xs font-medium rounded-md cursor-pointer ${
                subTab === 'employees' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Karyawan &amp; RBAC
            </button>
            <button
              type="button"
              onClick={() => setSubTab('audit')}
              className={`px-3.5 py-1.5 min-h-[36px] text-xs font-medium rounded-md cursor-pointer ${
                subTab === 'audit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Audit Log ({auditLogs.length})
            </button>
          </>
        )}
      </div>

      {subTab === 'reports' && reportData && (
        <div className="space-y-6">
          {/* Estimasi Laba Rugi */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Estimasi Laba Rugi (P&amp;L)
              </h2>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-600">Penjualan Kotor (Subtotal Menu)</span>
                  <span className="font-mono tabular-nums text-slate-900">{formatIDR(reportData.pnl.grossSales)}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-600">Diskon Penjualan</span>
                  <span className="font-mono tabular-nums text-red-700">-{formatIDR(reportData.pnl.totalDiscounts)}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-600">Estimasi HPP (Resep Terjual)</span>
                  <span className="font-mono tabular-nums text-red-700">-{formatIDR(reportData.pnl.totalHpp)}</span>
                </div>
                <div className="py-2.5 flex justify-between font-semibold">
                  <span className="text-slate-900">Laba Kotor (Gross Profit)</span>
                  <span className="font-mono tabular-nums text-emerald-700">{formatIDR(reportData.pnl.grossProfit)}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-600">Pengeluaran Operasional</span>
                  <span className="font-mono tabular-nums text-red-700">-{formatIDR(reportData.pnl.totalOpex)}</span>
                </div>
                <div className="pt-3 flex justify-between text-sm font-bold">
                  <span className="text-slate-900">Estimasi Laba Bersih</span>
                  <span
                    className={`font-mono tabular-nums ${
                      reportData.pnl.estimatedNetProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {formatIDR(reportData.pnl.estimatedNetProfit)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 pt-2">
                Pajak PPN terkumpul ({formatIDR(reportData.pnl.totalTax)}) dicatat terpisah sebagai kewajiban pajak. Total penerimaan PO: {formatIDR(reportData.pnl.totalPurchases)}.
              </p>
            </div>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Pengeluaran Operasional
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAddExpense(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Catat Biaya</span>
                </button>
              </div>
              <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                {reportData.expenses.map((ex) => (
                  <div key={ex.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-medium text-slate-900">{ex.description}</p>
                      <p className="text-slate-500">
                        {EXPENSE_CATEGORY_LABELS[ex.category] || ex.category} · {ex.outletName} · {ex.expenseDate}
                      </p>
                    </div>
                    <span className="font-mono font-semibold text-red-700 tabular-nums shrink-0">
                      -{formatIDR(ex.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sales by Product & Cashier */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="font-display text-base font-semibold text-slate-900">Penjualan per Produk</h2>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Produk</th>
                    <th className="px-4 py-2.5 font-medium text-right">Terjual</th>
                    <th className="px-5 py-2.5 font-medium text-right">Omzet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.salesByProduct.map((p) => (
                    <tr key={p.productId}>
                      <td className="px-5 py-2.5 font-medium text-slate-900">{p.productName}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{p.qty}</td>
                      <td className="px-5 py-2.5 text-right font-mono font-semibold tabular-nums">{formatIDR(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="font-display text-base font-semibold text-slate-900">Penjualan per Kasir</h2>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Nama Kasir</th>
                    <th className="px-4 py-2.5 font-medium text-right">Transaksi</th>
                    <th className="px-5 py-2.5 font-medium text-right">Total Nilai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.salesByCashier.map((c) => (
                    <tr key={c.cashierUid}>
                      <td className="px-5 py-2.5 font-medium text-slate-900">{c.cashierName}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.transactions}</td>
                      <td className="px-5 py-2.5 text-right font-mono font-semibold tabular-nums">{formatIDR(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'employees' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Daftar Karyawan &amp; Penempatan Outlet
              </h2>
              {can('employees.manage') && (
                <button
                  type="button"
                  onClick={() => setShowAddEmp(true)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Tambah Karyawan</span>
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-medium">Nama &amp; Email</th>
                    <th className="px-4 py-3 font-medium">Peran (RBAC)</th>
                    <th className="px-4 py-3 font-medium">Penempatan Outlet</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">Memuat karyawan...</td></tr>
                  ) : (
                    employees.map((emp) => (
                      <tr key={emp.id}>
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900">{emp.fullName}</p>
                          <p className="text-slate-500">{emp.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          {can('employees.manage') ? (
                            <select
                              value={emp.role}
                              onChange={(e) => updateEmployeeRole(emp.id, e.target.value, emp.assignedOutletId)}
                              className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                            >
                              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          ) : (
                            <span>{ROLE_LABELS[emp.role as UserRole] || emp.role}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {can('employees.manage') ? (
                            <select
                              value={emp.assignedOutletId || ''}
                              onChange={(e) =>
                                updateEmployeeRole(
                                  emp.id,
                                  emp.role,
                                  e.target.value ? Number(e.target.value) : null
                                )
                              }
                              className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                            >
                              <option value="">Semua Outlet (Pusat)</option>
                              {outlets.map((o) => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span>{emp.outletName}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 font-medium text-emerald-700">
                          {emp.isActive ? 'Aktif' : 'Nonaktif'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RBAC Reference Matrix */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-emerald-700" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Matriks Hak Akses (RBAC)
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((roleKey) => (
                <div key={roleKey} className="border border-slate-200 rounded-lg p-4">
                  <p className="font-semibold text-slate-900">{ROLE_LABELS[roleKey]}</p>
                  <p className="mt-1.5 text-slate-500 leading-relaxed">
                    {ROLE_PERMISSIONS[roleKey].length} hak akses modul aktif ({ROLE_PERMISSIONS[roleKey].slice(0, 4).join(', ')}...)
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-medium">Waktu</th>
                  <th className="px-4 py-3 font-medium">Aktor &amp; Peran</th>
                  <th className="px-4 py-3 font-medium">Aksi</th>
                  <th className="px-5 py-3 font-medium">Detail Perubahan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{log.actorEmail}</p>
                      <p className="text-slate-500">{log.actorRole}</p>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-800">{log.action}</td>
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-500 max-w-md truncate">
                      {log.detailsJson}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={submitExpense} className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Catat Pengeluaran Operasional</h3>
              <button type="button" onClick={() => setShowAddExpense(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <select value={expForm.outletId} onChange={(e) => setExpForm({ ...expForm, outletId: Number(e.target.value) })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs bg-white">
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs bg-white">
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input required placeholder="Deskripsi pengeluaran" value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            <div className="grid grid-cols-2 gap-3">
              <input required type="number" placeholder="Nominal (Rp)" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 font-mono text-xs" />
              <input required type="date" value={expForm.expenseDate} onChange={(e) => setExpForm({ ...expForm, expenseDate: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            </div>
            <button type="submit" className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer">
              Simpan Pengeluaran
            </button>
          </form>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={submitEmployee} className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Tambah Karyawan</h3>
              <button type="button" onClick={() => setShowAddEmp(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <input required placeholder="Nama Lengkap" value={empForm.fullName} onChange={(e) => setEmpForm({ ...empForm, fullName: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            <input required type="email" placeholder="Email Google Karyawan" value={empForm.email} onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            <select value={empForm.role} onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs bg-white">
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={empForm.assignedOutletId} onChange={(e) => setEmpForm({ ...empForm, assignedOutletId: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs bg-white">
              <option value="">Semua Outlet (Pusat)</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button type="submit" className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer">
              Simpan Karyawan
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
