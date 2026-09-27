// Mismas categorias que el CHECK de public.products.
export const CATEGORIES = ['Albums', 'Lightsticks', 'Ropa', 'Photocards', 'Posters', 'Velas']

function validateVariant(v) {
  const e = {}
  if (!String(v.label ?? '').trim()) e.label = 'La etiqueta es obligatoria'
  if (!Number.isInteger(v.price_cents) || v.price_cents < 0) e.price_cents = 'Precio inválido'
  if (!Number.isInteger(v.stock) || v.stock < 0) e.stock = 'Stock inválido'
  // Mas estricto que el CHECK de la base (>= 0): un peso de cero rompe la
  // cotizacion de envio de la Fase 2c.
  if (!Number.isInteger(v.weight_grams) || v.weight_grams <= 0) {
    e.weight_grams = 'El peso debe ser mayor a 0'
  }
  return e
}

export function validateProduct(form) {
  const errors = {}
  if (!String(form.name ?? '').trim()) errors.name = 'El nombre es obligatorio'
  if (!String(form.group ?? '').trim()) errors.group = 'El grupo es obligatorio'
  if (!CATEGORIES.includes(form.category)) errors.category = 'Elige una categoría válida'

  const variants = form.variants ?? []
  if (variants.length === 0) {
    errors.variants = 'Agrega al menos una variante'
  } else if (form.is_active && !variants.some((v) => v.is_active)) {
    // Sin variante activa, la tienda mostraria un producto sin nada comprable.
    errors.variants = 'Un producto activo necesita al menos una variante activa'
  }

  const variantErrors = variants.map(validateVariant)
  if (variantErrors.some((e) => Object.keys(e).length > 0)) {
    errors.variantErrors = variantErrors
  }

  return errors
}

export function isValid(errors) {
  return Object.keys(errors).length === 0
}
