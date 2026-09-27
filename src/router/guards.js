const DEFAULT_ADMIN_HOME = '/admin/dashboard'

// Solo aceptamos rutas internas: "//host" o "https://host" saldrian del sitio.
function safeRedirect(value) {
  if (typeof value !== 'string') return DEFAULT_ADMIN_HOME
  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_ADMIN_HOME
  return value
}

// Decide a donde va una navegacion. Es solo experiencia de usuario: la barrera
// real es la RLS de PostgreSQL, que rechaza a cualquiera sin is_admin.
export function resolveAdminRoute(to, auth) {
  const isAdmin = Boolean(auth.session) && auth.isAdmin === true

  if (to.meta?.requiresAdmin) {
    if (isAdmin) return true
    return { name: 'AdminLogin', query: { redirect: to.fullPath } }
  }

  if (to.name === 'AdminLogin' && isAdmin) {
    return { path: safeRedirect(to.query?.redirect) }
  }

  return true
}
