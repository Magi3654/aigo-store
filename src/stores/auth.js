import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase.js'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  const user = ref(null)
  const isAdmin = ref(false)
  const initialized = ref(false)
  const loading = ref(false)
  const error = ref(null)

  // Evita que dos navegaciones simultaneas disparen dos init() en paralelo.
  let initPromise = null
  // Cada loadProfile/signOut sube el contador; una consulta que resuelve cuando
  // ya hay otra mas nueva descarta su resultado en vez de pisar isAdmin.
  let profileGen = 0

  function setSession(value) {
    session.value = value ?? null
    user.value = value?.user ?? null
  }

  async function loadProfile() {
    const gen = ++profileGen
    if (!user.value) {
      isAdmin.value = false
      return
    }
    // maybeSingle: un usuario sin fila en profiles no es un error, es un no-admin.
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.value.id)
      .maybeSingle()
    if (gen !== profileGen) return
    isAdmin.value = data?.is_admin === true
  }

  async function init() {
    if (initialized.value) return
    if (initPromise) return initPromise
    initPromise = (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        setSession(data?.session)
        await loadProfile()
        // Mantiene el estado al dia cuando el token se refresca solo o cuando la
        // sesion se cierra en otra pestana.
        supabase.auth.onAuthStateChange((_event, next) => {
          setSession(next)
          loadProfile()
        })
        initialized.value = true
      } finally {
        // Si getSession falla, la siguiente navegacion puede reintentar en vez de
        // heredar para siempre la promesa rechazada.
        initPromise = null
      }
    })()
    return initPromise
  }

  async function signIn(email, password) {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      error.value = 'Correo o contraseña incorrectos'
      loading.value = false
      return false
    }
    setSession(data?.session)
    await loadProfile()
    if (!isAdmin.value) {
      // Credenciales validas pero sin permiso: no dejamos una sesion a medias.
      await supabase.auth.signOut()
      setSession(null)
      error.value = 'Esta cuenta no tiene acceso al panel'
      loading.value = false
      return false
    }
    loading.value = false
    return true
  }

  async function signOut() {
    profileGen++
    const { error: err } = await supabase.auth.signOut()
    if (err) {
      // Sin red, auth-js conserva la sesion local y un recargo volveria a entrar.
      // El cierre local no depende del servidor.
      await supabase.auth.signOut({ scope: 'local' })
    }
    setSession(null)
    isAdmin.value = false
  }

  return { session, user, isAdmin, initialized, loading, error, init, signIn, signOut }
})
