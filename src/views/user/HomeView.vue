<script setup>
import { useProductsStore } from '../../stores/products'
import { computed } from 'vue'

const store = useProductsStore()
const featured = computed(() => store.products.slice(0, 4))
</script>

<template>
  <div class="home">
    <!-- Hero -->
    <section class="hero">
      <div class="hero-content">
        <h1>Tu tienda de<br><span class="gradient-text">K-pop Merch</span></h1>
        <p>Albums, lightsticks, ropa y más de tus grupos favoritos. Envíos a todo México.</p>
        <router-link to="/productos" class="btn-primary">
          <i class="fas fa-store"></i> Ver Productos
        </router-link>
      </div>
      <div class="hero-decoration">
        <div class="circle c1"></div>
        <div class="circle c2"></div>
        <div class="circle c3"></div>
      </div>
    </section>

    <!-- Categorías -->
    <section class="categories container">
      <h2>Categorías</h2>
      <div class="cat-grid">
        <router-link to="/productos?cat=Albums" class="cat-card">
          <i class="fas fa-compact-disc"></i>
          <span>Albums</span>
        </router-link>
        <router-link to="/productos?cat=Lightsticks" class="cat-card">
          <i class="fas fa-wand-magic-sparkles"></i>
          <span>Lightsticks</span>
        </router-link>
        <router-link to="/productos?cat=Ropa" class="cat-card">
          <i class="fas fa-shirt"></i>
          <span>Ropa</span>
        </router-link>
        <router-link to="/productos?cat=Photocards" class="cat-card">
          <i class="fas fa-images"></i>
          <span>Photocards</span>
        </router-link>
        <router-link to="/productos?cat=Posters" class="cat-card">
          <i class="fas fa-image"></i>
          <span>Posters</span>
        </router-link>
      </div>
    </section>

    <!-- Destacados -->
    <section class="featured container">
      <h2>Productos Destacados</h2>
      <div class="products-grid">
        <router-link
          v-for="product in featured"
          :key="product.id"
          :to="`/producto/${product.id}`"
          class="product-card"
        >
          <div class="product-img">
            <img :src="product.image" :alt="product.name" />
          </div>
          <div class="product-info">
            <span class="product-group">{{ product.group }}</span>
            <h3>{{ product.name }}</h3>
            <p class="product-price">${{ product.price.toLocaleString() }} MXN</p>
          </div>
        </router-link>
      </div>
      <div class="see-all">
        <router-link to="/productos" class="btn-outline">Ver todos los productos</router-link>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="container footer-content">
        <div class="footer-brand">
          <span class="logo-text-footer">💜 AIGO</span>
          <p>Tu tienda de K-pop merch favorita</p>
        </div>
        <div class="footer-links">
          <router-link to="/productos">Productos</router-link>
          <router-link to="/seguimiento">Rastrear Pedido</router-link>
          <router-link to="/admin">Admin</router-link>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 AIGO Store. Todos los derechos reservados.</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  padding: 80px 20px;
  text-align: center;
  overflow: hidden;
  min-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hero-content {
  position: relative;
  z-index: 2;
}
.hero h1 {
  font-size: 3.5rem;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 20px;
}
.gradient-text {
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.hero p {
  font-size: 1.2rem;
  color: var(--text-muted);
  margin-bottom: 30px;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: var(--gradient);
  color: white;
  padding: 14px 32px;
  border-radius: 50px;
  font-weight: 600;
  font-size: 1rem;
  transition: transform 0.3s, box-shadow 0.3s;
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(234, 146, 174, 0.3);
}
.hero-decoration {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.1;
}
.c1 { width: 400px; height: 400px; background: var(--primary); top: -100px; right: -100px; }
.c2 { width: 300px; height: 300px; background: var(--secondary); bottom: -50px; left: -50px; }
.c3 { width: 200px; height: 200px; background: var(--accent); top: 50%; left: 60%; }

.categories {
  padding: 60px 20px;
}
.categories h2, .featured h2 {
  font-size: 2rem;
  font-weight: 600;
  margin-bottom: 30px;
  text-align: center;
}
.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
}
.cat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 30px 20px;
  text-align: center;
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.cat-card i {
  font-size: 2rem;
  color: var(--primary-light);
}
.cat-card span {
  font-weight: 500;
}
.cat-card:hover {
  border-color: var(--primary);
  transform: translateY(-4px);
  box-shadow: 0 10px 30px rgba(234, 146, 174, 0.15);
}

.featured {
  padding: 60px 20px;
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
}
.product-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}
.product-card:hover .product-img img {
  transform: scale(1.05);
}
.product-info {
  padding: 16px;
}
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
  margin: 6px 0 8px;
}
.product-price {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--primary-light);
}

.see-all {
  text-align: center;
  margin-top: 30px;
}
.btn-outline {
  display: inline-block;
  padding: 12px 28px;
  border: 2px solid var(--primary);
  color: var(--primary-light);
  border-radius: 50px;
  font-weight: 600;
  transition: all 0.3s;
}
.btn-outline:hover {
  background: var(--primary);
  color: white;
}

.footer {
  margin-top: 80px;
  border-top: 1px solid var(--border);
  padding-top: 40px;
}
.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 30px;
}
.logo-text-footer {
  font-size: 1.3rem;
  font-weight: 700;
}
.footer-brand p {
  color: var(--text-muted);
  margin-top: 8px;
  font-size: 0.9rem;
}
.footer-links {
  display: flex;
  gap: 20px;
}
.footer-links a {
  color: var(--text-muted);
  transition: color 0.3s;
}
.footer-links a:hover { color: var(--primary-light); }
.footer-bottom {
  text-align: center;
  padding: 20px;
  margin-top: 30px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .hero h1 { font-size: 2.2rem; }
  .hero { min-height: 50vh; padding: 60px 20px; }
}
</style>
