<script setup>
defineProps({
  variant: {
    type: String,
    default: 'solid',
    validator: (v) => ['solid', 'outline', 'on-photo'].includes(v),
  },
  to: { type: [String, Object], default: null },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
})
</script>

<template>
  <router-link
    v-if="to && !disabled"
    :to="to"
    class="btn"
    :class="[`btn--${variant}`, { 'btn--block': block }]"
  >
    <slot />
  </router-link>
  <button
    v-else
    :type="type"
    class="btn"
    :class="[`btn--${variant}`, { 'btn--block': block }]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border: 1px solid var(--ink);
  border-radius: var(--radius-button);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.8px;
  line-height: 1;
  text-transform: uppercase;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}
.btn--solid { background: var(--ink); color: var(--canvas); }
.btn--solid:hover:not(:disabled) { background: #3a2838; }
.btn--outline { background: transparent; color: var(--ink); }
.btn--outline:hover:not(:disabled) { background: var(--ink); color: var(--canvas); }
.btn--on-photo { background: var(--canvas); color: var(--ink); }
.btn--on-photo:hover { background: var(--surface); }
.btn--block { width: 100%; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
