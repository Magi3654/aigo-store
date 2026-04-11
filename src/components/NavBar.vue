<script setup>
import { useCartStore } from '../stores/cart'
import { ref } from 'vue'

const cart = useCartStore()
const menuOpen = ref(false)
</script>

<template>
  <nav class="navbar">
    <div class="nav-container">
      <router-link to="/" class="logo">
        <span class="logo-icon">💜</span>
        <span class="logo-text">AIGO</span>
      </router-link>

      <button class="menu-toggle" @click="menuOpen = !menuOpen">
        <i :class="menuOpen ? 'fas fa-times' : 'fas fa-bars'"></i>
      </button>

      <div class="nav-links" :class="{ open: menuOpen }" @click="menuOpen = false">
        <router-link to="/">Inicio</router-link>
        <router-link to="/productos">Productos</router-link>
        <router-link to="/seguimiento">Seguimiento</router-link>
        <router-link to="/carrito" class="cart-link">
          <i class="fas fa-shopping-bag"></i>
          <span v-if="cart.totalItems" class="cart-badge">{{ cart.totalItems }}</span>
        </router-link>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(251, 248, 248, 0.95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
  padding: 15px 0;
}
.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.5rem;
  font-weight: 700;
}
.logo-icon { font-size: 1.8rem; }
.logo-text {
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 3px;
}
.nav-links {
  display: flex;
  align-items: center;
  gap: 30px;
}
.nav-links a {
  color: var(--text-muted);
  font-weight: 500;
  transition: color 0.3s;
  font-size: 0.95rem;
}
.nav-links a:hover,
.nav-links a.router-link-active {
  color: var(--primary-light);
}
.cart-link {
  position: relative;
}
.cart-badge {
  position: absolute;
  top: -8px;
  right: -12px;
  background: var(--primary);
  color: white;
  font-size: 0.7rem;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}
.menu-toggle {
  display: none;
  background: none;
  border: none;
  color: var(--text);
  font-size: 1.3rem;
}
@media (max-width: 768px) {
  .menu-toggle { display: block; }
  .nav-links {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-card);
    flex-direction: column;
    padding: 20px;
    gap: 20px;
    border-bottom: 1px solid var(--border);
  }
  .nav-links.open { display: flex; }
}
</style>
