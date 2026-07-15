const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function formatMXN(cents) {
  return mxn.format((cents ?? 0) / 100)
}
