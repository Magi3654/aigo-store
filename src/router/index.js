import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'Home', component: () => import('../views/user/HomeView.vue') },
  { path: '/productos', name: 'Products', component: () => import('../views/user/ProductsView.vue') },
  { path: '/producto/:id', name: 'ProductDetail', component: () => import('../views/user/ProductDetailView.vue') },
  { path: '/carrito', name: 'Cart', component: () => import('../views/user/CartView.vue') },
  { path: '/checkout', name: 'Checkout', component: () => import('../views/user/CheckoutView.vue') },
  { path: '/seguimiento', name: 'Tracking', component: () => import('../views/user/TrackingView.vue') },
  // Admin
  { path: '/admin', name: 'AdminLogin', component: () => import('../views/admin/AdminLogin.vue') },
  { path: '/admin/dashboard', name: 'AdminDashboard', component: () => import('../views/admin/DashboardView.vue'), meta: { requiresAdmin: true } },
  { path: '/admin/pedidos', name: 'AdminOrders', component: () => import('../views/admin/OrdersView.vue'), meta: { requiresAdmin: true } },
  { path: '/admin/productos', name: 'AdminProducts', component: () => import('../views/admin/ProductsManageView.vue'), meta: { requiresAdmin: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

router.beforeEach((to) => {
  if (to.meta.requiresAdmin) {
    const admin = localStorage.getItem('aigo_admin')
    if (!admin) return { name: 'AdminLogin' }
  }
})

export default router
