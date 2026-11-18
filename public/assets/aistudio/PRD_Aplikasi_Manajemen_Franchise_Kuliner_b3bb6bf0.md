# Product Requirements Document (PRD)

## Aplikasi Manajemen Franchise & Kuliner

**Status:** Draft awal --- menunggu konfirmasi kebutuhan dan pilihan
teknologi\
**Nama aplikasi:** Belum ditentukan\
**Platform target:** Desktop, Android, dan tablet

------------------------------------------------------------------------

## 1. Ringkasan Produk

Aplikasi ini dirancang sebagai sistem manajemen bisnis kuliner dan
franchise yang terintegrasi. Sistem membantu pemilik usaha dan tim
operasional mengelola outlet, penjualan, pembayaran, produk, stok,
pembelian, karyawan, serta laporan bisnis dari satu aplikasi.

Aplikasi ditargetkan dapat digunakan melalui browser desktop dan
Android. Pendekatan awal yang disarankan adalah aplikasi web
responsif/PWA agar satu basis aplikasi dapat digunakan di berbagai
ukuran layar.

## 2. Tujuan Produk

-   Memusatkan pengelolaan bisnis dan banyak outlet.
-   Mempermudah proses transaksi penjualan dan pembayaran.
-   Memantau stok, pembelian, serta kebutuhan bahan baku.
-   Menyediakan laporan penjualan dan keuangan.
-   Mendukung pengelolaan mitra franchise.
-   Menyediakan data yang aman berdasarkan peran dan outlet pengguna.

## 3. Target Pengguna

Peran pengguna yang direncanakan: - Owner/pemilik usaha - Admin pusat
(Head Office) - Manager outlet - Kasir - Staf dapur - Staf
gudang/inventory - Mitra franchise - Pelanggan (opsional, jika fitur
pemesanan pelanggan diaktifkan)

Hak akses setiap peran perlu ditetapkan dalam matriks Role-Based Access
Control (RBAC).

## 4. Modul dan Fitur Fungsional

### 4.1 Dashboard

-   Ringkasan penjualan harian, mingguan, dan bulanan.
-   Ringkasan transaksi dan metode pembayaran.
-   Ringkasan stok menipis.
-   Perbandingan performa antar-outlet.
-   Ringkasan pendapatan dan pengeluaran sesuai hak akses.

### 4.2 Manajemen Outlet

-   Membuat dan mengubah data outlet.
-   Menentukan manager dan staf outlet.
-   Melihat performa masing-masing outlet.
-   Mengatur status outlet aktif/nonaktif.

### 4.3 Point of Sale (POS) / Kasir

-   Memilih produk dan variasi.
-   Mengatur jumlah pesanan.
-   Menghitung subtotal, pajak, diskon, dan total.
-   Mencatat transaksi.
-   Mencetak atau membagikan struk digital.
-   Membatalkan transaksi dengan izin khusus dan menyimpan alasan
    pembatalan.

### 4.4 Manajemen Pembayaran (Payment Management)

Modul pembayaran menjadi bagian utama aplikasi dan terhubung dengan POS,
transaksi, laporan, serta rekonsiliasi.

**Metode pembayaran yang direncanakan:** - Tunai (cash). - QRIS. -
Transfer bank. - E-wallet, misalnya DANA, GoPay, OVO, dan ShopeePay. -
Kartu debit/kredit.

**Fitur pembayaran:** - Memilih metode pembayaran saat checkout. -
Mendukung pembayaran penuh dan, jika dibutuhkan, pembayaran gabungan
(split payment). - Mencatat nominal yang dibayar dan kembalian untuk
transaksi tunai. - Menyimpan nomor referensi pembayaran untuk metode
non-tunai. - Menampilkan status pembayaran: menunggu/pending, berhasil,
gagal, dibatalkan, dan refund. - Menyimpan waktu pembayaran, kasir,
outlet, metode, dan referensi transaksi. - Menampilkan riwayat
pembayaran dan detail setiap pembayaran. - Membuat bukti
pembayaran/struk digital. - Menyediakan rekap pembayaran berdasarkan
tanggal, outlet, kasir, dan metode. - Mendukung proses refund atau
pembatalan dengan otorisasi dan jejak audit. - Menyediakan rekonsiliasi
transaksi non-tunai dengan laporan penyedia pembayaran.

**Pilihan implementasi yang masih perlu dikonfirmasi:** 1. **Manual:**
kasir memilih metode pembayaran dan mengonfirmasi pembayaran setelah
menerima pembayaran. 2. **Payment gateway:** pembayaran online diproses
melalui penyedia payment gateway dan statusnya diperbarui melalui
integrasi. 3. **Gabungan:** mendukung pembayaran manual dan payment
gateway.

Integrasi payment gateway memerlukan pemilihan penyedia, proses
onboarding merchant, kredensial API, pengujian sandbox, serta
pemeriksaan biaya dan metode pembayaran yang didukung. Jangan menyimpan
nomor kartu lengkap, CVV, PIN, atau kredensial sensitif pelanggan di
database aplikasi.

### 4.5 Manajemen Produk dan Menu

-   CRUD produk, kategori, varian, dan modifier.
-   Harga jual per outlet bila diperlukan.
-   Status ketersediaan produk.
-   Foto dan deskripsi produk.

### 4.6 Manajemen Stok dan Bahan Baku

-   Stok bahan baku per outlet/gudang.
-   Satuan dan konversi satuan.
-   Stok masuk, stok keluar, penyesuaian, dan transfer.
-   Peringatan stok minimum.
-   Riwayat pergerakan stok.

### 4.7 Resep dan HPP

-   Menghubungkan produk menu dengan bahan baku.
-   Menentukan kuantitas bahan untuk setiap resep.
-   Menghitung estimasi harga pokok penjualan (HPP).
-   Mengestimasi dampak transaksi terhadap stok.

### 4.8 Supplier dan Pembelian

-   Data supplier.
-   Purchase order.
-   Penerimaan barang.
-   Riwayat pembelian dan biaya.

### 4.9 Karyawan

-   Data karyawan dan penempatan outlet.
-   Peran dan hak akses.
-   Jadwal kerja (opsional).
-   Riwayat aktivitas pengguna.

### 4.10 Laporan

-   Penjualan per periode, outlet, produk, dan kasir.
-   Ringkasan metode pembayaran.
-   Pengeluaran operasional.
-   Estimasi laba rugi berdasarkan data biaya yang tersedia.
-   Laporan stok dan pembelian.
-   Ekspor laporan ke CSV/PDF (perlu ditentukan).

### 4.11 Manajemen Franchise

-   Data mitra dan kontrak franchise.
-   Hubungan mitra dengan outlet.
-   Pengaturan biaya awal dan royalty fee.
-   Perhitungan kewajiban berdasarkan aturan kontrak.
-   Laporan performa mitra dan outlet.

### 4.12 AI Business Assistant (opsional)

-   Ringkasan performa bisnis berdasarkan data aplikasi.
-   Tanya jawab tentang tren penjualan dan stok.
-   Rekomendasi operasional berbasis data.
-   AI hanya boleh mengakses data sesuai izin pengguna dan tidak boleh
    melakukan transaksi finansial tanpa konfirmasi manusia.

## 5. Kebutuhan Non-Fungsional

-   **Responsif:** mendukung desktop, tablet, dan layar Android.
-   **Keamanan:** autentikasi, RBAC, validasi input, dan aturan akses
    database.
-   **Privasi:** data satu bisnis/outlet tidak boleh terbuka kepada
    pihak yang tidak berwenang.
-   **Audit:** perubahan penting, refund, pembatalan, dan penyesuaian
    stok harus tercatat.
-   **Keandalan:** penanganan kegagalan jaringan dan pencegahan
    transaksi ganda.
-   **Performa:** halaman utama dan transaksi harus tetap responsif pada
    penggunaan normal.
-   **Backup:** kebijakan pencadangan dan pemulihan data perlu
    ditetapkan.

## 6. Rekomendasi Teknologi Awal

Pilihan berikut adalah rekomendasi awal, belum keputusan final: -
Frontend: React + TypeScript. - UI: Tailwind CSS atau komponen UI yang
konsisten. - Backend: Node.js dengan API terstruktur. - Database:
PostgreSQL untuk relasi transaksi, stok, pembayaran, dan multi-outlet;
Firebase dapat dipertimbangkan untuk autentikasi atau kebutuhan
real-time. - Authentication: Firebase Authentication atau penyedia
autentikasi setara. - AI: Gemini API untuk fitur asisten bisnis. -
Hosting: Google Cloud Run atau layanan hosting yang sesuai. - PWA: agar
aplikasi web dapat dipasang dan digunakan pada perangkat Android. -
Version control: GitHub.

Pemilihan final harus mempertimbangkan kemampuan tim, biaya, kebutuhan
offline, skala outlet, serta dukungan integrasi pembayaran.

## 7. Rancangan Arsitektur

Arsitektur awal yang disarankan:

1.  Client web/PWA untuk desktop, Android, dan tablet.
2.  Backend API untuk aturan bisnis dan validasi transaksi.
3.  Database relasional sebagai sumber data utama.
4.  Layanan autentikasi dan otorisasi.
5.  Integrasi payment gateway melalui backend.
6.  Integrasi Gemini API untuk fitur AI opsional.

**Catatan penting:** status pembayaran dari payment gateway harus
diverifikasi di backend melalui mekanisme resmi penyedia (misalnya
webhook bertanda tangan), bukan hanya berdasarkan informasi dari
browser/aplikasi kasir.

## 8. Rancangan ERD Awal

Entitas utama yang disarankan:

-   `businesses` --- data badan/usaha pemilik sistem.
-   `users` --- akun pengguna.
-   `roles` --- definisi peran.
-   `user_business_roles` --- relasi pengguna, bisnis, dan peran.
-   `outlets` --- cabang/outlet.
-   `user_outlet_access` --- akses pengguna ke outlet.
-   `franchise_partners` --- data mitra franchise.
-   `products` --- produk/menu.
-   `product_categories` --- kategori produk.
-   `outlet_products` --- harga dan ketersediaan produk per outlet.
-   `ingredients` --- bahan baku.
-   `recipes` --- resep produk.
-   `recipe_items` --- bahan dan kuantitas dalam resep.
-   `inventory_locations` --- lokasi stok/gudang.
-   `inventory_balances` --- saldo stok.
-   `stock_movements` --- pergerakan stok.
-   `suppliers` --- pemasok.
-   `purchase_orders` --- pesanan pembelian.
-   `purchase_order_items` --- detail barang pembelian.
-   `sales` --- transaksi penjualan.
-   `sale_items` --- detail produk dalam transaksi.
-   `payments` --- catatan pembayaran untuk transaksi.
-   `payment_methods` --- metode pembayaran.
-   `payment_provider_transactions` --- referensi transaksi dari
    penyedia pembayaran.
-   `refunds` --- catatan pengembalian dana.
-   `expenses` --- pengeluaran operasional.
-   `audit_logs` --- jejak aktivitas penting.

**Relasi utama:** - Satu `business` memiliki banyak `outlets` dan
`users`. - Satu `user` dapat memiliki beberapa peran dan akses outlet. -
Satu `outlet` memiliki banyak `sales`. - Satu `sale` memiliki banyak
`sale_items` dan satu atau lebih `payments`. - Satu `payment` terkait
dengan satu `payment_method`; pembayaran gateway dapat memiliki
referensi penyedia. - Satu `sale` dapat memiliki catatan `refunds`. -
Satu `product` dapat memiliki banyak `recipe_items`. - Pergerakan stok
dicatat dalam `stock_movements` dan memengaruhi saldo stok. - Satu
`franchise_partner` dapat terkait dengan satu atau lebih outlet.

ERD final perlu menentukan primary key, foreign key, indeks, aturan
penghapusan data, kolom audit, serta strategi pemisahan data
antar-bisnis.

## 9. Alur Pembayaran

1.  Kasir memilih produk dan menyelesaikan pesanan.
2.  Sistem menghitung total transaksi.
3.  Kasir memilih metode pembayaran.
4.  Untuk pembayaran tunai, kasir memasukkan nominal diterima dan sistem
    menghitung kembalian.
5.  Untuk pembayaran non-tunai manual, kasir mencatat referensi dan
    mengonfirmasi sesuai prosedur operasional.
6.  Untuk payment gateway, backend membuat permintaan pembayaran ke
    penyedia.
7.  Sistem menunggu konfirmasi pembayaran yang tervalidasi.
8.  Setelah pembayaran berhasil, transaksi ditandai lunas dan struk
    diterbitkan.
9.  Jika gagal atau kedaluwarsa, status transaksi diperbarui tanpa
    membuat pembayaran sukses palsu.
10. Refund dan pembatalan harus melalui izin yang sesuai serta tercatat
    di audit log.

## 10. Acceptance Criteria Awal

-   Pengguna hanya dapat melihat outlet dan data sesuai hak aksesnya.
-   Transaksi POS menyimpan item, harga, diskon, pajak, dan total secara
    konsisten.
-   Transaksi tidak boleh tercatat lunas sebelum pembayaran
    terverifikasi.
-   Pembayaran tunai menghitung kembalian dengan benar.
-   Sistem dapat menampilkan riwayat dan rekap pembayaran per outlet dan
    periode.
-   Refund memerlukan otorisasi dan meninggalkan jejak audit.
-   Kegagalan jaringan tidak boleh menyebabkan transaksi atau pembayaran
    tercatat ganda.
-   Tampilan dan fungsi utama dapat digunakan pada desktop dan Android.

## 11. Pertanyaan yang Masih Harus Diputuskan

1.  Nama aplikasi dan identitas brand.
2.  Fokus utama: manajemen franchise, kuliner, POS, atau sistem lengkap.
3.  Jumlah outlet yang ditargetkan.
4.  Peran pengguna yang benar-benar diperlukan.
5.  Fitur prioritas untuk versi pertama (MVP).
6.  Teknologi database dan backend final.
7.  Gaya visual UI/UX.
8.  Dukungan offline: penuh, sebagian, atau selalu online.
9.  Apakah pelanggan dapat memesan langsung.
10. Pembayaran manual, payment gateway, atau gabungan.
11. Penyedia payment gateway yang akan digunakan.
12. Pajak, service charge, diskon, dan aturan refund.
13. Kebutuhan cetak struk dan perangkat printer.
14. Kebutuhan ekspor laporan dan integrasi akuntansi.

## 12. Roadmap Pengembangan Awal

-   **Tahap 1 --- Discovery:** konfirmasi kebutuhan, role, alur bisnis,
    dan MVP.
-   **Tahap 2 --- Fondasi:** autentikasi, multi-business, outlet,
    database, dan hak akses.
-   **Tahap 3 --- Operasional:** produk, POS, pembayaran dasar, stok,
    dan pembelian.
-   **Tahap 4 --- Laporan:** dashboard, laporan penjualan, pembayaran,
    dan biaya.
-   **Tahap 5 --- Franchise:** mitra, royalty fee, dan laporan jaringan
    outlet.
-   **Tahap 6 --- Integrasi:** payment gateway, AI assistant, dan fitur
    tambahan.
-   **Tahap 7 --- QA & rilis:** pengujian keamanan, perangkat, performa,
    backup, dan deployment.

Roadmap dan urutan tahap dapat berubah setelah kebutuhan bisnis
dikonfirmasi.

------------------------------------------------------------------------

**Catatan:** Dokumen ini merupakan draft PRD awal. Fitur pembayaran
sudah dimasukkan, tetapi metode implementasi dan penyedia payment
gateway masih menunggu keputusan. Detail skema database, API, dan desain
layar perlu difinalisasi setelah pertanyaan pada Bagian 11 dijawab.
