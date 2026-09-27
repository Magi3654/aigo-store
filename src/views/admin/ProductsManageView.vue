<script setup>
import { ref, computed, onMounted } from 'vue'
import AdminLayout from '../../components/AdminLayout.vue'
import { useAdminCatalogStore } from '../../stores/adminCatalog.js'
import { formatMXN } from '../../lib/format.js'
import { CATEGORIES, validateProduct, isValid } from '../../lib/validateProduct.js'
import { pesosToCents, centsToPesos } from '../../lib/money.js'

const catalog = useAdminCatalogStore()

const search = ref('')
const categoryFilter = ref('')
const showInactive = ref(false)
const actionError = ref(null)

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
  actionError.value = null
  const res = await catalog.setProductActive(product.id, !product.is_active)
  if (!res.ok) actionError.value = res.error
}

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

// Mapea un producto cargado (centavos, shape de la base) al shape del formulario
// (pesos como texto). La usan tanto openEdit como el reintento tras un fallo de
// actualizacion, para no arrastrar ids de variantes ya guardadas como si fueran nuevas.
function formFromProduct(product) {
  return {
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
}

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
  form.value = formFromProduct(product)
  modalOpen.value = true
}

function resetModal() {
  modalOpen.value = false
  form.value = null
}

// Mientras un guardado esta en vuelo el modal no se cierra: su resultado tardio
// acabaria aplicandose a otro modal abierto despues.
function closeModal() {
  if (saving.value) return
  resetModal()
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
  try {
    const res = editingId.value
      ? await catalog.updateProduct(payload)
      : await catalog.createProduct(payload)

    if (!res.ok) {
      formError.value = res.error
      if (editingId.value) {
        // El estado local puede haber quedado a medias: recargamos desde la base y
        // volvemos a poblar el formulario con lo recien cargado, para que un reintento
        // no vuelva a insertar como nuevas las variantes que ya se guardaron. Mientras
        // esto este pendiente, "saving" sigue en true (ver finally) para que Guardar
        // no se reactive y dispare un segundo intento sobre el formulario viejo.
        const reload = await catalog.fetchAll()
        // Si el reload tambien falla, el store conserva los datos de antes de la
        // escritura parcial: byId devolveria el producto sin las variantes que ya
        // se insertaron, y el reseed dejaria el formulario incompleto para un reintento.
        const product = reload.ok ? catalog.byId(editingId.value) : null
        if (product) {
          form.value = formFromProduct(product)
        } else {
          // No hay estado fresco y confiable que mostrar en el formulario: cerramos
          // y dejamos el error en la pagina, igual que en la rama "no encontrado".
          resetModal()
          actionError.value = res.error
        }
      }
      // Una creacion fallida no necesita reseed: el store revierte el insert (o lo
      // deja inactivo) y recarga la lista.
      return
    }
    resetModal()
  } finally {
    saving.value = false
  }
}

function variantError(index, field) {
  return errors.value.variantErrors?.[index]?.[field] ?? null
}
</script>

<template>
  <AdminLayout>
    <div class="products-header">
      <h1>Productos</h1>
      <button class="btn-primary" :disabled="saving" @click="openCreate">
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

    <p v-if="actionError" class="error-msg">{{ actionError }}</p>
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
          <button class="icon-btn" title="Editar" :disabled="saving" @click="openEdit(p)"><i class="fas fa-pen"></i></button>
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

    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingId ? 'Editar producto' : 'Nuevo producto' }}</h2>
          <button class="modal-close" :disabled="saving" @click="closeModal"><i class="fas fa-times"></i></button>
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
          <button class="btn-ghost" :disabled="saving" @click="closeModal">Cancelar</button>
          <button class="btn-primary" :disabled="saving" @click="save">
            {{ saving ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </div>
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
.modal-close:disabled, .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
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
</style>
