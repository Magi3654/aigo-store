<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { safeRedirect } from '../../router/guards.js'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const password = ref('')

// Un error de un intento anterior no debe reaparecer al volver a esta pantalla.
onMounted(() => { auth.error = null })
onBeforeUnmount(() => { auth.error = null })

async function login() {
  const ok = await auth.signIn(email.value.trim(), password.value)
  if (!ok) return
  router.push(safeRedirect(route.query.redirect))
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">💜</div>
      <h1>AIGO Admin</h1>
      <p>Panel de administración</p>
      <form @submit.prevent="login">
        <div class="form-group">
          <label>Correo</label>
          <input v-model="email" type="email" autocomplete="username" placeholder="correo@ejemplo.com" required />
        </div>
        <div class="form-group">
          <label>Contraseña</label>
          <input v-model="password" type="password" autocomplete="current-password" placeholder="Tu contraseña" required />
        </div>
        <p v-if="auth.error" class="error-msg">{{ auth.error }}</p>
        <button type="submit" class="btn-login" :disabled="auth.loading">
          {{ auth.loading ? 'Entrando…' : 'Ingresar' }}
        </button>
      </form>
      <router-link to="/" class="back-link">
        <i class="fas fa-arrow-left"></i> Volver a la tienda
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.login-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 40px;
  width: 100%;
  max-width: 400px;
  text-align: center;
}
.login-logo { font-size: 3rem; margin-bottom: 10px; }
.login-card h1 {
  font-size: 1.8rem;
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 6px;
}
.login-card > p { color: var(--text-muted); margin-bottom: 30px; font-size: 0.9rem; }
.form-group { text-align: left; margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 6px; font-size: 0.85rem; color: var(--text-muted); }
.form-group input {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 1rem;
}
.form-group input:focus { outline: none; border-color: var(--primary); }
.error-msg { color: var(--danger); font-size: 0.85rem; margin-bottom: 10px; }
.btn-login {
  width: 100%;
  padding: 14px;
  background: var(--gradient);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  transition: all 0.3s;
}
.btn-login:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(234,146,174,0.3); }
.btn-login:disabled { opacity: 0.6; transform: none; box-shadow: none; }
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-top: 20px;
  transition: color 0.3s;
}
.back-link:hover { color: var(--primary-light); }
</style>
