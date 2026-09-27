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

export const SESSION_LOST = 'Tu sesión expiró o no tienes permisos; vuelve a iniciar sesión'

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

  // Un UPDATE que RLS filtra (p. ej. la sesion expiro y la peticion va como anon)
  // no falla: devuelve 204 con 0 filas. Pedimos las filas afectadas y tratamos
  // "ninguna" como error, para no reportar un guardado que no ocurrio.
  async function updateRows(query) {
    const { data, error: err } = await query.select('id')
    if (err) return describeDbError(err)
    if (!data?.length) return SESSION_LOST
    return null
  }

  // Invariante del catalogo: un producto activo tiene al menos una variante activa.
  // Sin transacciones entre llamadas, el producto nace inactivo y solo se activa
  // cuando sus variantes ya existen.
  async function createProduct(form) {
    const { data, error: err } = await supabase
      .from('products')
      .insert({ ...productPayload(form), is_active: false })
      .select('id')
      .single()
    if (err) return failAfterReload(describeDbError(err))

    const rows = form.variants.map((v) => ({ ...variantPayload(v), product_id: data.id }))
    const { error: vErr } = await supabase.from('product_variants').insert(rows)
    if (vErr) {
      // El producto quedaria huerfano (aunque inactivo, invisible en la tienda).
      // Lo deshacemos; si el borrado tambien falla, queda inactivo en la lista.
      let message = describeDbError(vErr)
      const { data: deleted, error: delErr } = await supabase
        .from('products')
        .delete()
        .eq('id', data.id)
        .select('id')
      if (delErr || !deleted?.length) {
        console.error('[adminCatalog] no se pudo deshacer el producto creado', data.id, delErr ?? '0 filas borradas')
        message += '. El producto quedó guardado como inactivo; revísalo en la lista'
      }
      return failAfterReload(message)
    }

    if (form.is_active) {
      const aErr = await updateRows(
        supabase.from('products').update({ is_active: true }).eq('id', data.id),
      )
      if (aErr) return failAfterReload(aErr)
    }

    await fetchAll()
    return { ok: true }
  }

  async function failAfterReload(message) {
    await fetchAll()
    return { ok: false, error: message }
  }

  async function updateProduct(form) {
    // Si el formulario activa el producto, is_active se escribe al final, despues
    // de las variantes: un fallo a medias no deja un producto activo sin variantes.
    // Si lo desactiva, se escribe aqui mismo (despublicar primero es lo seguro).
    const payload = productPayload(form)
    if (form.is_active) delete payload.is_active
    const err = await updateRows(supabase.from('products').update(payload).eq('id', form.id))
    if (err) return { ok: false, error: err }

    const loadedVariants = byId(form.id)?.variants ?? []
    const { toInsert, toUpdate, toDeactivate } = variantDiff(form.variants, loadedVariants)

    // Primero todo lo que deja variantes activas y al final lo que las desactiva:
    // si un paso falla a medias, el producto conserva al menos las variantes con
    // las que va a quedar (validateProduct garantiza que hay una).
    const updateVariant = async (v) =>
      updateRows(supabase.from('product_variants').update(variantPayload(v)).eq('id', v.id))

    for (const v of toUpdate.filter((v) => v.is_active)) {
      const uErr = await updateVariant(v)
      if (uErr) return { ok: false, error: uErr }
    }

    if (toInsert.length) {
      const rows = toInsert.map((v) => ({ ...variantPayload(v), product_id: form.id }))
      const { error: iErr } = await supabase.from('product_variants').insert(rows)
      if (iErr) return { ok: false, error: describeDbError(iErr) }
    }

    for (const v of toUpdate.filter((v) => !v.is_active)) {
      const uErr = await updateVariant(v)
      if (uErr) return { ok: false, error: uErr }
    }

    if (toDeactivate.length) {
      const dErr = await updateRows(
        supabase.from('product_variants').update({ is_active: false }).in('id', toDeactivate),
      )
      if (dErr) return { ok: false, error: dErr }
    }

    if (form.is_active) {
      const aErr = await updateRows(
        supabase.from('products').update({ is_active: true }).eq('id', form.id),
      )
      if (aErr) return { ok: false, error: aErr }
    }

    await fetchAll()
    return { ok: true }
  }

  async function setProductActive(id, isActive) {
    const err = await updateRows(
      supabase.from('products').update({ is_active: isActive }).eq('id', id),
    )
    if (err) return { ok: false, error: err }
    await fetchAll()
    return { ok: true }
  }

  return {
    products, loading, error, loaded,
    byId, fetchAll, createProduct, updateProduct, setProductActive,
  }
})
