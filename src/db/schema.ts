import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';

export const businesses = pgTable('businesses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  legalName: text('legal_name').notNull(),
  taxRate: doublePrecision('tax_rate').notNull().default(11),
  serviceChargeRate: doublePrecision('service_charge_rate').notNull().default(0),
  currency: text('currency').notNull().default('IDR'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull().default(''),
  role: text('role').notNull().default('cashier'), // owner | head_office | outlet_manager | cashier | kitchen | warehouse | franchise_partner
  assignedOutletId: integer('assigned_outlet_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const outlets = pgTable('outlets', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  phone: text('phone').notNull().default(''),
  managerName: text('manager_name').notNull().default(''),
  status: text('status').notNull().default('active'), // active | inactive
  isFranchise: boolean('is_franchise').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const franchisePartners = pgTable('franchise_partners', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  outletId: integer('outlet_id').references(() => outlets.id),
  partnerName: text('partner_name').notNull(),
  companyName: text('company_name').notNull(),
  contactEmail: text('contact_email').notNull(),
  contactPhone: text('contact_phone').notNull(),
  contractNumber: text('contract_number').notNull().unique(),
  contractStart: text('contract_start').notNull(),
  contractEnd: text('contract_end').notNull(),
  initialFee: doublePrecision('initial_fee').notNull().default(0),
  royaltyType: text('royalty_type').notNull().default('percentage_gross'), // percentage_gross | fixed_monthly
  royaltyValue: doublePrecision('royalty_value').notNull().default(5),
  status: text('status').notNull().default('active'), // active | pending | expired
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const royaltyObligations = pgTable('royalty_obligations', {
  id: serial('id').primaryKey(),
  partnerId: integer('partner_id')
    .references(() => franchisePartners.id)
    .notNull(),
  outletId: integer('outlet_id').references(() => outlets.id),
  periodMonth: text('period_month').notNull(), // YYYY-MM
  grossSales: doublePrecision('gross_sales').notNull().default(0),
  calculatedFee: doublePrecision('calculated_fee').notNull().default(0),
  status: text('status').notNull().default('unpaid'), // unpaid | paid
  paidAt: timestamp('paid_at'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const productCategories = pgTable('product_categories', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  categoryId: integer('category_id').references(() => productCategories.id),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  basePrice: doublePrecision('base_price').notNull(),
  variantsJson: text('variants_json').notNull().default('[]'),
  modifiersJson: text('modifiers_json').notNull().default('[]'),
  isAvailable: boolean('is_available').notNull().default(true),
  accentTone: text('accent_tone').notNull().default('emerald'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const outletProducts = pgTable('outlet_products', {
  id: serial('id').primaryKey(),
  outletId: integer('outlet_id')
    .references(() => outlets.id)
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull(),
  customPrice: doublePrecision('custom_price'),
  isAvailable: boolean('is_available').notNull().default(true),
});

export const ingredients = pgTable('ingredients', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  unit: text('unit').notNull(), // gram | ml | pcs
  purchaseUnit: text('purchase_unit').notNull(), // kg | liter | pack
  conversionFactor: doublePrecision('conversion_factor').notNull().default(1000),
  costPerUnit: doublePrecision('cost_per_unit').notNull().default(0),
  minStock: doublePrecision('min_stock').notNull().default(500),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const inventoryBalances = pgTable('inventory_balances', {
  id: serial('id').primaryKey(),
  outletId: integer('outlet_id')
    .references(() => outlets.id)
    .notNull(),
  ingredientId: integer('ingredient_id')
    .references(() => ingredients.id)
    .notNull(),
  quantity: doublePrecision('quantity').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const stockMovements = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  outletId: integer('outlet_id')
    .references(() => outlets.id)
    .notNull(),
  ingredientId: integer('ingredient_id')
    .references(() => ingredients.id)
    .notNull(),
  movementType: text('movement_type').notNull(), // in | out | adjustment | transfer_in | transfer_out | sale_deduction
  quantityDelta: doublePrecision('quantity_delta').notNull(),
  unitCost: doublePrecision('unit_cost').notNull().default(0),
  referenceType: text('reference_type').notNull().default('manual'),
  referenceId: text('reference_id').notNull().default(''),
  notes: text('notes').notNull().default(''),
  createdByUid: text('created_by_uid').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const recipes = pgTable('recipes', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull()
    .unique(),
  yieldQty: doublePrecision('yield_qty').notNull().default(1),
  notes: text('notes').notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const recipeItems = pgTable('recipe_items', {
  id: serial('id').primaryKey(),
  recipeId: integer('recipe_id')
    .references(() => recipes.id)
    .notNull(),
  ingredientId: integer('ingredient_id')
    .references(() => ingredients.id)
    .notNull(),
  quantity: doublePrecision('quantity').notNull(),
});

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  name: text('name').notNull(),
  contactPerson: text('contact_person').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  address: text('address').notNull().default(''),
  category: text('category').notNull().default('Bahan Baku'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  outletId: integer('outlet_id')
    .references(() => outlets.id)
    .notNull(),
  supplierId: integer('supplier_id')
    .references(() => suppliers.id)
    .notNull(),
  poNumber: text('po_number').notNull().unique(),
  status: text('status').notNull().default('draft'), // draft | ordered | received | cancelled
  totalAmount: doublePrecision('total_amount').notNull().default(0),
  notes: text('notes').notNull().default(''),
  orderedByUid: text('ordered_by_uid').notNull(),
  receivedAt: timestamp('received_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: serial('id').primaryKey(),
  poId: integer('po_id')
    .references(() => purchaseOrders.id)
    .notNull(),
  ingredientId: integer('ingredient_id')
    .references(() => ingredients.id)
    .notNull(),
  quantity: doublePrecision('quantity').notNull(), // in base unit
  unitCost: doublePrecision('unit_cost').notNull(),
  receivedQty: doublePrecision('received_qty').notNull().default(0),
});

export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  outletId: integer('outlet_id')
    .references(() => outlets.id)
    .notNull(),
  receiptNumber: text('receipt_number').notNull().unique(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  cashierUid: text('cashier_uid').notNull(),
  cashierName: text('cashier_name').notNull(),
  customerName: text('customer_name').notNull().default('Pelanggan Umum'),
  orderType: text('order_type').notNull().default('dine_in'), // dine_in | takeaway | delivery
  subtotal: doublePrecision('subtotal').notNull(),
  discountAmount: doublePrecision('discount_amount').notNull().default(0),
  taxAmount: doublePrecision('tax_amount').notNull().default(0),
  serviceChargeAmount: doublePrecision('service_charge_amount').notNull().default(0),
  totalAmount: doublePrecision('total_amount').notNull(),
  status: text('status').notNull().default('pending_payment'), // pending_payment | paid | failed | voided | refunded
  voidReason: text('void_reason').notNull().default(''),
  authorizedByUid: text('authorized_by_uid').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const saleItems = pgTable('sale_items', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id')
    .references(() => sales.id)
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull(),
  productName: text('product_name').notNull(),
  variantName: text('variant_name').notNull().default(''),
  modifiersSummary: text('modifiers_summary').notNull().default(''),
  quantity: integer('quantity').notNull(),
  unitPrice: doublePrecision('unit_price').notNull(),
  lineTotal: doublePrecision('line_total').notNull(),
  estimatedHpp: doublePrecision('estimated_hpp').notNull().default(0),
});

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id')
    .references(() => sales.id)
    .notNull(),
  outletId: integer('outlet_id')
    .references(() => outlets.id)
    .notNull(),
  method: text('method').notNull(), // cash | qris | bank_transfer | ewallet_dana | ewallet_gopay | ewallet_ovo | ewallet_shopeepay | card
  channelMode: text('channel_mode').notNull().default('manual'), // manual | gateway
  amount: doublePrecision('amount').notNull(),
  cashTendered: doublePrecision('cash_tendered').notNull().default(0),
  changeAmount: doublePrecision('change_amount').notNull().default(0),
  referenceNumber: text('reference_number').notNull().default(''),
  providerStatus: text('provider_status').notNull().default('pending'), // pending | success | failed | cancelled | refunded
  reconciled: boolean('reconciled').notNull().default(false),
  reconciledAt: timestamp('reconciled_at'),
  cashierUid: text('cashier_uid').notNull(),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const refunds = pgTable('refunds', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id')
    .references(() => sales.id)
    .notNull(),
  paymentId: integer('payment_id').references(() => payments.id),
  amount: doublePrecision('amount').notNull(),
  reason: text('reason').notNull(),
  authorizedByUid: text('authorized_by_uid').notNull(),
  authorizedByName: text('authorized_by_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  outletId: integer('outlet_id')
    .references(() => outlets.id)
    .notNull(),
  category: text('category').notNull(), // rent | utilities | payroll | marketing | maintenance | other
  description: text('description').notNull(),
  amount: doublePrecision('amount').notNull(),
  expenseDate: text('expense_date').notNull(), // YYYY-MM-DD
  createdByUid: text('created_by_uid').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id)
    .notNull(),
  outletId: integer('outlet_id'),
  actorUid: text('actor_uid').notNull(),
  actorEmail: text('actor_email').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  detailsJson: text('details_json').notNull().default('{}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
