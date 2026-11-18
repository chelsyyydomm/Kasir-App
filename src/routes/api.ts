import { Router, Response } from 'express';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  auditLogs,
  businesses,
  expenses,
  franchisePartners,
  ingredients,
  inventoryBalances,
  outletProducts,
  outlets,
  payments,
  productCategories,
  products,
  purchaseOrderItems,
  purchaseOrders,
  recipeItems,
  recipes,
  refunds,
  royaltyObligations,
  saleItems,
  sales,
  stockMovements,
  suppliers,
  users,
} from '../db/schema.ts';
import { ensureSeedData } from '../db/seed.ts';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.ts';
import { isGlobalRole, ROLE_PERMISSIONS, UserRole } from '../lib/rbac.ts';
import { GEMINI_ASSISTANT_MODEL, getGeminiClient } from '../lib/gemini.ts';

const router = Router();
router.use(requireAuth);

function getAllowedOutletIds(req: AuthRequest, allOutlets: Array<{ id: number }>): number[] {
  const user = req.appUser!;
  if (isGlobalRole(user.role)) {
    return allOutlets.map((o) => o.id);
  }
  if (user.assignedOutletId) {
    return [user.assignedOutletId];
  }
  return allOutlets.length > 0 ? [allOutlets[0].id] : [];
}

async function writeAudit(params: {
  businessId: number;
  outletId?: number | null;
  req: AuthRequest;
  action: string;
  entityType: string;
  entityId: string | number;
  details: Record<string, unknown>;
}) {
  const user = params.req.appUser!;
  await db.insert(auditLogs).values({
    businessId: params.businessId,
    outletId: params.outletId ?? null,
    actorUid: user.uid,
    actorEmail: user.email,
    actorRole: user.role,
    action: params.action,
    entityType: params.entityType,
    entityId: String(params.entityId),
    detailsJson: JSON.stringify(params.details),
  });
}

async function deductRecipeStockForSale(saleId: number, outletId: number, actorUid: string) {
  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId));
  for (const item of items) {
    const [recipe] = await db
      .select()
      .from(recipes)
      .where(eq(recipes.productId, item.productId))
      .limit(1);
    if (!recipe) continue;

    const rItems = await db
      .select()
      .from(recipeItems)
      .where(eq(recipeItems.recipeId, recipe.id));

    for (const rItem of rItems) {
      const deductQty = (rItem.quantity / (recipe.yieldQty || 1)) * item.quantity;
      const [existingBal] = await db
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.outletId, outletId),
            eq(inventoryBalances.ingredientId, rItem.ingredientId)
          )
        )
        .limit(1);

      if (existingBal) {
        await db
          .update(inventoryBalances)
          .set({
            quantity: Math.max(0, existingBal.quantity - deductQty),
            updatedAt: new Date(),
          })
          .where(eq(inventoryBalances.id, existingBal.id));
      } else {
        await db.insert(inventoryBalances).values({
          outletId,
          ingredientId: rItem.ingredientId,
          quantity: 0,
        });
      }

      await db.insert(stockMovements).values({
        outletId,
        ingredientId: rItem.ingredientId,
        movementType: 'sale_deduction',
        quantityDelta: -deductQty,
        unitCost: 0,
        referenceType: 'sale',
        referenceId: String(saleId),
        notes: `Pengurangan otomatis transaksi #${saleId} (${item.productName} x${item.quantity})`,
        createdByUid: actorUid,
      });
    }
  }
}

// 1. Bootstrap & Session Context
router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.appUser!;
    await ensureSeedData(user.uid, user.email);

    const [biz] = await db.select().from(businesses).limit(1);
    const allOutlets = await db.select().from(outlets).orderBy(outlets.id);
    const allowedIds = getAllowedOutletIds(req, allOutlets);
    const visibleOutlets = allOutlets.filter((o) => allowedIds.includes(o.id));
    const permissions = ROLE_PERMISSIONS[user.role as UserRole] || [];

    res.json({
      user,
      business: biz,
      outlets: visibleOutlets,
      allOutletsCount: allOutlets.length,
      permissions,
    });
  } catch (error) {
    console.error('GET /api/me failed:', error);
    res.status(500).json({ error: 'Gagal memuat konteks pengguna.' });
  }
});

// 2. Dashboard
router.get('/dashboard', requirePermission('dashboard.view'), async (req: AuthRequest, res: Response) => {
  try {
    const [biz] = await db.select().from(businesses).limit(1);
    if (!biz) return res.status(404).json({ error: 'Bisnis tidak ditemukan.' });

    const allOutlets = await db.select().from(outlets).orderBy(outlets.id);
    const allowedIds = getAllowedOutletIds(req, allOutlets);
    const reqOutletId = req.query.outletId ? Number(req.query.outletId) : null;
    const targetOutletIds =
      reqOutletId && allowedIds.includes(reqOutletId) ? [reqOutletId] : allowedIds;

    const range = String(req.query.range || '30d');
    const now = new Date();
    let sinceDate = new Date(now.getTime() - 30 * 86400000);
    if (range === 'today') {
      sinceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === '7d') {
      sinceDate = new Date(now.getTime() - 7 * 86400000);
    }

    const salesList =
      targetOutletIds.length > 0
        ? await db
            .select()
            .from(sales)
            .where(and(inArray(sales.outletId, targetOutletIds), gte(sales.createdAt, sinceDate)))
            .orderBy(desc(sales.createdAt))
        : [];

    const paidSales = salesList.filter((s) => s.status === 'paid');
    const paidSaleIds = paidSales.map((s) => s.id);

    const itemsList =
      paidSaleIds.length > 0
        ? await db.select().from(saleItems).where(inArray(saleItems.saleId, paidSaleIds))
        : [];

    const paymentsList =
      targetOutletIds.length > 0
        ? await db
            .select()
            .from(payments)
            .where(and(inArray(payments.outletId, targetOutletIds), gte(payments.createdAt, sinceDate)))
        : [];

    const expenseList =
      targetOutletIds.length > 0
        ? await db
            .select()
            .from(expenses)
            .where(inArray(expenses.outletId, targetOutletIds))
        : [];

    const totalRevenue = paidSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const estimatedHpp = itemsList.reduce((acc, it) => acc + it.estimatedHpp, 0);
    const totalExpenses = expenseList.reduce((acc, e) => acc + e.amount, 0);

    // Payment method summary
    const methodMap = new Map<string, { method: string; total: number; count: number }>();
    for (const p of paymentsList) {
      if (p.providerStatus !== 'success') continue;
      const cur = methodMap.get(p.method) || { method: p.method, total: 0, count: 0 };
      cur.total += p.amount;
      cur.count += 1;
      methodMap.set(p.method, cur);
    }

    // Outlet performance comparison
    const outletComparison = allOutlets
      .filter((o) => allowedIds.includes(o.id))
      .map((o) => {
        const oSales = paidSales.filter((s) => s.outletId === o.id);
        const oRevenue = oSales.reduce((acc, s) => acc + s.totalAmount, 0);
        const oPending = salesList.filter(
          (s) => s.outletId === o.id && s.status === 'pending_payment'
        ).length;
        return {
          outletId: o.id,
          code: o.code,
          name: o.name,
          city: o.city,
          isFranchise: o.isFranchise,
          status: o.status,
          revenue: oRevenue,
          transactions: oSales.length,
          pendingCount: oPending,
        };
      });

    // Low stock alerts
    const ingList = await db.select().from(ingredients);
    const ingMap = new Map(ingList.map((i) => [i.id, i]));
    const outletMap = new Map(allOutlets.map((o) => [o.id, o]));
    const balances =
      targetOutletIds.length > 0
        ? await db
            .select()
            .from(inventoryBalances)
            .where(inArray(inventoryBalances.outletId, targetOutletIds))
        : [];

    const lowStockItems = balances
      .map((b) => {
        const ing = ingMap.get(b.ingredientId);
        const outlet = outletMap.get(b.outletId);
        if (!ing || !outlet) return null;
        if (b.quantity > ing.minStock) return null;
        return {
          id: b.id,
          outletId: b.outletId,
          outletName: outlet.name,
          ingredientId: ing.id,
          ingredientName: ing.name,
          unit: ing.unit,
          quantity: b.quantity,
          minStock: ing.minStock,
        };
      })
      .filter(Boolean);

    res.json({
      kpis: {
        totalRevenue,
        transactionCount: paidSales.length,
        pendingCount: salesList.filter((s) => s.status === 'pending_payment').length,
        estimatedHpp,
        grossProfit: totalRevenue - estimatedHpp,
        totalExpenses,
        lowStockCount: lowStockItems.length,
      },
      paymentBreakdown: Array.from(methodMap.values()),
      outletComparison,
      lowStockItems,
      recentSales: salesList.slice(0, 8),
    });
  } catch (error) {
    console.error('GET /api/dashboard failed:', error);
    res.status(500).json({ error: 'Gagal memuat data dashboard.' });
  }
});

// 3. Outlets Management
router.get('/outlets', requirePermission('outlets.view'), async (req: AuthRequest, res: Response) => {
  try {
    const allOutlets = await db.select().from(outlets).orderBy(outlets.id);
    const allowedIds = getAllowedOutletIds(req, allOutlets);
    const filtered = allOutlets.filter((o) => allowedIds.includes(o.id));
    res.json(filtered);
  } catch (error) {
    console.error('GET /api/outlets failed:', error);
    res.status(500).json({ error: 'Gagal memuat daftar outlet.' });
  }
});

router.post('/outlets', requirePermission('outlets.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const [biz] = await db.select().from(businesses).limit(1);
    const { code, name, address, city, phone, managerName, isFranchise } = req.body;
    if (!code || !name || !address || !city) {
      return res.status(400).json({ error: 'Kode, nama, alamat, dan kota outlet wajib diisi.' });
    }
    const [created] = await db
      .insert(outlets)
      .values({
        businessId: biz.id,
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        address: String(address).trim(),
        city: String(city).trim(),
        phone: String(phone || '').trim(),
        managerName: String(managerName || '').trim(),
        status: 'active',
        isFranchise: Boolean(isFranchise),
      })
      .returning();

    // Initialize inventory balances at 0 for all ingredients
    const allIngs = await db.select().from(ingredients);
    if (allIngs.length > 0) {
      await db.insert(inventoryBalances).values(
        allIngs.map((ing) => ({
          outletId: created.id,
          ingredientId: ing.id,
          quantity: 0,
        }))
      );
    }

    await writeAudit({
      businessId: biz.id,
      outletId: created.id,
      req,
      action: 'OUTLET_CREATED',
      entityType: 'outlet',
      entityId: created.id,
      details: { code: created.code, name: created.name },
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('POST /api/outlets failed:', error);
    res.status(500).json({ error: 'Gagal membuat outlet baru.' });
  }
});

router.patch('/outlets/:id', requirePermission('outlets.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const outletId = Number(req.params.id);
    const [biz] = await db.select().from(businesses).limit(1);
    const { name, address, city, phone, managerName, status, isFranchise } = req.body;
    const [updated] = await db
      .update(outlets)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(managerName !== undefined ? { managerName } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(isFranchise !== undefined ? { isFranchise } : {}),
      })
      .where(eq(outlets.id, outletId))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Outlet tidak ditemukan.' });

    await writeAudit({
      businessId: biz.id,
      outletId: updated.id,
      req,
      action: 'OUTLET_UPDATED',
      entityType: 'outlet',
      entityId: updated.id,
      details: { status: updated.status, managerName: updated.managerName },
    });

    res.json(updated);
  } catch (error) {
    console.error('PATCH /api/outlets/:id failed:', error);
    res.status(500).json({ error: 'Gagal memperbarui outlet.' });
  }
});

// 4. Categories, Products, & Recipes (HPP)
router.get('/products', requirePermission('products.view'), async (req: AuthRequest, res: Response) => {
  try {
    const outletId = req.query.outletId ? Number(req.query.outletId) : null;
    const cats = await db.select().from(productCategories).orderBy(productCategories.sortOrder);
    const prods = await db.select().from(products).orderBy(products.id);
    const allRecipes = await db.select().from(recipes);
    const allRecipeItems = await db.select().from(recipeItems);
    const allIngs = await db.select().from(ingredients);
    const overrides = outletId
      ? await db.select().from(outletProducts).where(eq(outletProducts.outletId, outletId))
      : [];

    const ingMap = new Map(allIngs.map((i) => [i.id, i]));
    const overrideMap = new Map(overrides.map((o) => [o.productId, o]));

    const enriched = prods.map((p) => {
      const rec = allRecipes.find((r) => r.productId === p.id);
      const rItems = rec
        ? allRecipeItems
            .filter((ri) => ri.recipeId === rec.id)
            .map((ri) => {
              const ing = ingMap.get(ri.ingredientId);
              return {
                ...ri,
                ingredientName: ing?.name || 'Bahan',
                unit: ing?.unit || '',
                costPerUnit: ing?.costPerUnit || 0,
                lineCost: (ing?.costPerUnit || 0) * ri.quantity,
              };
            })
        : [];
      const estimatedHpp = rItems.reduce((sum, ri) => sum + ri.lineCost, 0) / (rec?.yieldQty || 1);
      const ov = overrideMap.get(p.id);

      return {
        ...p,
        effectivePrice: ov?.customPrice ?? p.basePrice,
        effectiveAvailable: ov ? ov.isAvailable : p.isAvailable,
        estimatedHpp: Math.round(estimatedHpp),
        recipe: rec ? { ...rec, items: rItems } : null,
      };
    });

    res.json({ categories: cats, products: enriched });
  } catch (error) {
    console.error('GET /api/products failed:', error);
    res.status(500).json({ error: 'Gagal memuat daftar produk.' });
  }
});

router.post('/categories', requirePermission('products.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const [biz] = await db.select().from(businesses).limit(1);
    const { name, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
    const [created] = await db
      .insert(productCategories)
      .values({ businessId: biz.id, name: String(name).trim(), sortOrder: Number(sortOrder || 0) })
      .returning();
    res.status(201).json(created);
  } catch (error) {
    console.error('POST /api/categories failed:', error);
    res.status(500).json({ error: 'Gagal menambahkan kategori.' });
  }
});

router.post('/products', requirePermission('products.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const [biz] = await db.select().from(businesses).limit(1);
    const { categoryId, sku, name, description, basePrice, variants, modifiers, isAvailable, accentTone } =
      req.body;
    if (!sku || !name || basePrice === undefined) {
      return res.status(400).json({ error: 'SKU, nama produk, dan harga dasar wajib diisi.' });
    }
    const [created] = await db
      .insert(products)
      .values({
        businessId: biz.id,
        categoryId: categoryId ? Number(categoryId) : null,
        sku: String(sku).trim().toUpperCase(),
        name: String(name).trim(),
        description: String(description || '').trim(),
        basePrice: Number(basePrice),
        variantsJson: JSON.stringify(variants || []),
        modifiersJson: JSON.stringify(modifiers || []),
        isAvailable: isAvailable !== false,
        accentTone: String(accentTone || 'emerald'),
      })
      .returning();

    await writeAudit({
      businessId: biz.id,
      req,
      action: 'PRODUCT_CREATED',
      entityType: 'product',
      entityId: created.id,
      details: { sku: created.sku, name: created.name, basePrice: created.basePrice },
    });
    res.status(201).json(created);
  } catch (error) {
    console.error('POST /api/products failed:', error);
    res.status(500).json({ error: 'Gagal menambahkan produk.' });
  }
});

router.patch('/products/:id', requirePermission('products.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const productId = Number(req.params.id);
    const [biz] = await db.select().from(businesses).limit(1);
    const { name, description, basePrice, categoryId, isAvailable, variants, modifiers } = req.body;
    const [updated] = await db
      .update(products)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(basePrice !== undefined ? { basePrice: Number(basePrice) } : {}),
        ...(categoryId !== undefined ? { categoryId: Number(categoryId) } : {}),
        ...(isAvailable !== undefined ? { isAvailable: Boolean(isAvailable) } : {}),
        ...(variants !== undefined ? { variantsJson: JSON.stringify(variants) } : {}),
        ...(modifiers !== undefined ? { modifiersJson: JSON.stringify(modifiers) } : {}),
      })
      .where(eq(products.id, productId))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Produk tidak ditemukan.' });

    await writeAudit({
      businessId: biz.id,
      req,
      action: 'PRODUCT_UPDATED',
      entityType: 'product',
      entityId: updated.id,
      details: { name: updated.name, basePrice: updated.basePrice, isAvailable: updated.isAvailable },
    });
    res.json(updated);
  } catch (error) {
    console.error('PATCH /api/products/:id failed:', error);
    res.status(500).json({ error: 'Gagal memperbarui produk.' });
  }
});

router.put('/products/:id/outlet-override', requirePermission('products.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const productId = Number(req.params.id);
    const { outletId, customPrice, isAvailable } = req.body;
    if (!outletId) return res.status(400).json({ error: 'outletId wajib diisi.' });

    const existing = await db
      .select()
      .from(outletProducts)
      .where(and(eq(outletProducts.outletId, Number(outletId)), eq(outletProducts.productId, productId)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(outletProducts)
        .set({
          customPrice: customPrice !== null && customPrice !== '' ? Number(customPrice) : null,
          isAvailable: isAvailable !== false,
        })
        .where(eq(outletProducts.id, existing[0].id))
        .returning();
      return res.json(updated);
    }

    const [created] = await db
      .insert(outletProducts)
      .values({
        outletId: Number(outletId),
        productId,
        customPrice: customPrice !== null && customPrice !== '' ? Number(customPrice) : null,
        isAvailable: isAvailable !== false,
      })
      .returning();
    res.status(201).json(created);
  } catch (error) {
    console.error('PUT /api/products/:id/outlet-override failed:', error);
    res.status(500).json({ error: 'Gagal mengatur harga khusus outlet.' });
  }
});

router.put('/products/:id/recipe', requirePermission('recipes.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const productId = Number(req.params.id);
    const [biz] = await db.select().from(businesses).limit(1);
    const { yieldQty, notes, items } = req.body as {
      yieldQty?: number;
      notes?: string;
      items: Array<{ ingredientId: number; quantity: number }>;
    };

    const [existing] = await db
      .select()
      .from(recipes)
      .where(eq(recipes.productId, productId))
      .limit(1);

    let recipeId: number;
    if (existing) {
      await db
        .update(recipes)
        .set({
          yieldQty: Number(yieldQty || 1),
          notes: String(notes || ''),
          updatedAt: new Date(),
        })
        .where(eq(recipes.id, existing.id));
      recipeId = existing.id;
      await db.delete(recipeItems).where(eq(recipeItems.recipeId, recipeId));
    } else {
      const [created] = await db
        .insert(recipes)
        .values({
          productId,
          yieldQty: Number(yieldQty || 1),
          notes: String(notes || ''),
        })
        .returning();
      recipeId = created.id;
    }

    if (items && items.length > 0) {
      await db.insert(recipeItems).values(
        items
          .filter((it) => Number(it.quantity) > 0)
          .map((it) => ({
            recipeId,
            ingredientId: Number(it.ingredientId),
            quantity: Number(it.quantity),
          }))
      );
    }

    await writeAudit({
      businessId: biz.id,
      req,
      action: 'RECIPE_UPDATED',
      entityType: 'recipe',
      entityId: recipeId,
      details: { productId, itemCount: items?.length || 0 },
    });

    res.json({ success: true, recipeId });
  } catch (error) {
    console.error('PUT /api/products/:id/recipe failed:', error);
    res.status(500).json({ error: 'Gagal menyimpan resep dan HPP.' });
  }
});

// 5. POS Checkout & Payment Management
router.post('/pos/checkout', requirePermission('pos.operate'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.appUser!;
    const [biz] = await db.select().from(businesses).limit(1);
    const allOutlets = await db.select().from(outlets);
    const allowedIds = getAllowedOutletIds(req, allOutlets);

    const {
      outletId,
      idempotencyKey,
      customerName,
      orderType,
      discountAmount,
      items,
      payments: paymentLegs,
    } = req.body as {
      outletId: number;
      idempotencyKey: string;
      customerName?: string;
      orderType?: string;
      discountAmount?: number;
      items: Array<{
        productId: number;
        variantName?: string;
        variantDelta?: number;
        modifiersSummary?: string;
        modifiersTotal?: number;
        quantity: number;
      }>;
      payments: Array<{
        method: string;
        channelMode: 'manual' | 'gateway';
        amount: number;
        cashTendered?: number;
        referenceNumber?: string;
      }>;
    };

    if (!outletId || !allowedIds.includes(Number(outletId))) {
      return res.status(403).json({ error: 'Akses outlet tidak diizinkan.' });
    }
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'idempotencyKey wajib disertakan untuk mencegah transaksi ganda.' });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Keranjang pesanan tidak boleh kosong.' });
    }
    if (!paymentLegs || paymentLegs.length === 0) {
      return res.status(400).json({ error: 'Minimal satu metode pembayaran harus dipilih.' });
    }

    // Idempotency check: prevent duplicate sales on retry/network hiccup
    const existingSale = await db
      .select()
      .from(sales)
      .where(eq(sales.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existingSale.length > 0) {
      const existingItems = await db
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, existingSale[0].id));
      const existingPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.saleId, existingSale[0].id));
      return res.status(200).json({
        deduplicated: true,
        sale: existingSale[0],
        items: existingItems,
        payments: existingPayments,
      });
    }

    // Compute authoritative prices & HPP on the server
    const prodList = await db.select().from(products);
    const prodMap = new Map(prodList.map((p) => [p.id, p]));
    const overrides = await db
      .select()
      .from(outletProducts)
      .where(eq(outletProducts.outletId, Number(outletId)));
    const overrideMap = new Map(overrides.map((o) => [o.productId, o]));

    const allRecipes = await db.select().from(recipes);
    const allRecipeItems = await db.select().from(recipeItems);
    const allIngs = await db.select().from(ingredients);
    const ingMap = new Map(allIngs.map((i) => [i.id, i]));

    let subtotal = 0;
    const computedItems: Array<{
      productId: number;
      productName: string;
      variantName: string;
      modifiersSummary: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      estimatedHpp: number;
    }> = [];

    for (const reqItem of items) {
      const prod = prodMap.get(Number(reqItem.productId));
      if (!prod) {
        return res.status(400).json({ error: `Produk ID ${reqItem.productId} tidak ditemukan.` });
      }
      const ov = overrideMap.get(prod.id);
      const base = ov?.customPrice ?? prod.basePrice;
      const unitPrice = base + Number(reqItem.variantDelta || 0) + Number(reqItem.modifiersTotal || 0);
      const qty = Math.max(1, Number(reqItem.quantity));
      const lineTotal = unitPrice * qty;
      subtotal += lineTotal;

      const rec = allRecipes.find((r) => r.productId === prod.id);
      let unitHpp = 0;
      if (rec) {
        const rItems = allRecipeItems.filter((ri) => ri.recipeId === rec.id);
        unitHpp =
          rItems.reduce((sum, ri) => sum + (ingMap.get(ri.ingredientId)?.costPerUnit || 0) * ri.quantity, 0) /
          (rec.yieldQty || 1);
      }

      computedItems.push({
        productId: prod.id,
        productName: prod.name,
        variantName: String(reqItem.variantName || ''),
        modifiersSummary: String(reqItem.modifiersSummary || ''),
        quantity: qty,
        unitPrice,
        lineTotal,
        estimatedHpp: Math.round(unitHpp * qty),
      });
    }

    const discount = Math.max(0, Math.min(subtotal, Number(discountAmount || 0)));
    const taxable = Math.max(0, subtotal - discount);
    const taxAmount = Math.round((taxable * biz.taxRate) / 100);
    const serviceChargeAmount = Math.round((taxable * biz.serviceChargeRate) / 100);
    const totalAmount = taxable + taxAmount + serviceChargeAmount;

    const paymentSum = paymentLegs.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    if (Math.abs(paymentSum - totalAmount) > 1) {
      return res.status(400).json({
        error: `Total pembayaran (Rp ${paymentSum}) harus sama dengan total tagihan (Rp ${totalAmount}).`,
      });
    }

    // Validate cash tendered
    for (const leg of paymentLegs) {
      if (leg.method === 'cash' && Number(leg.cashTendered || 0) < Number(leg.amount)) {
        return res.status(400).json({ error: 'Nominal tunai yang diterima kurang dari tagihan.' });
      }
    }

    const hasGatewayPending = paymentLegs.some((leg) => leg.channelMode === 'gateway');
    const saleStatus = hasGatewayPending ? 'pending_payment' : 'paid';
    const outletObj = allOutlets.find((o) => o.id === Number(outletId))!;
    const receiptNumber = `INV-${outletObj.code.split('-')[1] || 'POS'}-${Date.now().toString().slice(-8)}`;

    const [createdSale] = await db
      .insert(sales)
      .values({
        businessId: biz.id,
        outletId: Number(outletId),
        receiptNumber,
        idempotencyKey,
        cashierUid: user.uid,
        cashierName: user.fullName,
        customerName: String(customerName || 'Pelanggan Umum').trim(),
        orderType: String(orderType || 'dine_in'),
        subtotal,
        discountAmount: discount,
        taxAmount,
        serviceChargeAmount,
        totalAmount,
        status: saleStatus,
      })
      .returning();

    const createdItems = await db
      .insert(saleItems)
      .values(computedItems.map((it) => ({ ...it, saleId: createdSale.id })))
      .returning();

    const now = new Date();
    const createdPayments = await db
      .insert(payments)
      .values(
        paymentLegs.map((leg, idx) => {
          const isCash = leg.method === 'cash';
          const isGateway = leg.channelMode === 'gateway';
          const tendered = isCash ? Number(leg.cashTendered || leg.amount) : Number(leg.amount);
          const change = isCash ? Math.max(0, tendered - Number(leg.amount)) : 0;
          const ref =
            leg.referenceNumber?.trim() ||
            (isCash
              ? `CASH-${createdSale.id}-${idx + 1}`
              : `${leg.method.toUpperCase()}-${Date.now().toString().slice(-6)}-${idx + 1}`);

          return {
            saleId: createdSale.id,
            outletId: Number(outletId),
            method: leg.method,
            channelMode: leg.channelMode || 'manual',
            amount: Number(leg.amount),
            cashTendered: tendered,
            changeAmount: change,
            referenceNumber: ref,
            providerStatus: isGateway ? 'pending' : 'success',
            reconciled: isCash,
            reconciledAt: isCash ? now : null,
            cashierUid: user.uid,
            paidAt: isGateway ? null : now,
          };
        })
      )
      .returning();

    if (saleStatus === 'paid') {
      await deductRecipeStockForSale(createdSale.id, Number(outletId), user.uid);
    }

    await writeAudit({
      businessId: biz.id,
      outletId: Number(outletId),
      req,
      action: saleStatus === 'paid' ? 'SALE_COMPLETED' : 'SALE_PENDING_GATEWAY',
      entityType: 'sale',
      entityId: createdSale.id,
      details: {
        receiptNumber,
        totalAmount,
        methods: paymentLegs.map((l) => `${l.method}:${l.channelMode}`),
      },
    });

    res.status(201).json({
      deduplicated: false,
      sale: createdSale,
      items: createdItems,
      payments: createdPayments,
    });
  } catch (error) {
    console.error('POST /api/pos/checkout failed:', error);
    res.status(500).json({ error: 'Gagal memproses checkout transaksi.' });
  }
});

// Sales & Payments List + Verification / Reconciliation / Refund / Void
router.get('/payments', requirePermission('payments.view'), async (req: AuthRequest, res: Response) => {
  try {
    const allOutlets = await db.select().from(outlets);
    const allowedIds = getAllowedOutletIds(req, allOutlets);
    const reqOutletId = req.query.outletId ? Number(req.query.outletId) : null;
    const targetOutletIds =
      reqOutletId && allowedIds.includes(reqOutletId) ? [reqOutletId] : allowedIds;

    if (targetOutletIds.length === 0) return res.json({ sales: [], payments: [], refunds: [] });

    const salesList = await db
      .select()
      .from(sales)
      .where(inArray(sales.outletId, targetOutletIds))
      .orderBy(desc(sales.createdAt));

    const saleIds = salesList.map((s) => s.id);
    const itemsList =
      saleIds.length > 0 ? await db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds)) : [];
    const paymentsList =
      saleIds.length > 0
        ? await db.select().from(payments).where(inArray(payments.saleId, saleIds)).orderBy(desc(payments.createdAt))
        : [];
    const refundsList =
      saleIds.length > 0 ? await db.select().from(refunds).where(inArray(refunds.saleId, saleIds)) : [];

    const outletMap = new Map(allOutlets.map((o) => [o.id, o.name]));
    const enrichedSales = salesList.map((s) => ({
      ...s,
      outletName: outletMap.get(s.outletId) || 'Outlet',
      items: itemsList.filter((it) => it.saleId === s.id),
      payments: paymentsList.filter((p) => p.saleId === s.id),
      refunds: refundsList.filter((r) => r.saleId === s.id),
    }));

    res.json({
      sales: enrichedSales,
      payments: paymentsList.map((p) => {
        const s = salesList.find((x) => x.id === p.saleId);
        return {
          ...p,
          receiptNumber: s?.receiptNumber || '',
          customerName: s?.customerName || '',
          cashierName: s?.cashierName || '',
          outletName: outletMap.get(p.outletId) || 'Outlet',
        };
      }),
      refunds: refundsList,
    });
  } catch (error) {
    console.error('GET /api/payments failed:', error);
    res.status(500).json({ error: 'Gagal memuat riwayat pembayaran.' });
  }
});

// Backend verification of Gateway Payment (simulates verified provider webhook callback)
router.post('/payments/:id/verify-gateway', requirePermission('payments.view'), async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = Number(req.params.id);
    const user = req.appUser!;
    const [biz] = await db.select().from(businesses).limit(1);
    const { outcome } = req.body as { outcome: 'success' | 'failed' | 'cancelled' };

    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment) return res.status(404).json({ error: 'Pembayaran tidak ditemukan.' });
    if (payment.providerStatus !== 'pending') {
      return res.status(400).json({ error: `Pembayaran sudah berstatus '${payment.providerStatus}'.` });
    }

    const now = new Date();
    const [updatedPayment] = await db
      .update(payments)
      .set({
        providerStatus: outcome,
        paidAt: outcome === 'success' ? now : null,
      })
      .where(eq(payments.id, paymentId))
      .returning();

    // Check all payment legs for this sale
    const siblingPayments = await db.select().from(payments).where(eq(payments.saleId, payment.saleId));
    const allSuccess = siblingPayments.every((p) => p.providerStatus === 'success');
    const anyFailed = siblingPayments.some(
      (p) => p.providerStatus === 'failed' || p.providerStatus === 'cancelled'
    );

    if (allSuccess) {
      await db.update(sales).set({ status: 'paid' }).where(eq(sales.id, payment.saleId));
      await deductRecipeStockForSale(payment.saleId, payment.outletId, user.uid);
    } else if (anyFailed) {
      await db.update(sales).set({ status: 'failed' }).where(eq(sales.id, payment.saleId));
    }

    await writeAudit({
      businessId: biz.id,
      outletId: payment.outletId,
      req,
      action: `PAYMENT_GATEWAY_${outcome.toUpperCase()}`,
      entityType: 'payment',
      entityId: paymentId,
      details: { saleId: payment.saleId, referenceNumber: payment.referenceNumber, outcome },
    });

    res.json({ payment: updatedPayment, salePaid: allSuccess });
  } catch (error) {
    console.error('POST /api/payments/:id/verify-gateway failed:', error);
    res.status(500).json({ error: 'Gagal memverifikasi status pembayaran gateway.' });
  }
});

// Non-cash reconciliation
router.patch('/payments/:id/reconcile', requirePermission('payments.reconcile'), async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = Number(req.params.id);
    const [biz] = await db.select().from(businesses).limit(1);
    const { reconciled } = req.body;
    const [updated] = await db
      .update(payments)
      .set({
        reconciled: Boolean(reconciled),
        reconciledAt: reconciled ? new Date() : null,
      })
      .where(eq(payments.id, paymentId))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Data pembayaran tidak ditemukan.' });

    await writeAudit({
      businessId: biz.id,
      outletId: updated.outletId,
      req,
      action: reconciled ? 'PAYMENT_RECONCILED' : 'PAYMENT_UNRECONCILED',
      entityType: 'payment',
      entityId: paymentId,
      details: { method: updated.method, referenceNumber: updated.referenceNumber, amount: updated.amount },
    });

    res.json(updated);
  } catch (error) {
    console.error('PATCH /api/payments/:id/reconcile failed:', error);
    res.status(500).json({ error: 'Gagal memperbarui status rekonsiliasi.' });
  }
});

// Void or Refund Sale (Authorization + Audit Trail)
router.post('/sales/:id/void-refund', requirePermission('pos.void_refund'), async (req: AuthRequest, res: Response) => {
  try {
    const saleId = Number(req.params.id);
    const user = req.appUser!;
    const [biz] = await db.select().from(businesses).limit(1);
    const { actionType, reason } = req.body as { actionType: 'void' | 'refund'; reason: string };

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Alasan pembatalan/refund wajib diisi untuk jejak audit.' });
    }

    const [sale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
    if (!sale) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
    if (sale.status === 'voided' || sale.status === 'refunded') {
      return res.status(400).json({ error: `Transaksi sudah berstatus '${sale.status}'.` });
    }

    const newSaleStatus = actionType === 'void' ? 'voided' : 'refunded';
    const newPayStatus = actionType === 'void' ? 'cancelled' : 'refunded';

    const [updatedSale] = await db
      .update(sales)
      .set({
        status: newSaleStatus,
        voidReason: reason.trim(),
        authorizedByUid: user.uid,
      })
      .where(eq(sales.id, saleId))
      .returning();

    const salePayments = await db.select().from(payments).where(eq(payments.saleId, saleId));
    await db
      .update(payments)
      .set({ providerStatus: newPayStatus })
      .where(eq(payments.saleId, saleId));

    if (actionType === 'refund' && sale.status === 'paid') {
      await db.insert(refunds).values({
        saleId,
        paymentId: salePayments[0]?.id ?? null,
        amount: sale.totalAmount,
        reason: reason.trim(),
        authorizedByUid: user.uid,
        authorizedByName: user.fullName,
      });
    }

    await writeAudit({
      businessId: biz.id,
      outletId: sale.outletId,
      req,
      action: actionType === 'void' ? 'SALE_VOIDED' : 'SALE_REFUNDED',
      entityType: 'sale',
      entityId: saleId,
      details: { receiptNumber: sale.receiptNumber, amount: sale.totalAmount, reason: reason.trim() },
    });

    res.json({ sale: updatedSale });
  } catch (error) {
    console.error('POST /api/sales/:id/void-refund failed:', error);
    res.status(500).json({ error: 'Gagal memproses pembatalan/refund transaksi.' });
  }
});

// 6. Inventory & Stock Movements
router.get('/inventory', requirePermission('inventory.view'), async (req: AuthRequest, res: Response) => {
  try {
    const allOutlets = await db.select().from(outlets);
    const allowedIds = getAllowedOutletIds(req, allOutlets);
    const reqOutletId = req.query.outletId ? Number(req.query.outletId) : null;
    const targetOutletIds =
      reqOutletId && allowedIds.includes(reqOutletId) ? [reqOutletId] : allowedIds;

    const ingList = await db.select().from(ingredients).orderBy(ingredients.id);
    const balList =
      targetOutletIds.length > 0
        ? await db
            .select()
            .from(inventoryBalances)
            .where(inArray(inventoryBalances.outletId, targetOutletIds))
        : [];
    const movements =
      targetOutletIds.length > 0
        ? await db
            .select()
            .from(stockMovements)
            .where(inArray(stockMovements.outletId, targetOutletIds))
            .orderBy(desc(stockMovements.createdAt))
            .limit(80)
        : [];

    const outletMap = new Map(allOutlets.map((o) => [o.id, o.name]));
    const ingMap = new Map(ingList.map((i) => [i.id, i]));

    res.json({
      ingredients: ingList,
      balances: balList.map((b) => {
        const ing = ingMap.get(b.ingredientId);
        return {
          ...b,
          outletName: outletMap.get(b.outletId) || 'Outlet',
          ingredientName: ing?.name || '',
          sku: ing?.sku || '',
          unit: ing?.unit || '',
          purchaseUnit: ing?.purchaseUnit || '',
          conversionFactor: ing?.conversionFactor || 1,
          costPerUnit: ing?.costPerUnit || 0,
          minStock: ing?.minStock || 0,
          isLow: ing ? b.quantity <= ing.minStock : false,
        };
      }),
      movements: movements.map((m) => ({
        ...m,
        outletName: outletMap.get(m.outletId) || 'Outlet',
        ingredientName: ingMap.get(m.ingredientId)?.name || '',
        unit: ingMap.get(m.ingredientId)?.unit || '',
      })),
    });
  } catch (error) {
    console.error('GET /api/inventory failed:', error);
    res.status(500).json({ error: 'Gagal memuat data stok bahan baku.' });
  }
});

router.post('/ingredients', requirePermission('inventory.adjust'), async (req: AuthRequest, res: Response) => {
  try {
    const [biz] = await db.select().from(businesses).limit(1);
    const { sku, name, unit, purchaseUnit, conversionFactor, costPerUnit, minStock } = req.body;
    if (!sku || !name || !unit) {
      return res.status(400).json({ error: 'SKU, nama bahan, dan satuan wajib diisi.' });
    }
    const [created] = await db
      .insert(ingredients)
      .values({
        businessId: biz.id,
        sku: String(sku).trim().toUpperCase(),
        name: String(name).trim(),
        unit: String(unit).trim(),
        purchaseUnit: String(purchaseUnit || unit).trim(),
        conversionFactor: Number(conversionFactor || 1),
        costPerUnit: Number(costPerUnit || 0),
        minStock: Number(minStock || 0),
      })
      .returning();

    const allOutlets = await db.select().from(outlets);
    if (allOutlets.length > 0) {
      await db.insert(inventoryBalances).values(
        allOutlets.map((o) => ({
          outletId: o.id,
          ingredientId: created.id,
          quantity: 0,
        }))
      );
    }

    await writeAudit({
      businessId: biz.id,
      req,
      action: 'INGREDIENT_CREATED',
      entityType: 'ingredient',
      entityId: created.id,
      details: { sku: created.sku, name: created.name },
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('POST /api/ingredients failed:', error);
    res.status(500).json({ error: 'Gagal menambahkan bahan baku.' });
  }
});

router.post('/inventory/movement', requirePermission('inventory.adjust'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.appUser!;
    const [biz] = await db.select().from(businesses).limit(1);
    const { outletId, ingredientId, movementType, quantity, notes } = req.body as {
      outletId: number;
      ingredientId: number;
      movementType: 'in' | 'out' | 'adjustment';
      quantity: number;
      notes?: string;
    };

    if (!outletId || !ingredientId || quantity === undefined) {
      return res.status(400).json({ error: 'Outlet, bahan baku, dan kuantitas wajib diisi.' });
    }

    const [bal] = await db
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.outletId, Number(outletId)),
          eq(inventoryBalances.ingredientId, Number(ingredientId))
        )
      )
      .limit(1);

    const currentQty = bal?.quantity ?? 0;
    let delta = Number(quantity);
    let nextQty = currentQty;

    if (movementType === 'in') {
      delta = Math.abs(delta);
      nextQty = currentQty + delta;
    } else if (movementType === 'out') {
      delta = -Math.abs(delta);
      nextQty = Math.max(0, currentQty + delta);
    } else if (movementType === 'adjustment') {
      nextQty = Math.max(0, Number(quantity));
      delta = nextQty - currentQty;
    }

    if (bal) {
      await db
        .update(inventoryBalances)
        .set({ quantity: nextQty, updatedAt: new Date() })
        .where(eq(inventoryBalances.id, bal.id));
    } else {
      await db.insert(inventoryBalances).values({
        outletId: Number(outletId),
        ingredientId: Number(ingredientId),
        quantity: nextQty,
      });
    }

    const [mov] = await db
      .insert(stockMovements)
      .values({
        outletId: Number(outletId),
        ingredientId: Number(ingredientId),
        movementType,
        quantityDelta: delta,
        unitCost: 0,
        referenceType: 'manual',
        referenceId: '',
        notes: String(notes || '').trim(),
        createdByUid: user.uid,
      })
      .returning();

    await writeAudit({
      businessId: biz.id,
      outletId: Number(outletId),
      req,
      action: `STOCK_${movementType.toUpperCase()}`,
      entityType: 'inventory',
      entityId: ingredientId,
      details: { delta, nextQty, notes },
    });

    res.status(201).json(mov);
  } catch (error) {
    console.error('POST /api/inventory/movement failed:', error);
    res.status(500).json({ error: 'Gagal mencatat pergerakan stok.' });
  }
});

router.post('/inventory/transfer', requirePermission('inventory.adjust'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.appUser!;
    const [biz] = await db.select().from(businesses).limit(1);
    const { fromOutletId, toOutletId, ingredientId, quantity, notes } = req.body;
    const qty = Math.abs(Number(quantity || 0));
    if (!fromOutletId || !toOutletId || fromOutletId === toOutletId || !ingredientId || qty <= 0) {
      return res.status(400).json({ error: 'Outlet asal, outlet tujuan berbeda, bahan, dan jumlah > 0 wajib diisi.' });
    }

    const [srcBal] = await db
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.outletId, Number(fromOutletId)),
          eq(inventoryBalances.ingredientId, Number(ingredientId))
        )
      )
      .limit(1);

    if (!srcBal || srcBal.quantity < qty) {
      return res.status(400).json({ error: 'Stok pada outlet asal tidak mencukupi untuk transfer.' });
    }

    const [dstBal] = await db
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.outletId, Number(toOutletId)),
          eq(inventoryBalances.ingredientId, Number(ingredientId))
        )
      )
      .limit(1);

    await db
      .update(inventoryBalances)
      .set({ quantity: srcBal.quantity - qty, updatedAt: new Date() })
      .where(eq(inventoryBalances.id, srcBal.id));

    if (dstBal) {
      await db
        .update(inventoryBalances)
        .set({ quantity: dstBal.quantity + qty, updatedAt: new Date() })
        .where(eq(inventoryBalances.id, dstBal.id));
    } else {
      await db.insert(inventoryBalances).values({
        outletId: Number(toOutletId),
        ingredientId: Number(ingredientId),
        quantity: qty,
      });
    }

    const ref = `TRF-${Date.now().toString().slice(-6)}`;
    await db.insert(stockMovements).values([
      {
        outletId: Number(fromOutletId),
        ingredientId: Number(ingredientId),
        movementType: 'transfer_out',
        quantityDelta: -qty,
        referenceType: 'transfer',
        referenceId: ref,
        notes: notes || `Transfer ke outlet #${toOutletId}`,
        createdByUid: user.uid,
      },
      {
        outletId: Number(toOutletId),
        ingredientId: Number(ingredientId),
        movementType: 'transfer_in',
        quantityDelta: qty,
        referenceType: 'transfer',
        referenceId: ref,
        notes: notes || `Transfer dari outlet #${fromOutletId}`,
        createdByUid: user.uid,
      },
    ]);

    await writeAudit({
      businessId: biz.id,
      outletId: Number(fromOutletId),
      req,
      action: 'STOCK_TRANSFERRED',
      entityType: 'inventory',
      entityId: ingredientId,
      details: { fromOutletId, toOutletId, qty, ref },
    });

    res.status(201).json({ success: true, ref });
  } catch (error) {
    console.error('POST /api/inventory/transfer failed:', error);
    res.status(500).json({ error: 'Gagal memproses transfer stok antar-outlet.' });
  }
});

// 7. Suppliers & Purchase Orders
router.get('/procurement', requirePermission('procurement.view'), async (req: AuthRequest, res: Response) => {
  try {
    const allOutlets = await db.select().from(outlets);
    const allowedIds = getAllowedOutletIds(req, allOutlets);
    const suppList = await db.select().from(suppliers).orderBy(suppliers.id);
    const poList =
      allowedIds.length > 0
        ? await db
            .select()
            .from(purchaseOrders)
            .where(inArray(purchaseOrders.outletId, allowedIds))
            .orderBy(desc(purchaseOrders.createdAt))
        : [];
    const poIds = poList.map((p) => p.id);
    const poItems =
      poIds.length > 0
        ? await db.select().from(purchaseOrderItems).where(inArray(purchaseOrderItems.poId, poIds))
        : [];
    const ingList = await db.select().from(ingredients);
    const ingMap = new Map(ingList.map((i) => [i.id, i]));
    const suppMap = new Map(suppList.map((s) => [s.id, s.name]));
    const outletMap = new Map(allOutlets.map((o) => [o.id, o.name]));

    res.json({
      suppliers: suppList,
      purchaseOrders: poList.map((po) => ({
        ...po,
        supplierName: suppMap.get(po.supplierId) || 'Supplier',
        outletName: outletMap.get(po.outletId) || 'Outlet',
        items: poItems
          .filter((it) => it.poId === po.id)
          .map((it) => ({
            ...it,
            ingredientName: ingMap.get(it.ingredientId)?.name || '',
            unit: ingMap.get(it.ingredientId)?.unit || '',
          })),
      })),
    });
  } catch (error) {
    console.error('GET /api/procurement failed:', error);
    res.status(500).json({ error: 'Gagal memuat data supplier dan pembelian.' });
  }
});

router.post('/suppliers', requirePermission('procurement.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const [biz] = await db.select().from(businesses).limit(1);
    const { name, contactPerson, phone, email, address, category } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama supplier wajib diisi.' });
    const [created] = await db
      .insert(suppliers)
      .values({
        businessId: biz.id,
        name: String(name).trim(),
        contactPerson: String(contactPerson || '').trim(),
        phone: String(phone || '').trim(),
        email: String(email || '').trim(),
        address: String(address || '').trim(),
        category: String(category || 'Bahan Baku').trim(),
      })
      .returning();
    res.status(201).json(created);
  } catch (error) {
    console.error('POST /api/suppliers failed:', error);
    res.status(500).json({ error: 'Gagal menambahkan supplier.' });
  }
});

router.post('/purchase-orders', requirePermission('procurement.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.appUser!;
    const [biz] = await db.select().from(businesses).limit(1);
    const { outletId, supplierId, notes, items } = req.body as {
      outletId: number;
      supplierId: number;
      notes?: string;
      items: Array<{ ingredientId: number; quantity: number; unitCost: number }>;
    };
    if (!outletId || !supplierId || !items?.length) {
      return res.status(400).json({ error: 'Outlet, supplier, dan item pembelian wajib diisi.' });
    }
    const totalAmount = items.reduce((acc, it) => acc + Number(it.quantity) * Number(it.unitCost), 0);
    const poNumber = `PO-${new Date().toISOString().slice(0, 7).replace('-', '')}-${Date.now().toString().slice(-4)}`;

    const [createdPo] = await db
      .insert(purchaseOrders)
      .values({
        businessId: biz.id,
        outletId: Number(outletId),
        supplierId: Number(supplierId),
        poNumber,
        status: 'ordered',
        totalAmount,
        notes: String(notes || '').trim(),
        orderedByUid: user.uid,
      })
      .returning();

    await db.insert(purchaseOrderItems).values(
      items.map((it) => ({
        poId: createdPo.id,
        ingredientId: Number(it.ingredientId),
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
        receivedQty: 0,
      }))
    );

    await writeAudit({
      businessId: biz.id,
      outletId: Number(outletId),
      req,
      action: 'PO_CREATED',
      entityType: 'purchase_order',
      entityId: createdPo.id,
      details: { poNumber, totalAmount },
    });

    res.status(201).json(createdPo);
  } catch (error) {
    console.error('POST /api/purchase-orders failed:', error);
    res.status(500).json({ error: 'Gagal membuat purchase order.' });
  }
});

router.post('/purchase-orders/:id/receive', requirePermission('procurement.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const poId = Number(req.params.id);
    const user = req.appUser!;
    const [biz] = await db.select().from(businesses).limit(1);

    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
    if (!po) return res.status(404).json({ error: 'Purchase order tidak ditemukan.' });
    if (po.status === 'received') {
      return res.status(400).json({ error: 'Barang untuk PO ini sudah diterima sebelumnya.' });
    }

    const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
    for (const item of items) {
      await db
        .update(purchaseOrderItems)
        .set({ receivedQty: item.quantity })
        .where(eq(purchaseOrderItems.id, item.id));

      const [bal] = await db
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.outletId, po.outletId),
            eq(inventoryBalances.ingredientId, item.ingredientId)
          )
        )
        .limit(1);

      if (bal) {
        await db
          .update(inventoryBalances)
          .set({ quantity: bal.quantity + item.quantity, updatedAt: new Date() })
          .where(eq(inventoryBalances.id, bal.id));
      } else {
        await db.insert(inventoryBalances).values({
          outletId: po.outletId,
          ingredientId: item.ingredientId,
          quantity: item.quantity,
        });
      }

      await db.insert(stockMovements).values({
        outletId: po.outletId,
        ingredientId: item.ingredientId,
        movementType: 'in',
        quantityDelta: item.quantity,
        unitCost: item.unitCost,
        referenceType: 'purchase_order',
        referenceId: po.poNumber,
        notes: `Penerimaan barang PO ${po.poNumber}`,
        createdByUid: user.uid,
      });
    }

    const [updatedPo] = await db
      .update(purchaseOrders)
      .set({ status: 'received', receivedAt: new Date() })
      .where(eq(purchaseOrders.id, poId))
      .returning();

    await writeAudit({
      businessId: biz.id,
      outletId: po.outletId,
      req,
      action: 'PO_RECEIVED',
      entityType: 'purchase_order',
      entityId: poId,
      details: { poNumber: po.poNumber, totalAmount: po.totalAmount },
    });

    res.json(updatedPo);
  } catch (error) {
    console.error('POST /api/purchase-orders/:id/receive failed:', error);
    res.status(500).json({ error: 'Gagal memproses penerimaan barang.' });
  }
});

// 8. Employees, RBAC, & Audit Logs
router.get('/employees', requirePermission('employees.view'), async (req: AuthRequest, res: Response) => {
  try {
    const allUsers = await db.select().from(users).orderBy(users.id);
    const allOutlets = await db.select().from(outlets);
    const outletMap = new Map(allOutlets.map((o) => [o.id, o.name]));
    const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(60);

    res.json({
      employees: allUsers.map((u) => ({
        ...u,
        outletName: u.assignedOutletId ? outletMap.get(u.assignedOutletId) || 'Outlet' : 'Semua Outlet (Pusat)',
      })),
      auditLogs: logs,
    });
  } catch (error) {
    console.error('GET /api/employees failed:', error);
    res.status(500).json({ error: 'Gagal memuat data karyawan dan audit log.' });
  }
});

router.post('/employees', requirePermission('employees.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const [biz] = await db.select().from(businesses).limit(1);
    const { email, fullName, phone, role, assignedOutletId } = req.body;
    if (!email || !fullName || !role) {
      return res.status(400).json({ error: 'Email, nama lengkap, dan peran wajib diisi.' });
    }
    const [created] = await db
      .insert(users)
      .values({
        uid: `staff_${Date.now()}`,
        email: String(email).trim(),
        fullName: String(fullName).trim(),
        phone: String(phone || '').trim(),
        role: String(role),
        assignedOutletId: assignedOutletId ? Number(assignedOutletId) : null,
        isActive: true,
      })
      .returning();

    await writeAudit({
      businessId: biz.id,
      outletId: created.assignedOutletId,
      req,
      action: 'EMPLOYEE_ADDED',
      entityType: 'user',
      entityId: created.id,
      details: { email: created.email, role: created.role },
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('POST /api/employees failed:', error);
    res.status(500).json({ error: 'Gagal menambahkan karyawan.' });
  }
});

router.patch('/employees/:id', requirePermission('employees.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.params.id);
    const [biz] = await db.select().from(businesses).limit(1);
    const { role, assignedOutletId, isActive, fullName, phone } = req.body;

    const [updated] = await db
      .update(users)
      .set({
        ...(role !== undefined ? { role } : {}),
        ...(assignedOutletId !== undefined
          ? { assignedOutletId: assignedOutletId ? Number(assignedOutletId) : null }
          : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        ...(fullName !== undefined ? { fullName } : {}),
        ...(phone !== undefined ? { phone } : {}),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

    await writeAudit({
      businessId: biz.id,
      outletId: updated.assignedOutletId,
      req,
      action: 'EMPLOYEE_UPDATED',
      entityType: 'user',
      entityId: updated.id,
      details: { role: updated.role, assignedOutletId: updated.assignedOutletId, isActive: updated.isActive },
    });

    res.json(updated);
  } catch (error) {
    console.error('PATCH /api/employees/:id failed:', error);
    res.status(500).json({ error: 'Gagal memperbarui peran/akses karyawan.' });
  }
});

// 9. Franchise Management
router.get('/franchise', requirePermission('franchise.view'), async (req: AuthRequest, res: Response) => {
  try {
    const allOutlets = await db.select().from(outlets);
    const allowedIds = getAllowedOutletIds(req, allOutlets);
    const partners = await db.select().from(franchisePartners).orderBy(franchisePartners.id);
    const visiblePartners = partners.filter((p) => !p.outletId || allowedIds.includes(p.outletId));
    const partnerIds = visiblePartners.map((p) => p.id);

    const royalties =
      partnerIds.length > 0
        ? await db
            .select()
            .from(royaltyObligations)
            .where(inArray(royaltyObligations.partnerId, partnerIds))
            .orderBy(desc(royaltyObligations.createdAt))
        : [];

    const outletMap = new Map(allOutlets.map((o) => [o.id, o]));
    const paidSales = await db.select().from(sales).where(eq(sales.status, 'paid'));

    res.json({
      partners: visiblePartners.map((p) => {
        const outlet = p.outletId ? outletMap.get(p.outletId) : null;
        const outletRevenue = paidSales
          .filter((s) => s.outletId === p.outletId)
          .reduce((acc, s) => acc + s.totalAmount, 0);
        return {
          ...p,
          outletName: outlet?.name || 'Belum terhubung',
          outletCity: outlet?.city || '',
          currentOutletRevenue: outletRevenue,
        };
      }),
      royalties: royalties.map((r) => {
        const partner = visiblePartners.find((p) => p.id === r.partnerId);
        const outlet = r.outletId ? outletMap.get(r.outletId) : null;
        return {
          ...r,
          partnerName: partner?.partnerName || '',
          companyName: partner?.companyName || '',
          outletName: outlet?.name || '',
        };
      }),
    });
  } catch (error) {
    console.error('GET /api/franchise failed:', error);
    res.status(500).json({ error: 'Gagal memuat data mitra franchise.' });
  }
});

router.post('/franchise/partners', requirePermission('franchise.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const [biz] = await db.select().from(businesses).limit(1);
    const {
      outletId,
      partnerName,
      companyName,
      contactEmail,
      contactPhone,
      contractNumber,
      contractStart,
      contractEnd,
      initialFee,
      royaltyType,
      royaltyValue,
    } = req.body;

    if (!partnerName || !companyName || !contractNumber) {
      return res.status(400).json({ error: 'Nama mitra, badan usaha, dan nomor kontrak wajib diisi.' });
    }

    const [created] = await db
      .insert(franchisePartners)
      .values({
        businessId: biz.id,
        outletId: outletId ? Number(outletId) : null,
        partnerName: String(partnerName).trim(),
        companyName: String(companyName).trim(),
        contactEmail: String(contactEmail || '').trim(),
        contactPhone: String(contactPhone || '').trim(),
        contractNumber: String(contractNumber).trim().toUpperCase(),
        contractStart: String(contractStart || new Date().toISOString().slice(0, 10)),
        contractEnd: String(contractEnd || '2030-12-31'),
        initialFee: Number(initialFee || 0),
        royaltyType: String(royaltyType || 'percentage_gross'),
        royaltyValue: Number(royaltyValue || 5),
        status: 'active',
      })
      .returning();

    if (outletId) {
      await db.update(outlets).set({ isFranchise: true }).where(eq(outlets.id, Number(outletId)));
    }

    await writeAudit({
      businessId: biz.id,
      outletId: outletId ? Number(outletId) : null,
      req,
      action: 'FRANCHISE_PARTNER_CREATED',
      entityType: 'franchise_partner',
      entityId: created.id,
      details: { contractNumber: created.contractNumber, partnerName: created.partnerName },
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('POST /api/franchise/partners failed:', error);
    res.status(500).json({ error: 'Gagal mendaftarkan mitra franchise.' });
  }
});

router.post('/franchise/calculate-royalty', requirePermission('franchise.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const [biz] = await db.select().from(businesses).limit(1);
    const periodMonth = String(req.body.periodMonth || new Date().toISOString().slice(0, 7));
    const partners = await db.select().from(franchisePartners).where(eq(franchisePartners.status, 'active'));
    const paidSales = await db.select().from(sales).where(eq(sales.status, 'paid'));

    const createdList = [];
    for (const partner of partners) {
      if (!partner.outletId) continue;
      const monthSales = paidSales.filter(
        (s) =>
          s.outletId === partner.outletId &&
          new Date(s.createdAt).toISOString().slice(0, 7) === periodMonth
      );
      const grossSales = monthSales.reduce((acc, s) => acc + s.totalAmount, 0);
      const calculatedFee =
        partner.royaltyType === 'fixed_monthly'
          ? partner.royaltyValue
          : Math.round((grossSales * partner.royaltyValue) / 100);

      const [existing] = await db
        .select()
        .from(royaltyObligations)
        .where(
          and(
            eq(royaltyObligations.partnerId, partner.id),
            eq(royaltyObligations.periodMonth, periodMonth)
          )
        )
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(royaltyObligations)
          .set({ grossSales, calculatedFee })
          .where(eq(royaltyObligations.id, existing.id))
          .returning();
        createdList.push(updated);
      } else {
        const [inserted] = await db
          .insert(royaltyObligations)
          .values({
            partnerId: partner.id,
            outletId: partner.outletId,
            periodMonth,
            grossSales,
            calculatedFee,
            status: 'unpaid',
            notes: `Perhitungan royalty periode ${periodMonth}`,
          })
          .returning();
        createdList.push(inserted);
      }
    }

    await writeAudit({
      businessId: biz.id,
      req,
      action: 'ROYALTY_CALCULATED',
      entityType: 'royalty',
      entityId: periodMonth,
      details: { periodMonth, partnerCount: createdList.length },
    });

    res.json({ periodMonth, obligations: createdList });
  } catch (error) {
    console.error('POST /api/franchise/calculate-royalty failed:', error);
    res.status(500).json({ error: 'Gagal menghitung kewajiban royalty.' });
  }
});

router.post('/franchise/royalties/:id/pay', requirePermission('franchise.manage'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [biz] = await db.select().from(businesses).limit(1);
    const [updated] = await db
      .update(royaltyObligations)
      .set({ status: 'paid', paidAt: new Date() })
      .where(eq(royaltyObligations.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Tagihan royalty tidak ditemukan.' });

    await writeAudit({
      businessId: biz.id,
      outletId: updated.outletId,
      req,
      action: 'ROYALTY_PAID',
      entityType: 'royalty',
      entityId: id,
      details: { periodMonth: updated.periodMonth, amount: updated.calculatedFee },
    });

    res.json(updated);
  } catch (error) {
    console.error('POST /api/franchise/royalties/:id/pay failed:', error);
    res.status(500).json({ error: 'Gagal menandai pembayaran royalty.' });
  }
});

// 10. Reports & Expenses
router.get('/reports', requirePermission('reports.view'), async (req: AuthRequest, res: Response) => {
  try {
    const allOutlets = await db.select().from(outlets);
    const allowedIds = getAllowedOutletIds(req, allOutlets);
    const reqOutletId = req.query.outletId ? Number(req.query.outletId) : null;
    const targetOutletIds =
      reqOutletId && allowedIds.includes(reqOutletId) ? [reqOutletId] : allowedIds;

    const salesList =
      targetOutletIds.length > 0
        ? await db
            .select()
            .from(sales)
            .where(inArray(sales.outletId, targetOutletIds))
            .orderBy(desc(sales.createdAt))
        : [];
    const paidSales = salesList.filter((s) => s.status === 'paid');
    const paidSaleIds = paidSales.map((s) => s.id);
    const itemsList =
      paidSaleIds.length > 0
        ? await db.select().from(saleItems).where(inArray(saleItems.saleId, paidSaleIds))
        : [];
    const expList =
      targetOutletIds.length > 0
        ? await db
            .select()
            .from(expenses)
            .where(inArray(expenses.outletId, targetOutletIds))
            .orderBy(desc(expenses.expenseDate))
        : [];
    const poList =
      targetOutletIds.length > 0
        ? await db
            .select()
            .from(purchaseOrders)
            .where(and(inArray(purchaseOrders.outletId, targetOutletIds), eq(purchaseOrders.status, 'received')))
        : [];

    const outletMap = new Map(allOutlets.map((o) => [o.id, o.name]));

    // By Product
    const byProductMap = new Map<
      number,
      { productId: number; productName: string; qty: number; revenue: number; hpp: number }
    >();
    for (const it of itemsList) {
      const cur = byProductMap.get(it.productId) || {
        productId: it.productId,
        productName: it.productName,
        qty: 0,
        revenue: 0,
        hpp: 0,
      };
      cur.qty += it.quantity;
      cur.revenue += it.lineTotal;
      cur.hpp += it.estimatedHpp;
      byProductMap.set(it.productId, cur);
    }

    // By Cashier
    const byCashierMap = new Map<
      string,
      { cashierUid: string; cashierName: string; transactions: number; revenue: number }
    >();
    for (const s of paidSales) {
      const cur = byCashierMap.get(s.cashierUid) || {
        cashierUid: s.cashierUid,
        cashierName: s.cashierName,
        transactions: 0,
        revenue: 0,
      };
      cur.transactions += 1;
      cur.revenue += s.totalAmount;
      byCashierMap.set(s.cashierUid, cur);
    }

    const grossSales = paidSales.reduce((acc, s) => acc + s.subtotal, 0);
    const totalDiscounts = paidSales.reduce((acc, s) => acc + s.discountAmount, 0);
    const totalTax = paidSales.reduce((acc, s) => acc + s.taxAmount, 0);
    const netSales = paidSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const totalHpp = itemsList.reduce((acc, it) => acc + it.estimatedHpp, 0);
    const totalOpex = expList.reduce((acc, e) => acc + e.amount, 0);
    const totalPurchases = poList.reduce((acc, p) => acc + p.totalAmount, 0);

    res.json({
      pnl: {
        grossSales,
        totalDiscounts,
        totalTax,
        netSales,
        totalHpp,
        grossProfit: grossSales - totalDiscounts - totalHpp,
        totalOpex,
        estimatedNetProfit: grossSales - totalDiscounts - totalHpp - totalOpex,
        totalPurchases,
      },
      salesByProduct: Array.from(byProductMap.values()).sort((a, b) => b.revenue - a.revenue),
      salesByCashier: Array.from(byCashierMap.values()).sort((a, b) => b.revenue - a.revenue),
      expenses: expList.map((e) => ({ ...e, outletName: outletMap.get(e.outletId) || 'Outlet' })),
    });
  } catch (error) {
    console.error('GET /api/reports failed:', error);
    res.status(500).json({ error: 'Gagal menyusun laporan bisnis.' });
  }
});

router.post('/expenses', requirePermission('reports.view'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.appUser!;
    const [biz] = await db.select().from(businesses).limit(1);
    const { outletId, category, description, amount, expenseDate } = req.body;
    if (!outletId || !category || !description || !amount) {
      return res.status(400).json({ error: 'Outlet, kategori, deskripsi, dan nominal wajib diisi.' });
    }
    const [created] = await db
      .insert(expenses)
      .values({
        businessId: biz.id,
        outletId: Number(outletId),
        category: String(category),
        description: String(description).trim(),
        amount: Number(amount),
        expenseDate: String(expenseDate || new Date().toISOString().slice(0, 10)),
        createdByUid: user.uid,
      })
      .returning();

    await writeAudit({
      businessId: biz.id,
      outletId: Number(outletId),
      req,
      action: 'EXPENSE_RECORDED',
      entityType: 'expense',
      entityId: created.id,
      details: { category, amount: created.amount, description: created.description },
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('POST /api/expenses failed:', error);
    res.status(500).json({ error: 'Gagal mencatat pengeluaran operasional.' });
  }
});

// 11. AI Business Assistant (Gemini API Server-Side, RBAC-scoped)
router.post('/ai/assistant', requirePermission('ai.assistant'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.appUser!;
    const { prompt, outletId } = req.body as { prompt: string; outletId?: number | null };
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Pertanyaan untuk asisten AI wajib diisi.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY belum dikonfigurasi pada server environment.',
      });
    }

    const allOutlets = await db.select().from(outlets);
    const allowedIds = getAllowedOutletIds(req, allOutlets);
    const targetIds = outletId && allowedIds.includes(Number(outletId)) ? [Number(outletId)] : allowedIds;

    const scopedOutlets = allOutlets.filter((o) => targetIds.includes(o.id));
    const scopedSales =
      targetIds.length > 0
        ? await db.select().from(sales).where(inArray(sales.outletId, targetIds)).orderBy(desc(sales.createdAt)).limit(100)
        : [];
    const paidSales = scopedSales.filter((s) => s.status === 'paid');
    const paidSaleIds = paidSales.map((s) => s.id);
    const scopedItems =
      paidSaleIds.length > 0 ? await db.select().from(saleItems).where(inArray(saleItems.saleId, paidSaleIds)) : [];
    const scopedPayments =
      targetIds.length > 0 ? await db.select().from(payments).where(inArray(payments.outletId, targetIds)) : [];
    const scopedBalances =
      targetIds.length > 0
        ? await db.select().from(inventoryBalances).where(inArray(inventoryBalances.outletId, targetIds))
        : [];
    const ingList = await db.select().from(ingredients);
    const ingMap = new Map(ingList.map((i) => [i.id, i]));
    const outletMap = new Map(allOutlets.map((o) => [o.id, o.name]));

    const lowStock = scopedBalances
      .filter((b) => {
        const ing = ingMap.get(b.ingredientId);
        return ing && b.quantity <= ing.minStock;
      })
      .map((b) => {
        const ing = ingMap.get(b.ingredientId)!;
        return {
          outlet: outletMap.get(b.outletId),
          bahan: ing.name,
          stok: `${b.quantity} ${ing.unit}`,
          minimum: `${ing.minStock} ${ing.unit}`,
        };
      });

    const businessSnapshot = {
      pengguna: { nama: user.fullName, peran: user.role },
      outletDiakses: scopedOutlets.map((o) => ({ id: o.id, nama: o.name, kota: o.city, franchise: o.isFranchise })),
      ringkasanPenjualan: {
        jumlahTransaksiLunas: paidSales.length,
        totalOmzetIdr: paidSales.reduce((a, s) => a + s.totalAmount, 0),
        totalEstimasiHppIdr: scopedItems.reduce((a, i) => a + i.estimatedHpp, 0),
        transaksiPendingGateway: scopedSales.filter((s) => s.status === 'pending_payment').length,
      },
      pembayaranBelumRekonsiliasi: scopedPayments.filter((p) => p.providerStatus === 'success' && !p.reconciled).length,
      stokMenipis: lowStock,
      produkTerlaris: Object.values(
        scopedItems.reduce<Record<string, { produk: string; terjual: number; omzet: number }>>((acc, it) => {
          if (!acc[it.productName]) {
            acc[it.productName] = { produk: it.productName, terjual: 0, omzet: 0 };
          }
          acc[it.productName].terjual += it.quantity;
          acc[it.productName].omzet += it.lineTotal;
          return acc;
        }, {})
      )
        .sort((a, b) => b.terjual - a.terjual)
        .slice(0, 6),
    };

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_ASSISTANT_MODEL,
      contents: prompt.trim(),
      config: {
        systemInstruction: `Anda adalah AI Business Assistant untuk aplikasi manajemen franchise dan kuliner KulinaHub.
Jawab dalam Bahasa Indonesia yang ringkas, profesional, terstruktur dengan angka Rupiah yang akurat, dan hanya berdasarkan data terotorisasi pengguna berikut:
${JSON.stringify(businessSnapshot)}

Aturan ketat:
1. Hanya analisis data dari outlet yang ada dalam snapshot di atas (sesuai hak akses peran '${user.role}').
2. Jangan pernah mengeksekusi transaksi finansial, refund, atau perubahan stok secara otomatis — selalu minta konfirmasi manual operator di modul terkait.
3. Berikan rekomendasi operasional yang konkret dan dapat ditindaklanjuti (restock bahan menipis, rekonsiliasi non-tunai, optimasi HPP/menu).`,
      },
    });

    res.json({
      reply: response.text || 'Tidak ada respons dari asisten AI.',
      scopedOutletCount: scopedOutlets.length,
    });
  } catch (error) {
    console.error('POST /api/ai/assistant failed:', error);
    res.status(500).json({ error: 'Gagal memproses permintaan ke AI Business Assistant.' });
  }
});

export default router;
