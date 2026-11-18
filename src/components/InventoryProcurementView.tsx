import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, PackagePlus, Plus, Truck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatDateTime, formatIDR } from '../lib/format';

interface IngredientRow {
  id: number;
  sku: string;
  name: string;
  unit: string;
  purchaseUnit: string;
  conversionFactor: number;
  costPerUnit: number;
  minStock: number;
}

interface BalanceRow {
  id: number;
  outletId: number;
  outletName: string;
  ingredientId: number;
  ingredientName: string;
  sku: string;
  unit: string;
  purchaseUnit: string;
  conversionFactor: number;
  costPerUnit: number;
  minStock: number;
  quantity: number;
  isLow: boolean;
}

interface MovementRow {
  id: number;
  outletName: string;
  ingredientName: string;
  unit: string;
  movementType: string;
  quantityDelta: number;
  referenceId: string;
  notes: string;
  createdAt: string;
}

interface SupplierRow {
  id: number;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  category: string;
}

interface PoRow {
  id: number;
  poNumber: string;
  outletName: string;
  supplierName: string;
  status: string;
  totalAmount: number;
  notes: string;
  createdAt: string;
  items: Array<{
    id: number;
    ingredientName: string;
    unit: string;
    quantity: number;
    unitCost: number;
  }>;
}

export const InventoryProcurementView: React.FC = () => {
  const { outlets, activeOutletId, apiFetch, can } = useAuth();
  const [tab, setTab] = useState<'balances' | 'movements' | 'po' | 'suppliers'>('balances');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [pos, setPos] = useState<PoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjForm, setAdjForm] = useState({
    outletId: activeOutletId || outlets[0]?.id || 1,
    ingredientId: 1,
    movementType: 'in' as 'in' | 'out' | 'adjustment',
    quantity: '',
    notes: '',
  });

  const [showTransfer, setShowTransfer] = useState(false);
  const [trfForm, setTrfForm] = useState({
    fromOutletId: outlets[0]?.id || 1,
    toOutletId: outlets[1]?.id || outlets[0]?.id || 1,
    ingredientId: 1,
    quantity: '',
    notes: '',
  });

  const [showNewPo, setShowNewPo] = useState(false);
  const [poForm, setPoForm] = useState({
    outletId: activeOutletId || outlets[0]?.id || 1,
    supplierId: 1,
    ingredientId: 1,
    quantity: '5000',
    unitCost: '240',
    notes: '',
  });

  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [suppForm, setSuppForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    category: 'Bahan Baku',
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const q = activeOutletId ? `?outletId=${activeOutletId}` : '';
      const invRes = await apiFetch<{
        ingredients: IngredientRow[];
        balances: BalanceRow[];
        movements: MovementRow[];
      }>(`/api/inventory${q}`);
      setIngredients(invRes.ingredients);
      setBalances(invRes.balances);
      setMovements(invRes.movements);

      if (invRes.ingredients[0]) {
        setAdjForm((prev) => ({ ...prev, ingredientId: invRes.ingredients[0].id }));
        setTrfForm((prev) => ({ ...prev, ingredientId: invRes.ingredients[0].id }));
        setPoForm((prev) => ({ ...prev, ingredientId: invRes.ingredients[0].id }));
      }

      if (can('procurement.view')) {
        const procRes = await apiFetch<{ suppliers: SupplierRow[]; purchaseOrders: PoRow[] }>(
          '/api/procurement'
        );
        setSuppliers(procRes.suppliers);
        setPos(procRes.purchaseOrders);
        if (procRes.suppliers[0]) {
          setPoForm((prev) => ({ ...prev, supplierId: procRes.suppliers[0].id }));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [activeOutletId, apiFetch, can]);

  useEffect(() => {
    load();
  }, [load]);

  const submitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      await apiFetch('/api/inventory/movement', {
        method: 'POST',
        body: JSON.stringify({
          outletId: Number(adjForm.outletId),
          ingredientId: Number(adjForm.ingredientId),
          movementType: adjForm.movementType,
          quantity: Number(adjForm.quantity),
          notes: adjForm.notes,
        }),
      });
      setShowAdjust(false);
      await load();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui stok.');
    }
  };

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      await apiFetch('/api/inventory/transfer', {
        method: 'POST',
        body: JSON.stringify({
          fromOutletId: Number(trfForm.fromOutletId),
          toOutletId: Number(trfForm.toOutletId),
          ingredientId: Number(trfForm.ingredientId),
          quantity: Number(trfForm.quantity),
          notes: trfForm.notes,
        }),
      });
      setShowTransfer(false);
      await load();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Transfer stok gagal.');
    }
  };

  const submitPo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      await apiFetch('/api/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          outletId: Number(poForm.outletId),
          supplierId: Number(poForm.supplierId),
          notes: poForm.notes,
          items: [
            {
              ingredientId: Number(poForm.ingredientId),
              quantity: Number(poForm.quantity),
              unitCost: Number(poForm.unitCost),
            },
          ],
        }),
      });
      setShowNewPo(false);
      await load();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat PO.');
    }
  };

  const receivePo = async (poId: number) => {
    await apiFetch(`/api/purchase-orders/${poId}/receive`, { method: 'POST' });
    await load();
  };

  const submitSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify(suppForm),
    });
    setShowNewSupplier(false);
    setSuppForm({ name: '', contactPerson: '', phone: '', email: '', category: 'Bahan Baku' });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            Stok Bahan Baku, Supplier &amp; Pembelian
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Saldo bahan per outlet, konversi satuan beli, transfer antar-cabang, dan penerimaan barang Purchase Order.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {can('inventory.adjust') && (
            <>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setShowAdjust(true);
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <PackagePlus className="w-4 h-4 text-emerald-700" />
                <span>Stok Masuk / Opname</span>
              </button>
              {outlets.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setShowTransfer(true);
                  }}
                  className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeftRight className="w-4 h-4 text-slate-700" />
                  <span>Transfer Antar-Outlet</span>
                </button>
              )}
            </>
          )}
          {can('procurement.manage') && (
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setShowNewPo(true);
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Purchase Order</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex p-1 bg-slate-100 border border-slate-200 rounded-lg overflow-x-auto max-w-full">
        {[
          { id: 'balances', label: 'Saldo Stok Outlet' },
          { id: 'movements', label: 'Riwayat Pergerakan' },
          { id: 'po', label: 'Purchase Order' },
          { id: 'suppliers', label: 'Data Supplier' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3.5 py-1.5 min-h-[36px] text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'balances' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-medium">Bahan Baku</th>
                  <th className="px-4 py-3 font-medium">Outlet</th>
                  <th className="px-4 py-3 font-medium">Konversi Satuan</th>
                  <th className="px-4 py-3 font-medium text-right">Saldo Saat Ini</th>
                  <th className="px-4 py-3 font-medium text-right">Batas Min.</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      Memuat saldo stok...
                    </td>
                  </tr>
                ) : (
                  balances.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{b.ingredientName}</p>
                        <p className="font-mono text-[11px] text-slate-400">
                          {b.sku} · {formatIDR(b.costPerUnit)}/{b.unit}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{b.outletName}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono">
                        1 {b.purchaseUnit} = {b.conversionFactor} {b.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {b.quantity.toLocaleString('id-ID')} {b.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500">
                        {b.minStock.toLocaleString('id-ID')} {b.unit}
                      </td>
                      <td className="px-5 py-3 font-medium">
                        {b.isLow ? (
                          <span className="text-amber-700">Stok Menipis</span>
                        ) : (
                          <span className="text-emerald-700">Aman</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'movements' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-medium">Waktu</th>
                  <th className="px-4 py-3 font-medium">Outlet</th>
                  <th className="px-4 py-3 font-medium">Bahan</th>
                  <th className="px-4 py-3 font-medium">Tipe</th>
                  <th className="px-4 py-3 font-medium text-right">Perubahan</th>
                  <th className="px-5 py-3 font-medium">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{m.outletName}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{m.ingredientName}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{m.movementType}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${
                        m.quantityDelta >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {m.quantityDelta >= 0 ? '+' : ''}
                      {m.quantityDelta} {m.unit}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{m.notes || m.referenceId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'po' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-medium">No. PO</th>
                  <th className="px-4 py-3 font-medium">Supplier &amp; Outlet</th>
                  <th className="px-4 py-3 font-medium">Detail Item</th>
                  <th className="px-4 py-3 font-medium text-right">Total Nilai</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Penerimaan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pos.map((po) => (
                  <tr key={po.id}>
                    <td className="px-5 py-3">
                      <p className="font-mono font-semibold text-slate-900">{po.poNumber}</p>
                      <p className="text-[11px] text-slate-400">{formatDateTime(po.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{po.supplierName}</p>
                      <p className="text-slate-500">{po.outletName}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {po.items
                        .map((it) => `${it.ingredientName} (${it.quantity} ${it.unit})`)
                        .join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      {formatIDR(po.totalAmount)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <span className={po.status === 'received' ? 'text-emerald-700' : 'text-amber-700'}>
                        {po.status === 'received' ? 'Diterima' : 'Dipesan'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {po.status !== 'received' && can('procurement.manage') ? (
                        <button
                          type="button"
                          onClick={() => receivePo(po.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Terima Barang</span>
                        </button>
                      ) : (
                        <span className="text-slate-400">Selesai</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="space-y-4">
          {can('procurement.manage') && (
            <button
              type="button"
              onClick={() => setShowNewSupplier(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Truck className="w-4 h-4 text-emerald-700" />
              <span>Tambah Supplier</span>
            </button>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suppliers.map((s) => (
              <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs text-slate-500">{s.category}</p>
                <h3 className="mt-1 font-display text-base font-bold text-slate-900">{s.name}</h3>
                <p className="mt-2 text-xs text-slate-600">
                  PIC: {s.contactPerson} · {s.phone} · {s.email}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={submitAdjustment} className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Catat Pergerakan Stok</h3>
              <button type="button" onClick={() => setShowAdjust(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            {errorMsg && <p className="text-xs text-red-700 bg-red-50 p-2.5 rounded">{errorMsg}</p>}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Outlet</label>
              <select
                value={adjForm.outletId}
                onChange={(e) => setAdjForm({ ...adjForm, outletId: Number(e.target.value) })}
                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs bg-white"
              >
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Bahan Baku</label>
              <select
                value={adjForm.ingredientId}
                onChange={(e) => setAdjForm({ ...adjForm, ingredientId: Number(e.target.value) })}
                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs bg-white"
              >
                {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Jenis</label>
                <select
                  value={adjForm.movementType}
                  onChange={(e) => setAdjForm({ ...adjForm, movementType: e.target.value as 'in' | 'out' | 'adjustment' })}
                  className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  <option value="in">Stok Masuk (+)</option>
                  <option value="out">Stok Keluar (-)</option>
                  <option value="adjustment">Opname (Set Saldo)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Jumlah</label>
                <input
                  required
                  type="number"
                  value={adjForm.quantity}
                  onChange={(e) => setAdjForm({ ...adjForm, quantity: e.target.value })}
                  className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 font-mono text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Catatan</label>
              <input
                value={adjForm.notes}
                onChange={(e) => setAdjForm({ ...adjForm, notes: e.target.value })}
                placeholder="Opname mingguan / barang rusak"
                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs"
              />
            </div>
            <button type="submit" className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer">
              Simpan Perubahan Stok
            </button>
          </form>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={submitTransfer} className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Transfer Stok Antar-Outlet</h3>
              <button type="button" onClick={() => setShowTransfer(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            {errorMsg && <p className="text-xs text-red-700 bg-red-50 p-2.5 rounded">{errorMsg}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Dari Outlet</label>
                <select
                  value={trfForm.fromOutletId}
                  onChange={(e) => setTrfForm({ ...trfForm, fromOutletId: Number(e.target.value) })}
                  className="w-full min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Ke Outlet</label>
                <select
                  value={trfForm.toOutletId}
                  onChange={(e) => setTrfForm({ ...trfForm, toOutletId: Number(e.target.value) })}
                  className="w-full min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Bahan Baku</label>
                <select
                  value={trfForm.ingredientId}
                  onChange={(e) => setTrfForm({ ...trfForm, ingredientId: Number(e.target.value) })}
                  className="w-full min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Jumlah</label>
                <input
                  required
                  type="number"
                  value={trfForm.quantity}
                  onChange={(e) => setTrfForm({ ...trfForm, quantity: e.target.value })}
                  className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 font-mono text-xs"
                />
              </div>
            </div>
            <button type="submit" className="w-full min-h-[44px] rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer">
              Proses Transfer
            </button>
          </form>
        </div>
      )}

      {/* New PO Modal */}
      {showNewPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={submitPo} className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Buat Purchase Order</h3>
              <button type="button" onClick={() => setShowNewPo(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Outlet Tujuan</label>
                <select
                  value={poForm.outletId}
                  onChange={(e) => setPoForm({ ...poForm, outletId: Number(e.target.value) })}
                  className="w-full min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Supplier</label>
                <select
                  value={poForm.supplierId}
                  onChange={(e) => setPoForm({ ...poForm, supplierId: Number(e.target.value) })}
                  className="w-full min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Bahan Baku</label>
              <select
                value={poForm.ingredientId}
                onChange={(e) => {
                  const ing = ingredients.find((i) => i.id === Number(e.target.value));
                  setPoForm({
                    ...poForm,
                    ingredientId: Number(e.target.value),
                    unitCost: String(ing?.costPerUnit || 0),
                  });
                }}
                className="w-full min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
              >
                {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Jumlah (satuan dasar)</label>
                <input
                  required
                  type="number"
                  value={poForm.quantity}
                  onChange={(e) => setPoForm({ ...poForm, quantity: e.target.value })}
                  className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Harga / Satuan (Rp)</label>
                <input
                  required
                  type="number"
                  value={poForm.unitCost}
                  onChange={(e) => setPoForm({ ...poForm, unitCost: e.target.value })}
                  className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 font-mono text-xs"
                />
              </div>
            </div>
            <button type="submit" className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer">
              Kirim Purchase Order
            </button>
          </form>
        </div>
      )}

      {/* New Supplier Modal */}
      {showNewSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={submitSupplier} className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Tambah Supplier Baru</h3>
              <button type="button" onClick={() => setShowNewSupplier(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <input required placeholder="Nama Perusahaan Supplier" value={suppForm.name} onChange={(e) => setSuppForm({ ...suppForm, name: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            <input placeholder="Nama Kontak (PIC)" value={suppForm.contactPerson} onChange={(e) => setSuppForm({ ...suppForm, contactPerson: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Telepon" value={suppForm.phone} onChange={(e) => setSuppForm({ ...suppForm, phone: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
              <input placeholder="Kategori" value={suppForm.category} onChange={(e) => setSuppForm({ ...suppForm, category: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            </div>
            <button type="submit" className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer">
              Simpan Supplier
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
