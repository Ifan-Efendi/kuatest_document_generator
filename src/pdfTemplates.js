import { invoiceCss, quotationCss, receiptCss } from './pdfStyles.js'

const h = (value = '') => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character])
const rupiah = (value) => Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = (value) => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })
const dateLong = (value) => value ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '-'
const companyName = (value) => String(value || '').replace(/Megatama/gi, 'Mega Tama')
const cssDocument = (css) => `<style>${css}
  .company-rule { display: block; width: 100%; height: 1.1mm; position: relative; margin: 4mm 0 3mm; flex: 0 0 auto; }
  .company-rule span { display: block; position: absolute; left: 0; right: 0; border-top: 0.2mm solid #111; }
  .company-rule span:nth-child(1) { top: 0; }
  .company-rule span:nth-child(2) { top: 0.25mm; border-top-width: 0.6mm; }
  .company-rule span:nth-child(3) { top: 0.9mm; }
  .company-header .logo { transform: translateX(2mm); }
  .company-identity .company-description { font-size: 10.5pt; letter-spacing: -0.1pt; word-spacing: -0.5pt; white-space: nowrap; overflow-wrap: normal; }
  .invoice-page .items .summary td[colspan="4"] { border: 0; }
  .invoice-info .label, .invoice-info .right-label { width: 14%; }
  .invoice-info .colon { width: 1%; }
  .invoice-info .value { width: 30%; padding-left: .5mm; padding-right: 1mm; }
  .invoice-info .spacer { width: 4%; }
  .invoice-info .right-value { width: 36%; padding-left: .5mm; }
  .invoice-info .address .value { width: auto; }
  .recipient .colon { width: 1%; }
  .recipient .value { padding-left: .5mm; padding-right: 1mm; }
</style>`
const lineTotal = (item) => Number(item.total ?? Number(item.quantity || 0) * Number(item.price || 0))
const itemSubtotal = (items) => items.reduce((sum, item) => sum + lineTotal(item), 0)

function header(company, logo) {
  return `<header>
    <table class="company-header"><tr>
      <td class="company-logo">${logo ? `<img class="logo" src="${h(logo)}" alt="Logo perusahaan">` : ''}</td>
      <td class="company-identity">
        <div class="company-name">${h(companyName(company.name))}</div>
        <div class="company-description">${h(company.description)}</div>
        <div class="company-meta">SK Menkumham ${h(company.legal_number)} | NIB : ${h(company.business_number)}</div>
        <div class="company-meta company-contact">${company.contactLabel || 'Contact'} : ${h(company.phone)} | E-mail : <a href="mailto:${h(company.email)}">${h(company.email)}</a></div>
        <div class="company-website">Website : <a href="https://${h(company.website)}">${h(company.website)}</a></div>
      </td>
    </tr></table>
    <div class="company-rule"><span></span><span></span><span></span></div>
  </header>`
}

function imageHtml(source, className, alt) {
  return source ? `<img class="${className}" src="${h(source)}" alt="${h(alt)}">` : ''
}

function signImages(settings, document) {
  const combined = document.signatureStamp || settings.signatureStamp
  if (combined) return imageHtml(combined, 'signature-stamp-image', 'Cap dan tanda tangan perusahaan')
  return ''
}

function itemRows(document) {
  return (document.items || []).map((item, index) => `<tr>
    <td>${index + 1}</td><td class="name">${h(item.name)}</td><td class="spec">${h(item.specification || 'N/a')}</td>
    <td class="quantity">${qty(item.quantity)}</td><td class="unit">${h(item.unit)}</td>
    <td class="amount"><div class="money"><span>Rp</span><span class="number">${rupiah(item.price)}</span></div></td>
    <td class="amount"><div class="money"><span>Rp</span><span class="number">${rupiah(lineTotal(item))}</span></div></td>
  </tr>`).join('')
}

function quoteRows(document) {
  const items = document.items || []
  const subtotal = itemSubtotal(items)
  const total = Number(document.total ?? Math.max(0, subtotal + Number(document.shippingFee || 0) - Number(document.discount || 0)))
  const vatRate = Number(document.vatRate || document.pphRate || 0)
  const vat = vatRate > 0 ? total * vatRate / 100 : Number(document.vatAmount ?? document.pph ?? 0)
  const grandTotal = Number(document.grandTotal ?? (total + vat))
  const adjustments = Number(document.shippingFee || 0) > 0 || Number(document.discount || 0) > 0 || vat > 0 || vatRate > 0
  const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const money = (amount, bold = true) => `<div class="money${bold ? ' total-money' : ''}"><span>Rp</span><span class="number">${rupiah(amount)}</span></div>`
  let rows = itemRows(document)
  rows += `<tr><td colspan="3" class="summary-label">Jumlah</td><td class="summary-quantity">${qty(quantity)}</td><td class="summary-quantity">Item</td><td class="summary-label">Total</td><td class="amount">${money(subtotal)}</td></tr>`
  if (Number(document.shippingFee || 0) > 0) rows += `<tr><td class="summary-spacer" colspan="5"></td><td class="total-label">Ongkir :</td><td class="amount">${money(document.shippingFee)}</td></tr>`
  if (Number(document.discount || 0) > 0) rows += `<tr><td class="summary-spacer" colspan="5"></td><td class="total-label">Diskon :</td><td class="amount">${money(document.discount)}</td></tr>`
  if (vat > 0) rows += `<tr><td class="summary-spacer" colspan="5"></td><td class="total-label">PPN${vatRate > 0 ? ` ${qty(vatRate)}%` : ''} :</td><td class="amount">${money(vat)}</td></tr>`
  if (adjustments) rows += `<tr class="grand-total"><td class="summary-spacer" colspan="5"></td><td class="total-label">Grand Total :</td><td class="amount">${money(grandTotal)}</td></tr>`
  const hasDownPayment = document.downPaymentAmount !== null && document.downPaymentAmount !== undefined && document.downPaymentAmount !== ''
  if (document.billingStage === 'dp' || hasDownPayment) {
    const dp = hasDownPayment
      ? Math.min(grandTotal, Math.max(0, Number(document.downPaymentAmount)))
      : Math.round(grandTotal * Number(document.billingPercentage || 0) / 100 * 100) / 100
    const label = hasDownPayment ? 'DP' : document.billingLabel || `DP ${qty(document.billingPercentage)}%`
    rows += `<tr class="dp-billing"><td class="summary-spacer" colspan="5"></td><td class="total-label">${h(label)} :</td><td class="amount">${money(dp)}</td></tr>`
    rows += `<tr class="sisa-billing"><td class="summary-spacer" colspan="5"></td><td class="total-label">Sisa Tagihan :</td><td class="amount">${money(Math.max(0, Math.round((grandTotal - dp) * 100) / 100))}</td></tr>`
  }
  return rows
}

function invoiceRows(document) {
  const items = (document.items || []).filter((item) => String(item.name || '').trim())
  const subtotal = itemSubtotal(items)
  const shipping = Number(document.shippingFee || 0)
  const discount = Number(document.discount || 0)
  const taxable = Number(document.total ?? Math.max(0, subtotal + shipping - discount))
  const vat = Number(document.vatAmount ?? taxable * Number(document.vatRate || 0) / 100)
  const grandTotal = Number(document.grandTotal ?? taxable + vat)
  const hasDownPayment = document.downPaymentAmount !== null && document.downPaymentAmount !== undefined && document.downPaymentAmount !== ''
  const isDp = document.billingStage === 'dp' || hasDownPayment
  let rows = items.map((item, index) => `<tr>
    <td class="index">${index + 1}</td>
    <td class="description"><div class="item-name">${h(item.name)}</div>${item.specification && item.specification !== 'N/A' ? `<div class="item-specification">${h(item.specification)}</div>` : ''}</td>
    <td class="quantity">${qty(item.quantity)}</td><td class="unit">${h(item.unit)}</td>
    <td class="amount">Rp ${rupiah(item.price)}</td><td class="amount">Rp ${rupiah(lineTotal(item))}</td>
  </tr>`).join('')
  if (shipping > 0 || discount > 0 || vat > 0) {
    rows += `<tr class="summary"><td colspan="4"></td><td class="label">Total:</td><td class="amount">Rp ${rupiah(subtotal + shipping)}</td></tr>`
    if (shipping > 0) rows += `<tr class="summary"><td colspan="4"></td><td class="label">Ongkir:</td><td class="amount">Rp ${rupiah(shipping)}</td></tr>`
    if (discount > 0) rows += `<tr class="summary"><td colspan="4"></td><td class="label">Diskon:</td><td class="amount">Rp ${rupiah(discount)}</td></tr><tr class="summary emphasis"><td colspan="4"></td><td class="label">Harga Setelah Diskon:</td><td class="amount">Rp ${rupiah(taxable)}</td></tr>`
    if (vat > 0) rows += `<tr class="summary"><td colspan="4"></td><td class="label">PPN${Number(document.vatRate || 0) > 0 ? ` (${qty(document.vatRate)}%)` : ''}:</td><td class="amount">Rp ${rupiah(vat)}</td></tr>`
    rows += `<tr class="summary billing"><td colspan="4"></td><td class="label">Grand Total:</td><td class="amount">Rp ${rupiah(grandTotal)}</td></tr>`
  } else rows += `<tr class="summary billing"><td colspan="4"></td><td class="label">Grand Total:</td><td class="amount">Rp ${rupiah(subtotal)}</td></tr>`
  if (isDp) {
    const percentage = document.billingStage === 'pelunasan' ? Math.max(0, 100 - Number(document.billingPercentage || 0)) : document.billingStage === 'dp' ? Number(document.billingPercentage || 0) : 100
    const dp = hasDownPayment
      ? Math.min(grandTotal, Math.max(0, Number(document.downPaymentAmount)))
      : Math.round(grandTotal * percentage / 100 * 100) / 100
    const remaining = Math.max(0, Math.round((grandTotal - dp) * 100) / 100)
    const label = hasDownPayment ? 'DP Pembayaran' : h(document.billingLabel || 'Tagihan Penuh')
    rows += `<tr class="summary"><td colspan="4"></td><td class="label">${label}:</td><td class="amount">Rp ${rupiah(dp)}</td></tr><tr class="summary sisa"><td colspan="4"></td><td class="label">Sisa Tagihan:</td><td class="amount">Rp ${rupiah(remaining)}</td></tr>`
  }
  return rows
}

const equipmentPages = (document) => (document.items || []).filter((item) => item.image).map((item) => `<section class="equipment-page"><img src="${h(item.image)}" alt="Gambar alat"></section>`).join('')

function agreementTerms(value, title) {
  if (!String(value || '').trim()) return ''
  const lines = String(value).split(/\r\n|\r|\n/).map((line) => line.trim().replace(/^-\s*/, '')).filter(Boolean)
  return lines.length ? `<div class="terms"><div class="terms-title">${title}</div>${lines.map((line) => `<div class="term-line">&bull; &nbsp;${h(line)}</div>`).join('')}</div>` : ''
}

export function documentPdf(document, company, fileName = '') {
  const invoice = document.type === 'invoice'
  const total = (document.items || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0) + Number(document.shippingFee || 0) - Number(document.discount || 0)
  const hasAdjustments = Number(document.shippingFee || 0) > 0 || Number(document.discount || 0) > 0 || Number(document.vatAmount || document.pph || 0) > 0 || Number(document.vatRate || document.pphRate || 0) > 0
  const invoiceTerms = String(document.paymentTerms || '').trim()
    ? agreementTerms(document.paymentTerms, 'Keterangan:')
    : `<div class="terms"><div class="terms-title">Keterangan:</div><div class="term-line">&bull; &nbsp;Pembayaran Ditransfer Melalui Bank ${h(company.bank_name)}</div><div class="term-line">&bull; &nbsp;No. Rek : ${h(company.bank_account)} Atas Nama : ${h(String(company.bank_account_name || '').toUpperCase())}</div></div>`
  const body = invoice
    ? `<section class="invoice-page">${header({ ...company, contactLabel: 'Kontak' }, company.logo)}
      <h1>INVOICE</h1>
      <table class="invoice-info"><colgroup><col style="width:14%"><col style="width:1%"><col style="width:30%"><col style="width:4%"><col style="width:14%"><col style="width:1%"><col style="width:36%"></colgroup>
        <tr><td class="label">Kepada</td><td class="colon">:</td><td class="value">${h(document.recipientName)}</td><td class="spacer"></td><td class="right-label">No. Invoice</td><td class="colon">:</td><td class="right-value">${h(document.number)}</td></tr>
        <tr><td class="label">Perusahaan</td><td class="colon">:</td><td class="value">${h(document.companyName)}</td><td class="spacer"></td><td class="right-label">Tanggal Terbit</td><td class="colon">:</td><td class="right-value">${dateLong(document.date)}</td></tr>
        <tr><td class="label">No. PO/QUO</td><td class="colon">:</td><td class="value">${h(document.quotationNumber || '-')}</td><td class="spacer"></td><td class="right-label">Jatuh Tempo</td><td class="colon">:</td><td class="right-value">${dateLong(document.dueDate)}</td></tr>
        <tr><td class="label">Jenis Tagihan</td><td class="colon">:</td><td class="value">${h(document.billingLabel || 'Tagihan Penuh')}</td><td class="spacer"></td><td class="right-label"></td><td class="colon"></td><td class="right-value"></td></tr>
        <tr class="address"><td class="label">Alamat</td><td class="colon">:</td><td class="value" colspan="5">${h(document.address || '-')}</td></tr>
      </table>
      <table class="items"><colgroup><col style="width:4.5%"><col style="width:33.5%"><col style="width:8%"><col style="width:8%"><col style="width:23%"><col style="width:23%"></colgroup>
        <thead><tr><th>No</th><th>Deskripsi</th><th>Jumlah</th><th>Satuan</th><th>Harga</th><th>Total</th></tr></thead><tbody>${invoiceRows(document)}</tbody></table>
      ${invoiceTerms}
      <div class="signatures"><div class="signature"><div>${company.city ? `${h(company.city)}, ` : ''}${dateLong(document.date)}</div><div>Hormat kami,</div><div class="signature-art">${signImages(company, document)}</div><div class="signatory-name">${h(company.invoice_signatory_name || company.name)}</div><div>Finance</div></div></div>
      <footer class="footer">Office : ${h(company.address)}</footer></section>${equipmentPages(document)}`
    : `<section class="document-page${hasAdjustments ? ' has-adjustments' : ''}">${header(company, company.logo)}
      <h1>QUOTATION</h1>
      <table class="recipient"><colgroup><col style="width:14%"><col style="width:1%"><col style="width:31%"><col style="width:4%"><col style="width:13%"><col style="width:1%"><col style="width:36%"></colgroup>
        <tr><td class="label">Kepada</td><td class="colon">:</td><td class="value">${h(document.recipientName)}</td><td class="spacer"></td><td class="label">E-mail</td><td class="colon">:</td><td class="value">${h(document.email)}</td></tr>
        <tr><td class="label">Perusahaan</td><td class="colon">:</td><td class="value">${h(document.companyName)}</td><td class="spacer"></td><td class="label">No Quo</td><td class="colon">:</td><td class="value">${h(document.number)}</td></tr>
        <tr><td class="label">Tlp / Fax</td><td class="colon">:</td><td class="value">${h(document.phone)}</td><td class="spacer"></td><td class="label">Tanggal</td><td class="colon">:</td><td class="value">${dateLong(document.date)}</td></tr>
        <tr class="address-row"><td class="label">Alamat</td><td class="colon">:</td><td class="value" colspan="5">${h(document.address)}</td></tr>
      </table>
      <table class="items"><colgroup><col style="width:4.5%"><col style="width:28%"><col style="width:15.5%"><col style="width:6%"><col style="width:6%"><col style="width:20%"><col style="width:20%"></colgroup>
        <thead><tr><th>No</th><th>Nama Alat</th><th>Spesifikasi</th><th colspan="2">Quantity</th><th>Harga</th><th>Total</th></tr></thead><tbody>${quoteRows(document)}</tbody></table>
      ${agreementTerms(document.workConditions, 'Kondisi Perjanjian Kerja :')}${agreementTerms(document.paymentTerms, 'Cara Pembayaran :')}
      <p class="closing">Demikian penawaran ini kami sampaikan. Atas kepercayaan dan kerjasamanya yang baik kami ucapkan terimakasih</p>
      <div class="signatures"><div class="signature"><div class="signature-title">Hormat kami,</div><div class="signature-art">${signImages(company, document)}</div><div class="signatory-space"></div><div class="signatory-name">${h(company.signatory_name || company.name)}</div></div>
      <div class="signature"><div class="signature-title">Konfirmasi Persetujuan Customer</div><div class="customer-sign-space"></div><div class="customer-signatory-line">(..................................)</div><div class="signature-note">Note : Mohon ditanda tangan, stempel / Email jika disetujui atau kirim PO.</div></div></div>
      <footer class="footer">Office : ${h(company.address)}</footer></section>${equipmentPages(document)}`

  const pdfTitle = fileName || `${document.number}.pdf`
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&display=swap" rel="stylesheet">${cssDocument(invoice ? invoiceCss : quotationCss)}<title>${h(pdfTitle)}</title></head><body>${body}</body></html>`
}

const words = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']
function spellNumber(value) {
  const number = Math.floor(Number(value) || 0)
  if (number < 12) return words[number]
  if (number < 20) return `${spellNumber(number - 10)} belas`
  if (number < 100) return `${spellNumber(Math.floor(number / 10))} puluh${number % 10 ? ` ${spellNumber(number % 10)}` : ''}`
  if (number < 200) return `seratus${number > 100 ? ` ${spellNumber(number - 100)}` : ''}`
  if (number < 1000) return `${spellNumber(Math.floor(number / 100))} ratus${number % 100 ? ` ${spellNumber(number % 100)}` : ''}`
  if (number < 2000) return `seribu${number > 1000 ? ` ${spellNumber(number - 1000)}` : ''}`
  if (number < 1000000) return `${spellNumber(Math.floor(number / 1000))} ribu${number % 1000 ? ` ${spellNumber(number % 1000)}` : ''}`
  if (number < 1000000000) return `${spellNumber(Math.floor(number / 1000000))} juta${number % 1000000 ? ` ${spellNumber(number % 1000000)}` : ''}`
  if (number < 1000000000000) return `${spellNumber(Math.floor(number / 1000000000))} miliar${number % 1000000000 ? ` ${spellNumber(number % 1000000000)}` : ''}`
  return `${spellNumber(Math.floor(number / 1000000000000))} triliun${number % 1000000000000 ? ` ${spellNumber(number % 1000000000000)}` : ''}`
}

export const amountInWords = (amount) => {
  const cents = Math.round(Math.abs(Number(amount) || 0) * 100)
  const rupiahAmount = Math.floor(cents / 100)
  const sen = cents % 100
  let result = spellNumber(rupiahAmount)
  if (sen > 0) result += ` koma ${spellNumber(sen)} sen`
  return `${result.charAt(0).toUpperCase()}${result.slice(1)} rupiah`
}

export function paymentPurpose(invoice) {
  if (!invoice) return 'Pilih invoice terlebih dahulu.'
  const stage = invoice.billingStage === 'dp'
    ? 'Pembayaran Down Payment Alat/Barang'
    : invoice.billingStage === 'pelunasan'
      ? 'Pembayaran Pelunasan Alat/Barang'
      : invoice.billingStage === 'penuh'
        ? 'Pembayaran Penuh Alat/Barang'
        : 'Pembayaran Invoice'
  return `${stage} No. ${invoice.number}`
}

function receiptStatement(receipt, company) {
  const date = dateLong(receipt.date)
  if (receipt.method === 'tunai') return `Telah diterima secara tunai oleh ${h(companyStatementName(company.name))} pada tanggal ${date}.`
  if (receipt.method === 'transfer') return `Pembayaran telah diterima melalui transfer ${h(company.bank_name)} No. Rek ${h(company.bank_account)} a.n. ${h(String(company.bank_account_name || '').toUpperCase())}.`
  return `Pembayaran telah diterima pada tanggal ${date}.`
}

function companyStatementName(value) {
  const name = String(value || '')
  const match = name.match(/^PT[.\s]+(.+)$/i)
  if (!match) return companyName(name).replace(/Megatama/gi, 'Mega Tama')
  const readable = match[1].replace(/Megatama/gi, 'Mega Tama').toLocaleLowerCase('id-ID').replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase('id-ID'))
  return `PT ${readable}`
}

export function receiptPdf(receipt, invoice, company, fileName = '') {
  const body = `<section class="receipt-page">${header(company, company.logo)}
    <h1>KWITANSI</h1>
    <table class="receipt-details">
      <tr><td class="label">Nomor Kwitansi</td><td class="colon">:</td><td class="value">${h(receipt.number)}</td></tr>
      <tr><td class="label">Telah Terima Dari</td><td class="colon">:</td><td class="value">${h(receipt.receivedFrom || invoice.companyName)}</td></tr>
      <tr><td class="label">Uang Sejumlah</td><td class="colon">:</td><td class="value words">= ${h(receipt.amountWords || amountInWords(receipt.amount))} =</td></tr>
      <tr><td class="label">Untuk Pembayaran</td><td class="colon">:</td><td class="value">${h(receipt.description || paymentPurpose(invoice))}</td></tr>
    </table>
    <div class="bank-details"><div>${receiptStatement(receipt, company)}</div></div>
    <div class="amount"><div class="amount-band"></div><table><tr><td class="currency">Rp.</td><td class="number">${rupiah(receipt.amount)}</td></tr></table></div>
    <div class="signatures"><div class="signature"><div>${company.city ? `${h(company.city)}, ` : ''}${dateLong(receipt.date)}</div><div class="signature-art">${signImages(company, receipt)}</div><div class="signatory-name">${h(company.invoice_signatory_name || company.name)}</div><div>Finance</div></div></div>
    <footer class="footer">Office : ${h(company.address)}</footer></section>`
  const pdfTitle = fileName || `${receipt.number}.pdf`
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&display=swap" rel="stylesheet">${cssDocument(receiptCss)}<title>${h(pdfTitle)}</title></head><body>${body}</body></html>`
}

async function renderPdf(payload, fileName) {
  const { supabase } = await import('./supabase.js')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Silakan masuk kembali untuk membuat PDF.')
  const response = await fetch('/api/render-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ ...payload, fileName }),
  })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) {
    const result = await response.json().catch(() => null)
    throw new Error(result?.error || 'PDF gagal dibuat.')
  }
  const file = await response.blob()
  if (await file.slice(0, 5).text() !== '%PDF-') {
    throw new Error('Server tidak mengirim file PDF yang valid. Coba lagi setelah aplikasi berhasil di-deploy ke Vercel.')
  }
  return file
}

export async function previewPdf(payload, fileName) {
  const file = await renderPdf(payload, fileName)
  return URL.createObjectURL(file)
}

export async function downloadPdf(payload, fileName) {
  const file = await renderPdf(payload, fileName)
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
