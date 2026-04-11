import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useProductsStore = defineStore('products', () => {
  const products = ref([
    {
      id: 1,
      name: 'BTS - Album "Proof"',
      category: 'Albums',
      group: 'BTS',
      price: 850,
      image: 'https://placehold.co/400x400/F3E8EE/936DA4?text=BTS+Proof',
      description: 'Álbum antología de BTS con 3 CDs, photobook y photocards exclusivas.',
      stock: 15
    },
    {
      id: 2,
      name: 'BLACKPINK - Lightstick Ver.2',
      category: 'Lightsticks',
      group: 'BLACKPINK',
      price: 1200,
      image: 'https://placehold.co/400x400/FCD4C5/B06B8A?text=BP+Lightstick',
      description: 'Lightstick oficial de BLACKPINK versión 2 con Bluetooth.',
      stock: 8
    },
    {
      id: 3,
      name: 'Stray Kids - Hoodie "MANIAC"',
      category: 'Ropa',
      group: 'Stray Kids',
      price: 750,
      image: 'https://placehold.co/400x400/E1C7EA/936DA4?text=SKZ+Hoodie',
      description: 'Hoodie oficial de la gira MANIAC de Stray Kids. Material premium.',
      stock: 20
    },
    {
      id: 4,
      name: 'TWICE - Album "READY TO BE"',
      category: 'Albums',
      group: 'TWICE',
      price: 650,
      image: 'https://placehold.co/400x400/E1C7EA/BB82A8?text=TWICE+RTB',
      description: 'Álbum READY TO BE de TWICE. Incluye photobook y photocards random.',
      stock: 12
    },
    {
      id: 5,
      name: 'BTS - Photocards Set (7pcs)',
      category: 'Photocards',
      group: 'BTS',
      price: 350,
      image: 'https://placehold.co/400x400/FCD4C5/C18797?text=BTS+PCs',
      description: 'Set de 7 photocards oficiales de BTS. Edición especial.',
      stock: 30
    },
    {
      id: 6,
      name: 'SEVENTEEN - Lightstick Ver.3',
      category: 'Lightsticks',
      group: 'SEVENTEEN',
      price: 1100,
      image: 'https://placehold.co/400x400/F3E8EE/A583AA?text=SVT+Lightstick',
      description: 'Lightstick oficial de SEVENTEEN versión 3. Carat Bong.',
      stock: 10
    },
    {
      id: 7,
      name: 'NewJeans - Album "Get Up"',
      category: 'Albums',
      group: 'NewJeans',
      price: 550,
      image: 'https://placehold.co/400x400/F3E8EE/936DA4?text=NJ+GetUp',
      description: 'Mini álbum "Get Up" de NewJeans en formato de bolsa.',
      stock: 25
    },
    {
      id: 8,
      name: 'ATEEZ - Poster Set',
      category: 'Posters',
      group: 'ATEEZ',
      price: 280,
      image: 'https://placehold.co/400x400/E1C7EA/936DA4?text=ATEEZ+Poster',
      description: 'Set de 4 posters oficiales de ATEEZ. Tamaño A3.',
      stock: 18
    },
    {
      id: 9,
      name: 'aespa - Album "MY WORLD"',
      category: 'Albums',
      group: 'aespa',
      price: 600,
      image: 'https://placehold.co/400x400/E1C7EA/BB82A8?text=aespa+MW',
      description: 'Tercer mini álbum de aespa "MY WORLD". Incluye photocards y poster.',
      stock: 14
    },
    {
      id: 10,
      name: 'Stray Kids - Lightstick "Nachimbong"',
      category: 'Lightsticks',
      group: 'Stray Kids',
      price: 1050,
      image: 'https://placehold.co/400x400/FCD4C5/B06B8A?text=SKZ+LS',
      description: 'Lightstick oficial de Stray Kids. Nachimbong con Bluetooth.',
      stock: 6
    },
    {
      id: 11,
      name: 'BLACKPINK - T-shirt "Born Pink"',
      category: 'Ropa',
      group: 'BLACKPINK',
      price: 550,
      image: 'https://placehold.co/400x400/F3E8EE/936DA4?text=BP+Tshirt',
      description: 'Playera oficial de la gira BORN PINK. 100% algodón.',
      stock: 22
    },
    {
      id: 12,
      name: 'LE SSERAFIM - Album "UNFORGIVEN"',
      category: 'Albums',
      group: 'LE SSERAFIM',
      price: 580,
      image: 'https://placehold.co/400x400/F3E8EE/A583AA?text=LSF+Album',
      description: 'Primer álbum de estudio de LE SSERAFIM. Incluye photobook y PCs.',
      stock: 16
    }
  ])

  const categories = computed(() => [...new Set(products.value.map(p => p.category))])
  const groups = computed(() => [...new Set(products.value.map(p => p.group))])

  function getProductById(id) {
    return products.value.find(p => p.id === Number(id))
  }

  function updateProduct(id, data) {
    const index = products.value.findIndex(p => p.id === Number(id))
    if (index !== -1) {
      products.value[index] = { ...products.value[index], ...data }
    }
  }

  function addProduct(product) {
    const maxId = Math.max(...products.value.map(p => p.id), 0)
    products.value.push({ ...product, id: maxId + 1 })
  }

  function deleteProduct(id) {
    products.value = products.value.filter(p => p.id !== Number(id))
  }

  return { products, categories, groups, getProductById, updateProduct, addProduct, deleteProduct }
})
