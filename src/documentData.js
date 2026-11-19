export const parseStoredAmount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
  const amount = Number(normalized.replace(/[^\d.-]/g, ''))
  return Number.isFinite(amount) ? amount : 0
}

export const normalizeDocumentItems = (items, idPrefix = 'item') => (Array.isArray(items) ? items : []).map((item, index) => {
  const quantity = parseStoredAmount(item.quantity ?? item.qty ?? item.jumlah ?? 1)
  const totalValue = item.total ?? item.lineTotal ?? item.subtotal
  const savedTotal = parseStoredAmount(totalValue)
  const savedPrice = parseStoredAmount(item.price ?? item.unitPrice ?? item.unit_price ?? item.harga)
  const price = savedPrice > 0 ? savedPrice : quantity > 0 && savedTotal > 0 ? savedTotal / quantity : savedPrice
  const calculatedTotal = quantity * price
  const total = totalValue == null || (savedTotal <= 0 && calculatedTotal > 0) ? calculatedTotal : savedTotal

  return {
    ...item,
    id: item.id || idPrefix + '-' + (index + 1),
    name: String(item.name ?? item.productName ?? item.description ?? item.namaAlat ?? ''),
    specification: String(item.specification ?? item.spec ?? 'N/A'),
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit: String(item.unit ?? item.unitName ?? item.satuan ?? 'Unit'),
    price,
    total,
  }
})

export const documentSubtotal = (items = []) => items.reduce((sum, item) => {
  const savedTotal = parseStoredAmount(item.total)
  const calculatedTotal = parseStoredAmount(item.quantity) * parseStoredAmount(item.price)
  return sum + (savedTotal > 0 || calculatedTotal === 0 ? savedTotal : calculatedTotal)
}, 0)

export const docTotal = (document) => {
  const subtotal = documentSubtotal(document.items || [])
  const adjusted = Math.max(0, subtotal + Number(document.shippingFee || 0) - Number(document.discount || 0))
  const rate = Number(document.vatRate || document.pphRate || 0)
  const tax = rate > 0 ? adjusted * rate / 100 : Number(document.vatAmount ?? document.pph ?? 0)
  return adjusted + tax
}
