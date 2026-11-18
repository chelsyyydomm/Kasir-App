import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  CreditCard,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Split,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatDateTime, formatIDR, PAYMENT_METHOD_LABELS } from '../lib/format';

interface VariantOption {
  name: string;
  priceDelta: number;
}

interface ModifierOption {
  name: string;
  price: number;
}

interface ProductItem {
  id: number;
  categoryId: number | null;
  sku: string;
  name: string;
  description: string;
  effectivePrice: number;
  effectiveAvailable: boolean;
  variantsJson: string;
  modifiersJson: string;
  accentTone: string;
}

interface CategoryItem {
  id: number;
  name: string;
}

interface CartLine {
  key: string;
  productId: number;
  productName: string;
  basePrice: number;
  variantName: string;
  variantDelta: number;
  modifiers: ModifierOption[];
  quantity: number;
}

interface PaymentLegInput {
  id: string;
  method: string;
  channelMode: 'manual' | 'gateway';
  amount: number;
  cashTendered: number;
  referenceNumber: string;
}

interface ReceiptResult {
  deduplicated: boolean;
  sale: {
    id: number;
    receiptNumber: string;
    customerName: string;
    orderType: string;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    status: string;
    cashierName: string;
    createdAt: string;
  };
  items: Array<{
    id: number;
    productName: string;
    variantName: string;
    modifiersSummary: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  payments: Array<{
    id: number;
    method: string;
    channelMode: string;
    amount: number;
    cashTendered: number;
    changeAmount: number;
    referenceNumber: string;
    providerStatus: string;
  }>;
}

const PAYMENT_OPTIONS = [
  { id: 'cash', label: 'Tunai', supportsGateway: false },
  { id: 'qris', label: 'QRIS', supportsGateway: true },
  { id: 'ewallet_gopay', label: 'GoPay', supportsGateway: true },
  { id: 'ewallet_ovo', label: 'OVO', supportsGateway: true },
  { id: 'ewallet_dana', label: 'DANA', supportsGateway: true },
  { id: 'ewallet_shopeepay', label: 'ShopeePay', supportsGateway: true },
  { id: 'bank_transfer', label: 'Transfer Bank', supportsGateway: true },
  { id: 'card', label: 'Kartu Debit/Kredit', supportsGateway: false },
];

export const PosView: React.FC = () => {
  const { outlets, activeOutletId, business, apiFetch } = useAuth();
  const posOutletId = activeOutletId || outlets[0]?.id || null;
  const currentOutlet = outlets.find((o) => o.id === posOutletId);

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('Pelanggan Umum');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [discountAmount, setDiscountAmount] = useState(0);

  const [configProduct, setConfigProduct] = useState<ProductItem | null>(null);
  const [pickedVariant, setPickedVariant] = useState<VariantOption | null>(null);
  const [pickedModifiers, setPickedModifiers] = useState<ModifierOption[]>([]);

  const [showCheckout, setShowCheckout] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [paymentLegs, setPaymentLegs] = useState<PaymentLegInput[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [receipt, setReceipt] = useState<ReceiptResult | null>(null);
  const [copiedReceipt, setCopiedReceipt] = useState(false);
  const [verifyingPaymentId, setVerifyingPaymentId] = useState<number | null>(null);

  const loadMenu = useCallback(async () => {
    try {
      setLoading(true);
      const q = posOutletId ? `?outletId=${posOutletId}` : '';
      const res = await apiFetch<{ categories: CategoryItem[]; products: ProductItem[] }>(
        `/api/products${q}`
      );
      setCategories(res.categories);
      setProducts(res.products);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, posOutletId]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.effectiveAvailable) return false;
      if (selectedCat !== 'all' && p.categoryId !== selectedCat) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s);
      }
      return true;
    });
  }, [products, selectedCat, search]);

  const subtotal = useMemo(() => {
    return cart.reduce((acc, line) => {
      const modSum = line.modifiers.reduce((m, x) => m + x.price, 0);
      const unit = line.basePrice + line.variantDelta + modSum;
      return acc + unit * line.quantity;
    }, 0);
  }, [cart]);

  const safeDiscount = Math.max(0, Math.min(subtotal, discountAmount));
  const taxRate = business?.taxRate ?? 11;
  const taxAmount = Math.round(((subtotal - safeDiscount) * taxRate) / 100);
  const grandTotal = subtotal - safeDiscount + taxAmount;

  const openProductSelector = (p: ProductItem) => {
    const variants: VariantOption[] = JSON.parse(p.variantsJson || '[]');
    const mods: ModifierOption[] = JSON.parse(p.modifiersJson || '[]');
    if (variants.length <= 1 && mods.length === 0) {
      const v = variants[0] || { name: '', priceDelta: 0 };
      addToCart(p, v, []);
      return;
    }
    setConfigProduct(p);
    setPickedVariant(variants[0] || null);
    setPickedModifiers([]);
  };

  const addToCart = (
    p: ProductItem,
    variant: VariantOption | null,
    mods: ModifierOption[]
  ) => {
    const vName = variant?.name || '';
    const vDelta = variant?.priceDelta || 0;
    const modNames = mods.map((m) => m.name).sort().join('+');
    const key = `${p.id}::${vName}::${modNames}`;

    setCart((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          key,
          productId: p.id,
          productName: p.name,
          basePrice: p.effectivePrice,
          variantName: vName,
          variantDelta: vDelta,
          modifiers: mods,
          quantity: 1,
        },
      ];
    });
    setConfigProduct(null);
  };

  const updateQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((it) => (it.key === key ? { ...it, quantity: it.quantity + delta } : it))
        .filter((it) => it.quantity > 0)
    );
  };

  const openCheckoutModal = () => {
    if (cart.length === 0 || !posOutletId) return;
    setCheckoutError(null);
    setIsSplit(false);
    setIdempotencyKey(`pos-${posOutletId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    setPaymentLegs([
      {
        id: 'leg-1',
        method: 'cash',
        channelMode: 'manual',
        amount: grandTotal,
        cashTendered: grandTotal,
        referenceNumber: '',
      },
    ]);
    setShowCheckout(true);
  };

  const toggleSplitPayment = () => {
    if (!isSplit) {
      const half = Math.floor(grandTotal / 2);
      setIsSplit(true);
      setPaymentLegs([
        {
          id: 'leg-1',
          method: 'cash',
          channelMode: 'manual',
          amount: half,
          cashTendered: half,
          referenceNumber: '',
        },
        {
          id: 'leg-2',
          method: 'qris',
          channelMode: 'manual',
          amount: grandTotal - half,
          cashTendered: grandTotal - half,
          referenceNumber: '',
        },
      ]);
    } else {
      setIsSplit(false);
      setPaymentLegs([
        {
          id: 'leg-1',
          method: paymentLegs[0]?.method || 'cash',
          channelMode: paymentLegs[0]?.channelMode || 'manual',
          amount: grandTotal,
          cashTendered: grandTotal,
          referenceNumber: '',
        },
      ]);
    }
  };

  const updateLeg = (id: string, patch: Partial<PaymentLegInput>) => {
    setPaymentLegs((prev) =>
      prev.map((leg) => {
        if (leg.id !== id) return leg;
        const merged = { ...leg, ...patch };
        if (patch.method && patch.method === 'cash') {
          merged.channelMode = 'manual';
        }
        return merged;
      })
    );
  };

  const handleCheckoutSubmit = async () => {
    if (!posOutletId) return;
    setCheckoutError(null);
    const sum = paymentLegs.reduce((a, l) => a + Number(l.amount || 0), 0);
    if (Math.abs(sum - grandTotal) > 1) {
      setCheckoutError(
        `Total nominal split (${formatIDR(sum)}) harus sama dengan total tagihan (${formatIDR(grandTotal)}).`
      );
      return;
    }

    for (const leg of paymentLegs) {
      if (leg.method === 'cash' && Number(leg.cashTendered) < Number(leg.amount)) {
        setCheckoutError('Uang tunai yang diterima tidak boleh kurang dari nominal tagihan.');
        return;
      }
    }

    try {
      setSubmitting(true);
      const res = await apiFetch<ReceiptResult>('/api/pos/checkout', {
        method: 'POST',
        body: JSON.stringify({
          outletId: posOutletId,
          idempotencyKey,
          customerName,
          orderType,
          discountAmount: safeDiscount,
          items: cart.map((line) => ({
            productId: line.productId,
            variantName: line.variantName,
            variantDelta: line.variantDelta,
            modifiersSummary: line.modifiers.map((m) => m.name).join(', '),
            modifiersTotal: line.modifiers.reduce((s, m) => s + m.price, 0),
            quantity: line.quantity,
          })),
          payments: paymentLegs.map((l) => ({
            method: l.method,
            channelMode: l.channelMode,
            amount: Number(l.amount),
            cashTendered: Number(l.cashTendered),
            referenceNumber: l.referenceNumber,
          })),
        }),
      });

      setShowCheckout(false);
      setReceipt(res);
      setCart([]);
      setDiscountAmount(0);
      setCustomerName('Pelanggan Umum');
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : 'Checkout gagal diproses.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyGatewayInReceipt = async (paymentId: number, outcome: 'success' | 'failed') => {
    try {
      setVerifyingPaymentId(paymentId);
      await apiFetch(`/api/payments/${paymentId}/verify-gateway`, {
        method: 'POST',
        body: JSON.stringify({ outcome }),
      });
      if (receipt) {
        setReceipt({
          ...receipt,
          sale: { ...receipt.sale, status: outcome === 'success' ? 'paid' : 'failed' },
          payments: receipt.payments.map((p) =>
            p.id === paymentId ? { ...p, providerStatus: outcome } : p
          ),
        });
      }
    } finally {
      setVerifyingPaymentId(null);
    }
  };

  const copyReceiptText = () => {
    if (!receipt) return;
    const lines = [
      `STRUK DIGITAL - ${business?.name || 'KulinaHub'}`,
      `Outlet: ${currentOutlet?.name || ''}`,
      `No: ${receipt.sale.receiptNumber}`,
      `Waktu: ${formatDateTime(receipt.sale.createdAt)}`,
      `Pelanggan: ${receipt.sale.customerName}`,
      '--------------------------------',
      ...receipt.items.map(
        (it) =>
          `${it.quantity}x ${it.productName}${it.variantName ? ` (${it.variantName})` : ''} - ${formatIDR(it.lineTotal)}`
      ),
      '--------------------------------',
      `Subtotal: ${formatIDR(receipt.sale.subtotal)}`,
      receipt.sale.discountAmount > 0 ? `Diskon: -${formatIDR(receipt.sale.discountAmount)}` : '',
      `PPN (${taxRate}%): ${formatIDR(receipt.sale.taxAmount)}`,
      `TOTAL: ${formatIDR(receipt.sale.totalAmount)}`,
      `Status: ${receipt.sale.status === 'paid' ? 'LUNAS' : 'MENUNGGU PEMBAYARAN'}`,
    ]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard.writeText(lines);
    setCopiedReceipt(true);
    setTimeout(() => setCopiedReceipt(false), 2000);
  };

  const totalItemsCount = cart.reduce((a, b) => a + b.quantity, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            Point of Sale (POS) · {currentOutlet?.name || 'Pilih Outlet'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pilih menu, atur variasi/modifier, dan proses pembayaran tunai, non-tunai, atau split payment.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Menu Catalog */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama menu atau SKU..."
                className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Category filter tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedCat('all')}
              className={`px-3.5 min-h-[40px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCat === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Semua Menu
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCat(cat.id)}
                className={`px-3.5 min-h-[40px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCat === cat.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Menu Grid */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-36 rounded-xl border border-slate-200 bg-white animate-pulse p-4" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Tidak ada menu tersedia untuk filter yang dipilih.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openProductSelector(p)}
                  className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-emerald-600 transition-colors flex flex-col justify-between min-h-[136px] cursor-pointer active:scale-[0.99]"
                >
                  <div>
                    <p className="font-mono text-[11px] text-slate-400">{p.sku}</p>
                    <h3 className="mt-1 font-display text-sm font-semibold text-slate-900 line-clamp-2">
                      {p.name}
                    </h3>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                      {formatIDR(p.effectivePrice)}
                    </span>
                    <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                      <Plus className="w-4 h-4" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Order Cart */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 lg:sticky lg:top-20">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-slate-700" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Pesanan ({totalItemsCount})
              </h2>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs text-red-600 hover:underline cursor-pointer"
              >
                Kosongkan
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nama Pelanggan"
              className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-900"
            />
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as 'dine_in' | 'takeaway' | 'delivery')}
              className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-900 bg-white"
            >
              <option value="dine_in">Makan di Tempat</option>
              <option value="takeaway">Bawa Pulang</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>

          <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
            {cart.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">
                Ketuk kartu menu di samping untuk menambah pesanan.
              </p>
            ) : (
              cart.map((line) => {
                const modSum = line.modifiers.reduce((s, m) => s + m.price, 0);
                const unitPrice = line.basePrice + line.variantDelta + modSum;
                return (
                  <div key={line.key} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {line.productName}
                      </p>
                      {(line.variantName || line.modifiers.length > 0) && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {[line.variantName, ...line.modifiers.map((m) => m.name)]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                      <p className="font-mono text-xs text-slate-600 mt-1 tabular-nums">
                        {formatIDR(unitPrice * line.quantity)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQty(line.key, -1)}
                        className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        {line.quantity === 1 ? <Trash2 className="w-3.5 h-3.5 text-red-600" /> : <Minus className="w-3.5 h-3.5" />}
                      </button>
                      <span className="w-7 text-center font-mono text-xs font-semibold tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(line.key, 1)}
                        className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Totals */}
          <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatIDR(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 gap-2">
              <span>Diskon (Rp)</span>
              <input
                type="number"
                min={0}
                max={subtotal}
                value={discountAmount || ''}
                onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0"
                className="w-28 text-right font-mono px-2 py-1 rounded border border-slate-200 text-slate-900 tabular-nums"
              />
            </div>
            <div className="flex justify-between text-slate-600">
              <span>PPN ({taxRate}%)</span>
              <span className="font-mono tabular-nums">{formatIDR(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-100">
              <span>Total Tagihan</span>
              <span className="font-mono text-base text-emerald-700 tabular-nums">
                {formatIDR(grandTotal)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={cart.length === 0 || !posOutletId}
            onClick={openCheckoutModal}
            className="w-full min-h-[48px] rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            <span>Proses Pembayaran</span>
          </button>
        </div>
      </div>

      {/* Variant & Modifier Selection Modal */}
      {configProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">{configProduct.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{configProduct.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setConfigProduct(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const variants: VariantOption[] = JSON.parse(configProduct.variantsJson || '[]');
              const mods: ModifierOption[] = JSON.parse(configProduct.modifiersJson || '[]');
              return (
                <>
                  {variants.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-2">Pilih Varian</p>
                      <div className="grid grid-cols-2 gap-2">
                        {variants.map((v) => {
                          const active = pickedVariant?.name === v.name;
                          return (
                            <button
                              key={v.name}
                              type="button"
                              onClick={() => setPickedVariant(v)}
                              className={`min-h-[44px] px-3 py-2 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                                active
                                  ? 'border-emerald-700 bg-emerald-50 text-emerald-900 font-semibold'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div>{v.name}</div>
                              <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                                {v.priceDelta > 0 ? `+${formatIDR(v.priceDelta)}` : 'Harga standar'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {mods.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-2">Tambahan (Modifier)</p>
                      <div className="space-y-2">
                        {mods.map((m) => {
                          const checked = pickedModifiers.some((x) => x.name === m.name);
                          return (
                            <button
                              key={m.name}
                              type="button"
                              onClick={() =>
                                setPickedModifiers((prev) =>
                                  checked ? prev.filter((x) => x.name !== m.name) : [...prev, m]
                                )
                              }
                              className={`w-full min-h-[44px] px-3 py-2 rounded-lg border flex items-center justify-between text-xs cursor-pointer ${
                                checked
                                  ? 'border-emerald-700 bg-emerald-50 text-emerald-900 font-medium'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span>{m.name}</span>
                              <span className="font-mono tabular-nums">
                                {m.price > 0 ? `+${formatIDR(m.price)}` : 'Gratis'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            <button
              type="button"
              onClick={() => addToCart(configProduct, pickedVariant, pickedModifiers)}
              className="w-full min-h-[48px] rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer"
            >
              Tambahkan ke Pesanan
            </button>
          </div>
        </div>
      )}

      {/* Checkout & Split Payment Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">Checkout Pembayaran</h3>
                <p className="text-xs text-slate-500">
                  Total Tagihan: <strong className="font-mono text-slate-900">{formatIDR(grandTotal)}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSplitPayment}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border text-xs font-medium cursor-pointer ${
                    isSplit
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Split className="w-3.5 h-3.5" />
                  <span>{isSplit ? 'Split Aktif' : 'Split Payment'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCheckout(false)}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {checkoutError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {checkoutError}
              </div>
            )}

            <div className="space-y-4">
              {paymentLegs.map((leg, idx) => {
                const methodDef = PAYMENT_OPTIONS.find((m) => m.id === leg.method);
                const change =
                  leg.method === 'cash' ? Math.max(0, leg.cashTendered - leg.amount) : 0;

                return (
                  <div key={leg.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800">
                        {isSplit ? `Pembayaran #${idx + 1}` : 'Metode Pembayaran'}
                      </span>
                      {methodDef?.supportsGateway && (
                        <div className="inline-flex p-0.5 bg-slate-100 rounded-md text-[11px]">
                          <button
                            type="button"
                            onClick={() => updateLeg(leg.id, { channelMode: 'manual' })}
                            className={`px-2.5 py-1 rounded cursor-pointer ${
                              leg.channelMode === 'manual' ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'
                            }`}
                          >
                            Manual Kasir
                          </button>
                          <button
                            type="button"
                            onClick={() => updateLeg(leg.id, { channelMode: 'gateway' })}
                            className={`px-2.5 py-1 rounded cursor-pointer ${
                              leg.channelMode === 'gateway' ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'
                            }`}
                          >
                            Payment Gateway
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {PAYMENT_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => updateLeg(leg.id, { method: opt.id })}
                          className={`min-h-[40px] px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                            leg.method === opt.id
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {isSplit && (
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Nominal Bagian Ini (Rp)</label>
                        <input
                          type="number"
                          value={leg.amount}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            updateLeg(leg.id, {
                              amount: val,
                              cashTendered: leg.method === 'cash' ? Math.max(val, leg.cashTendered) : val,
                            });
                          }}
                          className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 font-mono text-sm tabular-nums"
                        />
                      </div>
                    )}

                    {leg.method === 'cash' ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs text-slate-600">Uang Diterima</label>
                          <input
                            type="number"
                            value={leg.cashTendered}
                            onChange={(e) =>
                              updateLeg(leg.id, { cashTendered: Math.max(0, Number(e.target.value) || 0) })
                            }
                            className="w-40 min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 font-mono text-sm text-right tabular-nums"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[leg.amount, 50000, 100000, 150000, 200000]
                            .filter((v, i, arr) => v >= leg.amount && arr.indexOf(v) === i)
                            .slice(0, 4)
                            .map((amt) => (
                              <button
                                key={amt}
                                type="button"
                                onClick={() => updateLeg(leg.id, { cashTendered: amt })}
                                className="px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 font-mono text-[11px] hover:bg-slate-100 cursor-pointer"
                              >
                                {amt === leg.amount ? 'Uang Pas' : formatIDR(amt)}
                              </button>
                            ))}
                        </div>
                        <div className="flex justify-between text-xs pt-1">
                          <span className="text-slate-500">Kembalian</span>
                          <span className="font-mono font-bold text-emerald-700 tabular-nums">
                            {formatIDR(change)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          {leg.channelMode === 'gateway'
                            ? 'Catatan / ID Referensi Gateway (otomatis dibuat jika kosong)'
                            : 'Nomor Referensi Pembayaran Non-Tunai'}
                        </label>
                        <input
                          type="text"
                          value={leg.referenceNumber}
                          onChange={(e) => updateLeg(leg.id, { referenceNumber: e.target.value })}
                          placeholder="Contoh: QRIS-882910 atau No. Approval EDC"
                          className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                        />
                        {leg.channelMode === 'gateway' && (
                          <p className="mt-1.5 text-[11px] text-amber-700">
                            Mode Payment Gateway akan mencatat transaksi sebagai Menunggu Pembayaran hingga terverifikasi backend.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleCheckoutSubmit}
              className="w-full min-h-[48px] rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Memproses Transaksi...' : `Konfirmasi & Terbitkan Struk (${formatIDR(grandTotal)})`}
            </button>
          </div>
        </div>
      )}

      {/* Digital Receipt Modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between no-print">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="font-display text-base font-bold text-slate-900">
                  {receipt.sale.status === 'paid' ? 'Transaksi Lunas & Struk Digital' : 'Menunggu Verifikasi Gateway'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
              <div className="text-center border-b border-slate-100 pb-3">
                <p className="font-display text-sm font-bold text-slate-900">{business?.name}</p>
                <p className="text-slate-500">{currentOutlet?.name}</p>
                <p className="font-mono text-[11px] text-slate-500 mt-1">{receipt.sale.receiptNumber}</p>
                <p className="text-[11px] text-slate-400">{formatDateTime(receipt.sale.createdAt)}</p>
              </div>

              <div className="space-y-1.5">
                {receipt.items.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2">
                    <div>
                      <span className="font-medium text-slate-900">
                        {it.quantity}x {it.productName}
                      </span>
                      {it.variantName && <span className="text-slate-500"> ({it.variantName})</span>}
                      {it.modifiersSummary && (
                        <div className="text-[11px] text-slate-400">+ {it.modifiersSummary}</div>
                      )}
                    </div>
                    <span className="font-mono tabular-nums text-slate-800 shrink-0">
                      {formatIDR(it.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-2 space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatIDR(receipt.sale.subtotal)}</span>
                </div>
                {receipt.sale.discountAmount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Diskon</span>
                    <span className="font-mono tabular-nums">-{formatIDR(receipt.sale.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>PPN</span>
                  <span className="font-mono tabular-nums">{formatIDR(receipt.sale.taxAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-slate-900 pt-1">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">{formatIDR(receipt.sale.totalAmount)}</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-2 space-y-2">
                {receipt.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-slate-800">
                        {PAYMENT_METHOD_LABELS[p.method] || p.method}
                      </span>
                      <span className="text-slate-400"> · {p.referenceNumber}</span>
                      {p.changeAmount > 0 && (
                        <div className="text-[11px] text-emerald-700 font-mono">
                          Tunai {formatIDR(p.cashTendered)} · Kembali {formatIDR(p.changeAmount)}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-mono tabular-nums">{formatIDR(p.amount)}</span>
                      <div
                        className={`text-[11px] font-medium ${
                          p.providerStatus === 'success' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {p.providerStatus === 'success' ? 'Terverifikasi' : 'Menunggu Gateway'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* If gateway payment is pending, allow backend webhook verification test */}
            {receipt.payments.some((p) => p.providerStatus === 'pending') && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 no-print">
                <p className="text-xs text-amber-900 font-medium">
                  Transaksi belum lunas karena menunggu konfirmasi webhook payment gateway.
                </p>
                <div className="flex gap-2">
                  {receipt.payments
                    .filter((p) => p.providerStatus === 'pending')
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={verifyingPaymentId === p.id}
                        onClick={() => handleVerifyGatewayInReceipt(p.id, 'success')}
                        className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 cursor-pointer"
                      >
                        {verifyingPaymentId === p.id ? 'Memverifikasi...' : 'Simulasikan Callback Berhasil'}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 no-print">
              <button
                type="button"
                onClick={copyReceiptText}
                className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>{copiedReceipt ? 'Tersalin' : 'Salin Struk'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[44px] px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Struk</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
