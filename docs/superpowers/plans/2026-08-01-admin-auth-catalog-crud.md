# Fase 2b — Auth de admin + CRUD de catálogo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el panel de administración de demo (contraseña en el bundle + bandera en `localStorage`) por autenticación real de Supabase con guard basado en `is_admin()`, y construir el CRUD de productos y variantes contra la base de datos.

**Architecture:** Un store `auth` es la única fuente de verdad de la sesión y alimenta un guard de router extraído como función pura. El CRUD vive en un store `adminCatalog` separado del store público `products`, apoyado en tres módulos puros y testeables (`money`, `validateProduct`, `variantDiff`) más un traductor de errores de PostgreSQL. La seguridad real la impone la RLS ya existente de la Fase 1; el guard es solo experiencia de usuario.

**Tech Stack:** Vue 3 (`script setup`) + Pinia + vue-router; `@supabase/supabase-js`; Vitest (mock del cliente); Supabase local (PostgREST + GoTrue) y pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-01-admin-auth-catalog-crud-design.md`

## Global Constraints

- **Solo stack local.** El frontend apunta a `http://127.0.0.1:54321`. Sin deploy ni cuentas externas.
- **No hay migraciones nuevas.** El esquema y la RLS de la Fase 1 ya cubren esta fase. Solo cambian `supabase/config.toml`, `supabase/seed.sql` y los tests pgTAP afectados.
- **Precios en centavos** como fuente de verdad; se muestran únicamente con `formatMXN` de `src/lib/format.js`.
- **No tocar:** `src/views/user/CheckoutView.vue` (WIP del usuario, territorio de 2c), `src/stores/shipping.js`, `src/stores/cart.js`, `src/lib/mapProduct.js`, `src/stores/products.js` ni ninguna vista de `src/views/user/`.
- **`src/stores/orders.js` NO se borra:** `CheckoutView` y `TrackingView` aún dependen de él hasta 2c/2d.
- **Categorías válidas** (idénticas al CHECK de la tabla): `Albums`, `Lightsticks`, `Ropa`, `Photocards`, `Posters`.
- **Credenciales del admin sembrado (solo local):** `admin@aigo.local` / `aigo-admin-local`, uuid fijo `00000000-0000-4000-8000-000000000001`.
- **Los subagentes NO ejecutan git.** El controlador del hilo principal hace todos los commits, agregando archivos explícitos. Los pasos de commit de este plan son para él.
- TDD estricto: test que falla → implementación mínima → test verde → commit.
- Valores del stack local (verificar con `supabase status -o env`):
  - `VITE_SUPABASE_URL=http://127.0.0.1:54321`
  - `VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `supabase/config.toml` | Cierra el registro público | 1 |
| `supabase/seed.sql` | Admin local sembrado | 1 |
| `supabase/tests/06_rls_profiles_settings_test.sql` | Hacer hermético frente al admin sembrado | 1 |
| `src/lib/money.js` | `pesosToCents` / `centsToPesos` | 2 |
| `src/stores/auth.js` | Sesión, perfil y `isAdmin` | 3 |
| `src/router/guards.js` | `resolveAdminRoute(to, auth)` puro | 4 |
| `src/router/index.js` | Guard asíncrono, sin `localStorage` | 4 |
| `src/views/admin/AdminLogin.vue` | Formulario de login real | 5 |
| `src/components/AdminLayout.vue` | Cierre de sesión real | 5 |
| `src/lib/validateProduct.js` | Validación del formulario | 6 |
| `src/lib/variantDiff.js` | Diff de variantes | 7 |
| `src/lib/dbError.js` | Traducción de errores de PostgreSQL | 7 |
| `src/stores/adminCatalog.js` | Lectura y escritura del catálogo como admin | 8 |
| `src/views/admin/ProductsManageView.vue` | Lista + filtros (9), modal CRUD (10) | 9, 10 |
| `src/views/admin/DashboardView.vue` | Métricas de catálogo | 11 |
| `src/views/admin/OrdersView.vue` | Placeholder honesto hasta 2c | 11 |
| `README.md` | Cómo crear el admin en la nube | 12 |

---

### Task 1: Cerrar el registro, sembrar el admin local y sanear pgTAP

**Files:**
- Modify: `supabase/config.toml` (línea `enable_signup = true`)
- Modify: `supabase/seed.sql` (append al final)
- Modify: `supabase/tests/06_rls_profiles_settings_test.sql:20` (insertar limpieza antes de sus propios inserts)

**Interfaces:**
- Consumes: nada.
- Produces: un usuario que puede iniciar sesión en el stack local con `admin@aigo.local` / `aigo-admin-local`, uuid `00000000-0000-4000-8000-000000000001`, con `public.profiles.is_admin = true`.

- [ ] **Step 1: Hacer hermético el test 06 (primero el test)**

En `supabase/tests/06_rls_profiles_settings_test.sql`, justo **antes** del bloque
`insert into auth.users (id, email) values` (línea ~16), añade la limpieza siguiendo la
convención que ya usa ese mismo archivo con `settings`:

```sql
-- Vaciamos profiles primero: supabase/seed.sql siembra el admin local y la
-- asercion "admin ve todos los perfiles" de abajo lee la tabla completa.
-- Se revierte con el rollback final.
delete from public.profiles;
```

- [ ] **Step 2: Sembrar el admin al final de `supabase/seed.sql`**

Añade al final del archivo:

```sql
-- ============================================================
-- ADMIN DE DESARROLLO — SOLO PARA EL STACK LOCAL.
-- `supabase db push` NO ejecuta este archivo, asi que esto nunca llega a la
-- nube. En la nube el admin se crea desde Studio (ver README).
-- Credenciales: admin@aigo.local / aigo-admin-local
-- ============================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'admin@aigo.local',
  crypt('aigo-admin-local', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  '', '', '', ''
);

-- GoTrue exige una identidad de tipo email para el login con contrasena.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '{"sub":"00000000-0000-4000-8000-000000000001","email":"admin@aigo.local","email_verified":true,"phone_verified":false}',
  'email',
  now(), now(), now()
);

insert into public.profiles (id, is_admin)
values ('00000000-0000-4000-8000-000000000001', true);
```

> Si `supabase db reset` falla con `function crypt(...) does not exist`, es que
> pgcrypto vive en el esquema `extensions`: cambia `crypt(` por `extensions.crypt(` y
> `gen_salt(` por `extensions.gen_salt(`.

- [ ] **Step 3: Cerrar el registro público**

En `supabase/config.toml`, cambia la línea `enable_signup = true` por:

```toml
enable_signup = false
```

- [ ] **Step 4: Aplicar y verificar la base**

```bash
supabase stop && supabase start
supabase db reset
```

Esperado: reset sin errores (el `enable_signup` requiere reinicio del contenedor de auth,
por eso el `stop`/`start`).

- [ ] **Step 5: Verificar que los 88 tests pgTAP siguen verdes**

```bash
supabase test db
```

Esperado: `All tests successful` y ningún fallo en `06_rls_profiles_settings_test.sql`.
Si falla "admin ve todos los perfiles", el `delete from public.profiles` del Step 1 no
quedó antes de los inserts del test.

- [ ] **Step 6: Verificar que el admin puede iniciar sesión de verdad**

```bash
ANON=$(supabase status -o env | grep ANON_KEY | cut -d= -f2- | tr -d '"')
curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"admin@aigo.local","password":"aigo-admin-local"}' \
  | head -c 120
```

Esperado: un JSON que empieza con `{"access_token":"eyJ...`.
Si devuelve `{"code":400,...invalid credentials}`, revisa el insert de `auth.identities`.

- [ ] **Step 7: Verificar que el registro público está cerrado**

```bash
curl -s -X POST "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"intruso@test.com","password":"123456789"}' | head -c 200
```

Esperado: un error de tipo `signup_disabled` / "Signups not allowed". Si crea el usuario,
el contenedor de auth no recogió el cambio: repite `supabase stop && supabase start`.

- [ ] **Step 8: Commit**

```bash
git add supabase/config.toml supabase/seed.sql supabase/tests/06_rls_profiles_settings_test.sql
git commit -m "feat(db): admin local sembrado y registro publico cerrado"
```

---

### Task 2: `src/lib/money.js` — pesos ↔ centavos

**Files:**
- Create: `src/lib/money.js`
- Test: `src/lib/money.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `pesosToCents(value: string | number): number | null` — `null` si la entrada no es un monto válido.
  - `centsToPesos(cents: number | null | undefined): string` — siempre con dos decimales.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/money.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { pesosToCents, centsToPesos } from './money.js'

describe('pesosToCents', () => {
  it('convierte montos con dos decimales', () => {
    expect(pesosToCents('850.00')).toBe(85000)
    expect(pesosToCents('0')).toBe(0)
    expect(pesosToCents('1234.5')).toBe(123450)
  })

  it('no arrastra errores de punto flotante', () => {
    expect(pesosToCents('19.99')).toBe(1999)
    expect(pesosToCents('1.005')).toBe(null)
  })

  it('acepta numeros ademas de cadenas', () => {
    expect(pesosToCents(850)).toBe(85000)
    expect(pesosToCents(19.99)).toBe(1999)
  })

  it('ignora separadores de miles y espacios', () => {
    expect(pesosToCents(' 1,234.50 ')).toBe(123450)
  })

  it('devuelve null ante entradas invalidas', () => {
    expect(pesosToCents('')).toBe(null)
    expect(pesosToCents('   ')).toBe(null)
    expect(pesosToCents('abc')).toBe(null)
    expect(pesosToCents('-5')).toBe(null)
    expect(pesosToCents(null)).toBe(null)
    expect(pesosToCents(undefined)).toBe(null)
  })
})

describe('centsToPesos', () => {
  it('formatea con dos decimales', () => {
    expect(centsToPesos(85000)).toBe('850.00')
    expect(centsToPesos(1999)).toBe('19.99')
    expect(centsToPesos(0)).toBe('0.00')
  })

  it('trata null y undefined como cero', () => {
    expect(centsToPesos(null)).toBe('0.00')
    expect(centsToPesos(undefined)).toBe('0.00')
  })

  it('sobrevive la ida y vuelta', () => {
    expect(pesosToCents(centsToPesos(123450))).toBe(123450)
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/lib/money.test.js`
Esperado: FAIL — `Failed to resolve import "./money.js"`.

- [ ] **Step 3: Implementación mínima**

Crea `src/lib/money.js`:

```js
// Los precios viven en centavos en la base de datos; el formulario del admin
// captura pesos. Math.round evita que 19.99 * 100 = 1998.9999999999998.
const AMOUNT = /^\d+(\.\d{1,2})?$/

export function pesosToCents(value) {
  if (value === null || value === undefined) return null
  const raw = String(value).trim().replace(/,/g, '')
  if (!AMOUNT.test(raw)) return null
  return Math.round(Number(raw) * 100)
}

export function centsToPesos(cents) {
  return ((cents ?? 0) / 100).toFixed(2)
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npx vitest run src/lib/money.test.js`
Esperado: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.js src/lib/money.test.js
git commit -m "feat(fe): conversion pesos<->centavos con money.js"
```

---

### Task 3: `src/stores/auth.js` — sesión y `is_admin`

**Files:**
- Create: `src/stores/auth.js`
- Test: `src/stores/auth.test.js`

**Interfaces:**
- Consumes: `supabase` de `src/lib/supabase.js`.
- Produces: `useAuthStore()` con `session`, `user`, `isAdmin`, `initialized`, `loading`, `error` (refs) y las acciones `init(): Promise<void>`, `signIn(email, password): Promise<boolean>`, `signOut(): Promise<void>`.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/stores/auth.test.js`:

```js
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
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/stores/auth.test.js`
Esperado: FAIL — `Failed to resolve import "./auth.js"`.

- [ ] **Step 3: Implementación mínima**

Crea `src/stores/auth.js`:

```js
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

  function setSession(value) {
    session.value = value ?? null
    user.value = value?.user ?? null
  }

  async function loadProfile() {
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
    isAdmin.value = data?.is_admin === true
  }

  async function init() {
    if (initialized.value) return
    if (initPromise) return initPromise
    initPromise = (async () => {
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
      initPromise = null
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
    await supabase.auth.signOut()
    setSession(null)
    isAdmin.value = false
  }

  return { session, user, isAdmin, initialized, loading, error, init, signIn, signOut }
})
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npx vitest run src/stores/auth.test.js`
Esperado: PASS, 8 tests.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `npm test`
Esperado: los 15 tests de la Fase 2a + los nuevos, todos verdes.

- [ ] **Step 6: Commit**

```bash
git add src/stores/auth.js src/stores/auth.test.js
git commit -m "feat(fe): store de auth con validacion de is_admin"
```

---

### Task 4: Guard real de rutas

**Files:**
- Create: `src/router/guards.js`
- Test: `src/router/guards.test.js`
- Modify: `src/router/index.js:25-30` (el `beforeEach` con `localStorage`)

**Interfaces:**
- Consumes: `useAuthStore()` de la Task 3.
- Produces: `resolveAdminRoute(to, auth): true | RouteLocationRaw` — función pura; `to` es un objeto con `meta`, `name`, `fullPath` y `query`; `auth` es cualquier objeto con `session` e `isAdmin`.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/router/guards.test.js`:

```js
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
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/router/guards.test.js`
Esperado: FAIL — `Failed to resolve import "./guards.js"`.

- [ ] **Step 3: Implementación mínima**

Crea `src/router/guards.js`:

```js
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
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npx vitest run src/router/guards.test.js`
Esperado: PASS, 8 tests.

- [ ] **Step 5: Cablear el guard en el router**

En `src/router/index.js`, reemplaza el bloque completo:

```js
router.beforeEach((to) => {
  if (to.meta.requiresAdmin) {
    const admin = localStorage.getItem('aigo_admin')
    if (!admin) return { name: 'AdminLogin' }
  }
})
```

por:

```js
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()
  return resolveAdminRoute(to, auth)
})
```

y añade los imports al principio del archivo, debajo del import de `vue-router`:

```js
import { useAuthStore } from '../stores/auth.js'
import { resolveAdminRoute } from './guards.js'
```

> `main.js` hace `app.use(createPinia())` antes de `app.use(router)`, así que
> `useAuthStore()` dentro del guard siempre encuentra una instancia de Pinia activa.

- [ ] **Step 6: Verificar que no queda rastro de la bandera falsa en el router**

```bash
grep -rn "aigo_admin" src/router/
```

Esperado: sin resultados.

- [ ] **Step 7: Verificar la suite completa y el build**

```bash
npm test && npm run build
```

Esperado: todos los tests verdes y build sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/router/guards.js src/router/guards.test.js src/router/index.js
git commit -m "feat(fe): guard de rutas admin sobre la sesion de Supabase"
```

---

### Task 5: Login real y cierre de sesión

**Files:**
- Modify: `src/views/admin/AdminLogin.vue` (reescribir `<script setup>` y el formulario; conservar los estilos)
- Modify: `src/components/AdminLayout.vue:1-10` (la función `logout`)

**Interfaces:**
- Consumes: `useAuthStore()` (Task 3), `resolveAdminRoute` ya cableado (Task 4).
- Produces: nada que consuman tareas posteriores.

- [ ] **Step 1: Reescribir el `<script setup>` de `AdminLogin.vue`**

Reemplaza las líneas 1-19 (todo el bloque `<script setup>`) por:

```vue
<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const password = ref('')

async function login() {
  const ok = await auth.signIn(email.value.trim(), password.value)
  if (!ok) return
  const redirect = route.query.redirect
  const target = typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/admin/dashboard'
  router.push(target)
}
</script>
```

- [ ] **Step 2: Reescribir el formulario**

Reemplaza el `<form>` completo del template (líneas ~27-34) por:

```vue
      <form @submit.prevent="login">
        <div class="form-group">
          <label>Correo</label>
          <input v-model="email" type="email" autocomplete="username" placeholder="admin@aigo.local" required />
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
```

Añade al final del bloque `<style scoped>`:

```css
.btn-login:disabled { opacity: 0.6; transform: none; box-shadow: none; }
```

- [ ] **Step 3: Cierre de sesión real en `AdminLayout.vue`**

Reemplaza las líneas 1-10 (el bloque `<script setup>`) por:

```vue
<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()

async function logout() {
  await auth.signOut()
  router.push('/admin')
}
</script>
```

- [ ] **Step 4: Verificar que la bandera falsa desapareció del código**

```bash
grep -rn "aigo_admin\|aigo2026" src/
```

Esperado: sin resultados.

- [ ] **Step 5: Verificación en vivo**

```bash
npm run dev
```

Con el navegador en `http://localhost:5173` (o el puerto que imprima Vite):

1. Ir a `/admin/productos` sin sesión → debe redirigir a `/admin?redirect=/admin/productos`.
2. Intentar entrar con `admin@aigo.local` / `mala` → mensaje "Correo o contraseña incorrectos".
3. Entrar con `admin@aigo.local` / `aigo-admin-local` → aterriza en `/admin/productos`.
4. Recargar la página (F5) estando dentro → sigue autenticado, no rebota al login.
5. "Cerrar sesión" → vuelve a `/admin`; visitar `/admin/dashboard` a mano redirige al login.

Esperado: los cinco puntos se cumplen. Si el punto 4 falla, `init()` no está esperándose
en el guard.

- [ ] **Step 6: Suite y build**

```bash
npm test && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/views/admin/AdminLogin.vue src/components/AdminLayout.vue
git commit -m "feat(fe): login y logout reales con Supabase Auth"
```

---

### Task 6: `src/lib/validateProduct.js`

**Files:**
- Create: `src/lib/validateProduct.js`
- Test: `src/lib/validateProduct.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `CATEGORIES: string[]`
  - `validateProduct(form): object` — mapa de errores; vacío si todo está bien. Claves posibles: `name`, `group`, `category`, `variants`, `variantErrors` (arreglo paralelo a `form.variants`, un objeto por variante con claves `label`, `price_cents`, `stock`, `weight_grams`).
  - `isValid(errors): boolean`
- Forma de `form`: `{ name, group, category, description, image_url, is_active, variants: [{ id?, label, sku, price_cents, stock, weight_grams, image_url, is_active }] }`.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/validateProduct.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { validateProduct, isValid, CATEGORIES } from './validateProduct.js'

function form(overrides = {}) {
  return {
    name: 'BTS - Album Proof',
    group: 'BTS',
    category: 'Albums',
    description: '',
    image_url: '',
    is_active: true,
    variants: [
      { label: 'Único', sku: null, price_cents: 85000, stock: 15, weight_grams: 300, image_url: null, is_active: true },
    ],
    ...overrides,
  }
}

describe('validateProduct', () => {
  it('acepta un formulario correcto', () => {
    const errors = validateProduct(form())
    expect(errors).toEqual({})
    expect(isValid(errors)).toBe(true)
  })

  it('exige nombre, grupo y categoria valida', () => {
    expect(validateProduct(form({ name: '   ' })).name).toBeTruthy()
    expect(validateProduct(form({ group: '' })).group).toBeTruthy()
    expect(validateProduct(form({ category: 'Peluches' })).category).toBeTruthy()
  })

  it('expone las categorias del CHECK de la tabla', () => {
    expect(CATEGORIES).toEqual(['Albums', 'Lightsticks', 'Ropa', 'Photocards', 'Posters'])
  })

  it('exige al menos una variante', () => {
    expect(validateProduct(form({ variants: [] })).variants).toBeTruthy()
  })

  it('exige que un producto activo tenga una variante activa', () => {
    const errors = validateProduct(form({
      variants: [{ label: 'Único', price_cents: 100, stock: 1, weight_grams: 300, is_active: false }],
    }))
    expect(errors.variants).toBe('Un producto activo necesita al menos una variante activa')
  })

  it('permite un producto inactivo sin variantes activas', () => {
    const errors = validateProduct(form({
      is_active: false,
      variants: [{ label: 'Único', price_cents: 100, stock: 1, weight_grams: 300, is_active: false }],
    }))
    expect(errors).toEqual({})
  })

  it('valida cada variante y reporta el indice', () => {
    const errors = validateProduct(form({
      variants: [
        { label: 'Único', price_cents: 85000, stock: 15, weight_grams: 300, is_active: true },
        { label: '  ', price_cents: null, stock: -1, weight_grams: 0, is_active: true },
      ],
    }))
    expect(errors.variantErrors[0]).toEqual({})
    expect(errors.variantErrors[1].label).toBeTruthy()
    expect(errors.variantErrors[1].price_cents).toBeTruthy()
    expect(errors.variantErrors[1].stock).toBeTruthy()
    expect(errors.variantErrors[1].weight_grams).toBe('El peso debe ser mayor a 0')
    expect(isValid(errors)).toBe(false)
  })

  it('rechaza precios y stock no enteros', () => {
    const errors = validateProduct(form({
      variants: [{ label: 'Único', price_cents: 85000.5, stock: 1.5, weight_grams: 300, is_active: true }],
    }))
    expect(errors.variantErrors[0].price_cents).toBeTruthy()
    expect(errors.variantErrors[0].stock).toBeTruthy()
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/lib/validateProduct.test.js`
Esperado: FAIL — `Failed to resolve import "./validateProduct.js"`.

- [ ] **Step 3: Implementación mínima**

Crea `src/lib/validateProduct.js`:

```js
// Mismas categorias que el CHECK de public.products.
export const CATEGORIES = ['Albums', 'Lightsticks', 'Ropa', 'Photocards', 'Posters']

function validateVariant(v) {
  const e = {}
  if (!String(v.label ?? '').trim()) e.label = 'La etiqueta es obligatoria'
  if (!Number.isInteger(v.price_cents) || v.price_cents < 0) e.price_cents = 'Precio inválido'
  if (!Number.isInteger(v.stock) || v.stock < 0) e.stock = 'Stock inválido'
  // Mas estricto que el CHECK de la base (>= 0): un peso de cero rompe la
  // cotizacion de envio de la Fase 2c.
  if (!Number.isInteger(v.weight_grams) || v.weight_grams <= 0) {
    e.weight_grams = 'El peso debe ser mayor a 0'
  }
  return e
}

export function validateProduct(form) {
  const errors = {}
  if (!String(form.name ?? '').trim()) errors.name = 'El nombre es obligatorio'
  if (!String(form.group ?? '').trim()) errors.group = 'El grupo es obligatorio'
  if (!CATEGORIES.includes(form.category)) errors.category = 'Elige una categoría válida'

  const variants = form.variants ?? []
  if (variants.length === 0) {
    errors.variants = 'Agrega al menos una variante'
  } else if (form.is_active && !variants.some((v) => v.is_active)) {
    // Sin variante activa, la tienda mostraria un producto sin nada comprable.
    errors.variants = 'Un producto activo necesita al menos una variante activa'
  }

  const variantErrors = variants.map(validateVariant)
  if (variantErrors.some((e) => Object.keys(e).length > 0)) {
    errors.variantErrors = variantErrors
  }

  return errors
}

export function isValid(errors) {
  return Object.keys(errors).length === 0
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npx vitest run src/lib/validateProduct.test.js`
Esperado: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validateProduct.js src/lib/validateProduct.test.js
git commit -m "feat(fe): validacion del formulario de producto"
```

---

### Task 7: `variantDiff` y traducción de errores de PostgreSQL

**Files:**
- Create: `src/lib/variantDiff.js`
- Create: `src/lib/dbError.js`
- Test: `src/lib/variantDiff.test.js`
- Test: `src/lib/dbError.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `variantDiff(formVariants, loadedVariants): { toInsert, toUpdate, toDeactivate }` — `toInsert` y `toUpdate` son objetos de variante; `toDeactivate` es un arreglo de ids (`string[]`).
  - `describeDbError(error): string | null`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `src/lib/variantDiff.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { variantDiff } from './variantDiff.js'

const loaded = [
  { id: 'v1', label: 'Único', sku: null, price_cents: 85000, stock: 15, weight_grams: 300, image_url: null, is_active: true },
  { id: 'v2', label: 'Talla M', sku: 'SKU-M', price_cents: 75000, stock: 5, weight_grams: 400, image_url: null, is_active: true },
]

describe('variantDiff', () => {
  it('sin cambios no produce operaciones', () => {
    const diff = variantDiff(loaded.map((v) => ({ ...v })), loaded)
    expect(diff).toEqual({ toInsert: [], toUpdate: [], toDeactivate: [] })
  })

  it('detecta una variante nueva (sin id)', () => {
    const nueva = { label: 'Talla L', sku: null, price_cents: 75000, stock: 3, weight_grams: 420, image_url: null, is_active: true }
    const diff = variantDiff([...loaded, nueva], loaded)
    expect(diff.toInsert).toEqual([nueva])
    expect(diff.toUpdate).toEqual([])
  })

  it('detecta cambios de precio y stock', () => {
    const editada = { ...loaded[0], price_cents: 90000, stock: 12 }
    const diff = variantDiff([editada, { ...loaded[1] }], loaded)
    expect(diff.toUpdate).toEqual([editada])
    expect(diff.toInsert).toEqual([])
  })

  it('una variante guardada que se quita del formulario se desactiva', () => {
    const diff = variantDiff([{ ...loaded[0] }], loaded)
    expect(diff.toDeactivate).toEqual(['v2'])
  })

  it('no desactiva dos veces una variante ya inactiva', () => {
    const conInactiva = [loaded[0], { ...loaded[1], is_active: false }]
    const diff = variantDiff([{ ...loaded[0] }], conInactiva)
    expect(diff.toDeactivate).toEqual([])
  })

  it('desactivar desde el formulario cuenta como update, no como baja', () => {
    const desactivada = { ...loaded[1], is_active: false }
    const diff = variantDiff([{ ...loaded[0] }, desactivada], loaded)
    expect(diff.toUpdate).toEqual([desactivada])
    expect(diff.toDeactivate).toEqual([])
  })

  it('trata null y undefined como el mismo valor vacio', () => {
    const igual = { ...loaded[0], sku: undefined, image_url: undefined }
    const diff = variantDiff([igual, { ...loaded[1] }], loaded)
    expect(diff.toUpdate).toEqual([])
  })

  it('funciona con un producto nuevo (sin variantes cargadas)', () => {
    const nueva = { label: 'Único', price_cents: 100, stock: 1, weight_grams: 300, is_active: true }
    expect(variantDiff([nueva], [])).toEqual({ toInsert: [nueva], toUpdate: [], toDeactivate: [] })
  })
})
```

Crea `src/lib/dbError.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { describeDbError } from './dbError.js'

describe('describeDbError', () => {
  it('devuelve null si no hay error', () => {
    expect(describeDbError(null)).toBe(null)
    expect(describeDbError(undefined)).toBe(null)
  })

  it('traduce el nombre de producto duplicado', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "products_name_key"' }
    expect(describeDbError(err)).toBe('Ya existe un producto con ese nombre')
  })

  it('traduce el SKU duplicado', () => {
    const err = { code: '23505', message: 'duplicate key', details: 'Key (sku)=(SKU-M) already exists.', constraint: 'product_variants_sku_key' }
    expect(describeDbError(err)).toBe('Ese SKU ya está en uso')
  })

  it('traduce la falta de permisos', () => {
    expect(describeDbError({ code: '42501', message: 'permission denied for table products' }))
      .toBe('Tu cuenta no tiene permisos para esta acción')
  })

  it('traduce una violacion de CHECK', () => {
    expect(describeDbError({ code: '23514', message: 'new row violates check constraint' }))
      .toBe('Algún valor no cumple las reglas de la base de datos')
  })

  it('cae al mensaje original cuando no reconoce el codigo', () => {
    expect(describeDbError({ code: 'PGRST301', message: 'JWT expired' })).toBe('JWT expired')
  })

  it('tiene un mensaje generico si no hay nada que mostrar', () => {
    expect(describeDbError({})).toBe('Ocurrió un error inesperado')
  })
})
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `npx vitest run src/lib/variantDiff.test.js src/lib/dbError.test.js`
Esperado: FAIL — no se resuelven `./variantDiff.js` ni `./dbError.js`.

- [ ] **Step 3: Implementar `variantDiff.js`**

```js
// Campos que se comparan para decidir si una variante cambio.
const FIELDS = ['label', 'sku', 'price_cents', 'stock', 'weight_grams', 'image_url', 'is_active']

function changed(a, b) {
  return FIELDS.some((f) => (a[f] ?? null) !== (b[f] ?? null))
}

// Compara las variantes del formulario contra las cargadas de la base.
// Las variantes guardadas que el admin quita del formulario NO se borran: se
// desactivan, para no perder el vinculo con los order_items de pedidos futuros.
export function variantDiff(formVariants, loadedVariants) {
  const toInsert = []
  const toUpdate = []
  const toDeactivate = []
  const byId = new Map()

  for (const v of formVariants ?? []) {
    if (v.id) byId.set(v.id, v)
    else toInsert.push(v)
  }

  for (const loaded of loadedVariants ?? []) {
    const current = byId.get(loaded.id)
    if (!current) {
      if (loaded.is_active) toDeactivate.push(loaded.id)
      continue
    }
    if (changed(current, loaded)) toUpdate.push(current)
  }

  return { toInsert, toUpdate, toDeactivate }
}
```

- [ ] **Step 4: Implementar `dbError.js`**

```js
// Traduce los codigos de PostgreSQL/PostgREST a algo que el admin entienda.
export function describeDbError(error) {
  if (!error) return null
  const haystack = `${error.constraint ?? ''} ${error.message ?? ''} ${error.details ?? ''}`

  if (error.code === '23505') {
    if (haystack.includes('products_name_key')) return 'Ya existe un producto con ese nombre'
    if (haystack.includes('product_variants_sku_key')) return 'Ese SKU ya está en uso'
    return 'Ese valor ya existe en la base de datos'
  }
  if (error.code === '42501') return 'Tu cuenta no tiene permisos para esta acción'
  if (error.code === '23514') return 'Algún valor no cumple las reglas de la base de datos'

  return error.message || 'Ocurrió un error inesperado'
}
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `npx vitest run src/lib/variantDiff.test.js src/lib/dbError.test.js`
Esperado: PASS, 15 tests entre los dos archivos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/variantDiff.js src/lib/variantDiff.test.js src/lib/dbError.js src/lib/dbError.test.js
git commit -m "feat(fe): diff de variantes y traduccion de errores de postgres"
```

---

### Task 8: `src/stores/adminCatalog.js`

**Files:**
- Create: `src/stores/adminCatalog.js`
- Test: `src/stores/adminCatalog.test.js`

**Interfaces:**
- Consumes: `supabase`, `describeDbError` (Task 7), `variantDiff` (Task 7).
- Produces: `useAdminCatalogStore()` con:
  - estado: `products` (arreglo de productos mapeados), `loading`, `error`, `loaded`
  - `mapAdminProductRow(row)` — exportada aparte, pura
  - `fetchAll(): Promise<{ ok: boolean, error?: string }>`
  - `createProduct(form): Promise<{ ok: boolean, error?: string }>`
  - `updateProduct(form): Promise<{ ok: boolean, error?: string }>` — `form.id` obligatorio
  - `setProductActive(id, isActive): Promise<{ ok: boolean, error?: string }>`
  - `byId(id)` — devuelve el producto cargado o `undefined`
- Forma del producto mapeado: `{ id, name, group, category, description, image_url, is_active, variants: [{ id, label, sku, price_cents, stock, weight_grams, image_url, is_active }] }`.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/stores/adminCatalog.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock encadenable de PostgREST: cada llamada consume una respuesta de `queue`
// y deja constancia en `log`. El `then` hace que el builder sea awaitable, igual
// que el cliente real.
const { queue, log } = vi.hoisted(() => ({ queue: [], log: [] }))

vi.mock('../lib/supabase.js', () => {
  function builder(table) {
    const state = { table, op: null, payload: null }
    function resolve() {
      log.push({ ...state })
      return Promise.resolve(queue.shift() ?? { data: null, error: null })
    }
    const q = {
      select() { state.op = state.op ?? 'select'; return q },
      insert(payload) { state.op = 'insert'; state.payload = payload; return q },
      update(payload) { state.op = 'update'; state.payload = payload; return q },
      delete() { state.op = 'delete'; return q },
      eq(col, val) { state.col = col; state.val = val; return q },
      in(col, val) { state.col = col; state.val = val; return q },
      order() { return resolve() },
      single() { return resolve() },
      then(onOk, onErr) { return resolve().then(onOk, onErr) },
    }
    return q
  }
  return { supabase: { from: (table) => builder(table) } }
})

import { useAdminCatalogStore, mapAdminProductRow } from './adminCatalog.js'

const ROW = {
  id: 'p1', name: 'BTS Proof', group: 'BTS', category: 'Albums',
  description: 'd', image_url: 'img', is_active: true,
  product_variants: [
    { id: 'v1', label: 'Único', sku: null, price_cents: 85000, stock: 15, weight_grams: 300, image_url: null, is_active: true },
  ],
}

function form(overrides = {}) {
  return {
    name: 'Nuevo', group: 'BTS', category: 'Albums', description: '', image_url: '', is_active: true,
    variants: [{ label: 'Único', sku: null, price_cents: 1000, stock: 2, weight_grams: 300, image_url: null, is_active: true }],
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  queue.length = 0
  log.length = 0
})

describe('mapAdminProductRow', () => {
  it('conserva is_active del producto y de las variantes', () => {
    const p = mapAdminProductRow({ ...ROW, is_active: false })
    expect(p.is_active).toBe(false)
    expect(p.variants[0].is_active).toBe(true)
    expect(p.variants[0].price_cents).toBe(85000)
  })

  it('tolera un producto sin variantes', () => {
    expect(mapAdminProductRow({ ...ROW, product_variants: null }).variants).toEqual([])
  })
})

describe('adminCatalog store', () => {
  it('fetchAll mapea las filas y marca loaded', async () => {
    queue.push({ data: [ROW], error: null })
    const store = useAdminCatalogStore()
    await store.fetchAll()
    expect(store.loaded).toBe(true)
    expect(store.error).toBe(null)
    expect(store.products).toHaveLength(1)
    expect(store.byId('p1').variants[0].stock).toBe(15)
  })

  it('fetchAll registra el error traducido', async () => {
    queue.push({ data: null, error: { code: '42501', message: 'permission denied' } })
    const store = useAdminCatalogStore()
    await store.fetchAll()
    expect(store.error).toBe('Tu cuenta no tiene permisos para esta acción')
    expect(store.loaded).toBe(false)
  })

  it('createProduct inserta el producto y luego sus variantes', async () => {
    queue.push({ data: { id: 'p9' }, error: null })   // insert products
    queue.push({ data: null, error: null })            // insert product_variants
    queue.push({ data: [ROW], error: null })           // refetch
    const store = useAdminCatalogStore()
    const res = await store.createProduct(form())
    expect(res.ok).toBe(true)
    expect(log[0]).toMatchObject({ table: 'products', op: 'insert' })
    expect(log[1]).toMatchObject({ table: 'product_variants', op: 'insert' })
    expect(log[1].payload[0].product_id).toBe('p9')
  })

  it('createProduct traduce el nombre duplicado y no toca variantes', async () => {
    queue.push({ data: null, error: { code: '23505', message: 'violates unique constraint "products_name_key"' } })
    const store = useAdminCatalogStore()
    const res = await store.createProduct(form())
    expect(res).toEqual({ ok: false, error: 'Ya existe un producto con ese nombre' })
    expect(log).toHaveLength(1)
  })

  it('createProduct borra el producto huerfano si fallan las variantes', async () => {
    queue.push({ data: { id: 'p9' }, error: null })                                  // insert products
    queue.push({ data: null, error: { code: '23514', message: 'check constraint' } }) // insert variants
    queue.push({ data: null, error: null })                                           // delete de rescate
    const store = useAdminCatalogStore()
    const res = await store.createProduct(form())
    expect(res.ok).toBe(false)
    expect(log[2]).toMatchObject({ table: 'products', op: 'delete', val: 'p9' })
  })

  it('updateProduct aplica el diff de variantes', async () => {
    queue.push({ data: [ROW], error: null })   // fetchAll inicial
    const store = useAdminCatalogStore()
    await store.fetchAll()
    log.length = 0

    queue.push({ data: null, error: null })    // update products
    queue.push({ data: null, error: null })    // update de v1
    queue.push({ data: null, error: null })    // insert de la variante nueva
    queue.push({ data: [ROW], error: null })   // refetch

    const res = await store.updateProduct({
      id: 'p1', name: 'BTS Proof', group: 'BTS', category: 'Albums',
      description: 'd', image_url: 'img', is_active: true,
      variants: [
        { id: 'v1', label: 'Único', sku: null, price_cents: 90000, stock: 15, weight_grams: 300, image_url: null, is_active: true },
        { label: 'Versión B', sku: null, price_cents: 88000, stock: 4, weight_grams: 300, image_url: null, is_active: true },
      ],
    })

    expect(res.ok).toBe(true)
    expect(log[0]).toMatchObject({ table: 'products', op: 'update', val: 'p1' })
    expect(log[1]).toMatchObject({ table: 'product_variants', op: 'update', val: 'v1' })
    expect(log[1].payload.price_cents).toBe(90000)
    expect(log[2]).toMatchObject({ table: 'product_variants', op: 'insert' })
  })

  it('setProductActive actualiza solo is_active', async () => {
    queue.push({ data: null, error: null })    // update
    queue.push({ data: [ROW], error: null })   // refetch
    const store = useAdminCatalogStore()
    const res = await store.setProductActive('p1', false)
    expect(res.ok).toBe(true)
    expect(log[0]).toMatchObject({ table: 'products', op: 'update', val: 'p1' })
    expect(log[0].payload).toEqual({ is_active: false })
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/stores/adminCatalog.test.js`
Esperado: FAIL — `Failed to resolve import "./adminCatalog.js"`.

- [ ] **Step 3: Implementación mínima**

Crea `src/stores/adminCatalog.js`:

```js
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase.js'
import { describeDbError } from '../lib/dbError.js'
import { variantDiff } from '../lib/variantDiff.js'

// A diferencia de mapProductRow (publico), aqui conservamos is_active: el admin
// necesita ver y editar lo despublicado.
export function mapAdminProductRow(row) {
  const variants = (row.product_variants ?? []).map((v) => ({
    id: v.id,
    label: v.label,
    sku: v.sku ?? null,
    price_cents: v.price_cents,
    stock: v.stock,
    weight_grams: v.weight_grams,
    image_url: v.image_url ?? null,
    is_active: v.is_active,
  }))
  variants.sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return {
    id: row.id,
    name: row.name,
    group: row.group,
    category: row.category,
    description: row.description ?? null,
    image_url: row.image_url ?? null,
    is_active: row.is_active,
    variants,
  }
}

function productPayload(form) {
  return {
    name: form.name.trim(),
    group: form.group.trim(),
    category: form.category,
    description: form.description?.trim() || null,
    image_url: form.image_url?.trim() || null,
    is_active: form.is_active,
  }
}

function variantPayload(v) {
  return {
    label: v.label.trim(),
    sku: v.sku?.trim() || null,
    price_cents: v.price_cents,
    stock: v.stock,
    weight_grams: v.weight_grams,
    image_url: v.image_url?.trim() || null,
    is_active: v.is_active,
  }
}

export const useAdminCatalogStore = defineStore('adminCatalog', () => {
  const products = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  function byId(id) {
    return products.value.find((p) => p.id === id)
  }

  async function fetchAll() {
    loading.value = true
    error.value = null
    // Como admin, products_admin_write (for all) devuelve tambien lo inactivo.
    const { data, error: err } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .order('name')
    if (err) {
      error.value = describeDbError(err)
    } else {
      products.value = data.map(mapAdminProductRow)
      loaded.value = true
    }
    loading.value = false
    return { ok: !err, error: error.value ?? undefined }
  }

  async function createProduct(form) {
    const { data, error: err } = await supabase
      .from('products')
      .insert(productPayload(form))
      .select('id')
      .single()
    if (err) return { ok: false, error: describeDbError(err) }

    const rows = form.variants.map((v) => ({ ...variantPayload(v), product_id: data.id }))
    const { error: vErr } = await supabase.from('product_variants').insert(rows)
    if (vErr) {
      // PostgREST no da transacciones entre llamadas: si las variantes fallan,
      // el producto quedaria huerfano y sin nada comprable. Lo deshacemos.
      await supabase.from('products').delete().eq('id', data.id)
      return { ok: false, error: describeDbError(vErr) }
    }

    await fetchAll()
    return { ok: true }
  }

  async function updateProduct(form) {
    const { error: err } = await supabase
      .from('products')
      .update(productPayload(form))
      .eq('id', form.id)
    if (err) return { ok: false, error: describeDbError(err) }

    const loadedVariants = byId(form.id)?.variants ?? []
    const { toInsert, toUpdate, toDeactivate } = variantDiff(form.variants, loadedVariants)

    for (const v of toUpdate) {
      const { error: uErr } = await supabase
        .from('product_variants')
        .update(variantPayload(v))
        .eq('id', v.id)
      if (uErr) return { ok: false, error: describeDbError(uErr) }
    }

    if (toInsert.length) {
      const rows = toInsert.map((v) => ({ ...variantPayload(v), product_id: form.id }))
      const { error: iErr } = await supabase.from('product_variants').insert(rows)
      if (iErr) return { ok: false, error: describeDbError(iErr) }
    }

    if (toDeactivate.length) {
      const { error: dErr } = await supabase
        .from('product_variants')
        .update({ is_active: false })
        .in('id', toDeactivate)
      if (dErr) return { ok: false, error: describeDbError(dErr) }
    }

    await fetchAll()
    return { ok: true }
  }

  async function setProductActive(id, isActive) {
    const { error: err } = await supabase
      .from('products')
      .update({ is_active: isActive })
      .eq('id', id)
    if (err) return { ok: false, error: describeDbError(err) }
    await fetchAll()
    return { ok: true }
  }

  return {
    products, loading, error, loaded,
    byId, fetchAll, createProduct, updateProduct, setProductActive,
  }
})
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npx vitest run src/stores/adminCatalog.test.js`
Esperado: PASS, 9 tests.

- [ ] **Step 5: Suite completa**

Run: `npm test`
Esperado: todo verde.

- [ ] **Step 6: Commit**

```bash
git add src/stores/adminCatalog.js src/stores/adminCatalog.test.js
git commit -m "feat(fe): store de catalogo para el panel de admin"
```

---

### Task 9: `ProductsManageView.vue` — lista y filtros

**Files:**
- Modify: `src/views/admin/ProductsManageView.vue` (reemplazo completo del placeholder)

**Interfaces:**
- Consumes: `useAdminCatalogStore()` (Task 8), `formatMXN` (`src/lib/format.js`), `CATEGORIES` (Task 6), `AdminLayout`.
- Produces: la vista sobre la que la Task 10 monta el modal.

- [ ] **Step 1: Reemplazar el archivo completo**

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import AdminLayout from '../../components/AdminLayout.vue'
import { useAdminCatalogStore } from '../../stores/adminCatalog.js'
import { formatMXN } from '../../lib/format.js'
import { CATEGORIES } from '../../lib/validateProduct.js'

const catalog = useAdminCatalogStore()

const search = ref('')
const categoryFilter = ref('')
const showInactive = ref(false)

onMounted(() => catalog.fetchAll())

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return catalog.products.filter((p) => {
    if (!showInactive.value && !p.is_active) return false
    if (categoryFilter.value && p.category !== categoryFilter.value) return false
    if (term && !p.name.toLowerCase().includes(term) && !p.group.toLowerCase().includes(term)) return false
    return true
  })
})

function activeVariants(product) {
  return product.variants.filter((v) => v.is_active)
}

function priceRange(product) {
  const prices = activeVariants(product).map((v) => v.price_cents)
  if (!prices.length) return 'sin variantes activas'
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? formatMXN(min) : `${formatMXN(min)} – ${formatMXN(max)}`
}

function totalStock(product) {
  return activeVariants(product).reduce((sum, v) => sum + v.stock, 0)
}

async function toggleActive(product) {
  const res = await catalog.setProductActive(product.id, !product.is_active)
  if (!res.ok) alert(res.error)
}
</script>

<template>
  <AdminLayout>
    <div class="products-header">
      <h1>Productos</h1>
      <button class="btn-primary" disabled>
        <i class="fas fa-plus"></i> Nuevo producto
      </button>
    </div>

    <div class="toolbar">
      <input v-model="search" class="search" type="search" placeholder="Buscar por nombre o grupo…" />
      <select v-model="categoryFilter" class="filter-select">
        <option value="">Todas las categorías</option>
        <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
      </select>
      <label class="checkbox">
        <input v-model="showInactive" type="checkbox" /> Ver inactivos
      </label>
    </div>

    <p v-if="catalog.error" class="error-msg">{{ catalog.error }}</p>
    <p v-else-if="catalog.loading && !catalog.loaded" class="muted">Cargando catálogo…</p>

    <div v-else-if="filtered.length" class="product-list">
      <div v-for="p in filtered" :key="p.id" class="product-row" :class="{ inactive: !p.is_active }">
        <img v-if="p.image_url" :src="p.image_url" :alt="p.name" class="thumb" />
        <div v-else class="thumb thumb-empty"><i class="fas fa-image"></i></div>

        <div class="product-info">
          <p class="product-name">
            {{ p.name }}
            <span v-if="!p.is_active" class="tag">inactivo</span>
          </p>
          <p class="product-meta">
            {{ p.group }} · {{ p.category }} ·
            {{ activeVariants(p).length }} {{ activeVariants(p).length === 1 ? 'variante' : 'variantes' }}
          </p>
        </div>

        <span class="product-price">{{ priceRange(p) }}</span>
        <span class="product-stock" :class="{ zero: totalStock(p) === 0 }">{{ totalStock(p) }} u.</span>

        <div class="row-actions">
          <button class="icon-btn" title="Editar" disabled><i class="fas fa-pen"></i></button>
          <button
            class="icon-btn"
            :title="p.is_active ? 'Despublicar' : 'Republicar'"
            @click="toggleActive(p)"
          >
            <i :class="p.is_active ? 'fas fa-trash' : 'fas fa-rotate-left'"></i>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="empty">
      <i class="fas fa-box-open"></i>
      <p>No hay productos que coincidan con el filtro</p>
    </div>
  </AdminLayout>
</template>

<style scoped>
.products-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
h1 { font-size: 1.8rem; font-weight: 700; }
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--gradient);
  color: white;
  border: none;
  border-radius: 12px;
  padding: 12px 20px;
  font-weight: 600;
}
.btn-primary:disabled { opacity: 0.6; }

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.search, .filter-select {
  padding: 10px 14px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 0.9rem;
}
.search { flex: 1; min-width: 200px; }
.checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.product-list {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.product-row {
  display: grid;
  grid-template-columns: 48px 1fr auto auto auto;
  gap: 14px;
  align-items: center;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
}
.product-row:first-child { border-top: none; }
.product-row.inactive { opacity: 0.55; }
.thumb {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
}
.thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-input);
  color: var(--text-muted);
}
.product-name { font-weight: 600; font-size: 0.95rem; }
.product-meta { color: var(--text-muted); font-size: 0.8rem; }
.tag {
  font-size: 0.65rem;
  background: var(--bg-input);
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: 6px;
  text-transform: uppercase;
}
.product-price { font-weight: 600; font-size: 0.9rem; }
.product-stock { color: var(--text-muted); font-size: 0.85rem; }
.product-stock.zero { color: var(--danger); font-weight: 600; }
.row-actions { display: flex; gap: 6px; }
.icon-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 34px;
  height: 34px;
  color: var(--text-muted);
  transition: all 0.2s;
}
.icon-btn:hover:not(:disabled) { color: var(--primary-light); border-color: var(--primary); }
.icon-btn:disabled { opacity: 0.4; }

.error-msg { color: var(--danger); margin-bottom: 16px; }
.muted { color: var(--text-muted); }
.empty { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty i { font-size: 2.5rem; margin-bottom: 12px; color: var(--primary-light); }

@media (max-width: 768px) {
  .product-row { grid-template-columns: 40px 1fr auto; }
  .product-price, .product-stock { grid-column: 2 / -1; font-size: 0.8rem; }
}
</style>
```

- [ ] **Step 2: Verificación en vivo**

```bash
npm run dev
```

Con sesión de admin, ir a `/admin/productos`:

1. Se listan los 12 productos del seed con su precio y stock.
2. Buscar "BTS" deja 2 filas; el filtro de categoría "Lightsticks" deja 3.
3. Pulsar 🗑 en uno lo atenúa y lo saca de la lista (porque "Ver inactivos" está apagado);
   al encender "Ver inactivos" reaparece con la etiqueta *inactivo* y el icono ↺.
4. Pulsar ↺ lo republica.
5. Abrir la tienda pública en `/productos`: el producto despublicado no aparece; tras
   republicarlo, vuelve.

Esperado: los cinco puntos se cumplen. Los botones "Nuevo producto" y ✎ están
deshabilitados a propósito hasta la Task 10.

- [ ] **Step 3: Suite y build**

```bash
npm test && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/views/admin/ProductsManageView.vue
git commit -m "feat(fe): lista de productos del admin con filtros y despublicado"
```

---

### Task 10: `ProductsManageView.vue` — modal de creación y edición

**Files:**
- Modify: `src/views/admin/ProductsManageView.vue` (añadir estado del modal, el bloque del modal en el template y sus estilos)

**Interfaces:**
- Consumes: `validateProduct`, `isValid`, `CATEGORIES` (Task 6); `pesosToCents`, `centsToPesos` (Task 2); `createProduct`, `updateProduct` (Task 8).
- Produces: el CRUD completo.

- [ ] **Step 1: Ampliar el `<script setup>`**

Sustituye la línea de import de `validateProduct.js` por:

```js
import { CATEGORIES, validateProduct, isValid } from '../../lib/validateProduct.js'
import { pesosToCents, centsToPesos } from '../../lib/money.js'
```

Y añade, después de la función `toggleActive`, todo este bloque:

```js
const modalOpen = ref(false)
const saving = ref(false)
const formError = ref(null)
const errors = ref({})
const editingId = ref(null)

// El formulario captura pesos como texto (price) y los convierte a centavos al
// guardar; asi el admin nunca ve centavos y no arrastramos errores de float.
function emptyVariant() {
  return { id: null, label: '', sku: '', price: '', stock: 0, weight_grams: 0, image_url: '', is_active: true }
}

const form = ref(null)

function openCreate() {
  editingId.value = null
  errors.value = {}
  formError.value = null
  form.value = {
    name: '', group: '', category: 'Albums', description: '', image_url: '',
    is_active: true, variants: [emptyVariant()],
  }
  modalOpen.value = true
}

function openEdit(product) {
  editingId.value = product.id
  errors.value = {}
  formError.value = null
  form.value = {
    name: product.name,
    group: product.group,
    category: product.category,
    description: product.description ?? '',
    image_url: product.image_url ?? '',
    is_active: product.is_active,
    variants: product.variants.map((v) => ({
      id: v.id,
      label: v.label,
      sku: v.sku ?? '',
      price: centsToPesos(v.price_cents),
      stock: v.stock,
      weight_grams: v.weight_grams,
      image_url: v.image_url ?? '',
      is_active: v.is_active,
    })),
  }
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  form.value = null
}

function addVariant() {
  form.value.variants.push(emptyVariant())
}

// Una variante ya guardada no se borra: se desactiva, para no romper el vinculo
// con los pedidos. Una recien anadida simplemente se quita del formulario.
function removeVariant(index) {
  const v = form.value.variants[index]
  if (v.id) v.is_active = false
  else form.value.variants.splice(index, 1)
}

// Convierte el formulario (pesos como texto) al shape que validan y guardan los
// modulos: precios en centavos y numeros enteros.
function toPayload() {
  return {
    id: editingId.value,
    name: form.value.name,
    group: form.value.group,
    category: form.value.category,
    description: form.value.description,
    image_url: form.value.image_url,
    is_active: form.value.is_active,
    variants: form.value.variants.map((v) => ({
      id: v.id ?? undefined,
      label: v.label,
      sku: v.sku,
      price_cents: pesosToCents(v.price),
      stock: Number(v.stock),
      weight_grams: Number(v.weight_grams),
      image_url: v.image_url,
      is_active: v.is_active,
    })),
  }
}

async function save() {
  formError.value = null
  const payload = toPayload()
  errors.value = validateProduct(payload)
  if (!isValid(errors.value)) return

  saving.value = true
  const res = editingId.value
    ? await catalog.updateProduct(payload)
    : await catalog.createProduct(payload)
  saving.value = false

  if (!res.ok) {
    formError.value = res.error
    // El estado local puede haber quedado a medias: recargamos desde la base.
    await catalog.fetchAll()
    return
  }
  closeModal()
}

function variantError(index, field) {
  return errors.value.variantErrors?.[index]?.[field] ?? null
}
</script>
```

- [ ] **Step 2: Conectar los botones de la lista**

En el template, cambia el botón "Nuevo producto":

```vue
      <button class="btn-primary" @click="openCreate">
        <i class="fas fa-plus"></i> Nuevo producto
      </button>
```

y el botón de editar de cada fila:

```vue
          <button class="icon-btn" title="Editar" @click="openEdit(p)"><i class="fas fa-pen"></i></button>
```

- [ ] **Step 3: Añadir el modal al template**

Justo antes de `</AdminLayout>`, añade:

```vue
    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingId ? 'Editar producto' : 'Nuevo producto' }}</h2>
          <button class="modal-close" @click="closeModal"><i class="fas fa-times"></i></button>
        </div>

        <div class="modal-body">
          <div class="field">
            <label>Nombre</label>
            <input v-model="form.name" type="text" placeholder="BTS - Album &quot;Proof&quot;" />
            <p v-if="errors.name" class="field-error">{{ errors.name }}</p>
          </div>

          <div class="field-row">
            <div class="field">
              <label>Grupo</label>
              <input v-model="form.group" type="text" placeholder="BTS" />
              <p v-if="errors.group" class="field-error">{{ errors.group }}</p>
            </div>
            <div class="field">
              <label>Categoría</label>
              <select v-model="form.category">
                <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
              </select>
              <p v-if="errors.category" class="field-error">{{ errors.category }}</p>
            </div>
          </div>

          <div class="field">
            <label>URL de la imagen</label>
            <input v-model="form.image_url" type="url" placeholder="https://…" />
          </div>

          <div class="field">
            <label>Descripción</label>
            <textarea v-model="form.description" rows="3"></textarea>
          </div>

          <label class="checkbox">
            <input v-model="form.is_active" type="checkbox" /> Publicado en la tienda
          </label>

          <div class="variants">
            <div class="variants-header">
              <h3>Variantes</h3>
              <button class="btn-ghost" @click="addVariant"><i class="fas fa-plus"></i> Añadir variante</button>
            </div>
            <p v-if="errors.variants" class="field-error">{{ errors.variants }}</p>

            <div
              v-for="(v, i) in form.variants"
              :key="v.id ?? `nueva-${i}`"
              class="variant-row"
              :class="{ off: !v.is_active }"
            >
              <div class="field">
                <label>Etiqueta</label>
                <input v-model="v.label" type="text" placeholder="Único" />
                <p v-if="variantError(i, 'label')" class="field-error">{{ variantError(i, 'label') }}</p>
              </div>
              <div class="field narrow">
                <label>Precio (MXN)</label>
                <input v-model="v.price" type="text" inputmode="decimal" placeholder="850.00" />
                <p v-if="variantError(i, 'price_cents')" class="field-error">{{ variantError(i, 'price_cents') }}</p>
              </div>
              <div class="field narrow">
                <label>Stock</label>
                <input v-model.number="v.stock" type="number" min="0" />
                <p v-if="variantError(i, 'stock')" class="field-error">{{ variantError(i, 'stock') }}</p>
              </div>
              <div class="field narrow">
                <label>Peso (g)</label>
                <input v-model.number="v.weight_grams" type="number" min="1" />
                <p v-if="variantError(i, 'weight_grams')" class="field-error">{{ variantError(i, 'weight_grams') }}</p>
              </div>
              <div class="field narrow">
                <label>SKU</label>
                <input v-model="v.sku" type="text" placeholder="opcional" />
              </div>
              <div class="variant-actions">
                <label class="checkbox small"><input v-model="v.is_active" type="checkbox" /> Activa</label>
                <button class="icon-btn" title="Quitar" @click="removeVariant(i)"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </div>

          <p v-if="formError" class="field-error big">{{ formError }}</p>
        </div>

        <div class="modal-footer">
          <button class="btn-ghost" @click="closeModal">Cancelar</button>
          <button class="btn-primary" :disabled="saving" @click="save">
            {{ saving ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </div>
    </div>
```

- [ ] **Step 4: Añadir los estilos del modal**

Añade al final del bloque `<style scoped>`:

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 100;
}
.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 18px;
  width: 100%;
  max-width: 820px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.modal-header, .modal-footer {
  display: flex;
  align-items: center;
  padding: 18px 22px;
}
.modal-header { justify-content: space-between; border-bottom: 1px solid var(--border); }
.modal-header h2 { font-size: 1.2rem; }
.modal-close { background: none; border: none; color: var(--text-muted); font-size: 1.1rem; }
.modal-body { padding: 22px; overflow-y: auto; }
.modal-footer { justify-content: flex-end; gap: 10px; border-top: 1px solid var(--border); }

.field { margin-bottom: 14px; }
.field label { display: block; margin-bottom: 6px; font-size: 0.8rem; color: var(--text-muted); }
.field input, .field select, .field textarea {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 0.95rem;
  font-family: inherit;
}
.field input:focus, .field select:focus, .field textarea:focus {
  outline: none;
  border-color: var(--primary);
}
.field-row { display: flex; gap: 14px; }
.field-row .field { flex: 1; }
.field-error { color: var(--danger); font-size: 0.78rem; margin-top: 4px; }
.field-error.big { font-size: 0.9rem; margin-top: 14px; }

.variants { margin-top: 20px; border-top: 1px solid var(--border); padding-top: 16px; }
.variants-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.variants-header h3 { font-size: 1rem; }
.variant-row {
  display: grid;
  grid-template-columns: 1.4fr 0.9fr 0.7fr 0.7fr 0.9fr auto;
  gap: 10px;
  align-items: start;
  padding: 12px;
  background: var(--bg-input);
  border-radius: 12px;
  margin-bottom: 10px;
}
.variant-row.off { opacity: 0.5; }
.variant-row .field { margin-bottom: 0; }
.variant-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  padding-top: 22px;
}
.checkbox.small { font-size: 0.78rem; }
.btn-ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 16px;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
}
.btn-ghost:hover { color: var(--primary-light); border-color: var(--primary); }

@media (max-width: 768px) {
  .variant-row { grid-template-columns: 1fr 1fr; }
  .variant-actions { padding-top: 0; flex-direction: row; align-items: center; }
  .field-row { flex-direction: column; gap: 0; }
}
```

- [ ] **Step 5: Verificación en vivo del CRUD**

```bash
npm run dev
```

Con sesión de admin en `/admin/productos`:

1. "Nuevo producto" → guardar vacío muestra los errores de nombre, grupo y variante sin
   llamar a la base.
2. Crear "TEST - Album demo", grupo "TEST", categoría Albums, una variante `Único`
   precio `850.00`, stock 5, peso 300 → aparece en la lista con `$850.00` y `5 u.`
3. Verlo en la tienda pública `/productos` con el precio correcto.
4. Editarlo: precio `900.50`, añadir una segunda variante "Versión B" ($880, 3 u., 300 g)
   → la lista muestra el rango `$880.00 – $900.50` y `8 u.`
5. En el modal, quitar la segunda variante con 🗑 y guardar → queda `1 variante`; en la
   tienda pública ya no se puede elegir esa variante.
6. Intentar crear otro producto con el nombre "TEST - Album demo" → error
   "Ya existe un producto con ese nombre" y no se crea nada.
7. Desmarcar "Publicado en la tienda" con su única variante activa → guarda bien y el
   producto desaparece de la tienda pública.
8. Volver a publicarlo desmarcando "Activa" de todas sus variantes → bloquea con
   "Un producto activo necesita al menos una variante activa".
9. Borrar el producto de prueba despublicándolo (🗑 en la lista).

Esperado: los nueve puntos se cumplen.

- [ ] **Step 6: Limpiar el producto de prueba**

```bash
supabase db reset
```

Esperado: la base vuelve al seed (12 productos + admin sembrado).

- [ ] **Step 7: Suite y build**

```bash
npm test && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/views/admin/ProductsManageView.vue
git commit -m "feat(fe): modal de alta y edicion de productos con variantes"
```

---

### Task 11: Dashboard de catálogo y placeholder de pedidos

**Files:**
- Modify: `src/views/admin/DashboardView.vue` (reemplazo completo)
- Modify: `src/views/admin/OrdersView.vue` (reemplazo completo)

**Interfaces:**
- Consumes: `useAdminCatalogStore()` (Task 8), `formatMXN`.
- Produces: nada que consuman tareas posteriores.

- [ ] **Step 1: Reemplazar `DashboardView.vue` completo**

```vue
<script setup>
import { computed, onMounted } from 'vue'
import AdminLayout from '../../components/AdminLayout.vue'
import { useAdminCatalogStore } from '../../stores/adminCatalog.js'
import { formatMXN } from '../../lib/format.js'

const catalog = useAdminCatalogStore()

onMounted(() => catalog.fetchAll())

// Solo metricas que existen hoy: el catalogo. Los pedidos llegan en la Fase 2c.
const activeVariants = computed(() =>
  catalog.products.flatMap((p) => p.variants.filter((v) => v.is_active))
)

const stats = computed(() => ({
  active: catalog.products.filter((p) => p.is_active).length,
  inactive: catalog.products.filter((p) => !p.is_active).length,
  variants: activeVariants.value.length,
  units: activeVariants.value.reduce((sum, v) => sum + v.stock, 0),
  outOfStock: activeVariants.value.filter((v) => v.stock === 0).length,
  inventoryValue: activeVariants.value.reduce((sum, v) => sum + v.price_cents * v.stock, 0),
}))

const lowStock = computed(() =>
  catalog.products
    .filter((p) => p.is_active)
    .flatMap((p) => p.variants.filter((v) => v.is_active && v.stock < 5).map((v) => ({ product: p, variant: v })))
    .sort((a, b) => a.variant.stock - b.variant.stock)
)
</script>

<template>
  <AdminLayout>
    <h1>Dashboard</h1>

    <p v-if="catalog.error" class="error-msg">{{ catalog.error }}</p>
    <p v-else-if="catalog.loading && !catalog.loaded" class="muted">Cargando catálogo…</p>

    <template v-else>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(234,146,174,0.2); color: #EA92AE;">
            <i class="fas fa-boxes-stacked"></i>
          </div>
          <div>
            <p class="stat-value">{{ stats.active }}</p>
            <p class="stat-label">Productos publicados</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(147,109,164,0.2); color: #936DA4;">
            <i class="fas fa-tags"></i>
          </div>
          <div>
            <p class="stat-value">{{ stats.variants }}</p>
            <p class="stat-label">Variantes activas</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(107,165,137,0.2); color: #6BA589;">
            <i class="fas fa-cubes"></i>
          </div>
          <div>
            <p class="stat-value">{{ stats.units }}</p>
            <p class="stat-label">Unidades en stock</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(200,112,112,0.2); color: #C87070;">
            <i class="fas fa-triangle-exclamation"></i>
          </div>
          <div>
            <p class="stat-value">{{ stats.outOfStock }}</p>
            <p class="stat-label">Variantes agotadas</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(193,135,151,0.2); color: #C18797;">
            <i class="fas fa-sack-dollar"></i>
          </div>
          <div>
            <p class="stat-value">{{ formatMXN(stats.inventoryValue) }}</p>
            <p class="stat-label">Valor del inventario</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(165,131,170,0.2); color: #A583AA;">
            <i class="fas fa-eye-slash"></i>
          </div>
          <div>
            <p class="stat-value">{{ stats.inactive }}</p>
            <p class="stat-label">Productos despublicados</p>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <h2>Bajo stock (menos de 5 unidades)</h2>
          <router-link to="/admin/productos" class="view-all">Gestionar <i class="fas fa-arrow-right"></i></router-link>
        </div>

        <div v-if="lowStock.length" class="stock-table">
          <div class="table-header"><span>Producto</span><span>Variante</span><span>Stock</span></div>
          <div v-for="row in lowStock" :key="row.variant.id" class="table-row">
            <span>{{ row.product.name }}</span>
            <span class="muted">{{ row.variant.label }}</span>
            <span :class="{ zero: row.variant.stock === 0 }">{{ row.variant.stock }} u.</span>
          </div>
        </div>
        <div v-else class="empty"><p>Todo el catálogo tiene 5 o más unidades</p></div>
      </div>

      <p class="note">
        <i class="fas fa-circle-info"></i>
        Las métricas de ventas y pedidos aparecerán cuando el checkout con Stripe entre en
        operación (Fase 2c).
      </p>
    </template>
  </AdminLayout>
</template>

<style scoped>
h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 24px; }
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 30px;
}
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}
.stat-value { font-size: 1.5rem; font-weight: 700; }
.stat-label { font-size: 0.8rem; color: var(--text-muted); }

.section { margin-bottom: 30px; }
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.section-header h2 { font-size: 1.2rem; }
.view-all {
  color: var(--primary-light);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.stock-table {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.table-header, .table-row {
  display: grid;
  grid-template-columns: 2fr 1fr 0.6fr;
  padding: 12px 20px;
  gap: 10px;
  align-items: center;
  font-size: 0.9rem;
}
.table-header {
  background: var(--bg-input);
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-transform: uppercase;
}
.table-row { border-top: 1px solid var(--border); }
.zero { color: var(--danger); font-weight: 600; }
.muted { color: var(--text-muted); }
.error-msg { color: var(--danger); }
.empty { text-align: center; padding: 40px; color: var(--text-muted); }
.note {
  color: var(--text-muted);
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 768px) {
  .table-header { display: none; }
  .table-row { grid-template-columns: 1fr 1fr; gap: 6px; }
}
</style>
```

- [ ] **Step 2: Reemplazar `OrdersView.vue` completo por el placeholder**

```vue
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
```

- [ ] **Step 3: Verificar que el panel ya no depende del store de localStorage**

```bash
grep -rn "stores/orders" src/views/admin/ src/components/
```

Esperado: sin resultados (el store sigue existiendo para `CheckoutView` y `TrackingView`).

- [ ] **Step 4: Verificación en vivo**

```bash
npm run dev
```

1. `/admin/dashboard` muestra 12 productos publicados, 12 variantes activas, 196 unidades
   y el valor del inventario en pesos.
2. La tabla de bajo stock lista las variantes con menos de 5 unidades (con el seed
   original no hay ninguna: debe verse "Todo el catálogo tiene 5 o más unidades").
3. Bajar el stock de una variante a 2 desde `/admin/productos` y recargar el dashboard:
   aparece en la tabla de bajo stock.
4. `/admin/pedidos` muestra el placeholder, sin errores en consola.

- [ ] **Step 5: Suite y build**

```bash
npm test && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/views/admin/DashboardView.vue src/views/admin/OrdersView.vue
git commit -m "feat(fe): dashboard de catalogo y placeholder honesto de pedidos"
```

---

### Task 12: Documentación y verificación final de la fase

**Files:**
- Modify: `README.md` (sección nueva)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la fase cerrada.

- [ ] **Step 1: Documentar el acceso al panel en el README**

Añade al final de `README.md`:

```markdown
## Panel de administración

El acceso al panel usa Supabase Auth. No hay registro público: los administradores se
crean a mano y se marcan en la tabla `profiles`.

### Desarrollo local

`supabase/seed.sql` siembra un admin en cada `supabase db reset`:

- **Correo:** `admin@aigo.local`
- **Contraseña:** `aigo-admin-local`

Esas credenciales son **solo para el stack local**. `supabase db push` no ejecuta el seed,
así que nunca llegan a la nube.

### En la nube

1. En Supabase Studio, **Authentication → Users → Add user**, con correo y contraseña
   propios y "Auto Confirm User" activado.
2. Copiar el UUID del usuario recién creado.
3. En el **SQL Editor**, marcarlo como administrador:

   ```sql
   insert into public.profiles (id, is_admin)
   values ('<uuid-del-usuario>', true)
   on conflict (id) do update set is_admin = true;
   ```

Sin ese paso, el usuario inicia sesión pero el panel lo rechaza: la RLS bloquea toda
lectura y escritura de administración a quien no tenga `is_admin = true`.
```

- [ ] **Step 2: Verificación completa de la fase**

```bash
npm test
npm run build
supabase test db
grep -rn "aigo_admin\|aigo2026" src/ || echo "sin rastros del login falso"
```

Esperado: Vitest todo verde (15 de la Fase 2a + los nuevos), build sin errores,
`All tests successful` en pgTAP y el grep sin resultados.

- [ ] **Step 3: Prueba de humo de extremo a extremo**

```bash
supabase db reset && npm run dev
```

1. `/admin/productos` sin sesión → redirige al login.
2. Login con el admin sembrado → entra al panel.
3. Crear un producto, verlo en la tienda pública, despublicarlo, verlo desaparecer.
4. Cerrar sesión → el panel vuelve a estar bloqueado.
5. Comprobar que un anónimo no puede escribir en el catálogo:

```bash
ANON=$(supabase status -o env | grep ANON_KEY | cut -d= -f2- | tr -d '"')
curl -s -X POST "http://127.0.0.1:54321/rest/v1/products" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"name":"HACK","group":"X","category":"Albums"}' | head -c 200
```

Esperado: error `42501` / "new row violates row-level security policy".

- [ ] **Step 4: Commit final**

```bash
git add README.md
git commit -m "docs: como crear el admin del panel en local y en la nube"
```

---

## Criterios de éxito (verificar al cerrar la fase)

1. El login usa Supabase Auth; `grep -rn "aigo_admin\|aigo2026" src/` no devuelve nada.
2. Un usuario autenticado sin `is_admin` no entra al panel ni puede escribir en el catálogo.
3. El admin crea, edita y despublica productos y variantes desde la UI, y los cambios se
   ven en la tienda pública.
4. El dashboard solo muestra métricas reales de catálogo; ninguna pantalla muestra datos
   inventados.
5. `npm test` verde (15 de la Fase 2a + los nuevos), `supabase test db` con los 88 pgTAP.
6. `npm run build` compila sin errores.
