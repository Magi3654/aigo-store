import { defineStore } from 'pinia'

export const useShippingStore = defineStore('shipping', () => {
  // Zonas de envío basadas en los primeros 2 dígitos del CP de México
  const zones = {
    // Zona Metro (CDMX y área metropolitana)
    metro: ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','53','54','55','56','57'],
    // Zona Centro
    centro: ['36','37','38','39','40','42','43','44','45','46','47','48','49','50','51','52','58','59','60','61','62','72','73','74','75','76','90'],
    // Zona Norte
    norte: ['20','21','22','23','24','25','26','27','28','29','31','32','33','34','35','64','65','66','67','78','79','80','81','82','83','84','85'],
    // Zona Sur
    sur: ['29','30','41','68','69','70','71','86','87','91','92','93','94','95','96','97']
  }

  const rates = {
    metro: { standard: 99, express: 179 },
    centro: { standard: 139, express: 229 },
    norte: { standard: 179, express: 299 },
    sur: { standard: 169, express: 279 },
    default: { standard: 199, express: 329 }
  }

  const deliveryDays = {
    metro: { standard: '3-5', express: '1-2' },
    centro: { standard: '4-6', express: '2-3' },
    norte: { standard: '5-8', express: '3-4' },
    sur: { standard: '5-8', express: '3-4' },
    default: { standard: '5-10', express: '3-5' }
  }

  function getZone(postalCode) {
    const prefix = postalCode.toString().substring(0, 2)
    for (const [zone, prefixes] of Object.entries(zones)) {
      if (prefixes.includes(prefix)) return zone
    }
    return 'default'
  }

  function calculateShipping(postalCode) {
    if (!postalCode || postalCode.length !== 5) return null
    const zone = getZone(postalCode)
    return {
      zone,
      zoneName: zone === 'metro' ? 'Zona Metropolitana' : zone === 'centro' ? 'Zona Centro' : zone === 'norte' ? 'Zona Norte' : zone === 'sur' ? 'Zona Sur' : 'Otra zona',
      standard: { cost: rates[zone].standard, days: deliveryDays[zone].standard },
      express: { cost: rates[zone].express, days: deliveryDays[zone].express }
    }
  }

  return { calculateShipping }
})
