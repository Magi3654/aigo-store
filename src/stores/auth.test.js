import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { authApi, profileResult } = vi.hoisted(() => ({
  authApi: {
    getSession: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
  },
  profileResult: { value: { data: null, error: null } },
}))

vi.mock('../lib/supabase.js', () => {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: () => Promise.resolve(profileResult.value),
  }
  return { supabase: { auth: authApi, from: () => q } }
})

import { useAuthStore } from './auth.js'

const SESSION = { user: { id: 'u1', email: 'admin@aigo.local' }, access_token: 't' }

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  authApi.getSession.mockResolvedValue({ data: { session: null }, error: null })
  authApi.signOut.mockResolvedValue({ error: null })
  authApi.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: () => {} } } })
  profileResult.value = { data: null, error: null }
})

describe('auth store', () => {
  it('init sin sesion deja el estado vacio', async () => {
    const auth = useAuthStore()
    await auth.init()
    expect(auth.session).toBe(null)
    expect(auth.isAdmin).toBe(false)
    expect(auth.initialized).toBe(true)
  })

  it('init con sesion de admin carga el perfil', async () => {
    authApi.getSession.mockResolvedValue({ data: { session: SESSION }, error: null })
    profileResult.value = { data: { is_admin: true }, error: null }
    const auth = useAuthStore()
    await auth.init()
    expect(auth.user.id).toBe('u1')
    expect(auth.isAdmin).toBe(true)
  })

  it('init es idempotente: no vuelve a consultar la sesion', async () => {
    const auth = useAuthStore()
    await auth.init()
    await auth.init()
    expect(authApi.getSession).toHaveBeenCalledTimes(1)
  })

  it('signIn con credenciales validas de admin devuelve true', async () => {
    authApi.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null })
    profileResult.value = { data: { is_admin: true }, error: null }
    const auth = useAuthStore()
    expect(await auth.signIn('admin@aigo.local', 'aigo-admin-local')).toBe(true)
    expect(auth.isAdmin).toBe(true)
    expect(auth.error).toBe(null)
    expect(auth.loading).toBe(false)
  })

  it('signIn con credenciales invalidas devuelve false y mensaje', async () => {
    authApi.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } })
    const auth = useAuthStore()
    expect(await auth.signIn('admin@aigo.local', 'mala')).toBe(false)
    expect(auth.error).toBe('Correo o contraseña incorrectos')
    expect(auth.session).toBe(null)
    expect(auth.loading).toBe(false)
  })

  it('signIn de un usuario sin is_admin cierra la sesion', async () => {
    authApi.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null })
    profileResult.value = { data: { is_admin: false }, error: null }
    const auth = useAuthStore()
    expect(await auth.signIn('cliente@test.com', 'x')).toBe(false)
    expect(authApi.signOut).toHaveBeenCalledTimes(1)
    expect(auth.session).toBe(null)
    expect(auth.isAdmin).toBe(false)
    expect(auth.error).toBe('Esta cuenta no tiene acceso al panel')
  })

  it('signIn de un usuario sin fila en profiles tampoco entra', async () => {
    authApi.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null })
    profileResult.value = { data: null, error: null }
    const auth = useAuthStore()
    expect(await auth.signIn('cliente@test.com', 'x')).toBe(false)
    expect(auth.isAdmin).toBe(false)
  })

  it('signOut limpia el estado', async () => {
    authApi.getSession.mockResolvedValue({ data: { session: SESSION }, error: null })
    profileResult.value = { data: { is_admin: true }, error: null }
    const auth = useAuthStore()
    await auth.init()
    await auth.signOut()
    expect(authApi.signOut).toHaveBeenCalled()
    expect(auth.session).toBe(null)
    expect(auth.user).toBe(null)
    expect(auth.isAdmin).toBe(false)
  })

  describe('respuestas rancias de loadProfile', () => {
    function deferred() {
      let resolve
      const promise = new Promise((r) => { resolve = r })
      return { promise, resolve }
    }

    async function initAndCaptureCallback() {
      const auth = useAuthStore()
      await auth.init()
      return { auth, onChange: authApi.onAuthStateChange.mock.calls[0][0] }
    }

    it('una consulta vieja que resuelve tarde no pisa el estado de un cierre de sesion posterior', async () => {
      const { auth, onChange } = await initAndCaptureCallback()
      const stale = deferred()
      profileResult.value = stale.promise
      onChange('SIGNED_IN', SESSION) // consulta A queda pendiente
      onChange('SIGNED_OUT', null) // sin usuario: isAdmin=false al instante
      stale.resolve({ data: { is_admin: true }, error: null })
      await stale.promise
      await Promise.resolve()
      expect(auth.user).toBe(null)
      expect(auth.isAdmin).toBe(false)
    })

    it('signOut invalida una consulta de perfil en vuelo', async () => {
      const { auth, onChange } = await initAndCaptureCallback()
      const stale = deferred()
      profileResult.value = stale.promise
      onChange('TOKEN_REFRESHED', SESSION)
      await auth.signOut()
      stale.resolve({ data: { is_admin: true }, error: null })
      await stale.promise
      await Promise.resolve()
      expect(auth.isAdmin).toBe(false)
    })
  })
})
