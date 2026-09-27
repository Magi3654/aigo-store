<script setup>
defineProps({ text: { type: String, required: true } })
</script>

<template>
  <div class="announcement" role="note">{{ text }}</div>
</template>

<style scoped>
.announcement {
  background: var(--lilac);
  color: var(--ink);
  font-size: 12px;
  line-height: 1.33;
  text-align: center;
  padding: 8px 16px;
}
</style>
