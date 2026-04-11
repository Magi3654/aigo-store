<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const password = ref('')
const error = ref(false)

function login() {
  // Contraseña simple para demo
  if (password.value === 'aigo2026') {
    localStorage.setItem('aigo_admin', 'true')
    router.push('/admin/dashboard')
  } else {
    error.value = true
    setTimeout(() => error.value = false, 3000)
  }
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
          <label>Contraseña</label>
          <input v-model="password" type="password" placeholder="Ingresa la contraseña" />
        </div>
        <p v-if="error" class="error-msg">Contraseña incorrecta</p>
        <button type="submit" class="btn-login">Ingresar</button>
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
