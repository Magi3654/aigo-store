<script setup>
import { useProductsStore } from '../../stores/products'
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const store = useProductsStore()
const route = useRoute()

const search = ref('')
const selectedCategory = ref('')
const selectedGroup = ref('')

onMounted(() => {
  if (route.query.cat) selectedCategory.value = route.query.cat
})

const filtered = computed(() => {
  return store.products.filter(p => {
    const matchSearch = !search.value || p.name.toLowerCase().includes(search.value.toLowerCase()) || p.group.toLowerCase().includes(search.value.toLowerCase())
    const matchCat = !selectedCategory.value || p.category === selectedCategory.value
    const matchGroup = !selectedGroup.value || p.group === selectedGroup.value
    return matchSearch && matchCat && matchGroup
  })
})
</script>

<template>
  <div class="products-page container">
    <h1>Productos</h1>

    <!-- Filtros -->
    <div class="filters">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input v-model="search" placeholder="Buscar producto o grupo..." />
      </div>
      <select v-model="selectedCategory">
        <option value="">Todas las categorías</option>
        <option v-for="cat in store.categories" :key="cat" :value="cat">{{ cat }}</option>
      </select>
      <select v-model="selectedGroup">
        <option value="">Todos los grupos</option>
        <option v-for="g in store.groups" :key="g" :value="g">{{ g }}</option>
      </select>
    </div>

    <p class="results-count">{{ filtered.length }} productos encontrados</p>

    <div class="products-grid">
      <router-link
        v-for="product in filtered"
        :key="product.id"
        :to="`/producto/${product.id}`"
        class="product-card"
      >
        <div class="product-img">
          <img :src="product.image" :alt="product.name" />
          <span v-if="product.stock < 5" class="low-stock">Pocas unidades</span>
        </div>
        <div class="product-info">
          <span class="product-group">{{ product.group }}</span>
          <h3>{{ product.name }}</h3>
          <span class="product-cat">{{ product.category }}</span>
          <p class="product-price">${{ product.price.toLocaleString() }} MXN</p>
        </div>
      </router-link>
    </div>

    <div v-if="!filtered.length" class="empty">
      <i class="fas fa-search"></i>
      <p>No se encontraron productos</p>
    </div>
  </div>
</template>

<style scoped>
.products-page {
  padding: 40px 20px 80px;
}
.products-page h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 25px;
}
.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.search-box {
  flex: 1;
  min-width: 200px;
  position: relative;
}
.search-box i {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}
.search-box input {
  width: 100%;
  padding: 12px 12px 12px 40px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 0.95rem;
}
.search-box input:focus {
  outline: none;
  border-color: var(--primary);
}
select {
  padding: 12px 16px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 0.95rem;
  min-width: 180px;
}
select:focus {
  outline: none;
  border-color: var(--primary);
}
.results-count {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-bottom: 20px;
}
.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}
.product-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s;
}
.product-card:hover {
  border-color: var(--primary);
  transform: translateY(-4px);
  box-shadow: 0 10px 30px rgba(234, 146, 174, 0.15);
}
.product-img {
  aspect-ratio: 1;
  overflow: hidden;
  position: relative;
}
.product-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}
.product-card:hover .product-img img { transform: scale(1.05); }
.low-stock {
  position: absolute;
  top: 10px;
  right: 10px;
  background: var(--danger);
  color: white;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}
.product-info { padding: 16px; }
.product-group {
  font-size: 0.8rem;
  color: var(--primary-light);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.product-info h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 6px 0 4px;
}
.product-cat {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.product-price {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--primary-light);
  margin-top: 8px;
}
.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty i { font-size: 3rem; margin-bottom: 15px; }
</style>
