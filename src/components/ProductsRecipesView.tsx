import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatIDR } from '../lib/format';

interface RecipeItemRow {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  costPerUnit: number;
  quantity: number;
  lineCost: number;
}

interface ProductRow {
  id: number;
  categoryId: number | null;
  sku: string;
  name: string;
  description: string;
  basePrice: number;
  effectivePrice: number;
  effectiveAvailable: boolean;
  estimatedHpp: number;
  variantsJson: string;
  modifiersJson: string;
  recipe: {
    id: number;
    yieldQty: number;
    notes: string;
    items: RecipeItemRow[];
  } | null;
}

interface CategoryRow {
  id: number;
  name: string;
}

interface IngredientRow {
  id: number;
  name: string;
  unit: string;
  costPerUnit: number;
}

export const ProductsRecipesView: React.FC = () => {
  const { activeOutletId, apiFetch, can } = useAuth();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProd, setNewProd] = useState({
    sku: '',
    name: '',
    categoryId: '',
    description: '',
    basePrice: '',
    variantsText: 'Regular:0, Large:6000',
    modifiersText: 'Extra Shot:6000',
  });

  const [recipeProduct, setRecipeProduct] = useState<ProductRow | null>(null);
  const [recipeItems, setRecipeItems] = useState<Array<{ ingredientId: number; quantity: number }>>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const q = activeOutletId ? `?outletId=${activeOutletId}` : '';
      const prodRes = await apiFetch<{ categories: CategoryRow[]; products: ProductRow[] }>(
        `/api/products${q}`
      );
      setCategories(prodRes.categories);
      setProducts(prodRes.products);

      if (can('inventory.view')) {
        const invRes = await apiFetch<{ ingredients: IngredientRow[] }>('/api/inventory');
        setIngredients(invRes.ingredients);
      }
    } finally {
      setLoading(false);
    }
  }, [activeOutletId, apiFetch, can]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const variants = newProd.variantsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((pair) => {
          const [n, d] = pair.split(':');
          return { name: n.trim(), priceDelta: Number(d || 0) };
        });
      const modifiers = newProd.modifiersText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((pair) => {
          const [n, p] = pair.split(':');
          return { name: n.trim(), price: Number(p || 0) };
        });

      await apiFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          sku: newProd.sku,
          name: newProd.name,
          categoryId: newProd.categoryId ? Number(newProd.categoryId) : categories[0]?.id,
          description: newProd.description,
          basePrice: Number(newProd.basePrice),
          variants,
          modifiers,
        }),
      });
      setShowAddProduct(false);
      setNewProd({
        sku: '',
        name: '',
        categoryId: '',
        description: '',
        basePrice: '',
        variantsText: 'Regular:0, Large:6000',
        modifiersText: '',
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (p: ProductRow) => {
    if (activeOutletId) {
      await apiFetch(`/api/products/${p.id}/outlet-override`, {
        method: 'PUT',
        body: JSON.stringify({
          outletId: activeOutletId,
          customPrice: p.effectivePrice !== p.basePrice ? p.effectivePrice : null,
          isAvailable: !p.effectiveAvailable,
        }),
      });
    } else {
      await apiFetch(`/api/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: !p.effectiveAvailable }),
      });
    }
    await load();
  };

  const openRecipeEditor = (p: ProductRow) => {
    setRecipeProduct(p);
    setRecipeItems(
      p.recipe?.items.map((it) => ({ ingredientId: it.ingredientId, quantity: it.quantity })) || [
        { ingredientId: ingredients[0]?.id || 1, quantity: 0 },
      ]
    );
  };

  const saveRecipe = async () => {
    if (!recipeProduct) return;
    try {
      setSaving(true);
      await apiFetch(`/api/products/${recipeProduct.id}/recipe`, {
        method: 'PUT',
        body: JSON.stringify({ yieldQty: 1, items: recipeItems }),
      });
      setRecipeProduct(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const liveEditedHpp = recipeItems.reduce((sum, it) => {
    const ing = ingredients.find((x) => x.id === Number(it.ingredientId));
    return sum + (ing?.costPerUnit || 0) * (Number(it.quantity) || 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            Produk, Menu, Resep &amp; Estimasi HPP
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola katalog menu, varian, modifier, ketersediaan per outlet, serta komposisi bahan baku dan HPP.
          </p>
        </div>

        {can('products.manage') && (
          <button
            type="button"
            onClick={() => setShowAddProduct(true)}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-2 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Menu Baru</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 font-medium">SKU &amp; Produk</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium text-right">Harga Jual</th>
                <th className="px-4 py-3 font-medium text-right">Estimasi HPP</th>
                <th className="px-4 py-3 font-medium text-right">Margin Kotor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Resep &amp; Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    Memuat katalog produk...
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const catName = categories.find((c) => c.id === p.categoryId)?.name || 'Umum';
                  const marginPct =
                    p.effectivePrice > 0
                      ? Math.round(((p.effectivePrice - p.estimatedHpp) / p.effectivePrice) * 100)
                      : 0;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{p.name}</p>
                        <p className="font-mono text-[11px] text-slate-400">{p.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{catName}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatIDR(p.effectivePrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {p.estimatedHpp > 0 ? formatIDR(p.estimatedHpp) : 'Belum diatur'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium tabular-nums text-emerald-700">
                        {p.estimatedHpp > 0 ? `${marginPct}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {can('products.manage') ? (
                          <button
                            type="button"
                            onClick={() => toggleAvailability(p)}
                            className={`text-xs font-medium cursor-pointer hover:underline ${
                              p.effectiveAvailable ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {p.effectiveAvailable ? 'Tersedia' : 'Nonaktif'}
                          </button>
                        ) : (
                          <span className={p.effectiveAvailable ? 'text-emerald-700' : 'text-slate-400'}>
                            {p.effectiveAvailable ? 'Tersedia' : 'Nonaktif'}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {can('recipes.manage') && (
                          <button
                            type="button"
                            onClick={() => openRecipeEditor(p)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Atur Resep ({p.recipe?.items.length || 0})</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={handleCreateProduct}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Tambah Produk Menu</h3>
              <button type="button" onClick={() => setShowAddProduct(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">SKU</label>
                <input
                  required
                  value={newProd.sku}
                  onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })}
                  placeholder="MNU-KP-009"
                  className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
                <select
                  value={newProd.categoryId}
                  onChange={(e) => setNewProd({ ...newProd, categoryId: e.target.value })}
                  className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Produk</label>
              <input
                required
                value={newProd.name}
                onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                placeholder="Es Kopi Pandan Latte"
                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Harga Jual Dasar (Rp)</label>
              <input
                required
                type="number"
                value={newProd.basePrice}
                onChange={(e) => setNewProd({ ...newProd, basePrice: e.target.value })}
                placeholder="28000"
                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Varian (format: Nama:TambahanHarga, pisah koma)
              </label>
              <input
                value={newProd.variantsText}
                onChange={(e) => setNewProd({ ...newProd, variantsText: e.target.value })}
                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[44px] rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
            >
              {saving ? 'Menyimpan...' : 'Simpan Menu'}
            </button>
          </form>
        </div>
      )}

      {/* Recipe & HPP Calculator Modal */}
      {recipeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Resep &amp; HPP: {recipeProduct.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Harga Jual: <span className="font-mono">{formatIDR(recipeProduct.effectivePrice)}</span> · Estimasi HPP:{' '}
                  <strong className="font-mono text-emerald-700">{formatIDR(liveEditedHpp)}</strong>
                </p>
              </div>
              <button type="button" onClick={() => setRecipeProduct(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
              {recipeItems.map((item, idx) => {
                const ing = ingredients.find((i) => i.id === Number(item.ingredientId));
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={item.ingredientId}
                      onChange={(e) => {
                        const next = [...recipeItems];
                        next[idx] = { ...next[idx], ingredientId: Number(e.target.value) };
                        setRecipeItems(next);
                      }}
                      className="flex-1 min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                    >
                      {ingredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({formatIDR(i.costPerUnit)}/{i.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={item.quantity}
                      onChange={(e) => {
                        const next = [...recipeItems];
                        next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                        setRecipeItems(next);
                      }}
                      className="w-24 min-h-[40px] px-2.5 rounded-lg border border-slate-200 font-mono text-xs text-right"
                    />
                    <span className="text-xs text-slate-500 w-10">{ing?.unit || ''}</span>
                    <button
                      type="button"
                      onClick={() => setRecipeItems(recipeItems.filter((_, i) => i !== idx))}
                      className="text-red-600 text-xs px-2 cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() =>
                setRecipeItems([
                  ...recipeItems,
                  { ingredientId: ingredients[0]?.id || 1, quantity: 10 },
                ])
              }
              className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
            >
              + Tambah Baris Bahan Baku
            </button>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRecipeProduct(null)}
                className="min-h-[42px] px-4 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveRecipe}
                className="min-h-[42px] px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Resep & Hitung HPP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
