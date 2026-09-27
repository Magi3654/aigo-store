import { describe, it, expect, beforeEach, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('./supabase.js', () => ({ supabase: { rpc } }))

import {
  normalizeOrderNumber, displayStatus, historyLabel, safeTrackingUrl, trackOrder,
} from './trackOrder.js'

beforeEach(() => {
  rpc.mockReset()
})

describe('normalizeOrderNumber', () => {
  it('quita espacios y pasa a mayusculas', () => {
    expect(normalizeOrderNumber('  aigo-3fa91c07 ')).toBe('AIGO-3FA91C07')
  })

  it('tolera valores que no son texto', () => {
    expect(normalizeOrderNumber(undefined)).toBe('')
    expect(normalizeOrderNumber(['AIGO-1'])).toBe('')
  })
})

describe('displayStatus', () => {
  const cases = [
    ['paid', 'cancelled', 'cancelled', 'Cancelado'],
    ['pending', 'cancelled', 'cancelled', 'Cancelado'],
    ['refunded', 'shipped', 'refunded', 'Reembolsado'],
    ['failed', 'pending', 'payment_failed', 'Pago rechazado'],
    ['pending', 'pending', 'awaiting_payment', 'Esperando pago'],
    ['paid', 'pending', 'paid', 'Pago confirmado'],
    ['paid', 'preparing', 'preparing', 'En preparación'],
    ['paid', 'shipped', 'shipped', 'Enviado'],
    ['paid', 'delivered', 'delivered', 'Entregado'],
  ]

  it.each(cases)('pago %s + envio %s -> %s', (payment, fulfillment, key, label) => {
    expect(displayStatus(payment, fulfillment)).toEqual({ key, label })
  })

  it('un estado de pago inesperado nunca se muestra como pagado', () => {
    expect(displayStatus(null, 'pending')).toEqual({ key: 'awaiting_payment', label: 'Esperando pago' })
    expect(displayStatus('raro', 'shipped')).toEqual({ key: 'awaiting_payment', label: 'Esperando pago' })
  })
})

describe('historyLabel', () => {
  it('traduce los estados conocidos', () => {
    expect(historyLabel('pending')).toBe('Pedido creado')
    expect(historyLabel('paid')).toBe('Pago confirmado')
    expect(historyLabel('failed')).toBe('Pago rechazado')
    expect(historyLabel('refunded')).toBe('Reembolsado')
    expect(historyLabel('preparing')).toBe('En preparación')
    expect(historyLabel('shipped')).toBe('Enviado')
    expect(historyLabel('delivered')).toBe('Entregado')
    expect(historyLabel('cancelled')).toBe('Cancelado')
  })

  it('deja tal cual un estado desconocido', () => {
    expect(historyLabel('en_aduana')).toBe('en_aduana')
  })
})

describe('safeTrackingUrl', () => {
  it('acepta http y https', () => {
    expect(safeTrackingUrl('https://www.fedex.com/x')).toBe('https://www.fedex.com/x')
    expect(safeTrackingUrl('HTTP://dhl.com/x')).toBe('HTTP://dhl.com/x')
  })

  it('rechaza cualquier otro esquema o valor vacio', () => {
    expect(safeTrackingUrl('javascript:alert(1)')).toBe(null)
    expect(safeTrackingUrl('  ')).toBe(null)
    expect(safeTrackingUrl(null)).toBe(null)
  })
})

describe('trackOrder', () => {
  const ORDER = { order_number: 'AIGO-SEED0003', items: [], history: [] }

  it('normaliza la entrada antes de llamar a la RPC', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null })
    await trackOrder(' aigo-seed0003 ', '  cliente@aigo.local ')
    expect(rpc).toHaveBeenCalledWith('track_order', {
      p_order_number: 'AIGO-SEED0003',
      p_email: 'cliente@aigo.local',
    })
  })

  it('devuelve el pedido cuando la RPC lo encuentra', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok', order: ORDER }, error: null })
    expect(await trackOrder('AIGO-SEED0003', 'cliente@aigo.local')).toEqual({ status: 'ok', order: ORDER })
  })

  it('pasa not_found y rate_limited tal cual', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null })
    expect(await trackOrder('A', 'b')).toEqual({ status: 'not_found' })
    rpc.mockResolvedValue({ data: { status: 'rate_limited' }, error: null })
    expect(await trackOrder('A', 'b')).toEqual({ status: 'rate_limited' })
  })

  it('un error de la RPC o una excepcion de red es "error"', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await trackOrder('A', 'b')).toEqual({ status: 'error' })
    rpc.mockRejectedValue(new Error('offline'))
    expect(await trackOrder('A', 'b')).toEqual({ status: 'error' })
  })

  it('una respuesta con forma inesperada es "error"', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null })
    expect(await trackOrder('A', 'b')).toEqual({ status: 'error' })
    rpc.mockResolvedValue({ data: { status: 'otra_cosa' }, error: null })
    expect(await trackOrder('A', 'b')).toEqual({ status: 'error' })
  })
})
