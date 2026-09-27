<script setup>
// Placeholder temporal (Fase 2b). Los pedidos reales los crean las Edge
// Functions con Stripe en la Fase 2c; hasta entonces no hay nada que mostrar
// y preferimos una pantalla honesta a datos inventados.
import AdminLayout from '../../components/AdminLayout.vue'
</script>

<template>
  <AdminLayout>
    <div class="wip">
      <i class="fas fa-receipt"></i>
      <h1>Gestión de pedidos</h1>
      <p>
        Los pedidos se crearán con el checkout de Stripe en la Fase 2c. Esta sección se
        reconstruye entonces sobre la tabla real de pedidos.
      </p>
      <router-link to="/admin/productos" class="btn-outline">Ir a productos</router-link>
    </div>
  </AdminLayout>
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
.wip p { max-width: 420px; margin: 0 auto; }
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
