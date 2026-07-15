<script setup>
// Placeholder temporal (Fase 2a). El CRUD real de productos/variantes vía
// Supabase Auth + RLS llega en la Fase 2b.
</script>

<template>
  <div class="wip container">
    <i class="fas fa-screwdriver-wrench"></i>
    <h1>Gestión de productos</h1>
    <p>Esta sección se reconstruye en la Fase 2b (auth de admin + CRUD vía Supabase).</p>
    <router-link to="/admin/dashboard" class="btn-outline">Volver al dashboard</router-link>
  </div>
</template>

<style scoped>
.wip {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-muted);
}
.wip i {
  font-size: 3rem;
  color: var(--primary-light);
  margin-bottom: 16px;
}
.wip h1 {
  font-size: 1.6rem;
  margin-bottom: 10px;
  color: var(--text);
}
.btn-outline {
  display: inline-block;
  margin-top: 20px;
  padding: 12px 28px;
  border: 2px solid var(--primary);
  color: var(--primary-light);
  border-radius: 50px;
  font-weight: 600;
}
</style>
