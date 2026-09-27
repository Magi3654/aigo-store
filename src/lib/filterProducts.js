function normalize(text) {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function filterProducts(products, { q = '', cat = '' } = {}) {
  const needle = normalize(q)
  return products.filter(
    (p) =>
      (!cat || p.category === cat) &&
      (!needle || normalize(p.name).includes(needle) || normalize(p.group).includes(needle)),
  )
}
