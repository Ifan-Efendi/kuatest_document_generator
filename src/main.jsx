import React, { useEffect, useMemo, useRef, useState } from 'react'
import { loadProfile, supabase, supabaseConfigured } from './supabase'
import { createRoot } from 'react-dom/client'
import {
  amountInWords,
  downloadPdf,
  paymentPurpose,
  previewPdf,
} from './pdfTemplates'
import {
  deleteRecord,
  getDocuments,
  getReceipts,
  getSettings,
  saveDocument,
  saveReceipt,
  saveSettings,
  setWorkspace,
} from './storage'
import './style.css'

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const matchesDatePeriod = (recordDate, period, referenceDate) => {
  if (period === 'all') return true
  if (!recordDate || !referenceDate) return false
  if (period === 'daily') return recordDate === referenceDate
  if (period === 'monthly') return recordDate.slice(0, 7) === referenceDate.slice(0, 7)
  const date = new Date(recordDate + 'T00:00:00Z')
  const reference = new Date(referenceDate + 'T00:00:00Z')
  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) return false
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() - ((reference.getUTCDay() + 6) % 7)))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  return date >= start && date < end
}
const formatLongDate = (value) => {
  if (!value) return ''
  const date = new Date(value + 'T12:00:00Z')
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}
const createId = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
const periodKey = (date = today()) => date.slice(0, 7)
const currentPeriod = periodKey()
const defaultCompany = {
  name: "PT. KUATEST MEGATAMA",
  description: "Material Testing Equipment | Calibration Services | Maintenance & Repair Services",
  legal_number: "AHU-0083816.AH.01.01.TAHUN 2025",
  business_number: "3009250104971",
  address: "Komplek bukit permata cimahi, Jl. Raya Bukit Permata No.8 Blk I1, Cilame, Kec. Ngamprah, Kabupaten Bandung Barat, Jawa Barat 40552",
  phone: "+62 895-3445-73716",
  email: "contact@kuatest.co.id",
  website: "www.kuatest.co.id",
  bank_name: "BCA",
  bank_account: "3371997677",
  bank_account_name: "RIKA ANGGARENI",
  signatory_name: "Rika Anggareni, S.M.",
  invoice_signatory_name: "Rika Anggareni, S.M.",
  logo: '/assets/company-logo.png',
  numberBaselines: { [currentPeriod]: { quotation: 33, invoice: null, receipt: null } },
}
const previousCompanyDescriptions = ["Material Testing Equipment | Calibration Services | Equipment Repair & Maintenance", "Maintenance & Repair Services"]
const labels = { quotation: 'Penawaran', invoice: 'Invoice', receipt: 'Kwitansi' }
const codes = { quotation: 'QUO', invoice: 'INV', receipt: 'KWT' }
const defaultWorkConditions = [
  'Garansi 1 Tahun',
  'Harga sudah termasuk kalibrasi',
  'Pekerjaan dilakukan setelah turun PO',
  'Harga Belum Termasuk Biaya Pengiriman',
  'Pembayaran Down Payment 50%, 50% Setelah Alat Siap Dikirim',
].join('\n')
const defaultPaymentTerms = [
  'Pembayaran Ditransfer Melalui Bank BCA',
  'No. Rek : 3371997677 Atas Nama : RIKA ANGGARENI',
].join('\n')
const months = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const todayAt = (date) => date || today()
const addDaysToDate = (value, days) => {
  const date = new Date(`${todayAt(value)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const safeFilePart = (value, fallback) => String(value || fallback)
  .trim()
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
  .replace(/\s+/g, ' ')
  .replace(/-+/g, '-')
  .replace(/[. ]+$/g, '')
const pdfFileName = (type, number, companyName) => {
  const title = type === 'quotation' ? 'QUOTATION' : type === 'invoice' ? 'INVOICE' : 'KWITANSI'
  const sequence = String(number || '').split('/')[0]
  return `${title} ${safeFilePart(sequence, 'TANPA-NOMOR')} - ${safeFilePart(companyName, 'TANPA-NAMA')}.pdf`
}

async function embedAsset(value) {
  if (!value || String(value).startsWith('data:')) return value
  const response = await fetch(value)
  if (!response.ok) return value
  const blob = await response.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => resolve(value)
    reader.readAsDataURL(blob)
  })
}

function numberFor(type, date, documents, receipts, baselines = {}) {
  const [year, month] = todayAt(date).split('-')
  const code = codes[type]
  const matches = (type === 'receipt' ? receipts : documents.filter((row) => row.type === type))
    .filter((row) => String(row.number || '').endsWith(`/${code}/KMT/${months[Number(month)]}/${year}`))
    .map((row) => Number(String(row.number).split('/')[0]) || 0)
  const baseline = Number(baselines?.[`${year}-${month}`]?.[type] ?? 0)
  const next = Math.max(0, baseline, ...matches) + 1
  return `${String(next).padStart(4, '0')}/${code}/KMT/${months[Number(month)]}/${year}`
}

const money = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const formatAmount = (value) => {
  if (value === '' || value == null || !Number.isFinite(Number(value))) return ''
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}
const parseAmountInput = (value) => {
  const [integer = '', fraction] = String(value).split(',', 2)
  const whole = integer.replace(/\D/g, '')
  const decimals = fraction?.replace(/\D/g, '')
  if (!whole && !decimals) return ''
  return `${whole || '0'}${decimals === undefined ? '' : `.${decimals}`}`
}
const formatAmountDraft = (value) => {
  const [integer = '', fraction] = String(value).replace(/[^\d,.]/g, '').split(',', 2)
  const digits = integer.replace(/\D/g, '')
  const grouped = digits ? Number(digits).toLocaleString('id-ID') : ''
  return `${grouped}${fraction === undefined ? '' : `,${fraction.replace(/\D/g, '')}`}`
}

function AmountInput({ value, onValueChange, ...props }) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(() => formatAmount(value))
  useEffect(() => {
    if (!focused) setDraft(formatAmount(value))
  }, [value, focused])
  return <input {...props} type="text" inputMode="decimal" value={draft}
    onFocus={() => setFocused(true)}
    onChange={(event) => {
      const next = formatAmountDraft(event.target.value)
      setDraft(next)
      onValueChange(parseAmountInput(next))
    }}
    onBlur={() => {
      setFocused(false)
      setDraft(formatAmount(parseAmountInput(draft)))
    }} />
}

const docTotal = (document) => {
  const subtotal = (document.items || []).reduce((sum, item) => sum + Number(item.total ?? Number(item.quantity || 0) * Number(item.price || 0)), 0)
  const adjusted = Math.max(0, subtotal + Number(document.shippingFee || 0) - Number(document.discount || 0))
  const rate = Number(document.vatRate || document.pphRate || 0)
  const tax = rate > 0 ? adjusted * rate / 100 : Number(document.vatAmount ?? document.pph ?? 0)
  return adjusted + tax
}

function newDocument(type, quotation = null, documents = [], receipts = [], baselines = {}) {
  const date = today()
  const autoNumber = numberFor(type, date, documents, receipts, baselines)
  return {
    id: createId(), type, number: autoNumber, autoNumber, date, dueDate: type === 'invoice' ? addDaysToDate(date, 14) : '',
    status: 'Draft', paymentStatus: 'DP', recipientName: quotation?.recipientName || '', companyName: quotation?.companyName || '',
    phone: quotation?.phone || '', email: quotation?.email || '', address: quotation?.address || '',
    workConditions: quotation?.workConditions || (type === 'quotation' ? defaultWorkConditions : ''),
    paymentTerms: quotation?.paymentTerms || defaultPaymentTerms,
    quotationId: quotation?.id || '', quotationNumber: quotation?.number || '', billingStage: 'penuh',
    billingPercentage: 0, downPaymentAmount: '', vatRate: quotation?.vatRate ?? quotation?.pphRate ?? 0,
    vatAmount: quotation?.vatAmount ?? quotation?.pph ?? 0,
    shippingFee: quotation?.shippingFee || 0, discount: quotation?.discount || 0,
    items: quotation?.items?.map((item) => ({ ...item, id: createId(), specification: String(item.specification || '').trim() || 'N/A' })) || [{ id: createId(), name: '', specification: 'N/A', quantity: 1, unit: 'Unit', price: 0, image: '' }],
  }
}

function newReceipt(invoice, documents, receipts, baselines = {}) {
  const date = today()
  const autoNumber = numberFor('receipt', date, documents, receipts, baselines)
  return {
    id: createId(), invoiceId: invoice?.id || '', number: autoNumber, autoNumber,
    date, amount: '', sendStatus: 'Belum Dikirim', receivedFrom: invoice?.companyName || '', description: invoice ? paymentPurpose(invoice) : '',
    method: 'transfer', amountWords: '',
  }
}

function Icon({ name }) {
  if (name === 'settings') return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h9m4 0h3M4 12h3m4 0h9M4 18h11m4 0h1"/><circle cx="15" cy="6" r="2" fill="white"/><circle cx="9" cy="12" r="2" fill="white"/><circle cx="17" cy="18" r="2" fill="white"/></svg>
  const paths = {
    quotation: <><path d="M7 3.75h7l4.25 4.3v12.2H7z"/><path d="M14 3.75v4.5h4.25M9.5 12h6M9.5 15.5h6"/></>,
    invoice: <><path d="M6.5 3.75h11v16.5h-11z"/><path d="M9 8h6M9 11.5h6M9 15h3"/></>,
    receipt: <><path d="M7 3.75h10v16.5l-2.5-1.8-2.5 1.8-2.5-1.8L7 20.25z"/><path d="M9.5 9.5h5M9.5 13h5"/></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M16 3v4M8 3v4M3.5 10h17"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4 4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    eye: <><path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    edit: <><path d="m4 16.8-.8 4 4-.8L19 8.2a2.1 2.1 0 0 0-3-3Z"/><path d="m14.5 6.7 3 3"/></>,
    download: <><path d="M12 3.5v12m0 0 4-4m-4 4-4-4M4.5 20h15"/></>,
    loading: <><circle cx="12" cy="12" r="9" opacity=".25"/><path d="M21 12a9 9 0 0 0-9-9"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    trash: <><path d="M4.5 7h15M9 7V4.5h6V7m2 0-.7 13H7.7L7 7m3.5 3v6m3-6v6"/></>,
    arrow: <><path d="M4 12h15m-6-6 6 6-6 6"/></>,
    receiptAdd: <><path d="M7 3.75h10v16.5l-2.5-1.8-2.5 1.8-2.5-1.8L7 20.25z"/><path d="M9 9.5h6M9 13h3m5 1v5m-2.5-2.5h5"/></>,
    user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.5-3.3 3.3-5.3 7-5.3s6.5 2 7 5.3"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
  }
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [documents, setDocuments] = useState([])
  const [receipts, setReceipts] = useState([])
  const [company, setCompany] = useState(defaultCompany)
  const [page, setPage] = useState('quotation')
  const [query, setQuery] = useState('')
  const [datePeriod, setDatePeriod] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateAnchor, setDateAnchor] = useState(today)
  const [modal, setModal] = useState(null)
  const [docForm, setDocForm] = useState(null)
  const [receiptForm, setReceiptForm] = useState(null)
  const [settingsForm, setSettingsForm] = useState(defaultCompany)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(null)
  const [viewingPdf, setViewingPdf] = useState(null)
  const [pendingPreview, setPendingPreview] = useState(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  const refresh = async (canPersistTagline = false) => {
    const [savedDocuments, savedReceipts, savedCompany] = await Promise.all([getDocuments(), getReceipts(), getSettings()])
    setDocuments(savedDocuments.sort((a, b) => String(b.date).localeCompare(String(a.date))))
    setReceipts(savedReceipts.sort((a, b) => String(b.date).localeCompare(String(a.date))))
    const savedBaselines = savedCompany.numberBaselines || {}
    const numberBaselines = { ...defaultCompany.numberBaselines, ...savedBaselines }
    numberBaselines[currentPeriod] = {
      ...defaultCompany.numberBaselines[currentPeriod],
      ...savedBaselines[currentPeriod],
    }
    const mergedCompany = { ...defaultCompany, ...savedCompany, city: '', numberBaselines }
    Object.entries(defaultCompany).forEach(([key, fallback]) => {
      const value = mergedCompany[key]
      if (typeof fallback === 'string' && fallback && (typeof value !== 'string' || !value.trim() || /^\[.*\]$/.test(value.trim()))) {
        mergedCompany[key] = fallback
      }
    })
    if (previousCompanyDescriptions.includes(savedCompany.description)) {
      mergedCompany.description = defaultCompany.description
      if (canPersistTagline) {
        try { await saveSettings(mergedCompany) } catch { /* retry on next director login */ }
      }
    }
    setCompany(mergedCompany)

  }

  useEffect(() => {
    if (!supabaseConfigured) { setReady(true); return }
    let active = true
    const openSession = async (session) => {
      if (!active) return
      setUser(session?.user || null)
      if (!session?.user) { setProfile(null); setWorkspace(null); setReady(true); return }
      try {
        const nextProfile = await loadProfile(session.user.id)
        if (!active) return
        setWorkspace(nextProfile); setProfile(nextProfile)
        await refresh(nextProfile.role === 'director'); setReady(true)
      } catch (error) { if (active) { setMessage(error.message); setReady(true) } }
    }
    supabase.auth.getSession().then(({ data }) => openSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { queueMicrotask(() => openSession(session)) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const closeOutside = (event) => {
      if (!userMenuRef.current?.contains(event.target)) setUserMenuOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setUserMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const signIn = async (event) => {
    event.preventDefault(); setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage('Email atau kata sandi tidak sesuai.')
  }
  const signOut = async () => { setUserMenuOpen(false); await supabase.auth.signOut(); setReady(false); setPage('quotation') }

  const items = page === 'receipt' ? receipts : documents.filter((row) => row.type === page)
  const statusOptions = page === 'quotation'
    ? ['Draft', 'Terkirim', 'Sudah Disetujui', 'Ditolak']
    : page === 'invoice'
      ? ['Draft', 'Terkirim', 'Belum Lunas', 'Lunas']
      : ['Belum Dikirim', 'Terkirim']
  const filtered = useMemo(() => items.filter((row) => {
    const searchable = (row.number + ' ' + (row.companyName || row.receivedFrom || '') + ' ' + (row.status || '')).toLowerCase()
    const rowStatus = page === 'receipt' ? row.sendStatus || 'Belum Dikirim' : row.status || 'Draft'
    const matchesStatus = statusFilter === 'all' || rowStatus === statusFilter
    return searchable.includes(query.toLowerCase()) && matchesDatePeriod(row.date, datePeriod, dateAnchor) && matchesStatus
  }), [items, query, datePeriod, dateAnchor, statusFilter, page])

  if (!supabaseConfigured) return <main className="auth-screen"><section className="auth-card"><h1>PT. KUATEST MEGA TAMA</h1><p>Konfigurasi Supabase belum dipasang.</p><p>Tambahkan VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di environment Vercel.</p></section></main>
  if (!user || !profile || !ready) return <main className="auth-screen"><form className="auth-card" onSubmit={signIn}><h1>PT. KUATEST MEGA TAMA</h1><p className="auth-subtitle">Masuk ke Document Generator</p><label className="field"><span>Email</span><input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><label className="field"><span>Kata sandi</span><input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label><button className="button primary">Masuk</button>{message && <p role="alert">{message}</p>}</form></main>

  const startDocument = (type, quotation = null) => {
    try {
      const currentBaselines = company.numberBaselines || {}
      const form = newDocument(type, quotation, documents, receipts, currentBaselines)
      setDocForm(form)
      setModal('document')
    } catch (error) {
      setMessage(error.message || `Form ${labels[type]} gagal dibuka.`)
    }
  }

  const startReceipt = (invoice = null) => {
    setReceiptForm(newReceipt(invoice, documents, receipts, company.numberBaselines))
    setModal('receipt')
  }

  const saveDoc = async (event) => {
    event.preventDefault()
    const form = {
      ...docForm,
      number: docForm.number.trim() || docForm.autoNumber || numberFor(docForm.type, docForm.date, documents, receipts, company.numberBaselines),
      items: docForm.items.filter((item) => item.name.trim()).map((item) => ({
        ...item,
        total: Math.round((Number(item.quantity || 0) * Number(item.price || 0) + Number.EPSILON) * 100) / 100,
      })),
    }
    if (!form.number || !form.companyName.trim() || form.items.length === 0) {
      setMessage('Isi nomor, nama perusahaan, dan minimal satu barang.')
      return
    }
    const subtotal = form.items.reduce((sum, item) => sum + Number(item.total || 0), 0)
    const taxable = Math.max(0, subtotal + Number(form.shippingFee || 0) - Number(form.discount || 0))
    form.subtotal = subtotal
    form.total = taxable
    form.vatAmount = Number(form.vatRate || 0) > 0 ? taxable * Number(form.vatRate || 0) / 100 : Number(form.vatAmount || form.pph || 0)
    form.grandTotal = taxable + form.vatAmount
    form.billingLabel = form.billingStage === 'dp' ? `DP ${form.billingPercentage}%` : 'Tagihan Penuh'
    await saveDocument(form)
    await refresh()
    setModal(null)
    setMessage(`${labels[form.type]} tersimpan.`)
  }

  const saveReceiptForm = async (event) => {
    event.preventDefault()
    const invoice = documents.find((row) => row.id === receiptForm.invoiceId)
    const number = receiptForm.number.trim() || receiptForm.autoNumber || numberFor('receipt', receiptForm.date, documents, receipts, company.numberBaselines)
    if (!invoice || Number(receiptForm.amount) <= 0 || !number) {
      setMessage('Pilih invoice dan isi nomor serta jumlah pembayaran.')
      return
    }
    const otherPaid = receipts.filter((row) => row.invoiceId === invoice.id && row.id !== receiptForm.id).reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const remaining = Math.max(0, docTotal(invoice) - otherPaid)
    if (Number(receiptForm.amount) > remaining) {
      setMessage(`Jumlah pembayaran melebihi sisa invoice ${money(remaining)}.`)
      return
    }
    const saved = {
      ...receiptForm,
      number,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      companyName: invoice.companyName,
      amount: Number(receiptForm.amount),
      amountWords: receiptForm.amountWords.trim() || amountInWords(receiptForm.amount),
    }
    await saveReceipt(saved)
    await refresh()
    setModal(null)
    setMessage('Kwitansi tersimpan.')
  }

  const changeStatus = async (document, status) => {
    await saveDocument({ ...document, status })
    await refresh()
  }

  const editDocument = (document) => {
    const defaultPhone = '+62 895-3445-73716'
    const autoNumber = document.autoNumber || (!document.number ? numberFor(document.type, document.date, documents, receipts, company.numberBaselines) : '')
    setDocForm({ ...document, number: document.number || autoNumber, autoNumber: document.autoNumber || autoNumber, dueDate: document.type === 'invoice' ? document.dueDate || addDaysToDate(document.date, 14) : document.dueDate || '', phone: document.phone === defaultPhone ? '' : document.phone || '', paymentTerms: document.paymentTerms || defaultPaymentTerms, vatRate: document.vatRate ?? document.pphRate ?? 0, vatAmount: document.vatAmount ?? document.pph ?? 0, items: (document.items || []).map((item) => ({ ...item })) })
    setModal('document')
  }

  const editReceipt = (receipt) => {
    setReceiptForm({ ...receipt })
    setModal('receipt')
  }

  const findReceiptInvoice = (receipt) => documents.find((row) => row.id === receipt.invoiceId)
    || documents.find((row) => row.type === 'invoice' && receipt.invoiceNumber && row.number === receipt.invoiceNumber)
    || (receipt.invoiceNumber || receipt.companyName || receipt.receivedFrom
      ? { number: receipt.invoiceNumber || '', companyName: receipt.companyName || receipt.receivedFrom || '' }
      : null)

  const openDocumentPdf = async (document) => {
    const pdfCompany = { ...company, logo: await embedAsset(company.logo) }
    const fileName = pdfFileName(document.type, document.number, document.companyName)
    await downloadPdf({ kind: 'document', document, company: pdfCompany }, fileName)
  }
  const previewDocumentPdf = async (document) => {
    const pdfCompany = { ...company, logo: await embedAsset(company.logo) }
    return previewPdf({ kind: 'document', document, company: pdfCompany }, pdfFileName(document.type, document.number, document.companyName))
  }
  const openReceiptPdf = async (receipt) => {
    const invoice = findReceiptInvoice(receipt)
    if (!invoice) throw new Error('Invoice untuk kuitansi ini tidak ditemukan di penyimpanan lokal.')
    const pdfCompany = { ...company, logo: await embedAsset(company.logo) }
    const fileName = pdfFileName('receipt', receipt.number, receipt.receivedFrom || invoice.companyName)
    await downloadPdf({ kind: 'receipt', receipt, invoice, company: pdfCompany }, fileName)
  }
  const downloadRecordPdf = async (record) => {
    if (downloadingPdf || viewingPdf) return
    const key = `${page}:${record.id}`
    setDownloadingPdf(key)
    setMessage('Mengunduh PDF…')
    try {
      if (page === 'receipt') await openReceiptPdf(record)
      else await openDocumentPdf(record)
      setMessage('PDF berhasil diunduh.')
    } catch (error) {
      setMessage(error.message || 'PDF gagal dibuat. Coba lagi.')
    } finally {
      setDownloadingPdf(null)
    }
  }
  const viewRecordPdf = async (record) => {
    if (downloadingPdf || viewingPdf) return
    const key = `${page}:${record.id}`
    if (pendingPreview?.key === key) {
      openPendingPdf()
      return
    }
    if (pendingPreview) {
      URL.revokeObjectURL(pendingPreview.url)
      setPendingPreview(null)
    }
    setViewingPdf(key)
    setMessage('Menyiapkan PDF untuk ditampilkan…')
    try {
      const url = page === 'receipt' ? await previewReceiptPdf(record) : await previewDocumentPdf(record)
      const tab = window.open(url, '_blank')
      if (tab) {
        tab.opener = null
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        setMessage('PDF siap ditampilkan.')
      } else {
        setPendingPreview({ key, url })
        setMessage('PDF siap. Klik Buka PDF untuk menampilkannya.')
      }
    } catch (error) {
      setMessage(error.message || 'PDF gagal dibuka. Coba lagi.')
    } finally {
      setViewingPdf(null)
    }
  }
  const previewReceiptPdf = async (receipt) => {
    const invoice = findReceiptInvoice(receipt)
    if (!invoice) throw new Error('Invoice untuk kuitansi ini tidak ditemukan di penyimpanan lokal.')
    const pdfCompany = { ...company, logo: await embedAsset(company.logo) }
    return previewPdf({ kind: 'receipt', receipt, invoice, company: pdfCompany }, pdfFileName('receipt', receipt.number, receipt.receivedFrom || invoice.companyName))
  }

  const openPendingPdf = () => {
    if (!pendingPreview) return
    const tab = window.open(pendingPreview.url, '_blank')
    if (!tab) {
      setMessage('Pop-up diblokir. Izinkan pop-up untuk menampilkan PDF.')
      return
    }
    tab.opener = null
    window.setTimeout(() => URL.revokeObjectURL(pendingPreview.url), 60_000)
    setPendingPreview(null)
    setMessage('PDF siap ditampilkan.')
  }

  const createInvoiceFrom = async (quotation) => {
    const existing = documents.some((row) => row.type === 'invoice' && row.quotationId === quotation.id)
    if (existing && !window.confirm('Penawaran ini sudah memiliki invoice. Buat invoice baru juga?')) return
    startDocument('invoice', quotation)
  }

  const remove = async (record, storeName) => {
    if (storeName === 'documents' && receipts.some((receipt) => receipt.invoiceId === record.id)) {
      setMessage('Invoice ini memiliki kuitansi terkait. Hapus kuitansinya dulu jika memang ingin menghapus invoice.')
      return
    }
    if (!window.confirm(`Hapus ${record.number}? Data lokal yang dihapus tidak bisa dikembalikan kecuali ada cadangan.`)) return
    await deleteRecord(storeName, record.id)
    await refresh()
  }

  const showSettings = () => { setSettingsForm({ ...company }); setModal('settings') }
  const saveCompanySettings = async (event) => {
    event.preventDefault()
    await saveSettings(settingsForm)
    setCompany({ ...settingsForm })
    setModal(null)
    setMessage('Identitas perusahaan tersimpan.')
  }


  const documentType = page === 'receipt' ? 'receipt' : page
  const title = labels[documentType]

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div><strong>KUATEST MEGATAMA</strong><span>Document Generator</span></div></div>
      {['quotation', 'invoice', 'receipt'].map((key) => <button key={key} className={`nav-item ${page === key ? 'active' : ''}`} onClick={() => { setPage(key); setQuery(''); setStatusFilter('all') }}><Icon name={key}/><span>{labels[key]}</span></button>)}
      <div className="sidebar-spacer" />
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="mobile-brand">KUATEST MEGATAMA</div><div className="topbar-right">
        {profile.role === 'director' && <button type="button" className="icon-button settings-trigger" onClick={showSettings} title="Identitas perusahaan" aria-label="Identitas perusahaan"><Icon name="settings"/></button>}
        <div className="account-menu" ref={userMenuRef}>
          <button type="button" className="account-trigger" onClick={() => setUserMenuOpen((open) => !open)} aria-label="Menu akun" aria-expanded={userMenuOpen} aria-haspopup="menu"><Icon name="user"/></button>
          {userMenuOpen && <div className="account-popover" role="menu">
            <div className="account-details"><strong>{profile.full_name || (profile.role === 'director' ? 'Direktur' : 'Admin')}</strong><span>{user?.email || ''}</span><small>{profile.role === 'director' ? 'Direktur' : 'Admin'}</small></div>
            <button type="button" className="account-logout" role="menuitem" onClick={signOut}><Icon name="logout"/>Keluar</button>
          </div>}
        </div>
      </div></header>

      <section className="page-content">
        <div className="page-heading"><div><h1>{title}</h1><p>{page === 'receipt' ? 'Penerimaan pembayaran dari invoice' : page === 'quotation' ? 'Daftar penawaran pelanggan' : 'Daftar tagihan pelanggan'}</p></div>
          {page === 'receipt'
            ? <button className="button primary" onClick={() => startReceipt()}><Icon name="plus"/>Buat Kwitansi</button>
            : <button type="button" className="button primary" onClick={() => startDocument(page)}><Icon name="plus"/>Buat {title}</button>}
        </div>

        <section className="table-card">
          <div className="table-toolbar"><div className="search-box"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nomor atau perusahaan" aria-label="Cari dokumen"/></div><div className="status-filter"><label htmlFor="status-filter">Status</label><select id="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter status"><option value="all">Semua status</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></div><div className="period-filter"><label htmlFor="date-period">Periode</label><select id="date-period" value={datePeriod} onChange={(event) => setDatePeriod(event.target.value)} aria-label="Pilih periode tanggal"><option value="all">Semua tanggal</option><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option></select></div><div className="date-filter"><label>Tanggal</label><DateInput value={dateAnchor} onChange={setDateAnchor} ariaLabel="Pilih tanggal acuan"/></div></div>
          <div className="table-scroll"><table><thead><tr><th>Nomor</th><th>Tanggal</th>{page === 'receipt' && <th>No. Invoice</th>}<th>Perusahaan</th><th>{page === 'receipt' ? 'Jumlah' : 'Grand Total'}</th>{page !== 'receipt' && <th>Status</th>}<th className="actions-heading">Aksi</th></tr></thead>
            <tbody>{filtered.map((record) => {
              const linkedInvoice = page === 'receipt' ? findReceiptInvoice(record) : null
              const pdfKey = `${page}:${record.id}`
              const isViewingPdf = viewingPdf === pdfKey
              const isDownloadingPdf = downloadingPdf === pdfKey
              const isPdfBusy = Boolean(viewingPdf || downloadingPdf)
              return <tr key={record.id}>
                <td className="number-cell">{record.number}</td><td>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${record.date}T12:00:00Z`))}</td>
                {page === 'receipt' && <td>{record.invoiceNumber || linkedInvoice?.number || '-'}</td>}
                <td>{record.companyName || record.receivedFrom || '-'}</td><td className="amount-cell">{money(page === 'receipt' ? record.amount : docTotal(record))}</td>
                {page !== 'receipt' && <td><select className="status-select" value={record.status || 'Draft'} onChange={(event) => changeStatus(record, event.target.value)} aria-label={`Status ${record.number}`}>
                  {(page === 'quotation' ? ['Draft', 'Terkirim', 'Sudah Disetujui', 'Ditolak'] : ['Draft', 'Terkirim', 'Belum Lunas', 'Lunas']).map((status) => <option key={status}>{status}</option>)}
                </select></td>}
                <td><div className="row-actions">
                  <button className={`icon-button${isViewingPdf ? ' is-loading' : ''}`} title={isViewingPdf ? 'Menyiapkan PDF…' : 'View PDF'} aria-label={isViewingPdf ? 'Menyiapkan PDF untuk ditampilkan' : 'View PDF'} disabled={isPdfBusy} onClick={() => viewRecordPdf(record)}><Icon name={isViewingPdf ? 'loading' : 'eye'}/></button>
                  <button className={`icon-button${isDownloadingPdf ? ' is-loading' : ''}`} title={isDownloadingPdf ? 'Mengunduh PDF…' : 'Unduh PDF'} aria-label={isDownloadingPdf ? 'Mengunduh PDF' : 'Unduh PDF'} disabled={isPdfBusy} onClick={() => downloadRecordPdf(record)}><Icon name={isDownloadingPdf ? 'loading' : 'download'}/></button>
                  <button className="icon-button" title="Ubah" onClick={() => page === 'receipt' ? editReceipt(record) : editDocument(record)}><Icon name="edit"/></button>
                  {page === 'quotation' && <button className="icon-button" title="Buat invoice dari penawaran" onClick={() => createInvoiceFrom(record)}><Icon name="arrow"/></button>}
                  {page === 'invoice' && <button className="icon-button" title="Buat kwitansi dari invoice" onClick={() => startReceipt(record)}><Icon name="receiptAdd"/></button>}
                  {profile.role === 'director' && <button className="icon-button danger" title="Hapus" onClick={() => remove(record, page === 'receipt' ? 'receipts' : 'documents')}><Icon name="trash"/></button>}
                </div></td>
              </tr>
            })}
            {!filtered.length && <tr><td colSpan={page === 'receipt' ? 6 : 6} className="empty-row">{!ready ? 'Memuat data...' : (query || datePeriod !== 'all' || statusFilter !== 'all') ? 'Tidak ada dokumen yang cocok dengan pencarian, status, atau periode.' : 'Belum ada dokumen. Buat dokumen pertama untuk memulai.'}</td></tr>}
            </tbody></table></div>
        </section>

      </section>
    </main>

    {modal === 'document' && docForm && <DocumentModal document={docForm} setDocument={setDocForm} onClose={() => setModal(null)} onSave={saveDoc} company={company} documents={documents} receipts={receipts} isExisting={documents.some((row) => row.id === docForm.id)}/>}
    {modal === 'receipt' && receiptForm && <ReceiptModal receipt={receiptForm} setReceipt={setReceiptForm} documents={documents} receipts={receipts} baselines={company.numberBaselines} onClose={() => setModal(null)} onSave={saveReceiptForm}/>}
    {modal === 'settings' && (profile.role === 'director' ? <SettingsModal settings={settingsForm} setSettings={setSettingsForm} onClose={() => setModal(null)} onSave={saveCompanySettings}/> : <div className="toast">Hanya direktur yang dapat mengubah identitas perusahaan.</div>)}
    {message && <div className="toast" role="status"><span>{message}</span>{pendingPreview && <button className="button primary toast-action" onClick={openPendingPdf}>Buka PDF</button>}<button onClick={() => setMessage('')} aria-label="Tutup"><Icon name="close"/></button></div>}
  </div>
}

function DocumentModal({ document, setDocument, onClose, onSave, company, documents, receipts, isExisting }) {
  const set = (key, value) => setDocument((state) => ({ ...state, [key]: value }))
  const updateItem = (id, key, value) => setDocument((state) => ({ ...state, items: state.items.map((item) => item.id === id ? { ...item, [key]: value } : item) }))
  const addItem = () => setDocument((state) => ({ ...state, items: [...state.items, { id: createId(), name: '', specification: 'N/A', quantity: 1, unit: 'Unit', price: 0, image: '' }] }))
  const removeItem = (id) => setDocument((state) => ({ ...state, items: state.items.filter((item) => item.id !== id) }))
  const total = docTotal(document)
  const downPayment = Math.min(total, Math.max(0, Number(document.downPaymentAmount || 0)))
  const remainingAfterDownPayment = Math.max(0, Math.round((total - downPayment) * 100) / 100)
  const readImage = (file, callback) => {
    if (!file) return
    if (file.size > 3 * 1024 * 1024) return window.alert('Ukuran gambar maksimal 3 MB.')
    const reader = new FileReader()
    reader.onload = () => callback(reader.result)
    reader.readAsDataURL(file)
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="modal document-modal" onSubmit={onSave}>
      <div className="modal-head"><div><span className="eyebrow">DOKUMEN</span><h2>{isExisting ? 'Ubah' : 'Buat'} {labels[document.type]}</h2></div><button type="button" className="icon-button" onClick={onClose}><Icon name="close"/></button></div>
      <div className="modal-body">
        <section className="form-section"><h3>Informasi dokumen</h3><div className="form-grid">
          <Field label={document.type === 'quotation' ? 'No. Quotation' : 'No. Invoice'}><input value={document.number} onChange={(event) => set('number', event.target.value)} /></Field>
          <Field label="Tanggal" required><DateInput required ariaLabel="Tanggal dokumen" value={document.date} onChange={(nextDateValue) => setDocument((state) => {
            const nextDate = nextDateValue
            const nextDueDate = state.type === 'invoice' && (!state.dueDate || state.dueDate === addDaysToDate(state.date, 14))
              ? addDaysToDate(nextDate, 14)
              : state.dueDate
            if (state.autoNumber && (!state.number || state.number === state.autoNumber)) {
              const nextNumber = numberFor(state.type, nextDate, documents, receipts, company.numberBaselines)
              return { ...state, date: nextDate, dueDate: nextDueDate, number: state.number ? nextNumber : '', autoNumber: nextNumber }
            }
            return { ...state, date: nextDate, dueDate: nextDueDate }
          })} /></Field>
          {document.type === 'invoice' && <Field label="Jatuh tempo"><DateInput ariaLabel="Tanggal jatuh tempo" value={document.dueDate || ''} onChange={(value) => set('dueDate', value)} /></Field>}
          <Field label="Kepada"><input value={document.recipientName} onChange={(event) => set('recipientName', event.target.value)} /></Field>
          <Field label="Perusahaan" required><input required value={document.companyName} onChange={(event) => set('companyName', event.target.value)} /></Field>
          <Field label="Telepon / Fax"><input value={document.phone} onChange={(event) => set('phone', event.target.value)} /></Field>
          <Field label="Email"><input type="email" value={document.email} onChange={(event) => set('email', event.target.value)} /></Field>
          <Field label="Alamat" className="full"><textarea rows="2" value={document.address} onChange={(event) => set('address', event.target.value)} /></Field>
          {document.type === 'invoice' && <Field label="Nomor penawaran"><input value={document.quotationNumber || ''} onChange={(event) => set('quotationNumber', event.target.value)} /></Field>}
          {document.type === 'invoice' && <Field label="Jenis tagihan"><select value={document.billingStage || 'penuh'} onChange={(event) => set('billingStage', event.target.value)}><option value="penuh">Tagihan penuh</option><option value="dp">DP</option></select></Field>}
        </div></section>

        <section className="form-section"><div className="section-head"><div><h3>Barang / jasa</h3><p>Masukkan nama alat.</p></div></div>
          <div className="line-items">{document.items.map((item, index) => <div className="line-item" key={item.id}>
            <div className="line-index">{String(index + 1).padStart(2, '0')}</div>
            <div className="line-fields"><Field label="Nama alat"><input value={item.name} onChange={(event) => updateItem(item.id, 'name', event.target.value)} /></Field><Field label="Spesifikasi"><textarea rows="1" value={item.specification} onChange={(event) => updateItem(item.id, 'specification', event.target.value)} /></Field><Field label="Jumlah"><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(item.id, 'quantity', event.target.value)} /></Field><Field label="Satuan"><input value={item.unit} onChange={(event) => updateItem(item.id, 'unit', event.target.value)} /></Field><Field label="Harga"><AmountInput value={item.price} onValueChange={(value) => updateItem(item.id, 'price', value)} /></Field>
              <Field label="Upload foto produk" className="full"><div className="upload-row"><input type="file" accept="image/*" onChange={(event) => readImage(event.target.files[0], (image) => updateItem(item.id, 'image', image))}/>{item.image && <button type="button" className="text-button danger-text" onClick={() => updateItem(item.id, 'image', '')}>Hapus gambar</button>}</div></Field>
            </div><button className="icon-button danger remove-line" type="button" title="Hapus baris" disabled={document.items.length === 1} onClick={() => removeItem(item.id)}><Icon name="trash"/></button>
          </div>)}</div>
          <div className="line-items-footer"><button className="button small subtle" type="button" onClick={addItem}><Icon name="plus"/>Tambah baris</button></div>
        </section>

        <section className="form-section"><h3>Perhitungan</h3><div className="form-grid">
          <Field label="Subtotal barang"><output className="field-output">{money(document.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0))}</output></Field>
          <Field label="Ongkir"><AmountInput value={document.shippingFee || 0} onValueChange={(value) => set('shippingFee', value)} /></Field>
          <Field label="Diskon"><AmountInput value={document.discount || 0} onValueChange={(value) => set('discount', value)} /></Field>
          {document.type === 'quotation' && <><Field label="PPN (%)"><input type="number" min="0" step="0.01" value={document.vatRate || 0} onChange={(event) => set('vatRate', event.target.value)} /></Field><Field label="PPN nominal (jika tanpa tarif)"><AmountInput value={document.vatAmount || 0} onValueChange={(value) => set('vatAmount', value)} /></Field></>}
          {document.type === 'invoice' && <Field label="PPN (%)"><input type="number" min="0" step="0.01" value={document.vatRate || 0} onChange={(event) => set('vatRate', event.target.value)} /></Field>}
          <Field label="Grand Total"><output className="total-output">{money(total)}</output></Field>
          {document.type === 'invoice' && document.billingStage === 'dp' && <><Field label="Nominal DP"><AmountInput value={document.downPaymentAmount || ''} onValueChange={(value) => set('downPaymentAmount', value)} /></Field><Field label="Sisa Tagihan"><output className="field-output total-output">{money(remainingAfterDownPayment)}</output></Field></>}
        </div></section>

        {document.type === 'quotation' && <section className="form-section"><h3>Syarat dan keterangan</h3><div className="form-grid"><Field label="Kondisi perjanjian kerja" className="full"><textarea rows="5" value={document.workConditions || ''} onChange={(event) => set('workConditions', event.target.value)} /></Field><Field label="Cara pembayaran" className="full"><textarea rows="2" value={document.paymentTerms || ''} onChange={(event) => set('paymentTerms', event.target.value)} /></Field></div></section>}
        {document.type === 'invoice' && <section className="form-section"><h3>Syarat dan keterangan</h3><div className="form-grid"><Field label="Cara pembayaran" className="full"><textarea rows="2" value={document.paymentTerms || ''} onChange={(event) => set('paymentTerms', event.target.value)} /></Field></div></section>}
      </div>
      <div className="modal-foot"><button type="button" className="button subtle" onClick={onClose}>Batal</button><button type="submit" className="button primary">Simpan {labels[document.type]}</button></div>
    </form>
  </div>
}

function DateInput({ value, onChange, required = false, ariaLabel }) {
  return <span className="date-input-shell">
    <span className={value ? 'date-input-value' : 'date-input-placeholder'}>{formatLongDate(value) || 'Pilih tanggal'}</span>
    <Icon name="calendar"/>
    <input className="date-input-native" type="date" value={value || ''} onChange={(event) => onChange(event.target.value)} required={required} aria-label={ariaLabel}/>
  </span>
}
function Field({ label, required = false, className = '', children }) {
  return <label className={`field ${className}`}><span>{label}{required && <b> *</b>}</span>{children}</label>
}

function ReceiptModal({ receipt, setReceipt, documents, receipts, baselines, onClose, onSave }) {
  const invoice = documents.find((row) => row.id === receipt.invoiceId)
  const otherPayments = receipts.filter((row) => row.invoiceId === invoice?.id && row.id !== receipt.id).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const remaining = invoice ? Math.max(0, docTotal(invoice) - otherPayments) : 0
  const changeInvoice = (id) => {
    const selected = documents.find((row) => row.id === id)
    setReceipt((state) => ({ ...state, invoiceId: id, receivedFrom: selected?.companyName || '', description: selected ? paymentPurpose(selected) : '' }))
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="modal compact-modal" onSubmit={onSave}>
      <div className="modal-head"><div><span className="eyebrow">DOKUMEN</span><h2>Buat Kwitansi</h2></div><button type="button" className="icon-button" onClick={onClose}><Icon name="close"/></button></div>
      <div className="modal-body"><section className="form-section"><div className="form-grid">
        <Field label="Invoice" required className="full"><select required value={receipt.invoiceId} onChange={(event) => changeInvoice(event.target.value)}><option value="">Pilih invoice</option>{documents.filter((doc) => doc.type === 'invoice').map((doc) => <option key={doc.id} value={doc.id}>{doc.number} · {doc.companyName} · {money(Math.max(0, docTotal(doc) - receipts.filter((row) => row.invoiceId === doc.id && row.id !== receipt.id).reduce((sum, row) => sum + Number(row.amount || 0), 0)))}</option>)}</select></Field>
        <Field label="Nomor kwitansi"><input value={receipt.number} onChange={(event) => setReceipt((state) => ({ ...state, number: event.target.value }))}/></Field>
        <Field label="Tanggal pembayaran" required><DateInput required ariaLabel="Tanggal pembayaran" value={receipt.date} onChange={(nextDateValue) => setReceipt((state) => {
          const nextDate = nextDateValue
          if (state.autoNumber && (!state.number || state.number === state.autoNumber)) {
            const nextNumber = numberFor('receipt', nextDate, documents, receipts, baselines)
            return { ...state, date: nextDate, number: state.number ? nextNumber : '', autoNumber: nextNumber }
          }
          return { ...state, date: nextDate }
        })}/></Field>
        <Field label="Telah terima dari"><input value={receipt.receivedFrom} onChange={(event) => setReceipt((state) => ({ ...state, receivedFrom: event.target.value }))}/></Field>
        <Field label="Jumlah pembayaran" required><AmountInput required value={receipt.amount} onValueChange={(value) => setReceipt((state) => ({ ...state, amount: value, amountWords: amountInWords(value) }))}/></Field>
        <Field label="Metode pembayaran"><select value={receipt.method} onChange={(event) => setReceipt((state) => ({ ...state, method: event.target.value }))}><option value="transfer">Transfer bank</option><option value="tunai">Tunai</option><option value="lainnya">Lainnya</option></select></Field>
        <Field label="Status pengiriman kwitansi"><select value={receipt.sendStatus || 'Belum Dikirim'} onChange={e => setReceipt(v => ({...v,sendStatus:e.target.value}))}><option>Belum Dikirim</option><option>Terkirim</option></select></Field>
        <Field label="Untuk pembayaran" className="full"><input value={receipt.description} onChange={(event) => setReceipt((state) => ({ ...state, description: event.target.value }))}/></Field>
        <Field label="Uang sejumlah (terbilang)" className="full"><input value={receipt.amountWords || ''} onChange={(event) => setReceipt((state) => ({ ...state, amountWords: event.target.value }))}/></Field>
        <div className="full outstanding"><span>Sisa invoice</span><strong>{money(remaining)}</strong></div>
      </div></section></div>
      <div className="modal-foot"><button type="button" className="button subtle" onClick={onClose}>Batal</button><button type="submit" className="button primary">Simpan Kwitansi</button></div>
    </form>
  </div>
}

function SettingsModal({ settings, setSettings, onClose, onSave }) {
  const update = (key, value) => setSettings((state) => ({ ...state, [key]: value }))
  const image = (key, file) => {
    if (!file) return
    if (file.size > 3 * 1024 * 1024) return window.alert('Ukuran gambar maksimal 3 MB.')
    const reader = new FileReader()
    reader.onload = () => update(key, reader.result)
    reader.readAsDataURL(file)
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="modal compact-modal settings-modal" onSubmit={onSave}>
      <div className="modal-head"><div><h2>Identitas Perusahaan</h2></div><button type="button" className="icon-button" onClick={onClose}><Icon name="close"/></button></div>
      <div className="modal-body"><section className="form-section"><div className="form-grid">
        {[['name','Nama perusahaan'],['description','Deskripsi'],['legal_number','No. SK Menkumham'],['business_number','NIB'],['phone','Telepon / Fax'],['email','Email'],['website','Website'],['address','Alamat kantor'],['bank_name','Nama bank'],['bank_account','Nomor rekening'],['bank_account_name','Nama pemilik rekening'],['signatory_name','Penandatangan penawaran'],['invoice_signatory_name','Penandatangan invoice / kuitansi']].map(([key,label]) => <Field key={key} label={label} className={key === 'description' || key === 'address' ? 'full' : ''}><input value={settings[key] || ''} onChange={(event) => update(key, event.target.value)}/></Field>)}
        {['logo','signatureStamp'].map((key) => <Field key={key} label={{logo:'Logo',signatureStamp:'Upload Cap dan Tanda Tangan'}[key]}><input type="file" accept="image/*" onChange={(event) => image(key, event.target.files[0])}/>{settings[key] && <span className="file-status">Gambar sudah dipilih</span>}</Field>)}
      </div></section></div>
      <div className="modal-foot"><button type="button" className="button subtle" onClick={onClose}>Batal</button><button type="submit" className="button primary">Simpan Identitas</button></div>
    </form>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
