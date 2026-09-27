import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase.js'
import { describeDbError } from '../lib/dbError.js'
import { variantDiff } from '../lib/variantDiff.js'

// A diferencia de mapProductRow (publico), aqui conservamos is_active: el admin
// necesita ver y editar lo despublicado.
export function mapAdminProductRow(row) {
  const variants = (row.product_variants ?? []).map((v) => ({
    id: v.id,
    label: v.label,
    sku: v.sku ?? null,
    price_cents: v.price_cents,
    stock: v.stock,
    weight_grams: v.weight_grams,
    image_url: v.image_url ?? null,
    is_active: v.is_active,
  }))
  variants.sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return {
    id: row.id,
    name: row.name,
    group: row.group,
    category: row.category,
    description: row.description ?? null,
    image_url: row.image_url ?? null,
    is_active: row.is_active,
    variants,
  }
}

function productPayload(form) {
  return {
    name: form.name.trim(),
    group: form.group.trim(),
    category: form.category,
    description: form.description?.trim() || null,
    image_url: form.image_url?.trim() || null,
    is_active: form.is_active,
  }
}

function variantPayload(v) {
  return {
    label: v.label.trim(),
    sku: v.sku?.trim() || null,
    price_cents: v.price_cents,
    stock: v.stock,
    weight_grams: v.weight_grams,
    image_url: v.image_url?.trim() || null,
    is_active: v.is_active,
  }
}

export const useAdminCatalogStore = defineStore('adminCatalog', () => {
  const products = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  function byId(id) {
    return products.value.find((p) => p.id === id)
  }

  async function fetchAll() {
    loading.value = true
    error.value = null
    // Como admin, products_admin_write (for all) devuelve tambien lo inactivo.
    const { data, error: err } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .order('name')
    if (err) {
      error.value = describeDbError(err)
    } else {
      products.value = data.map(mapAdminProductRow)
      loaded.value = true
    }
    loading.value = false
    return { ok: !err, error: error.value ?? undefined }
  }

  async function createProduct(form) {
    const { data, error: err } = await supabase
      .from('products')
      .insert(productPayload(form))
      .select('id')
      .single()
    if (err) return { ok: false, error: describeDbError(err) }

    const rows = form.variants.map((v) => ({ ...variantPayload(v), product_id: data.id }))
    const { error: vErr } = await supabase.from('product_variants').insert(rows)
    if (vErr) {
      // PostgREST no da transacciones entre llamadas: si las variantes fallan,
      // el producto quedaria huerfano y sin nada comprable. Lo deshacemos.
      await supabase.from('products').delete().eq('id', data.id)
      return { ok: false, error: describeDbError(vErr) }
    }

    await fetchAll()
    return { ok: true }
  }

  async function updateProduct(form) {
    const { error: err } = await supabase
      .from('products')
      .update(productPayload(form))
      .eq('id', form.id)
    if (err) return { ok: false, error: describeDbError(err) }

    const loadedVariants = byId(form.id)?.variants ?? []
    const { toInsert, toUpdate, toDeactivate } = variantDiff(form.variants, loadedVariants)

    for (const v of toUpdate) {
      const { error: uErr } = await supabase
        .from('product_variants')
        .update(variantPayload(v))
        .eq('id', v.id)
      if (uErr) return { ok: false, error: describeDbError(uErr) }
    }

    if (toInsert.length) {
      const rows = toInsert.map((v) => ({ ...variantPayload(v), product_id: form.id }))
      const { error: iErr } = await supabase.from('product_variants').insert(rows)
      if (iErr) return { ok: false, error: describeDbError(iErr) }
    }

    if (toDeactivate.length) {
      const { error: dErr } = await supabase
        .from('product_variants')
        .update({ is_active: false })
        .in('id', toDeactivate)
      if (dErr) return { ok: false, error: describeDbError(dErr) }
    }

    await fetchAll()
    return { ok: true }
  }

  async function setProductActive(id, isActive) {
    const { error: err } = await supabase
      .from('products')
      .update({ is_active: isActive })
      .eq('id', id)
    if (err) return { ok: false, error: describeDbError(err) }
    await fetchAll()
    return { ok: true }
  }

  return {
    products, loading, error, loaded,
    byId, fetchAll, createProduct, updateProduct, setProductActive,
  }
})
