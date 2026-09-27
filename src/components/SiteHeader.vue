<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart.js'
import BrandMark from './BrandMark.vue'
import IconSearch from './icons/IconSearch.vue'
import IconBag from './icons/IconBag.vue'
import IconMenu from './icons/IconMenu.vue'
import IconClose from './icons/IconClose.vue'

const cart = useCartStore()
const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)
const query = ref('')

const links = [
  { to: '/', label: 'Inicio' },
  { to: '/productos', label: 'Productos' },
  { to: '/seguimiento', label: 'Seguimiento' },
]

// Cualquier navegacion cierra el menu movil.
watch(() => route.fullPath, () => {
  menuOpen.value = false
})

function search() {
  const q = query.value.trim()
  router.push({ path: '/productos', query: q ? { q } : {} })
  query.value = ''
}
</script>

<template>
  <header class="site-header">
    <div class="site-header__bar container">
      <button
        class="site-header__toggle"
        type="button"
        aria-label="Abrir menú"
        aria-controls="site-menu"
        :aria-expanded="menuOpen"
        @click="menuOpen = true"
      >
        <IconMenu />
      </button>

      <nav id="site-menu" class="site-header__nav" :class="{ 'is-open': menuOpen }" aria-label="Principal">
        <button class="site-header__close" type="button" aria-label="Cerrar menú" @click="menuOpen = false">
          <IconClose />
        </button>
        <router-link v-for="l in links" :key="l.to" :to="l.to" class="site-header__link">{{ l.label }}</router-link>
      </nav>

      <BrandMark class="site-header__brand" />

      <div class="site-header__tools">
        <form class="site-header__search" role="search" @submit.prevent="search">
          <IconSearch />
          <input v-model="query" type="search" placeholder="Buscar" aria-label="Buscar productos" />
        </form>
        <router-link to="/productos" class="site-header__search-link" aria-label="Buscar productos">
          <IconSearch />
        </router-link>
        <router-link to="/carrito" class="site-header__bag" :aria-label="`Bolsa, ${cart.totalItems} artículos`">
          <IconBag />
          <span v-if="cart.totalItems" class="site-header__count">{{ cart.totalItems }}</span>
        </router-link>
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--canvas);
  border-bottom: 1px solid var(--ink);
}
.site-header__bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  min-height: 64px;
}
.site-header__toggle,
.site-header__close { display: none; color: var(--ink); }
.site-header__nav { display: flex; gap: 24px; }
.site-header__link {
  font-size: 14px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  padding: 4px 0;
  border-bottom: 1px solid transparent;
}
.site-header__link:hover,
.site-header__link.router-link-exact-active { border-bottom-color: var(--ink); }
.site-header__brand { justify-self: center; }
.site-header__tools { justify-self: end; display: flex; align-items: center; gap: 16px; }
.site-header__search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border-radius: var(--radius-pill);
  padding: 8px 16px;
}
.site-header__search input {
  border: none;
  background: transparent;
  width: 140px;
  font-size: 14px;
  outline: none;
}
.site-header__search input::placeholder { color: var(--ink-muted); }
.site-header__search:focus-within { outline: 2px solid var(--ink); outline-offset: 2px; }
.site-header__search-link { display: none; }
.site-header__bag { position: relative; display: flex; }
.site-header__count {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--canvas);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

@media (max-width: 768px) {
  .site-header__toggle { display: flex; }
  .site-header__nav {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 30;
    flex-direction: column;
    gap: 8px;
    padding: 24px 16px;
    background: var(--canvas);
  }
  .site-header__nav.is-open { display: flex; }
  .site-header__close { display: flex; align-self: flex-end; margin-bottom: 24px; }
  .site-header__link {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 40px;
    line-height: 1.1;
    letter-spacing: 0.6px;
  }
  /* En movil no cabe el campo: la lupa lleva al catalogo, que tiene su buscador. */
  .site-header__search { display: none; }
  .site-header__search-link { display: flex; }
}
</style>
