import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase.js'
import { mapProductRow } from '../lib/mapProduct.js'

export const useProductsStore = defineStore('products', () => {
  const products = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function fetchProducts() {
    if (loaded.value && !error.value) return
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .order('name')
    if (err) {
      error.value = err.message
    } else {
      products.value = data.map(mapProductRow)
      loaded.value = true
    }
    loading.value = false
  }

  async function fetchProductById(id) {
    const { data, error: err } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .eq('id', id)
      .single()
    if (err || !data) return null
    return mapProductRow(data)
  }

  const categories = computed(() => [...new Set(products.value.map((p) => p.category))])
  const groups = computed(() => [...new Set(products.value.map((p) => p.group))])

  return { products, loading, error, loaded, fetchProducts, fetchProductById, categories, groups }
})
