import { count } from 'drizzle-orm';
import { db } from './index.ts';
import {
  businesses,
  outlets,
  franchisePartners,
  royaltyObligations,
  productCategories,
  products,
  ingredients,
  inventoryBalances,
  stockMovements,
  recipes,
  recipeItems,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  sales,
  saleItems,
  payments,
  expenses,
  users,
  auditLogs,
} from './schema.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeedData(actorUid: string, actorEmail: string) {
  if (seedPromise) {
    await seedPromise;
    return;
  }

  seedPromise = (async () => {
    try {
      const [{ total }] = await db.select({ total: count() }).from(businesses);
      if (total > 0) return;

      const [biz] = await db
        .insert(businesses)
        .values({
          name: 'Kopi & Kuliner Nusantara',
          legalName: 'PT Kulina Nusantara Sejahtera',
          taxRate: 11,
          serviceChargeRate: 0,
          currency: 'IDR',
        })
        .returning();

      const insertedOutlets = await db
        .insert(outlets)
        .values([
          {
            businessId: biz.id,
            code: 'KNH-JKT-01',
            name: 'Kemang Flagship Jakarta',
            address: 'Jl. Kemang Raya No. 48, Jakarta Selatan',
            city: 'Jakarta Selatan',
            phone: '021-7192831',
            managerName: 'Raka Pratama',
            status: 'active',
            isFranchise: false,
          },
          {
            businessId: biz.id,
            code: 'KNH-BDG-01',
            name: 'Dago Heritage Bandung',
            address: 'Jl. Ir. H. Juanda No. 112, Bandung',
            city: 'Bandung',
            phone: '022-2501928',
            managerName: 'Nadia Kusuma',
            status: 'active',
            isFranchise: true,
          },
          {
            businessId: biz.id,
            code: 'KNH-SBY-01',
            name: 'Citraland Express Surabaya',
            address: 'Ruko G-Walk Blok B2/14, Surabaya Barat',
            city: 'Surabaya',
            phone: '031-5741102',
            managerName: 'Bima Wijaya',
            status: 'active',
            isFranchise: true,
          },
        ])
        .returning();

      const [jkt, bdg, sby] = insertedOutlets;

      // Seed representative staff users (non-blocking demo records)
      await db
        .insert(users)
        .values([
          {
            uid: 'seed_mgr_jkt',
            email: 'raka.pratama@kulinahub.id',
            fullName: 'Raka Pratama',
            phone: '0812-8801-1101',
            role: 'outlet_manager',
            assignedOutletId: jkt.id,
            isActive: true,
          },
          {
            uid: 'seed_kasir_jkt',
            email: 'sinta.dewi@kulinahub.id',
            fullName: 'Sinta Dewi',
            phone: '0813-8801-2202',
            role: 'cashier',
            assignedOutletId: jkt.id,
            isActive: true,
          },
          {
            uid: 'seed_gudang_pusat',
            email: 'dimas.warehouse@kulinahub.id',
            fullName: 'Dimas Saputra',
            phone: '0815-7701-3303',
            role: 'warehouse',
            assignedOutletId: jkt.id,
            isActive: true,
          },
          {
            uid: 'seed_mitra_bdg',
            email: 'mitra.dago@bandungkuliner.co.id',
            fullName: 'Hendra Gunawan',
            phone: '0811-2200-4404',
            role: 'franchise_partner',
            assignedOutletId: bdg.id,
            isActive: true,
          },
        ])
        .onConflictDoNothing();

      // Franchise Partners
      const insertedPartners = await db
        .insert(franchisePartners)
        .values([
          {
            businessId: biz.id,
            outletId: bdg.id,
            partnerName: 'Hendra Gunawan',
            companyName: 'CV Priangan Rasa Mandiri',
            contactEmail: 'mitra.dago@bandungkuliner.co.id',
            contactPhone: '0811-2200-4404',
            contractNumber: 'FRN-2025-BDG-001',
            contractStart: '2025-01-15',
            contractEnd: '2030-01-14',
            initialFee: 150000000,
            royaltyType: 'percentage_gross',
            royaltyValue: 6,
            status: 'active',
          },
          {
            businessId: biz.id,
            outletId: sby.id,
            partnerName: 'Evelyn Tanoto',
            companyName: 'PT Jawa Timur Kuliner Abadi',
            contactEmail: 'finance@jatimkuliner.id',
            contactPhone: '0812-3399-8877',
            contractNumber: 'FRN-2025-SBY-002',
            contractStart: '2025-06-01',
            contractEnd: '2030-05-31',
            initialFee: 125000000,
            royaltyType: 'percentage_gross',
            royaltyValue: 5,
            status: 'active',
          },
        ])
        .returning();

      // Product Categories
      const cats = await db
        .insert(productCategories)
        .values([
          { businessId: biz.id, name: 'Kopi & Espresso', sortOrder: 1 },
          { businessId: biz.id, name: 'Minuman Signature', sortOrder: 2 },
          { businessId: biz.id, name: 'Makanan Berat', sortOrder: 3 },
          { businessId: biz.id, name: 'Pastry & Camilan', sortOrder: 4 },
        ])
        .returning();

      const [catCoffee, catSig, catFood, catPastry] = cats;

      // Products
      const insertedProducts = await db
        .insert(products)
        .values([
          {
            businessId: biz.id,
            categoryId: catCoffee.id,
            sku: 'MNU-KP-001',
            name: 'Kopi Susu Gula Aren',
            description: 'Espresso double shot arabika Toraja dengan susu segar dan gula aren organik.',
            basePrice: 24000,
            variantsJson: JSON.stringify([
              { name: 'Regular (Iced)', priceDelta: 0 },
              { name: 'Large (Iced)', priceDelta: 6000 },
              { name: 'Hot 8oz', priceDelta: 0 },
            ]),
            modifiersJson: JSON.stringify([
              { name: 'Extra Espresso Shot', price: 6000 },
              { name: 'Ganti Oat Milk', price: 8000 },
            ]),
            isAvailable: true,
            accentTone: 'amber',
          },
          {
            businessId: biz.id,
            categoryId: catCoffee.id,
            sku: 'MNU-KP-002',
            name: 'Americano Arabika',
            description: 'Single-origin espresso diseduh dengan air mineral suhu terkontrol.',
            basePrice: 20000,
            variantsJson: JSON.stringify([
              { name: 'Iced', priceDelta: 0 },
              { name: 'Hot', priceDelta: 0 },
              { name: 'Large Iced', priceDelta: 5000 },
            ]),
            modifiersJson: JSON.stringify([{ name: 'Extra Shot', price: 6000 }]),
            isAvailable: true,
            accentTone: 'slate',
          },
          {
            businessId: biz.id,
            categoryId: catSig.id,
            sku: 'MNU-SG-001',
            name: 'Uji Matcha Latte',
            description: 'Pure ceremonial Uji matcha dikocok lembut dengan susu segar.',
            basePrice: 32000,
            variantsJson: JSON.stringify([
              { name: 'Iced Regular', priceDelta: 0 },
              { name: 'Iced Large', priceDelta: 7000 },
              { name: 'Hot', priceDelta: 0 },
            ]),
            modifiersJson: JSON.stringify([
              { name: 'Ganti Oat Milk', price: 8000 },
              { name: 'Cheese Foam', price: 5000 },
            ]),
            isAvailable: true,
            accentTone: 'emerald',
          },
          {
            businessId: biz.id,
            categoryId: catFood.id,
            sku: 'MNU-FD-001',
            name: 'Rice Bowl Ayam Sambal Matah',
            description: 'Nasi pandan wangi hangat dengan ayam krispi filet dan sambal matah Bali.',
            basePrice: 38000,
            variantsJson: JSON.stringify([
              { name: 'Porsi Normal', priceDelta: 0 },
              { name: 'Porsi Jumbo', priceDelta: 9000 },
            ]),
            modifiersJson: JSON.stringify([
              { name: 'Tambah Telur Ceplok', price: 5000 },
              { name: 'Extra Sambal Matah', price: 4000 },
            ]),
            isAvailable: true,
            accentTone: 'rose',
          },
          {
            businessId: biz.id,
            categoryId: catFood.id,
            sku: 'MNU-FD-002',
            name: 'Nasi Goreng Kampung Spesial',
            description: 'Nasi goreng bumbu rempah autentik dengan suwiran ayam dan acar segar.',
            basePrice: 42000,
            variantsJson: JSON.stringify([
              { name: 'Level Pedas Sedang', priceDelta: 0 },
              { name: 'Level Pedas Ekstra', priceDelta: 0 },
            ]),
            modifiersJson: JSON.stringify([{ name: 'Extra Ayam Suwir', price: 8000 }]),
            isAvailable: true,
            accentTone: 'orange',
          },
          {
            businessId: biz.id,
            categoryId: catPastry.id,
            sku: 'MNU-PS-001',
            name: 'Butter Croissant Artisan',
            description: 'Croissant renyah berlapis menggunakan mentega Prancis pilihan.',
            basePrice: 26000,
            variantsJson: JSON.stringify([
              { name: 'Original', priceDelta: 0 },
              { name: 'Almond Glaze', priceDelta: 6000 },
            ]),
            modifiersJson: JSON.stringify([{ name: 'Hangatkan di Oven', price: 0 }]),
            isAvailable: true,
            accentTone: 'amber',
          },
          {
            businessId: biz.id,
            categoryId: catSig.id,
            sku: 'MNU-SG-002',
            name: 'Lychee Yuzu Sparkle',
            description: 'Minuman segar yuzu Jepang dengan buah leci utuh dan soda dingin.',
            basePrice: 28000,
            variantsJson: JSON.stringify([{ name: 'Iced Regular', priceDelta: 0 }]),
            modifiersJson: JSON.stringify([{ name: 'Extra Leci', price: 4000 }]),
            isAvailable: true,
            accentTone: 'sky',
          },
          {
            businessId: biz.id,
            categoryId: catPastry.id,
            sku: 'MNU-PS-002',
            name: 'Pisang Goreng Gula Aren',
            description: 'Camilan sore renyah dengan siraman saus gula aren kental.',
            basePrice: 22000,
            variantsJson: JSON.stringify([{ name: 'Isi 4 Pcs', priceDelta: 0 }]),
            modifiersJson: JSON.stringify([{ name: 'Tabur Keju Parut', price: 5000 }]),
            isAvailable: true,
            accentTone: 'amber',
          },
        ])
        .returning();

      // Ingredients
      const insertedIngs = await db
        .insert(ingredients)
        .values([
          {
            businessId: biz.id,
            sku: 'ING-001',
            name: 'Biji Kopi Arabika House Blend',
            unit: 'gram',
            purchaseUnit: 'kg',
            conversionFactor: 1000,
            costPerUnit: 240, // Rp 240.000/kg = Rp 240/gram
            minStock: 2000,
          },
          {
            businessId: biz.id,
            sku: 'ING-002',
            name: 'Susu Segar UHT Full Cream',
            unit: 'ml',
            purchaseUnit: 'liter',
            conversionFactor: 1000,
            costPerUnit: 19, // Rp 19.000/liter
            minStock: 6000,
          },
          {
            businessId: biz.id,
            sku: 'ING-003',
            name: 'Gula Aren Cair Organik',
            unit: 'ml',
            purchaseUnit: 'liter',
            conversionFactor: 1000,
            costPerUnit: 35,
            minStock: 2000,
          },
          {
            businessId: biz.id,
            sku: 'ING-004',
            name: 'Bubuk Uji Matcha Ceremonial',
            unit: 'gram',
            purchaseUnit: 'kg',
            conversionFactor: 1000,
            costPerUnit: 850,
            minStock: 500,
          },
          {
            businessId: biz.id,
            sku: 'ING-005',
            name: 'Daging Ayam Fillet Dada',
            unit: 'gram',
            purchaseUnit: 'kg',
            conversionFactor: 1000,
            costPerUnit: 58,
            minStock: 4000,
          },
          {
            businessId: biz.id,
            sku: 'ING-006',
            name: 'Beras Pandan Wangi Premium',
            unit: 'gram',
            purchaseUnit: 'kg',
            conversionFactor: 1000,
            costPerUnit: 17,
            minStock: 5000,
          },
          {
            businessId: biz.id,
            sku: 'ING-007',
            name: 'Croissant Dough Frozen (70g)',
            unit: 'pcs',
            purchaseUnit: 'box',
            conversionFactor: 20,
            costPerUnit: 7800,
            minStock: 25,
          },
          {
            businessId: biz.id,
            sku: 'ING-008',
            name: 'Cup Plastik 16oz + Tutup',
            unit: 'pcs',
            purchaseUnit: 'pack',
            conversionFactor: 50,
            costPerUnit: 650,
            minStock: 100,
          },
        ])
        .returning();

      const [ingCoffee, ingMilk, ingAren, ingMatcha, ingChicken, ingRice, ingCroissant, ingCup] =
        insertedIngs;

      // Inventory balances across 3 outlets (including intentional low-stock alerts!)
      const balanceValues = [
        // JKT
        { outletId: jkt.id, ingredientId: ingCoffee.id, quantity: 8500 },
        { outletId: jkt.id, ingredientId: ingMilk.id, quantity: 4200 }, // LOW (< 6000)
        { outletId: jkt.id, ingredientId: ingAren.id, quantity: 5400 },
        { outletId: jkt.id, ingredientId: ingMatcha.id, quantity: 1400 },
        { outletId: jkt.id, ingredientId: ingChicken.id, quantity: 12000 },
        { outletId: jkt.id, ingredientId: ingRice.id, quantity: 18000 },
        { outletId: jkt.id, ingredientId: ingCroissant.id, quantity: 48 },
        { outletId: jkt.id, ingredientId: ingCup.id, quantity: 420 },
        // BDG
        { outletId: bdg.id, ingredientId: ingCoffee.id, quantity: 1600 }, // LOW (< 2000)
        { outletId: bdg.id, ingredientId: ingMilk.id, quantity: 11000 },
        { outletId: bdg.id, ingredientId: ingAren.id, quantity: 3800 },
        { outletId: bdg.id, ingredientId: ingMatcha.id, quantity: 900 },
        { outletId: bdg.id, ingredientId: ingChicken.id, quantity: 8500 },
        { outletId: bdg.id, ingredientId: ingRice.id, quantity: 12000 },
        { outletId: bdg.id, ingredientId: ingCroissant.id, quantity: 18 }, // LOW (< 25)
        { outletId: bdg.id, ingredientId: ingCup.id, quantity: 260 },
        // SBY
        { outletId: sby.id, ingredientId: ingCoffee.id, quantity: 5200 },
        { outletId: sby.id, ingredientId: ingMilk.id, quantity: 9500 },
        { outletId: sby.id, ingredientId: ingAren.id, quantity: 3200 },
        { outletId: sby.id, ingredientId: ingMatcha.id, quantity: 420 }, // LOW (< 500)
        { outletId: sby.id, ingredientId: ingChicken.id, quantity: 7200 },
        { outletId: sby.id, ingredientId: ingRice.id, quantity: 10500 },
        { outletId: sby.id, ingredientId: ingCroissant.id, quantity: 34 },
        { outletId: sby.id, ingredientId: ingCup.id, quantity: 310 },
      ];
      await db.insert(inventoryBalances).values(balanceValues);

      // Recipes
      const recipeDefs: Array<{
        productId: number;
        items: Array<{ ingredientId: number; quantity: number }>;
      }> = [
        {
          productId: insertedProducts[0].id, // Kopi Susu Gula Aren
          items: [
            { ingredientId: ingCoffee.id, quantity: 18 },
            { ingredientId: ingMilk.id, quantity: 150 },
            { ingredientId: ingAren.id, quantity: 30 },
            { ingredientId: ingCup.id, quantity: 1 },
          ],
        },
        {
          productId: insertedProducts[1].id, // Americano
          items: [
            { ingredientId: ingCoffee.id, quantity: 18 },
            { ingredientId: ingCup.id, quantity: 1 },
          ],
        },
        {
          productId: insertedProducts[2].id, // Uji Matcha
          items: [
            { ingredientId: ingMatcha.id, quantity: 8 },
            { ingredientId: ingMilk.id, quantity: 180 },
            { ingredientId: ingCup.id, quantity: 1 },
          ],
        },
        {
          productId: insertedProducts[3].id, // Rice Bowl Ayam Sambal Matah
          items: [
            { ingredientId: ingChicken.id, quantity: 140 },
            { ingredientId: ingRice.id, quantity: 180 },
          ],
        },
        {
          productId: insertedProducts[4].id, // Nasi Goreng Kampung
          items: [
            { ingredientId: ingChicken.id, quantity: 100 },
            { ingredientId: ingRice.id, quantity: 200 },
          ],
        },
        {
          productId: insertedProducts[5].id, // Butter Croissant
          items: [{ ingredientId: ingCroissant.id, quantity: 1 }],
        },
      ];

      for (const rDef of recipeDefs) {
        const [r] = await db
          .insert(recipes)
          .values({ productId: rDef.productId, yieldQty: 1, notes: 'Resep standar pusat' })
          .returning();
        await db.insert(recipeItems).values(
          rDef.items.map((item) => ({
            recipeId: r.id,
            ingredientId: item.ingredientId,
            quantity: item.quantity,
          }))
        );
      }

      // Suppliers & Purchase Orders
      const insertedSuppliers = await db
        .insert(suppliers)
        .values([
          {
            businessId: biz.id,
            name: 'PT Roastery Nusantara Jaya',
            contactPerson: 'Budi Santoso',
            phone: '021-88901234',
            email: 'order@roasterynusantara.id',
            address: 'Kawasan Industri Jababeka Blok K-4, Bekasi',
            category: 'Kopi & Bubuk Minuman',
          },
          {
            businessId: biz.id,
            name: 'CV Segar Pangan Sentosa',
            contactPerson: 'Dewi Anggraini',
            phone: '021-77654321',
            email: 'supply@segarpangan.co.id',
            address: 'Jl. Raya Pasar Minggu No. 90, Jakarta',
            category: 'Susu, Ayam & Bahan Basah',
          },
        ])
        .returning();

      const [po1] = await db
        .insert(purchaseOrders)
        .values([
          {
            businessId: biz.id,
            outletId: jkt.id,
            supplierId: insertedSuppliers[1].id,
            poNumber: 'PO-202611-001',
            status: 'ordered',
            totalAmount: 1900000,
            notes: 'Restock susu UHT dan ayam fillet mingguan Kemang',
            orderedByUid: actorUid,
          },
        ])
        .returning();

      await db.insert(purchaseOrderItems).values([
        { poId: po1.id, ingredientId: ingMilk.id, quantity: 40000, unitCost: 19, receivedQty: 0 },
        { poId: po1.id, ingredientId: ingChicken.id, quantity: 20000, unitCost: 57, receivedQty: 0 },
      ]);

      // Seed historical sales & payments across outlets
      const now = new Date();
      const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000);

      const demoOrders = [
        {
          outlet: jkt,
          receipt: 'INV-JKT-20261116-001',
          customer: 'Andi Wijaya',
          orderType: 'dine_in',
          items: [
            { product: insertedProducts[0], qty: 2, variant: 'Large (Iced)', unitPrice: 30000, hpp: 8870 },
            { product: insertedProducts[3], qty: 1, variant: 'Porsi Normal', unitPrice: 38000, hpp: 11180 },
          ],
          method: 'qris',
          mode: 'gateway',
          ref: 'QRIS-MID-98123401',
          status: 'paid',
          payStatus: 'success',
          reconciled: true,
          hoursAgo: 2,
        },
        {
          outlet: jkt,
          receipt: 'INV-JKT-20261116-002',
          customer: 'Meira Putri',
          orderType: 'takeaway',
          items: [
            { product: insertedProducts[2], qty: 2, variant: 'Iced Regular', unitPrice: 32000, hpp: 10870 },
            { product: insertedProducts[5], qty: 2, variant: 'Original', unitPrice: 26000, hpp: 7800 },
          ],
          method: 'cash',
          mode: 'manual',
          ref: 'CASH-POS-002',
          status: 'paid',
          payStatus: 'success',
          reconciled: true,
          hoursAgo: 4,
          cashTendered: 150000,
        },
        {
          outlet: bdg,
          receipt: 'INV-BDG-20261116-001',
          customer: 'Fajar Ramadhan',
          orderType: 'dine_in',
          items: [
            { product: insertedProducts[4], qty: 2, variant: 'Level Pedas Sedang', unitPrice: 42000, hpp: 9200 },
            { product: insertedProducts[0], qty: 2, variant: 'Regular (Iced)', unitPrice: 24000, hpp: 8870 },
          ],
          method: 'ewallet_gopay',
          mode: 'gateway',
          ref: 'GP-883920112',
          status: 'paid',
          payStatus: 'success',
          reconciled: false,
          hoursAgo: 5,
        },
        {
          outlet: sby,
          receipt: 'INV-SBY-20261116-001',
          customer: 'Clarissa Lim',
          orderType: 'delivery',
          items: [
            { product: insertedProducts[3], qty: 3, variant: 'Porsi Jumbo', unitPrice: 47000, hpp: 11180 },
            { product: insertedProducts[1], qty: 3, variant: 'Iced', unitPrice: 20000, hpp: 4970 },
          ],
          method: 'bank_transfer',
          mode: 'manual',
          ref: 'BCA-TRF-7741290',
          status: 'paid',
          payStatus: 'success',
          reconciled: true,
          hoursAgo: 8,
        },
        {
          outlet: bdg,
          receipt: 'INV-BDG-20261116-002',
          customer: 'Pelanggan Meja 04',
          orderType: 'dine_in',
          items: [
            { product: insertedProducts[2], qty: 1, variant: 'Iced Large', unitPrice: 39000, hpp: 10870 },
          ],
          method: 'qris',
          mode: 'gateway',
          ref: 'QRIS-PEND-554019',
          status: 'pending_payment',
          payStatus: 'pending',
          reconciled: false,
          hoursAgo: 1,
        },
      ];

      for (const ord of demoOrders) {
        const subtotal = ord.items.reduce((acc, it) => acc + it.unitPrice * it.qty, 0);
        const tax = Math.round(subtotal * 0.11);
        const totalAmt = subtotal + tax;
        const createdAt = hoursAgo(ord.hoursAgo);

        const [saleRow] = await db
          .insert(sales)
          .values({
            businessId: biz.id,
            outletId: ord.outlet.id,
            receiptNumber: ord.receipt,
            idempotencyKey: `seed-${ord.receipt}`,
            cashierUid: actorUid,
            cashierName: actorEmail.split('@')[0],
            customerName: ord.customer,
            orderType: ord.orderType,
            subtotal,
            discountAmount: 0,
            taxAmount: tax,
            serviceChargeAmount: 0,
            totalAmount: totalAmt,
            status: ord.status,
            createdAt,
          })
          .returning();

        await db.insert(saleItems).values(
          ord.items.map((it) => ({
            saleId: saleRow.id,
            productId: it.product.id,
            productName: it.product.name,
            variantName: it.variant,
            modifiersSummary: '',
            quantity: it.qty,
            unitPrice: it.unitPrice,
            lineTotal: it.unitPrice * it.qty,
            estimatedHpp: it.hpp * it.qty,
          }))
        );

        const tendered = ord.cashTendered || totalAmt;
        const change = ord.method === 'cash' ? Math.max(0, tendered - totalAmt) : 0;

        await db.insert(payments).values({
          saleId: saleRow.id,
          outletId: ord.outlet.id,
          method: ord.method,
          channelMode: ord.mode,
          amount: totalAmt,
          cashTendered: tendered,
          changeAmount: change,
          referenceNumber: ord.ref,
          providerStatus: ord.payStatus,
          reconciled: ord.reconciled,
          reconciledAt: ord.reconciled ? createdAt : null,
          cashierUid: actorUid,
          paidAt: ord.payStatus === 'success' ? createdAt : null,
          createdAt,
        });
      }

      // Royalty obligation for current month
      const periodMonth = now.toISOString().slice(0, 7);
      await db.insert(royaltyObligations).values([
        {
          partnerId: insertedPartners[0].id,
          outletId: bdg.id,
          periodMonth,
          grossSales: 159840,
          calculatedFee: Math.round(159840 * 0.06),
          status: 'unpaid',
          notes: 'Otomatis dihitung dari omzet kotor outlet Dago Heritage Bandung',
        },
        {
          partnerId: insertedPartners[1].id,
          outletId: sby.id,
          periodMonth,
          grossSales: 223110,
          calculatedFee: Math.round(223110 * 0.05),
          status: 'paid',
          paidAt: hoursAgo(12),
          notes: 'Pembayaran royalty bulan berjalan terverifikasi',
        },
      ]);

      // Expenses
      const todayStr = now.toISOString().slice(0, 10);
      await db.insert(expenses).values([
        {
          businessId: biz.id,
          outletId: jkt.id,
          category: 'utilities',
          description: 'Listrik & Air Outlet Kemang November',
          amount: 4250000,
          expenseDate: todayStr,
          createdByUid: actorUid,
        },
        {
          businessId: biz.id,
          outletId: bdg.id,
          category: 'marketing',
          description: 'Promosi Grand Opening Menu Uji Matcha Bandung',
          amount: 1850000,
          expenseDate: todayStr,
          createdByUid: actorUid,
        },
      ]);

      // Initial stock movement & audit log
      await db.insert(stockMovements).values({
        outletId: jkt.id,
        ingredientId: ingCoffee.id,
        movementType: 'in',
        quantityDelta: 10000,
        unitCost: 240,
        referenceType: 'initial_stock',
        referenceId: 'INIT-001',
        notes: 'Saldo awal stok pusat Kemang',
        createdByUid: actorUid,
      });

      await db.insert(auditLogs).values({
        businessId: biz.id,
        outletId: jkt.id,
        actorUid,
        actorEmail,
        actorRole: 'owner',
        action: 'SYSTEM_INITIALIZED',
        entityType: 'business',
        entityId: String(biz.id),
        detailsJson: JSON.stringify({ message: 'Data awal KulinaHub berhasil diinisialisasi' }),
      });
    } finally {
      seedPromise = null;
    }
  })();

  await seedPromise;
}
