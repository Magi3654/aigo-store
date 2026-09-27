<script setup>
import BrandMark from './BrandMark.vue'
import { home } from '../content/home.js'
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__grid container">
      <div>
        <BrandMark />
        <p class="site-footer__tagline">K-pop merch en México.</p>
      </div>
      <nav aria-label="Ayuda">
        <p class="site-footer__title">Ayuda</p>
        <router-link to="/seguimiento">Seguimiento de pedido</router-link>
      </nav>
      <nav v-if="home.social.length" aria-label="Redes sociales">
        <p class="site-footer__title">Síguenos</p>
        <a v-for="s in home.social" :key="s.url" :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.label }}</a>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.site-footer { margin-top: auto; background: var(--ink); color: var(--lilac); padding: 56px 0; }
.site-footer__grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 32px; }
.site-footer :deep(.brand) { color: var(--canvas); }
.site-footer__tagline { margin-top: 8px; font-size: 14px; }
.site-footer nav { display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
.site-footer nav a:hover { text-decoration: underline; }
.site-footer__title { font-size: 12px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--canvas); }

@media (max-width: 768px) {
  .site-footer__grid { grid-template-columns: 1fr; }
}
</style>
