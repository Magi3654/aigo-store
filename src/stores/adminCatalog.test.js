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

const SESSION_LOST = 'Tu sesión expiró o no tienes permisos; vuelve a iniciar sesión'

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

  it('createProduct inserta el producto inactivo, luego las variantes y al final lo activa', async () => {
    queue.push({ data: { id: 'p9' }, error: null })    // insert products (inactivo)
    queue.push({ data: null, error: null })             // insert product_variants
    queue.push({ data: [{ id: 'p9' }], error: null })   // update is_active
    queue.push({ data: [ROW], error: null })            // refetch
    const store = useAdminCatalogStore()
    const res = await store.createProduct(form())
    expect(res.ok).toBe(true)
    expect(log[0]).toMatchObject({ table: 'products', op: 'insert' })
    expect(log[0].payload.is_active).toBe(false)
    expect(log[1]).toMatchObject({ table: 'product_variants', op: 'insert' })
    expect(log[1].payload[0].product_id).toBe('p9')
    expect(log[2]).toMatchObject({ table: 'products', op: 'update', val: 'p9', payload: { is_active: true } })
    expect(log[3]).toMatchObject({ table: 'products', op: 'select' })
  })

  it('createProduct de un producto inactivo no hace el paso de activacion', async () => {
    queue.push({ data: { id: 'p9' }, error: null })
    queue.push({ data: null, error: null })
    queue.push({ data: [ROW], error: null })
    const store = useAdminCatalogStore()
    const res = await store.createProduct(form({ is_active: false }))
    expect(res.ok).toBe(true)
    expect(log).toHaveLength(3)
    expect(log[2]).toMatchObject({ table: 'products', op: 'select' })
  })

  it('createProduct traduce el nombre duplicado, no toca variantes y recarga', async () => {
    queue.push({ data: null, error: { code: '23505', message: 'violates unique constraint "products_name_key"' } })
    queue.push({ data: [ROW], error: null })   // refetch
    const store = useAdminCatalogStore()
    const res = await store.createProduct(form())
    expect(res).toEqual({ ok: false, error: 'Ya existe un producto con ese nombre' })
    expect(log).toHaveLength(2)
    expect(log[1]).toMatchObject({ table: 'products', op: 'select' })
  })

  it('createProduct borra el producto huerfano si fallan las variantes y recarga', async () => {
    queue.push({ data: { id: 'p9' }, error: null })                                  // insert products
    queue.push({ data: null, error: { code: '23514', message: 'check constraint' } }) // insert variants
    queue.push({ data: [{ id: 'p9' }], error: null })                                 // delete de rescate
    queue.push({ data: [ROW], error: null })                                          // refetch
    const store = useAdminCatalogStore()
    const res = await store.createProduct(form())
    expect(res).toEqual({ ok: false, error: 'Algún valor no cumple las reglas de la base de datos' })
    expect(log[2]).toMatchObject({ table: 'products', op: 'delete', val: 'p9' })
    expect(log[3]).toMatchObject({ table: 'products', op: 'select' })
    expect(log).toHaveLength(4)
  })

  it('createProduct avisa y registra si tambien falla el borrado de rescate', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    queue.push({ data: { id: 'p9' }, error: null })                                  // insert products
    queue.push({ data: null, error: { code: '23514', message: 'check constraint' } }) // insert variants
    queue.push({ data: [], error: null })                                             // delete: 0 filas
    queue.push({ data: [ROW], error: null })                                          // refetch
    const store = useAdminCatalogStore()
    const res = await store.createProduct(form())
    expect(res.ok).toBe(false)
    expect(res.error).toContain('Algún valor no cumple las reglas de la base de datos')
    expect(res.error).toContain('inactivo')
    expect(spy).toHaveBeenCalled()
    expect(log[3]).toMatchObject({ table: 'products', op: 'select' })
    spy.mockRestore()
  })

  it('createProduct deja el producto inactivo y recarga si falla la activacion', async () => {
    queue.push({ data: { id: 'p9' }, error: null })   // insert products
    queue.push({ data: null, error: null })            // insert variants
    queue.push({ data: [], error: null })              // update is_active: 0 filas
    queue.push({ data: [ROW], error: null })           // refetch
    const store = useAdminCatalogStore()
    const res = await store.createProduct(form())
    expect(res).toEqual({ ok: false, error: SESSION_LOST })
    expect(log[3]).toMatchObject({ table: 'products', op: 'select' })
  })

  async function loaded(row = ROW) {
    queue.push({ data: [row], error: null })   // fetchAll inicial
    const store = useAdminCatalogStore()
    await store.fetchAll()
    log.length = 0
    return store
  }

  it('updateProduct aplica el diff de variantes y activa el producto al final', async () => {
    const store = await loaded()

    queue.push({ data: [{ id: 'p1' }], error: null })   // update products (sin is_active)
    queue.push({ data: [{ id: 'v1' }], error: null })   // update de v1
    queue.push({ data: null, error: null })             // insert de la variante nueva
    queue.push({ data: [{ id: 'p1' }], error: null })   // update is_active al final
    queue.push({ data: [ROW], error: null })            // refetch

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
    expect(log[0].payload).not.toHaveProperty('is_active')
    expect(log[1]).toMatchObject({ table: 'product_variants', op: 'update', val: 'v1' })
    expect(log[1].payload.price_cents).toBe(90000)
    expect(log[2]).toMatchObject({ table: 'product_variants', op: 'insert' })
    expect(log[3]).toMatchObject({ table: 'products', op: 'update', val: 'p1', payload: { is_active: true } })
    expect(log[4]).toMatchObject({ table: 'products', op: 'select' })
  })

  it('updateProduct no activa el producto si falla un paso de variantes', async () => {
    const store = await loaded({ ...ROW, is_active: false })

    queue.push({ data: [{ id: 'p1' }], error: null })                                    // update products
    queue.push({ data: [{ id: 'v1' }], error: null })                                    // update v1
    queue.push({ data: null, error: { code: '23505', message: 'product_variants_sku_key' } }) // insert falla

    const res = await store.updateProduct({
      ...form(), id: 'p1', is_active: true,
      variants: [
        { id: 'v1', label: 'Único', sku: null, price_cents: 85000, stock: 14, weight_grams: 300, image_url: null, is_active: true },
        { label: 'Versión B', sku: 'DUP', price_cents: 88000, stock: 4, weight_grams: 300, image_url: null, is_active: true },
      ],
    })

    expect(res).toEqual({ ok: false, error: 'Ese SKU ya está en uso' })
    expect(log).toHaveLength(3)
    expect(log.some((e) => e.table === 'products' && e.payload?.is_active === true)).toBe(false)
  })

  it('updateProduct no desactiva variantes antes de que se inserten las nuevas', async () => {
    // Producto ya publicado: el admin cambia v1 por una variante nueva. Si el insert
    // falla, v1 debe seguir activa para no dejar un producto publicado sin variantes.
    const store = await loaded()

    queue.push({ data: [{ id: 'p1' }], error: null })                                    // update products
    queue.push({ data: null, error: { code: '23505', message: 'product_variants_sku_key' } }) // insert falla

    const res = await store.updateProduct({
      ...form(), id: 'p1', is_active: true,
      variants: [
        { id: 'v1', label: 'Único', sku: null, price_cents: 85000, stock: 15, weight_grams: 300, image_url: null, is_active: false },
        { label: 'Versión B', sku: 'DUP', price_cents: 88000, stock: 4, weight_grams: 300, image_url: null, is_active: true },
      ],
    })

    expect(res).toEqual({ ok: false, error: 'Ese SKU ya está en uso' })
    expect(log.some((e) => e.table === 'product_variants' && e.payload?.is_active === false)).toBe(false)
  })

  it('updateProduct que despublica escribe is_active=false en el primer paso', async () => {
    const store = await loaded()
    queue.push({ data: [{ id: 'p1' }], error: null })   // update products
    queue.push({ data: [{ id: 'v1' }], error: null })   // update v1
    queue.push({ data: [ROW], error: null })            // refetch
    const res = await store.updateProduct({
      ...form(), id: 'p1', is_active: false,
      variants: [{ id: 'v1', label: 'Único', sku: null, price_cents: 85000, stock: 14, weight_grams: 300, image_url: null, is_active: true }],
    })
    expect(res.ok).toBe(true)
    expect(log[0].payload.is_active).toBe(false)
    expect(log).toHaveLength(3)
  })

  it('updateProduct trata 0 filas afectadas como sesion perdida', async () => {
    const store = await loaded()
    queue.push({ data: [], error: null })   // update products: RLS filtro todo
    const res = await store.updateProduct({ ...form(), id: 'p1' })
    expect(res).toEqual({ ok: false, error: SESSION_LOST })
    expect(log).toHaveLength(1)
  })

  it('updateProduct trata 0 filas en la desactivacion de variantes como error', async () => {
    const store = await loaded()
    queue.push({ data: [{ id: 'p1' }], error: null })   // update products
    queue.push({ data: [], error: null })               // desactivar v1: 0 filas
    const res = await store.updateProduct({ ...form(), id: 'p1', is_active: false, variants: [] })
    expect(res).toEqual({ ok: false, error: SESSION_LOST })
    expect(log[1]).toMatchObject({ table: 'product_variants', op: 'update', payload: { is_active: false } })
  })

  it('setProductActive actualiza solo is_active', async () => {
    queue.push({ data: [{ id: 'p1' }], error: null })   // update
    queue.push({ data: [ROW], error: null })            // refetch
    const store = useAdminCatalogStore()
    const res = await store.setProductActive('p1', false)
    expect(res.ok).toBe(true)
    expect(log[0]).toMatchObject({ table: 'products', op: 'update', val: 'p1' })
    expect(log[0].payload).toEqual({ is_active: false })
  })

  it('setProductActive con 0 filas afectadas devuelve error y no recarga', async () => {
    queue.push({ data: [], error: null })   // update: sesion perdida, RLS filtra
    const store = useAdminCatalogStore()
    const res = await store.setProductActive('p1', false)
    expect(res).toEqual({ ok: false, error: SESSION_LOST })
    expect(log).toHaveLength(1)
  })
})
