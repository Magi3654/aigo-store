<script setup>
import { computed, onMounted } from 'vue'
import { useProductsStore } from '../../stores/products'
import { CATEGORIES } from '../../lib/validateProduct.js'
import { categoryLabel } from '../../lib/categories.js'
import { home } from '../../content/home.js'
import ProductTile from '../../components/ProductTile.vue'
import SectionHeading from '../../components/SectionHeading.vue'
import BaseButton from '../../components/BaseButton.vue'
import heroImg from '../../assets/hero-concierto.jpg'
import bandImg from '../../assets/coleccion.jpg'

const store = useProductsStore()
const featured = computed(() => store.products.slice(0, 4))

onMounted(() => store.fetchProducts())
</script>

<template>
  <div class="home">
    <section class="hero" :style="{ backgroundImage: `url(${heroImg})` }">
      <div class="hero__copy container">
        <h1 class="display hero__title">{{ home.hero.title }}</h1>
        <p class="hero__text">{{ home.hero.text }}</p>
        <div class="hero__actions">
          <BaseButton variant="on-photo" to="/productos">{{ home.hero.cta }}</BaseButton>
          <router-link to="/productos" class="hero__link">{{ home.hero.secondary }} →</router-link>
        </div>
      </div>
    </section>

    <nav class="cats" aria-label="Categorías">
      <router-link
        v-for="c in CATEGORIES"
        :key="c"
        :to="{ path: '/productos', query: { cat: c } }"
        class="cats__item display"
      >{{ categoryLabel(c) }}</router-link>
    </nav>

    <section class="section container">
      <SectionHeading :title="home.featured.title" to="/productos" />
      <p v-if="store.loading" class="state">Cargando productos…</p>
      <div v-else-if="store.error" class="state">
        <p>No se pudo cargar el catálogo.</p>
        <BaseButton variant="outline" @click="store.fetchProducts()">Reintentar</BaseButton>
      </div>
      <p v-else-if="!featured.length" class="state">Pronto habrá productos aquí.</p>
      <div v-else class="product-grid">
        <ProductTile v-for="p in featured" :key="p.id" :product="p" />
      </div>
    </section>

    <section class="band">
      <div class="band__text">
        <p class="band__kicker">{{ home.band.kicker }}</p>
        <h2 class="display band__title">{{ home.band.title }}</h2>
        <p class="band__body">{{ home.band.text }}</p>
        <BaseButton to="/productos">{{ home.band.cta }}</BaseButton>
      </div>
      <div class="band__image" :style="{ backgroundImage: `url(${bandImg})` }" role="img" :aria-label="home.band.title"></div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  min-height: min(78vh, 720px);
  display: flex;
  align-items: flex-end;
  background-size: cover;
  background-position: center 30%;
}
/* Unica excepcion a "sin degradados": sombra inferior para leer el texto sobre la foto. */
.hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(74, 51, 71, 0.8), rgba(74, 51, 71, 0) 60%);
}
.hero__copy { position: relative; z-index: 1; padding-bottom: 48px; color: var(--canvas); }
/* Anillo de foco claro: el ciruela no se ve sobre la foto sombreada. */
.hero :deep(:focus-visible) { outline-color: var(--canvas); }
.hero__title { font-size: clamp(56px, 9vw, 104px); max-width: 8ch; margin-bottom: 16px; }
.hero__text { font-size: 18px; font-weight: 500; max-width: 40ch; margin-bottom: 24px; }
.hero__actions { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.hero__link { font-size: 14px; letter-spacing: 0.8px; text-transform: uppercase; }
.hero__link:hover { text-decoration: underline; }

.cats {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1px;
  background: var(--lilac);
  border-bottom: 1px solid var(--lilac);
}
.cats__item {
  background: var(--canvas);
  text-align: center;
  padding: 24px 8px;
  font-size: clamp(18px, 2vw, 24px);
  line-height: 1;
}
.cats__item:hover { background: var(--surface); }

.section { padding-top: var(--section-gap); padding-bottom: var(--section-gap); }

.band { display: grid; grid-template-columns: 1.1fr 1fr; background: var(--lilac); color: var(--ink); }
.band__text { padding: 64px 48px; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-start; gap: 16px; }
.band__kicker { font-size: 12px; letter-spacing: 1.4px; text-transform: uppercase; }
.band__title { font-size: clamp(40px, 6vw, 72px); }
.band__body { max-width: 40ch; }
.band__image { min-height: 360px; background-size: cover; background-position: center; }

@media (max-width: 768px) {
  .cats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .band { grid-template-columns: 1fr; }
  .band__text { padding: 40px 16px; }
  .band__image { min-height: 240px; order: -1; }
}
</style>
