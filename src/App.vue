<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AnnouncementBar from './components/AnnouncementBar.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { home } from './content/home.js'

const route = useRoute()
const isAdmin = computed(() => route.path.startsWith('/admin'))
</script>

<template>
  <router-view v-if="isAdmin" />
  <template v-else>
    <AnnouncementBar :text="home.announcement" />
    <SiteHeader />
    <main class="site-main"><router-view /></main>
    <SiteFooter />
  </template>
</template>

<style>
.site-main { flex: 1; }
</style>
