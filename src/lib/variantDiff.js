// Campos que se comparan para decidir si una variante cambio.
const FIELDS = ['label', 'sku', 'price_cents', 'stock', 'weight_grams', 'image_url', 'is_active']

function changed(a, b) {
  return FIELDS.some((f) => (a[f] ?? null) !== (b[f] ?? null))
}

// Compara las variantes del formulario contra las cargadas de la base.
// Las variantes guardadas que el admin quita del formulario NO se borran: se
// desactivan, para no perder el vinculo con los order_items de pedidos futuros.
export function variantDiff(formVariants, loadedVariants) {
  const toInsert = []
  const toUpdate = []
  const toDeactivate = []
  const byId = new Map()

  for (const v of formVariants ?? []) {
    if (v.id) byId.set(v.id, v)
    else toInsert.push(v)
  }

  for (const loaded of loadedVariants ?? []) {
    const current = byId.get(loaded.id)
    if (!current) {
      if (loaded.is_active) toDeactivate.push(loaded.id)
      continue
    }
    if (changed(current, loaded)) toUpdate.push(current)
  }

  return { toInsert, toUpdate, toDeactivate }
}
