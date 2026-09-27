<script setup>
defineProps({
  title: { type: String, required: true },
  to: { type: [String, Object], default: null },
  linkText: { type: String, default: 'Ver todo' },
})
</script>

<template>
  <div class="section-heading">
    <h2 class="display">{{ title }}</h2>
    <router-link v-if="to" :to="to" class="section-heading__link">{{ linkText }} →</router-link>
  </div>
</template>

<style scoped>
.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
h2 { font-size: clamp(28px, 4vw, 40px); line-height: 1; }
.section-heading__link {
  font-size: 14px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  border-bottom: 1px solid var(--ink);
  padding-bottom: 2px;
  white-space: nowrap;
}
</style>
