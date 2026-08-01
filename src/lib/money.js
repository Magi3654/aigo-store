// Los precios viven en centavos en la base de datos; el formulario del admin
// captura pesos. Math.round evita que 19.99 * 100 = 1998.9999999999998.
const AMOUNT = /^\d+(\.\d{1,2})?$/

export function pesosToCents(value) {
  if (value === null || value === undefined) return null
  const raw = String(value).trim().replace(/,/g, '')
  if (!AMOUNT.test(raw)) return null
  return Math.round(Number(raw) * 100)
}

export function centsToPesos(cents) {
  return ((cents ?? 0) / 100).toFixed(2)
}
