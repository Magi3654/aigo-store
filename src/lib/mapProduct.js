export function mapProductRow(row) {
  const variants = (row.product_variants ?? []).map((v) => ({
    id: v.id,
    label: v.label,
    price_cents: v.price_cents,
    stock: v.stock,
    weight_grams: v.weight_grams,
    sku: v.sku ?? null,
    image_url: v.image_url ?? null,
  }))
  return {
    id: row.id,
    name: row.name,
    group: row.group,
    category: row.category,
    description: row.description ?? null,
    image_url: row.image_url ?? null,
    variants,
    defaultVariant: variants[0] ?? null,
  }
}
