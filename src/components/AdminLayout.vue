<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function logout() {
  localStorage.removeItem('aigo_admin')
  router.push('/admin')
}
</script>

<template>
  <div class="admin-layout">
    <aside class="sidebar">
      <div class="sidebar-logo">
        <span>💜</span>
        <span class="logo-text">AIGO</span>
        <span class="badge">Admin</span>
      </div>
      <nav class="sidebar-nav">
        <router-link to="/admin/dashboard"><i class="fas fa-chart-bar"></i> Dashboard</router-link>
        <router-link to="/admin/pedidos"><i class="fas fa-shopping-bag"></i> Pedidos</router-link>
        <router-link to="/admin/productos"><i class="fas fa-boxes-stacked"></i> Productos</router-link>
      </nav>
      <div class="sidebar-footer">
        <router-link to="/" class="store-link"><i class="fas fa-store"></i> Ver tienda</router-link>
        <button @click="logout" class="logout-btn"><i class="fas fa-sign-out-alt"></i> Cerrar sesión</button>
      </div>
    </aside>
    <main class="admin-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  width: 240px;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
}
.sidebar-logo {
  padding: 0 20px 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.2rem;
  font-weight: 700;
  border-bottom: 1px solid var(--border);
}
.logo-text {
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.badge {
  font-size: 0.65rem;
  background: var(--secondary);
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}
.sidebar-nav {
  flex: 1;
  padding: 16px 0;
}
.sidebar-nav a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.95rem;
  transition: all 0.3s;
}
.sidebar-nav a:hover,
.sidebar-nav a.router-link-active {
  color: var(--primary-light);
  background: rgba(234, 146, 174, 0.12);
  border-right: 3px solid var(--primary);
}
.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.store-link {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 0.9rem;
  padding: 8px 0;
  transition: color 0.3s;
}
.store-link:hover { color: var(--accent); }
.logout-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  color: var(--danger);
  font-size: 0.9rem;
  padding: 8px 0;
}
.admin-main {
  flex: 1;
  margin-left: 240px;
  padding: 30px;
}

@media (max-width: 768px) {
  .sidebar { width: 60px; }
  .sidebar-logo span:not(:first-child), .sidebar-nav a span, .sidebar-footer span { display: none; }
  .sidebar-nav a { justify-content: center; padding: 14px; }
  .admin-main { margin-left: 60px; }
}
</style>
