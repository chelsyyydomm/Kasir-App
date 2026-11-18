import React, { useCallback, useEffect, useState } from 'react';
import { Calculator, CheckCircle2, Plus, Store, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatIDR } from '../lib/format';

interface PartnerRow {
  id: number;
  outletId: number | null;
  outletName: string;
  outletCity: string;
  partnerName: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  contractNumber: string;
  contractStart: string;
  contractEnd: string;
  initialFee: number;
  royaltyType: string;
  royaltyValue: number;
  status: string;
  currentOutletRevenue: number;
}

interface RoyaltyRow {
  id: number;
  partnerName: string;
  companyName: string;
  outletName: string;
  periodMonth: string;
  grossSales: number;
  calculatedFee: number;
  status: string;
  notes: string;
}

export const OutletsFranchiseView: React.FC = () => {
  const { outlets, apiFetch, can, refreshContext } = useAuth();
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [royalties, setRoyalties] = useState<RoyaltyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  const [showNewOutlet, setShowNewOutlet] = useState(false);
  const [outletForm, setOutletForm] = useState({
    code: '',
    name: '',
    address: '',
    city: '',
    phone: '',
    managerName: '',
    isFranchise: true,
  });

  const [showNewPartner, setShowNewPartner] = useState(false);
  const [partnerForm, setPartnerForm] = useState({
    outletId: '',
    partnerName: '',
    companyName: '',
    contactEmail: '',
    contactPhone: '',
    contractNumber: '',
    initialFee: '125000000',
    royaltyType: 'percentage_gross',
    royaltyValue: '5',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      if (can('franchise.view')) {
        const res = await apiFetch<{ partners: PartnerRow[]; royalties: RoyaltyRow[] }>('/api/franchise');
        setPartners(res.partners);
        setRoyalties(res.royalties);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, can]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleOutletStatus = async (outletId: number, currentStatus: string) => {
    await apiFetch(`/api/outlets/${outletId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: currentStatus === 'active' ? 'inactive' : 'active' }),
    });
    await refreshContext();
  };

  const createOutlet = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/outlets', {
      method: 'POST',
      body: JSON.stringify(outletForm),
    });
    setShowNewOutlet(false);
    setOutletForm({ code: '', name: '', address: '', city: '', phone: '', managerName: '', isFranchise: true });
    await refreshContext();
    await load();
  };

  const createPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/franchise/partners', {
      method: 'POST',
      body: JSON.stringify({
        ...partnerForm,
        outletId: partnerForm.outletId ? Number(partnerForm.outletId) : null,
        initialFee: Number(partnerForm.initialFee),
        royaltyValue: Number(partnerForm.royaltyValue),
      }),
    });
    setShowNewPartner(false);
    await load();
    await refreshContext();
  };

  const calculateRoyalties = async () => {
    try {
      setCalculating(true);
      const periodMonth = new Date().toISOString().slice(0, 7);
      await apiFetch('/api/franchise/calculate-royalty', {
        method: 'POST',
        body: JSON.stringify({ periodMonth }),
      });
      await load();
    } finally {
      setCalculating(false);
    }
  };

  const markRoyaltyPaid = async (id: number) => {
    await apiFetch(`/api/franchise/royalties/${id}/pay`, { method: 'POST' });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            Manajemen Outlet &amp; Mitra Franchise
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Pengelolaan cabang aktif/nonaktif, kontrak mitra franchise, biaya awal, dan perhitungan kewajiban royalty bulanan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {can('outlets.manage') && (
            <button
              type="button"
              onClick={() => setShowNewOutlet(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Store className="w-4 h-4 text-emerald-700" />
              <span>Tambah Outlet</span>
            </button>
          )}
          {can('franchise.manage') && (
            <>
              <button
                type="button"
                onClick={() => setShowNewPartner(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Daftar Mitra Baru</span>
              </button>
              <button
                type="button"
                disabled={calculating}
                onClick={calculateRoyalties}
                className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Calculator className="w-4 h-4" />
                <span>{calculating ? 'Menghitung...' : 'Hitung Royalty Bulan Ini'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Outlets list */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-display text-base font-semibold text-slate-900">Jaringan Outlet</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 font-medium">Kode &amp; Nama Outlet</th>
                <th className="px-4 py-3 font-medium">Lokasi</th>
                <th className="px-4 py-3 font-medium">Manager</th>
                <th className="px-4 py-3 font-medium">Kepemilikan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Pengaturan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {outlets.map((o) => (
                <tr key={o.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{o.name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{o.code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{o.city}</p>
                    <p className="text-[11px] text-slate-400">{o.address}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-800">{o.managerName || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {o.isFranchise ? 'Mitra Franchise' : 'Milik Pusat'}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span className={o.status === 'active' ? 'text-emerald-700' : 'text-slate-400'}>
                      {o.status === 'active' ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {can('outlets.manage') && (
                      <button
                        type="button"
                        onClick={() => toggleOutletStatus(o.id, o.status)}
                        className="text-xs font-medium text-slate-700 hover:underline cursor-pointer"
                      >
                        {o.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Franchise Partners & Royalty */}
      {can('franchise.view') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Kontrak Mitra Franchise
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {loading ? (
                <p className="p-6 text-xs text-slate-500">Memuat data mitra...</p>
              ) : partners.length === 0 ? (
                <p className="p-6 text-xs text-slate-500">Belum ada mitra terdaftar.</p>
              ) : (
                partners.map((p) => (
                  <div key={p.id} className="p-5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-sm font-bold text-slate-900">{p.companyName}</p>
                        <p className="text-xs text-slate-600">
                          {p.partnerName} · {p.outletName}
                        </p>
                      </div>
                      <span className="font-mono text-xs text-emerald-700 font-semibold">
                        {p.royaltyType === 'fixed_monthly'
                          ? `${formatIDR(p.royaltyValue)}/bln`
                          : `${p.royaltyValue}% Omzet`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span className="font-mono">{p.contractNumber}</span>
                      <span>·</span>
                      <span>
                        Kontrak: {p.contractStart} s.d. {p.contractEnd}
                      </span>
                      <span>·</span>
                      <span className="font-mono">Biaya Awal: {formatIDR(p.initialFee)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Kewajiban Royalty Bulanan
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {royalties.length === 0 ? (
                <p className="p-6 text-xs text-slate-500">
                  Klik "Hitung Royalty Bulan Ini" untuk menghasilkan tagihan otomatis.
                </p>
              ) : (
                royalties.map((r) => (
                  <div key={r.id} className="p-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {r.companyName} · <span className="font-mono">{r.periodMonth}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">
                        {r.outletName} · Omzet {formatIDR(r.grossSales)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                        {formatIDR(r.calculatedFee)}
                      </p>
                      {r.status === 'paid' ? (
                        <p className="text-[11px] font-medium text-emerald-700">Lunas</p>
                      ) : can('franchise.manage') ? (
                        <button
                          type="button"
                          onClick={() => markRoyaltyPaid(r.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 text-white text-[11px] font-medium hover:bg-emerald-800 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Tandai Lunas</span>
                        </button>
                      ) : (
                        <p className="text-[11px] font-medium text-amber-700">Belum Dibayar</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Outlet Modal */}
      {showNewOutlet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={createOutlet} className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Tambah Cabang / Outlet</h3>
              <button type="button" onClick={() => setShowNewOutlet(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Kode (KNH-MLG-01)" value={outletForm.code} onChange={(e) => setOutletForm({ ...outletForm, code: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
              <input required placeholder="Kota" value={outletForm.city} onChange={(e) => setOutletForm({ ...outletForm, city: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            </div>
            <input required placeholder="Nama Outlet" value={outletForm.name} onChange={(e) => setOutletForm({ ...outletForm, name: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            <input required placeholder="Alamat Lengkap" value={outletForm.address} onChange={(e) => setOutletForm({ ...outletForm, address: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            <input placeholder="Nama Manager Outlet" value={outletForm.managerName} onChange={(e) => setOutletForm({ ...outletForm, managerName: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={outletForm.isFranchise} onChange={(e) => setOutletForm({ ...outletForm, isFranchise: e.target.checked })} />
              <span>Outlet dikelola oleh Mitra Franchise</span>
            </label>
            <button type="submit" className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer">
              Simpan Outlet
            </button>
          </form>
        </div>
      )}

      {/* New Partner Modal */}
      {showNewPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={createPartner} className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Daftarkan Mitra Franchise</h3>
              <button type="button" onClick={() => setShowNewPartner(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <select value={partnerForm.outletId} onChange={(e) => setPartnerForm({ ...partnerForm, outletId: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs bg-white">
              <option value="">-- Pilih Outlet Terkait --</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <input required placeholder="Nama Pemilik Mitra" value={partnerForm.partnerName} onChange={(e) => setPartnerForm({ ...partnerForm, partnerName: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            <input required placeholder="Nama Badan Usaha (PT/CV)" value={partnerForm.companyName} onChange={(e) => setPartnerForm({ ...partnerForm, companyName: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            <input required placeholder="No. Kontrak (FRN-2026-003)" value={partnerForm.contractNumber} onChange={(e) => setPartnerForm({ ...partnerForm, contractNumber: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Email Mitra" value={partnerForm.contactEmail} onChange={(e) => setPartnerForm({ ...partnerForm, contactEmail: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
              <input placeholder="Telepon" value={partnerForm.contactPhone} onChange={(e) => setPartnerForm({ ...partnerForm, contactPhone: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select value={partnerForm.royaltyType} onChange={(e) => setPartnerForm({ ...partnerForm, royaltyType: e.target.value })} className="w-full min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white">
                <option value="percentage_gross">% Omzet Kotor</option>
                <option value="fixed_monthly">Tetap Bulanan (Rp)</option>
              </select>
              <input required type="number" placeholder="Nilai Royalty" value={partnerForm.royaltyValue} onChange={(e) => setPartnerForm({ ...partnerForm, royaltyValue: e.target.value })} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 font-mono text-xs" />
            </div>
            <button type="submit" className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer">
              Simpan Kontrak Mitra
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
