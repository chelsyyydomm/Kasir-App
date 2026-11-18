export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Tunai (Cash)',
  qris: 'QRIS',
  bank_transfer: 'Transfer Bank',
  ewallet_dana: 'DANA',
  ewallet_gopay: 'GoPay',
  ewallet_ovo: 'OVO',
  ewallet_shopeepay: 'ShopeePay',
  card: 'Kartu Debit / Kredit',
};

export const SALE_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  paid: { label: 'Lunas', tone: 'text-emerald-700' },
  pending_payment: { label: 'Menunggu Bayar', tone: 'text-amber-700' },
  failed: { label: 'Gagal', tone: 'text-red-700' },
  voided: { label: 'Dibatalkan', tone: 'text-slate-600' },
  refunded: { label: 'Refund', tone: 'text-red-700' },
};

export const PAYMENT_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  success: { label: 'Berhasil', tone: 'text-emerald-700' },
  pending: { label: 'Menunggu', tone: 'text-amber-700' },
  failed: { label: 'Gagal', tone: 'text-red-700' },
  cancelled: { label: 'Dibatalkan', tone: 'text-slate-600' },
  refunded: { label: 'Refund', tone: 'text-red-700' },
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  rent: 'Sewa Tempat',
  utilities: 'Listrik, Air & Internet',
  payroll: 'Gaji & Tunjangan',
  marketing: 'Pemasaran & Promo',
  maintenance: 'Perawatan Alat',
  other: 'Operasional Lainnya',
};

export function downloadCSV(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join(
    '\n'
  );
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
