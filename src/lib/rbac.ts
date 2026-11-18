export type UserRole =
  | 'owner'
  | 'head_office'
  | 'outlet_manager'
  | 'cashier'
  | 'kitchen'
  | 'warehouse'
  | 'franchise_partner';

export type PermissionKey =
  | 'dashboard.view'
  | 'dashboard.financials'
  | 'outlets.view'
  | 'outlets.manage'
  | 'pos.operate'
  | 'pos.void_refund'
  | 'payments.view'
  | 'payments.reconcile'
  | 'products.view'
  | 'products.manage'
  | 'inventory.view'
  | 'inventory.adjust'
  | 'recipes.view'
  | 'recipes.manage'
  | 'procurement.view'
  | 'procurement.manage'
  | 'employees.view'
  | 'employees.manage'
  | 'reports.view'
  | 'reports.export'
  | 'franchise.view'
  | 'franchise.manage'
  | 'ai.assistant';

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner / Pemilik Usaha',
  head_office: 'Admin Pusat (Head Office)',
  outlet_manager: 'Manager Outlet',
  cashier: 'Kasir',
  kitchen: 'Staf Dapur',
  warehouse: 'Staf Gudang / Inventory',
  franchise_partner: 'Mitra Franchise',
};

export const ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  owner: [
    'dashboard.view',
    'dashboard.financials',
    'outlets.view',
    'outlets.manage',
    'pos.operate',
    'pos.void_refund',
    'payments.view',
    'payments.reconcile',
    'products.view',
    'products.manage',
    'inventory.view',
    'inventory.adjust',
    'recipes.view',
    'recipes.manage',
    'procurement.view',
    'procurement.manage',
    'employees.view',
    'employees.manage',
    'reports.view',
    'reports.export',
    'franchise.view',
    'franchise.manage',
    'ai.assistant',
  ],
  head_office: [
    'dashboard.view',
    'dashboard.financials',
    'outlets.view',
    'outlets.manage',
    'pos.operate',
    'pos.void_refund',
    'payments.view',
    'payments.reconcile',
    'products.view',
    'products.manage',
    'inventory.view',
    'inventory.adjust',
    'recipes.view',
    'recipes.manage',
    'procurement.view',
    'procurement.manage',
    'employees.view',
    'employees.manage',
    'reports.view',
    'reports.export',
    'franchise.view',
    'franchise.manage',
    'ai.assistant',
  ],
  outlet_manager: [
    'dashboard.view',
    'dashboard.financials',
    'outlets.view',
    'pos.operate',
    'pos.void_refund',
    'payments.view',
    'payments.reconcile',
    'products.view',
    'products.manage',
    'inventory.view',
    'inventory.adjust',
    'recipes.view',
    'procurement.view',
    'procurement.manage',
    'employees.view',
    'reports.view',
    'reports.export',
    'ai.assistant',
  ],
  cashier: [
    'dashboard.view',
    'outlets.view',
    'pos.operate',
    'payments.view',
    'products.view',
  ],
  kitchen: [
    'dashboard.view',
    'outlets.view',
    'products.view',
    'inventory.view',
    'recipes.view',
  ],
  warehouse: [
    'dashboard.view',
    'outlets.view',
    'inventory.view',
    'inventory.adjust',
    'procurement.view',
    'procurement.manage',
  ],
  franchise_partner: [
    'dashboard.view',
    'dashboard.financials',
    'outlets.view',
    'payments.view',
    'reports.view',
    'reports.export',
    'franchise.view',
    'ai.assistant',
  ],
};

export function hasPermission(role: string, permission: PermissionKey): boolean {
  const perms = ROLE_PERMISSIONS[role as UserRole];
  if (!perms) return false;
  return perms.includes(permission);
}

export function isGlobalRole(role: string): boolean {
  return role === 'owner' || role === 'head_office';
}
