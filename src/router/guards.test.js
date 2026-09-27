import { describe, it, expect } from 'vitest'
import { resolveAdminRoute } from './guards.js'

const admin = { session: { user: { id: 'u1' } }, isAdmin: true }
const noAdmin = { session: { user: { id: 'u2' } }, isAdmin: false }
const anon = { session: null, isAdmin: false }

const protectedRoute = {
  name: 'AdminProducts',
  fullPath: '/admin/productos',
  meta: { requiresAdmin: true },
  query: {},
}
const loginRoute = { name: 'AdminLogin', fullPath: '/admin', meta: {}, query: {} }
const publicRoute = { name: 'Home', fullPath: '/', meta: {}, query: {} }

describe('resolveAdminRoute', () => {
  it('deja pasar las rutas publicas', () => {
    expect(resolveAdminRoute(publicRoute, anon)).toBe(true)
  })

  it('deja pasar al admin a una ruta protegida', () => {
    expect(resolveAdminRoute(protectedRoute, admin)).toBe(true)
  })

  it('redirige al login si no hay sesion, conservando el destino', () => {
    expect(resolveAdminRoute(protectedRoute, anon)).toEqual({
      name: 'AdminLogin',
      query: { redirect: '/admin/productos' },
    })
  })

  it('redirige al login a un usuario autenticado que no es admin', () => {
    expect(resolveAdminRoute(protectedRoute, noAdmin)).toEqual({
      name: 'AdminLogin',
      query: { redirect: '/admin/productos' },
    })
  })

  it('rebota al dashboard si un admin visita el login', () => {
    expect(resolveAdminRoute(loginRoute, admin)).toEqual({ path: '/admin/dashboard' })
  })

  it('respeta el redirect al rebotar desde el login', () => {
    const to = { ...loginRoute, query: { redirect: '/admin/productos' } }
    expect(resolveAdminRoute(to, admin)).toEqual({ path: '/admin/productos' })
  })

  it('ignora redirects externos o mal formados', () => {
    for (const redirect of ['https://malo.com', '//malo.com', 'admin/productos', 42]) {
      const to = { ...loginRoute, query: { redirect } }
      expect(resolveAdminRoute(to, admin)).toEqual({ path: '/admin/dashboard' })
    }
  })

  it('deja ver el login a quien no es admin', () => {
    expect(resolveAdminRoute(loginRoute, anon)).toBe(true)
    expect(resolveAdminRoute(loginRoute, noAdmin)).toBe(true)
  })
})
