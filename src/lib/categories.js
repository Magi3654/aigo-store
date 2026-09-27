import { CATEGORIES } from './validateProduct.js'

const LABELS = {
  Albums: 'Álbumes',
  Posters: 'Pósters',
}

export function categoryLabel(category) {
  return LABELS[category] ?? category
}

export function normalizeCategory(value) {
  return typeof value === 'string' && CATEGORIES.includes(value) ? value : ''
}
