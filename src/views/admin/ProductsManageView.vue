<script setup>
import { useProductsStore } from '../../stores/products'
import { ref } from 'vue'
import AdminLayout from '../../components/AdminLayout.vue'

const store = useProductsStore()
const showForm = ref(false)
const editing = ref(null)
const form = ref(getEmptyForm())

function getEmptyForm() {
  return { name: '', group: '', category: '', price: 0, stock: 0, description: '', image: '' }
}

function openNew() {
  editing.value = null
  form.value = getEmptyForm()
  showForm.value = true
}

function openEdit(product) {
  editing.value = product.id
  form.value = { ...product }
  showForm.value = true
}

function save() {
  if (editing.value) {
    store.updateProduct(editing.value, form.value)
  } else {
    if (!form.value.image) {
      form.value.image = `https://placehold.co/400x400/F3E8EE/936DA4?text=${encodeURIComponent(form.value.name.slice(0,10))}`
    }
    store.addProduct(form.value)
  }
  showForm.value = false
}

function remove(id) {
  store.deleteProduct(id)
}
</script>

<template>
  <AdminLayout>
    <div class="products-header">
      <h1>Gestión de Productos</h1>
      <button class="btn-new" @click="openNew">
        <i class="fas fa-plus"></i> Nuevo Producto
      </button>
    </div>

    <div class="products-table">
      <div class="p-table-header">
        <span>Producto</span><span>Grupo</span><span>Categoría</span><span>Precio</span><span>Stock</span><span>Acciones</span>
      </div>
      <div v-for="product in store.products" :key="product.id" class="p-table-row">
        <div class="p-product">
          <img :src="product.image" :alt="product.name" />
          <span>{{ product.name }}</span>
        </div>
        <span>{{ product.group }}</span>
        <span>{{ product.category }}</span>
        <span class="p-price">${{ product.price.toLocaleString() }}</span>
        <span :class="{ 'low-stock': product.stock < 5 }">{{ product.stock }}</span>
        <div class="p-actions">
          <button @click="openEdit(product)" class="btn-edit" title="Editar">
            <i class="fas fa-pen"></i>
          </button>
          <button @click="remove(product.id)" class="btn-delete" title="Eliminar">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal formulario -->
    <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editing ? 'Editar' : 'Nuevo' }} Producto</h2>
          <button @click="showForm = false" class="modal-close"><i class="fas fa-times"></i></button>
        </div>
        <form @submit.prevent="save" class="modal-body">
          <div class="form-group">
            <label>Nombre</label>
            <input v-model="form.name" required />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Grupo</label>
              <input v-model="form.group" required />
            </div>
            <div class="form-group">
              <label>Categoría</label>
              <select v-model="form.category" required>
                <option value="">Seleccionar</option>
                <option>Albums</option>
                <option>Lightsticks</option>
                <option>Ropa</option>
                <option>Photocards</option>
                <option>Posters</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Precio (MXN)</label>
              <input v-model.number="form.price" type="number" min="0" required />
            </div>
            <div class="form-group">
              <label>Stock</label>
              <input v-model.number="form.stock" type="number" min="0" required />
            </div>
          </div>
          <div class="form-group">
            <label>URL de imagen</label>
            <input v-model="form.image" placeholder="https://..." />
          </div>
          <div class="form-group">
            <label>Descripción</label>
            <textarea v-model="form.description" rows="3"></textarea>
          </div>
          <button type="submit" class="btn-save">
            <i class="fas fa-check"></i> {{ editing ? 'Guardar cambios' : 'Crear producto' }}
          </button>
        </form>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
.products-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}
.products-header h1 { font-size: 1.8rem; font-weight: 700; }
.btn-new {
  padding: 10px 20px;
  background: var(--gradient);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s;
}
.btn-new:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(234,146,174,0.3); }

.products-table {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.p-table-header, .p-table-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 0.8fr 0.6fr 0.8fr;
  padding: 12px 20px;
  gap: 12px;
  align-items: center;
  font-size: 0.9rem;
}
.p-table-header {
  background: var(--bg-input);
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-transform: uppercase;
}
.p-table-row { border-top: 1px solid var(--border); }
.p-product {
  display: flex;
  align-items: center;
  gap: 12px;
}
.p-product img {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
}
.p-price { font-weight: 600; color: var(--primary-light); }
.low-stock { color: var(--danger); font-weight: 600; }
.p-actions { display: flex; gap: 8px; }
.btn-edit, .btn-delete {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  transition: all 0.3s;
}
.btn-edit:hover { color: var(--accent); border-color: var(--accent); }
.btn-delete:hover { color: var(--danger); border-color: var(--danger); }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(74,51,71,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}
.modal {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 20px;
  width: 100%;
  max-width: 550px;
  max-height: 85vh;
  overflow-y: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}
.modal-header h2 { font-size: 1.2rem; }
.modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
}
.modal-body { padding: 24px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 0.85rem; margin-bottom: 6px; color: var(--text-muted); }
.form-group input, .form-group select, .form-group textarea {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.95rem;
  resize: vertical;
}
.form-group input:focus, .form-group select:focus, .form-group textarea:focus {
  outline: none;
  border-color: var(--primary);
}
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.btn-save {
  width: 100%;
  padding: 14px;
  background: var(--gradient);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.3s;
}
.btn-save:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(234,146,174,0.3); }

@media (max-width: 768px) {
  .p-table-header { display: none; }
  .p-table-row { grid-template-columns: 1fr 1fr; }
}
</style>
